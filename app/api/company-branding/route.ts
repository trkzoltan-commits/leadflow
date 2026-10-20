import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import {
  COMPANY_LOGO_BUCKET,
  COMPANY_LOGO_MAX_BYTES,
  CompanyBrandingValidationError,
  companyLogoExtension,
  companyLogoStoragePath,
  parseCompanyBranding,
} from "@/lib/company-branding";

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
    const { data: previousCompany, error: previousCompanyError } = await supabaseAdmin
      .from("companies")
      .select("logo_url")
      .eq("id", profile.company_id)
      .single();
    if (previousCompanyError || !previousCompany) {
      return NextResponse.json({ error: "A vállalkozás nem érhető el." }, { status: 503 });
    }
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

    const previousObjectPath = companyLogoStoragePath(previousCompany.logo_url, profile.company_id);
    const currentObjectPath = companyLogoStoragePath(company.logo_url, profile.company_id);
    if (previousObjectPath && previousObjectPath !== currentObjectPath) {
      try {
        await supabaseAdmin.storage.from(COMPANY_LOGO_BUCKET).remove([previousObjectPath]);
      } catch {
        // The new branding is already saved; stale-file cleanup must not report a false save failure.
      }
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

export async function POST(request: Request) {
  const accessToken = request.headers.get("authorization")?.match(/^Bearer\s+(\S+)$/i)?.[1];
  if (!accessToken) return NextResponse.json({ error: "Nincs jogosultság." }, { status: 401 });

  try {
    const contentLength = Number(request.headers.get("content-length") || 0);
    if (Number.isFinite(contentLength) && contentLength > COMPANY_LOGO_MAX_BYTES + 256 * 1024) {
      return NextResponse.json({ error: "A logókép legfeljebb 2 MB méretű lehet." }, { status: 413 });
    }

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
      return NextResponse.json({ error: "Céges logót csak a tulajdonos tölthet fel." }, { status: 403 });
    }

    const formData = await request.formData();
    const logo = formData.get("logo");
    if (!(logo instanceof File)) {
      return NextResponse.json({ error: "Hiányzó logókép." }, { status: 400 });
    }
    const extension = companyLogoExtension(logo);

    const { data: company, error: companyError } = await supabaseAdmin
      .from("companies")
      .select("logo_url")
      .eq("id", profile.company_id)
      .single();
    if (companyError || !company) {
      return NextResponse.json({ error: "A vállalkozás nem érhető el." }, { status: 503 });
    }

    const objectPath = `${profile.company_id}/logo-${crypto.randomUUID()}.${extension}`;
    const bytes = Buffer.from(await logo.arrayBuffer());
    const { error: uploadError } = await supabaseAdmin.storage
      .from(COMPANY_LOGO_BUCKET)
      .upload(objectPath, bytes, { contentType: logo.type, cacheControl: "3600", upsert: false });
    if (uploadError) {
      return NextResponse.json({ error: "A logó feltöltése nem sikerült. Ellenőrizd a logótárhely beállítását." }, { status: 503 });
    }

    const { data: publicLogo } = supabaseAdmin.storage.from(COMPANY_LOGO_BUCKET).getPublicUrl(objectPath);
    const logoUrl = publicLogo.publicUrl;
    const { error: updateError } = await supabaseAdmin
      .from("companies")
      .update({ logo_url: logoUrl })
      .eq("id", profile.company_id);
    if (updateError) {
      await supabaseAdmin.storage.from(COMPANY_LOGO_BUCKET).remove([objectPath]);
      return NextResponse.json({ error: "A feltöltött logót nem sikerült a vállalkozáshoz menteni." }, { status: 503 });
    }

    const previousObjectPath = companyLogoStoragePath(company.logo_url, profile.company_id);
    if (previousObjectPath && previousObjectPath !== objectPath) {
      try {
        await supabaseAdmin.storage.from(COMPANY_LOGO_BUCKET).remove([previousObjectPath]);
      } catch {
        // The new logo is already active; stale-file cleanup can be retried independently.
      }
    }

    return NextResponse.json({ logoUrl }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (error instanceof CompanyBrandingValidationError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    return NextResponse.json({ error: "A logó feltöltése nem sikerült." }, { status: 503 });
  }
}
