import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

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

    const body = await request.json();
    const { message_id } = body;

    if (!message_id) {
      return NextResponse.json(
        { error: "Hiányzó message_id." },
        { status: 400 }
      );
    }

    const { data: message, error: messageError } = await supabaseAdmin
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

    if (message.status !== "draft") {
      return NextResponse.json(
        { error: "Csak piszkozat státuszú üzenet küldhető." },
        { status: 400 }
      );
    }

    const { data: lead, error: leadError } = await supabaseAdmin
      .from("leads")
      .select("id, company_id, name, email, status")
      .eq("id", message.lead_id)
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

    const webhookUrl =
      process.env.MAKE_SEND_APPROVED_REPLY_WEBHOOK_URL;

    if (!webhookUrl) {
      console.error(
        "MAKE_SEND_APPROVED_REPLY_WEBHOOK_URL nincs beállítva."
      );

      return NextResponse.json(
        { error: "Szerver konfigurációs hiba." },
        { status: 500 }
      );
    }

    const webhookResponse = await fetch(webhookUrl, {
      method: "POST",
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
      console.error(
        "Make approved reply webhook HTTP hiba:",
        webhookResponse.status,
        webhookResponse.statusText
      );

      return NextResponse.json(
        { error: "Nem sikerült elindítani az e-mail küldést." },
        { status: 502 }
      );
    }

    return NextResponse.json({
      success: true,
      message: "A jóváhagyott válasz küldése elindult.",
    });
  } catch (error) {
    console.error("Send approved reply API hiba:", error);

    return NextResponse.json(
      { error: "Hiba történt a válasz küldésének indításakor." },
      { status: 500 }
    );
  }
}