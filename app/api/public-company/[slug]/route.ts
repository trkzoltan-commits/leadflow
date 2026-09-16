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
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    const { slug } = await params;

    if (!slug?.trim()) {
      return NextResponse.json(
        { error: "Hiányzó vállalkozásazonosító." },
        { status: 400 }
      );
    }

    const { data: company, error } = await supabaseAdmin
      .from("companies")
      .select(
        `
        name, 
        public_slug, 
        logo_url, 
        brand_primary, 
        brand_secondary,
        branding_mode,
        logo_size,
        logo_position,
        logo_alignment,
        show_company_name,
        company_name_size,
        company_name_weight
        `
        )
      .eq("public_slug", slug.trim())
      .single();

    if (error || !company) {
      console.error("Publikus cég lekérési hiba:", error);

      return NextResponse.json(
        { error: "A vállalkozás nem található." },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      company: {
        name: company.name,
        slug: company.public_slug,
        logo_url: company.logo_url,
        brand_primary: company.brand_primary,
        brand_secondary: company.brand_secondary,
        branding_mode: company.branding_mode,
        logo_size: company.logo_size,
        logo_position: company.logo_position,
        logo_alignment: company.logo_alignment,
        show_company_name: company.show_company_name,
        company_name_size: company.company_name_size,
        company_name_weight: company.company_name_weight,
      },
    });
  } catch (error) {
    console.error("Public company API hiba:", error);

    return NextResponse.json(
      { error: "Hiba történt a vállalkozás lekérése közben." },
      { status: 500 }
    );
  }
}