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
        ai_safe_to_send,
        ai_requires_human_review,
        ai_risk_level,
        ai_risk_reason,
        created_at
        `
      )
      .eq("id", id)
      .single();

    if (leadError || !lead) {
      console.error("Lead lekérési hiba:", leadError);

      return NextResponse.json(
        { error: "A lead nem található." },
        { status: 404 }
      );
    }

    if (!lead.company_id) {
      console.error("A leadhez nem tartozik company_id.");

      return NextResponse.json(
        { error: "A lead vállalkozása nem azonosítható." },
        { status: 500 }
      );
    }

    const { data: settings, error: settingsError } =
      await supabaseAdmin
        .from("company_settings")
        .select("auto_reply_mode")
        .eq("company_id", lead.company_id)
        .maybeSingle();

    if (settingsError) {
      console.error(
        "Company settings lekérési hiba:",
        settingsError
      );
    }

    return NextResponse.json({
      success: true,
      lead,
      settings: {
        auto_reply_mode:
          settings?.auto_reply_mode || "manual",
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

    const { id } = await params;
    const body = await request.json();

    if (!id) {
      return NextResponse.json(
        { error: "Hiányzó lead azonosító." },
        { status: 400 }
      );
    }

    /*
     * Először megkeressük a leadet és annak company_id értékét.
     */
    const { data: existingLead, error: existingLeadError } =
      await supabaseAdmin
        .from("leads")
        .select("id, company_id")
        .eq("id", id)
        .single();

    if (existingLeadError || !existingLead) {
      console.error(
        "Lead lekérési hiba frissítés előtt:",
        existingLeadError
      );

      return NextResponse.json(
        { error: "A lead nem található." },
        { status: 404 }
      );
    }

    if (!existingLead.company_id) {
      return NextResponse.json(
        { error: "A lead vállalkozása nem azonosítható." },
        { status: 500 }
      );
    }

    const updateData: {
      status?: string;
      ai_safe_to_send?: boolean;
      ai_requires_human_review?: boolean;
      ai_risk_level?: string;
      ai_risk_reason?: string;
      updated_at?: string;
    } = {};

    if (
      typeof body.status === "string" &&
      body.status.trim()
    ) {
      updateData.status = body.status.trim();
    }

    if (
      typeof body.ai_safe_to_send === "boolean"
    ) {
      updateData.ai_safe_to_send =
        body.ai_safe_to_send;
    }

    if (
      typeof body.ai_requires_human_review ===
      "boolean"
    ) {
      updateData.ai_requires_human_review =
        body.ai_requires_human_review;
    }

    if (
      typeof body.ai_risk_level === "string" &&
      body.ai_risk_level.trim()
    ) {
      updateData.ai_risk_level =
        body.ai_risk_level.trim();
    }

    if (
      typeof body.ai_risk_reason === "string" &&
      body.ai_risk_reason.trim()
    ) {
      updateData.ai_risk_reason =
        body.ai_risk_reason.trim();
    }

    if (Object.keys(updateData).length === 0) {
      return NextResponse.json(
        { error: "Nincs frissíthető adat megadva." },
        { status: 400 }
      );
    }

    updateData.updated_at =
      new Date().toISOString();

    const { data, error } = await supabaseAdmin
      .from("leads")
      .update(updateData)
      .eq("id", id)
      .eq(
        "company_id",
        existingLead.company_id
      )
      .select(
        `
        id,
        company_id,
        status,
        ai_safe_to_send,
        ai_requires_human_review,
        ai_risk_level,
        ai_risk_reason
        `
      )
      .single();

    if (error || !data) {
      console.error(
        "Lead frissítési hiba:",
        error
      );

      return NextResponse.json(
        {
          error:
            "Nem sikerült frissíteni a lead adatait.",
        },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      lead: data,
    });
  } catch (error) {
    console.error(
      "Lead PATCH API hiba:",
      error
    );

    return NextResponse.json(
      {
        error:
          "Hiba történt a lead frissítése közben.",
      },
      { status: 500 }
    );
  }
}