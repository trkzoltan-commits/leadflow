import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { CompanyBrandingValidationError, parseCompanyBranding } from "@/lib/company-branding";

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SECRET_KEY!,
  { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } }
);

export async function PATCH(request: Request) {
  const accessToken = request.headers.get("authorization")?.match(/^Bearer\s+(\S+)$/i)?.[1];
  if (!accessToken) return NextResponse.json({ error: "Nincs jogosultság." }, { status: 401 });

  try {
    const { data: { user }, error: userError } = await supabaseAdmin.auth.getUser(accessToken);
    if (userError || !user) return NextResponse.json({ error: "Nincs jogosultság." }, { status: 401 });

    const { data: profile, error: profileError } = await supabaseAdmin
      .from("users")
      .select("company_id,role,is_active")
      .eq("id", user.id)
      .single();
    if (profileError || !profile?.company_id || profile.is_active === false) {
      return NextResponse.json({ error: "A felhasználó vállalkozása nem azonosítható." }, { status: 403 });
    }
    if (profile.role !== "owner") {
      return NextResponse.json({ error: "A céges arculatot csak a tulajdonos módosíthatja." }, { status: 403 });
    }

    const branding = parseCompanyBranding(await request.json());
    const { data: company, error: updateError } = await supabaseAdmin
      .from("companies")
      .update({
        logo_url: branding.logoUrl || null,
        brand_primary: branding.brandPrimary,
        brand_secondary: branding.brandSecondary,
        branding_mode: branding.brandingMode,
        show_company_name: branding.showCompanyName,
      })
      .eq("id", profile.company_id)
      .select("logo_url,brand_primary,brand_secondary,branding_mode,show_company_name")
      .single();
    if (updateError || !company) {
      return NextResponse.json({ error: "A céges arculat mentése nem sikerült." }, { status: 503 });
    }

    return NextResponse.json({ branding: parseCompanyBranding({
      logoUrl: company.logo_url || "",
      brandPrimary: company.brand_primary,
      brandSecondary: company.brand_secondary,
      brandingMode: company.branding_mode,
      showCompanyName: company.show_company_name,
    }) }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (error instanceof CompanyBrandingValidationError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    return NextResponse.json({ error: "A céges arculat mentése nem sikerült." }, { status: 503 });
  }
}
