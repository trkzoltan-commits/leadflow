import { authenticateMake, scopeMakeQuery } from "@/lib/make-auth";
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

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await authenticateMake(request);

    if (!auth.ok) {
      return auth.response;
    }

    const { id } = await params;
    const body = await request.json();
    const { status } = body;

    if (!id) {
      return NextResponse.json(
        { error: "Hiányzó üzenetazonosító." },
        { status: 400 }
      );
    }

    if (
      typeof status !== "string" ||
      !status.trim()
    ) {
      return NextResponse.json(
        { error: "Hiányzó státusz." },
        { status: 400 }
      );
    }

    /*
     * Először lekérjük az üzenetet, hogy megkapjuk
     * a saját company_id értékét.
     */
    const { data: existingMessage, error: existingMessageError } =
      await scopeMakeQuery(
        supabaseAdmin.from("messages")
        .select("id, company_id")
        .eq("id", id),
        auth.companyId
        ).single();

    if (existingMessageError || !existingMessage) {
      console.error(
        "Üzenet lekérési hiba:",
        existingMessageError
      );

      return NextResponse.json(
        { error: "Az üzenet nem található." },
        { status: 404 }
      );
    }

    if (!existingMessage.company_id) {
      return NextResponse.json(
        { error: "Az üzenet vállalkozása nem azonosítható." },
        { status: 500 }
      );
    }

    const { data, error } = await supabaseAdmin
      .from("messages")
      .update({
        status: status.trim(),
      })
      .eq("id", id)
      .eq(
        "company_id",
        existingMessage.company_id
      )
      .select(
        `
        id,
        company_id,
        lead_id,
        status,
        content,
        channel,
        direction,
        sender,
        created_at
        `
      )
      .single();

    if (error || !data) {
      console.error(
        "Üzenet státusz frissítési hiba:",
        error
      );

      return NextResponse.json(
        { error: "Nem sikerült frissíteni az üzenetet." },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      message: data,
    });
  } catch (error) {
    console.error(
      "Message PATCH API hiba:",
      error
    );

    return NextResponse.json(
      {
        error:
          "Hiba történt az üzenet frissítése közben.",
      },
      { status: 500 }
    );
  }
}