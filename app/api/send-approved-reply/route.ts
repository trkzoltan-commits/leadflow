import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { getMakeWebhook } from "@/lib/make-webhook";
import { beginAutomationDispatch, finishAutomationDispatch, webhookAttemptResult } from "@/lib/automation-dispatch";
import { buildApprovedReplyHtml } from "@/lib/email-html";

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SECRET_KEY!,
  {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  }
);

export async function POST(request: Request) {
  let claimedMessageId: string | null = null;
  let claimedCompanyId: string | null = null;

  try {
    const authorization = request.headers.get("authorization");

    if (!authorization?.startsWith("Bearer ")) {
      return NextResponse.json(
        { error: "Nincs jogosultság." },
        { status: 401 }
      );
    }

    const accessToken = authorization.slice(7);

    const {
      data: { user },
      error: userError,
    } = await supabaseAdmin.auth.getUser(accessToken);

    if (userError || !user) {
      return NextResponse.json(
        { error: "Nincs jogosultság." },
        { status: 401 }
      );
    }

    /*
     * Megkeressük, hogy a bejelentkezett felhasználó
     * melyik vállalkozáshoz tartozik.
     */
    const { data: userProfile, error: userProfileError } =
      await supabaseAdmin
        .from("users")
        .select("company_id,is_active")
        .eq("id", user.id)
        .single();

    if (
      userProfileError ||
      !userProfile ||
      !userProfile.company_id ||
      userProfile.is_active === false
    ) {
      console.error(
        "Felhasználói profil lekérési hiba:",
        userProfileError
      );

      return NextResponse.json(
        { error: "A felhasználó vállalkozása nem azonosítható." },
        { status: 403 }
      );
    }

    const companyId = userProfile.company_id;

    const body = await request.json();
    const { message_id } = body;

    if (!message_id) {
      return NextResponse.json(
        { error: "Hiányzó message_id." },
        { status: 400 }
      );
    }

    /*
     * Csak a felhasználó saját vállalkozásához
     * tartozó üzenetet engedjük lekérni.
     */
    const { data: message, error: messageError } =
      await supabaseAdmin
        .from("messages")
        .select(
          `
          id,
          company_id,
          lead_id,
          direction,
          sender,
          content,
          channel,
          status
          `
        )
        .eq("id", message_id)
        .eq("company_id", companyId)
        .single();

    if (messageError || !message) {
      console.error("Üzenet lekérési hiba:", messageError);

      return NextResponse.json(
        { error: "Az üzenet nem található." },
        { status: 404 }
      );
    }

    if (message.direction !== "outgoing") {
      return NextResponse.json(
        { error: "Csak kimenő üzenet küldhető." },
        { status: 400 }
      );
    }

    if (message.status === "sending") {
      return NextResponse.json(
        { error: "Az üzenet küldése már folyamatban van." },
        { status: 409 }
      );
    }

    if (message.status === "sent") {
      return NextResponse.json(
        { error: "Az üzenet már el lett küldve." },
        { status: 409 }
      );
    }

    if (!["draft", "failed"].includes(message.status)) {
      return NextResponse.json(
        { error: "Csak piszkozat vagy igazoltan sikertelen üzenet küldhető." },
        { status: 400 }
      );
    }

    if (typeof message.content !== "string" || !message.content.trim()) {
      return NextResponse.json(
        { error: "Üres válasz nem küldhető el. Írj vagy készíts választervezetet, majd mentsd el." },
        { status: 400 }
      );
    }

    const { data: lead, error: leadError } =
      await supabaseAdmin
        .from("leads")
        .select("id, company_id, name, email, status")
        .eq("id", message.lead_id)
        .eq("company_id", companyId)
        .single();

    if (leadError || !lead) {
      console.error("Lead lekérési hiba:", leadError);

      return NextResponse.json(
        { error: "A lead nem található." },
        { status: 404 }
      );
    }

    if (lead.company_id !== message.company_id) {
      return NextResponse.json(
        { error: "Érvénytelen vállalkozási kapcsolat." },
        { status: 403 }
      );
    }

    if (!lead.email?.trim()) {
      return NextResponse.json(
        { error: "Az érdeklődőnek nincs e-mail címe." },
        { status: 400 }
      );
    }

    const [{ data: company }, { data: emailSettings }] = await Promise.all([
      supabaseAdmin.from("companies").select("name,logo_url,brand_primary").eq("id", companyId).single(),
      supabaseAdmin.from("company_settings").select(
        "email_signature_enabled,email_signature_show_logo,email_signoff,email_signer_name,email_signer_role,email_phone,email_address,email_website,email_legal_text"
      ).eq("company_id", companyId).single(),
    ]);

    if (!company?.name || !emailSettings) {
      return NextResponse.json(
        { error: "A vállalkozás e-mail-aláírása nem érhető el." },
        { status: 503 }
      );
    }

    const webhookUrl = await getMakeWebhook(companyId, "approved_reply");

    if (!webhookUrl) {
      console.error(
        "A vállalkozás Make-kapcsolata nem érhető el."
      );

      return NextResponse.json(
        { error: "A vállalkozás levélküldése jelenleg nincs beállítva vagy nem érhető el." },
        { status: 503 }
      );
    }

    /*
     * FONTOS:
     * Atomi módon megpróbáljuk draft/failed → sending
     * állapotba tenni az üzenetet.
     *
     * Ha két kérés egyszerre érkezne, csak az egyik
     * tudja a draft rekordot lefoglalni.
     */
    const {
      data: claimedMessage,
      error: claimError,
    } = await supabaseAdmin
      .from("messages")
      .update({
        status: "sending",
      })
      .eq("id", message.id)
      .eq("company_id", companyId)
      .eq("status", message.status)
      .select("id")
      .maybeSingle();

    if (claimError) {
      console.error(
        "Üzenet sending státuszra állítási hiba:",
        claimError
      );

      return NextResponse.json(
        { error: "Nem sikerült elindítani az üzenet küldését." },
        { status: 500 }
      );
    }

    /*
     * Ha nincs rekord, közben egy másik kérés
     * már lefoglalta vagy elküldte.
     */
    if (!claimedMessage) {
      return NextResponse.json(
        {
          error:
            "Az üzenet küldése már elindult vagy az üzenet már el lett küldve.",
        },
        { status: 409 }
      );
    }

    claimedMessageId = claimedMessage.id;
    claimedCompanyId = companyId;

    const auditStarted = await beginAutomationDispatch(supabaseAdmin, {
      companyId, eventType: "approved_reply", entityId: message.id,
    });
    if (!auditStarted) {
      await supabaseAdmin.from("messages").update({ status: message.status })
        .eq("id", message.id).eq("company_id", companyId).eq("status", "sending");
      claimedMessageId = null;
      claimedCompanyId = null;
      return NextResponse.json({ error: "A küldés biztonságos naplózása nem sikerült. Próbáld újra később." }, { status: 503 });
    }

    const webhookResponse = await fetch(webhookUrl, {
      method: "POST",
      redirect: "error",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        event: "approved_reply.send",
        message_id: message.id,
        lead_id: lead.id,
        company_id: lead.company_id,
        recipient_email: lead.email,
        recipient_name: lead.name,
        content: buildApprovedReplyHtml(message.content, {
          enabled: emailSettings.email_signature_enabled,
          showLogo: emailSettings.email_signature_show_logo,
          logoUrl: company.logo_url,
          companyName: company.name,
          signoff: emailSettings.email_signoff,
          signerName: emailSettings.email_signer_name,
          signerRole: emailSettings.email_signer_role,
          phone: emailSettings.email_phone,
          email: emailSettings.email_address,
          website: emailSettings.email_website,
          legalText: emailSettings.email_legal_text,
          brandColor: company.brand_primary,
        }),
        timestamp: new Date().toISOString(),
      }),
    });

    const attempt = webhookAttemptResult(webhookResponse);
    await finishAutomationDispatch(supabaseAdmin, {
      companyId, eventType: "approved_reply", entityId: message.id,
      status: attempt.status, httpStatus: attempt.httpStatus, errorCode: attempt.errorCode,
    });

    if (!webhookResponse.ok) {
      return NextResponse.json({ status: "sending", error: "A küldés visszaigazolására várunk. Az újraküldés zárolva van." }, { status: 502 });
    }

    return NextResponse.json({
      success: true,
      status: "sending",
      message: "A jóváhagyott válasz küldése elindult.",
    });
  } catch {
    console.error("Send approved reply API hiba.");

    if (claimedMessageId && claimedCompanyId) {
      await finishAutomationDispatch(supabaseAdmin, {
        companyId: claimedCompanyId, eventType: "approved_reply", entityId: claimedMessageId,
        status: "uncertain", errorCode: "network",
      });
      return NextResponse.json({ status: "sending", error: "A küldés visszaigazolására várunk. Az újraküldés zárolva van." }, { status: 502 });
    }

    return NextResponse.json(
      { error: "Hiba történt a válasz küldésének indításakor." },
      { status: 500 }
    );
  }
}
