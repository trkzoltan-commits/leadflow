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
    const apiSecret = process.env.MAKE_API_SECRET;
    const receivedSecret = request.headers.get("x-leadflow-secret");

    if (!apiSecret) {
      console.error("MAKE_API_SECRET nincs beállítva.");

      return NextResponse.json(
        { error: "Szerver konfigurációs hiba." },
        { status: 500 }
      );
    }

    if (!receivedSecret || receivedSecret !== apiSecret) {
      return NextResponse.json(
        { error: "Nincs jogosultság." },
        { status: 401 }
      );
    }

    const body = await request.json();

    const {
      lead_id,
      direction,
      sender,
      content,
      channel,
      status,
    } = body;

    if (!lead_id) {
      return NextResponse.json(
        { error: "Hiányzó lead_id." },
        { status: 400 }
      );
    }

    if (!content?.trim()) {
      return NextResponse.json(
        { error: "Hiányzó üzenettartalom." },
        { status: 400 }
      );
    }

    const companyId = process.env.LEADFLOW_COMPANY_ID;

    if (!companyId) {
      console.error("LEADFLOW_COMPANY_ID nincs beállítva.");

      return NextResponse.json(
        { error: "Szerver konfigurációs hiba." },
        { status: 500 }
      );
    }

    const { data, error } = await supabaseAdmin
      .from("messages")
      .insert({
        company_id: companyId,
        lead_id,
        direction: direction || "outgoing",
        sender: sender || "LeadFlow",
        content: content.trim(),
        channel: channel || "email",
        status: status || "sent",
      })
      .select("id")
      .single();

    if (error) {
      console.error("Üzenet mentési hiba:", error);

      return NextResponse.json(
        { error: "Nem sikerült elmenteni az üzenetet." },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      messageId: data.id,
    });
  } catch (error) {
    console.error("Messages API hiba:", error);

    return NextResponse.json(
      { error: "Hiba történt az üzenet feldolgozása közben." },
      { status: 500 }
    );
  }
}