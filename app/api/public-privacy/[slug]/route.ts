import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { privacyNoticeReady, privacyNoticeTemplateVersion } from "@/lib/privacy-notice";

const supabaseAdmin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SECRET_KEY!, {
  auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
});

export async function GET(_request: Request, { params }: { params: Promise<{ slug: string }> }) {
  try {
    const { slug } = await params;
    if (!slug || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) {
      return NextResponse.json({ error: "A tájékoztató nem található." }, { status: 404 });
    }
    const { data: company, error: companyError } = await supabaseAdmin.from("companies")
      .select("id,name").eq("public_slug", slug).single();
    if (companyError || !company) return NextResponse.json({ error: "A tájékoztató nem található." }, { status: 404 });

    const { data: settings, error: settingsError } = await supabaseAdmin.from("company_settings")
      .select("privacy_notice_enabled,privacy_contact_email,privacy_company_address,privacy_retention_months,privacy_notice_updated_at")
      .eq("company_id", company.id).single();
    if (settingsError || !settings || !privacyNoticeReady({
      enabled: settings.privacy_notice_enabled,
      contactEmail: settings.privacy_contact_email,
      companyAddress: settings.privacy_company_address,
      retentionMonths: settings.privacy_retention_months,
      updatedAt: settings.privacy_notice_updated_at,
    })) return NextResponse.json({ error: "A tájékoztató még nincs közzétéve." }, { status: 404 });

    return NextResponse.json({
      companyName: company.name,
      companyAddress: settings.privacy_company_address,
      contactEmail: settings.privacy_contact_email,
      retentionMonths: settings.privacy_retention_months,
      updatedAt: settings.privacy_notice_updated_at,
      templateVersion: privacyNoticeTemplateVersion,
    }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ error: "A tájékoztató most nem érhető el." }, { status: 503 });
  }
}
