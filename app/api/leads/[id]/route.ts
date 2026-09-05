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

function isAuthorized(request: Request) {
  const apiSecret = process.env.MAKE_API_SECRET;
  const receivedSecret = request.headers.get("x-leadflow-secret");

  if (!apiSecret) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: "Szerver konfigurációs hiba." },
        { status: 500 }
      ),
    };
  }

  if (!receivedSecret || receivedSecret !== apiSecret) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: "Nincs jogosultság." },
        { status: 401 }
      ),
    };
  }

  return { ok: true };
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = isAuthorized(request);

    if (!auth.ok) {
      return auth.response;
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

    const { data: lead, error: leadError } = await supabaseAdmin
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

    if (leadError || !lead) {
      console.error("Lead lekérési hiba:", leadError);

      return NextResponse.json(
        { error: "A lead nem található." },
        { status: 404 }
      );
    }

    const { data: settings, error: settingsError } = await supabaseAdmin
      .from("company_settings")
      .select("auto_reply_mode")
      .eq("company_id", companyId)
      .maybeSingle();

    if (settingsError) {
      console.error("Company settings lekérési hiba:", settingsError);
    }

    return NextResponse.json({
      success: true,
      lead,
      settings: {
        auto_reply_mode: settings?.auto_reply_mode || "manual",
      },
    });
  } catch (error) {
    console.error("Lead API hiba:", error);

    return NextResponse.json(
      { error: "Hiba történt a lead lekérése közben." },
      { status: 500 }
    );
  }
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = isAuthorized(request);

    if (!auth.ok) {
      return auth.response;
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
    const body = await request.json();
    const { status } = body;

    if (!id) {
      return NextResponse.json(
        { error: "Hiányzó lead azonosító." },
        { status: 400 }
      );
    }

    if (!status?.trim()) {
      return NextResponse.json(
        { error: "Hiányzó státusz." },
        { status: 400 }
      );
    }

    const { data, error } = await supabaseAdmin
      .from("leads")
      .update({
        status: status.trim(),
      })
      .eq("id", id)
      .eq("company_id", companyId)
      .select("id, status")
      .single();

    if (error || !data) {
      console.error("Lead státusz frissítési hiba:", error);

      return NextResponse.json(
        { error: "Nem sikerült frissíteni a lead státuszát." },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      lead: data,
    });
  } catch (error) {
    console.error("Lead PATCH API hiba:", error);

    return NextResponse.json(
      { error: "Hiba történt a lead frissítése közben." },
      { status: 500 }
    );
  }
}