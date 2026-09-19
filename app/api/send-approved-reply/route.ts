import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { getMakeWebhook } from "@/lib/make-webhook";

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
        .select("company_id")
        .eq("id", user.id)
        .single();

    if (
      userProfileError ||
      !userProfile ||
      !userProfile.company_id
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

    if (message.status !== "draft") {
      return NextResponse.json(
        { error: "Csak piszkozat státuszú üzenet küldhető." },
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
     * Atomi módon megpróbáljuk draft → sending
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
      .eq("status", "draft")
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
        content: message.content,
        timestamp: new Date().toISOString(),
      }),
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

    if (claimedMessageId) {
      return NextResponse.json({ status: "sending", error: "A küldés visszaigazolására várunk. Az újraküldés zárolva van." }, { status: 502 });
    }

    return NextResponse.json(
      { error: "Hiba történt a válasz küldésének indításakor." },
      { status: 500 }
    );
  }
}
