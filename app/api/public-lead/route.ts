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
    const body = await request.json();

    const {
      company_slug,
      name,
      email,
      phone,
      service,
      description,
      location,
    } = body;

    if (!company_slug?.trim()) {
      return NextResponse.json(
        { error: "Hiányzó vállalkozásazonosító." },
        { status: 400 }
      );
    }

    if (!name?.trim()) {
      return NextResponse.json(
        { error: "A név megadása kötelező." },
        { status: 400 }
      );
    }

    if (!email?.trim() && !phone?.trim()) {
      return NextResponse.json(
        {
          error:
            "Legalább egy elérhetőség megadása szükséges: e-mail vagy telefonszám.",
        },
        { status: 400 }
      );
    }

    /*
     * A publikus slug alapján azonosítjuk a vállalkozást.
     */
    const { data: company, error: companyError } =
      await supabaseAdmin
        .from("companies")
        .select("id, public_slug")
        .eq("public_slug", company_slug.trim())
        .single();

    if (companyError || !company) {
      console.error(
        "Publikus vállalkozás lekérési hiba:",
        companyError
      );

      return NextResponse.json(
        { error: "A vállalkozás nem található." },
        { status: 404 }
      );
    }

    const { data, error } = await supabaseAdmin
      .from("leads")
      .insert({
        company_id: company.id,
        name: name.trim(),
        email: email?.trim() || null,
        phone: phone?.trim() || null,
        service: service?.trim() || null,
        description: description?.trim() || null,
        location: location?.trim() || null,
        priority: "medium",
        status: "new",
        source: "web",
      })
      .select("id")
      .single();

    if (error) {
      console.error("Publikus lead mentési hiba:", error);

      return NextResponse.json(
        { error: "Nem sikerült elmenteni az érdeklődést." },
        { status: 500 }
      );
    }

    const webhookUrl =
      process.env.MAKE_NEW_LEAD_WEBHOOK_URL;

    if (webhookUrl) {
      try {
        const webhookResponse = await fetch(webhookUrl, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            event: "lead.created",
            lead_id: data.id,
            company_id: company.id,
            company_slug: company.public_slug,
            timestamp: new Date().toISOString(),
          }),
        });

        if (!webhookResponse.ok) {
          console.error(
            "Make webhook HTTP hiba:",
            webhookResponse.status,
            webhookResponse.statusText
          );
        }
      } catch (webhookError) {
        console.error(
          "Make webhook hiba:",
          webhookError
        );
      }
    } else {
      console.warn(
        "MAKE_NEW_LEAD_WEBHOOK_URL nincs beállítva."
      );
    }

    return NextResponse.json({
      success: true,
      leadId: data.id,
    });
  } catch (error) {
    console.error(
      "Publikus lead API hiba:",
      error
    );

    return NextResponse.json(
      {
        error:
          "Hiba történt az érdeklődés feldolgozása közben.",
      },
      { status: 500 }
    );
  }
}