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

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
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

    const companyId = process.env.LEADFLOW_COMPANY_ID;

    if (!companyId) {
      console.error("LEADFLOW_COMPANY_ID nincs beállítva.");

      return NextResponse.json(
        { error: "Szerver konfigurációs hiba." },
        { status: 500 }
      );
    }

    const { id } = await params;

    if (!id) {
      return NextResponse.json(
        { error: "Hiányzó lead azonosító." },
        { status: 400 }
      );
    }

    const { data, error } = await supabaseAdmin
      .from("leads")
      .select(
        `
        id,
        company_id,
        name,
        email,
        phone,
        service,
        description,
        location,
        priority,
        status,
        source,
        created_at
        `
      )
      .eq("id", id)
      .eq("company_id", companyId)
      .single();

    if (error || !data) {
      console.error("Lead lekérési hiba:", error);

      return NextResponse.json(
        { error: "A lead nem található." },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      lead: data,
    });
  } catch (error) {
    console.error("Lead API hiba:", error);

    return NextResponse.json(
      { error: "Hiba történt a lead lekérése közben." },
      { status: 500 }
    );
  }
}