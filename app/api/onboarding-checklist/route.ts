import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { makeConnectionStatus } from "@/lib/make-connection-status";
import { buildOnboardingChecklist } from "@/lib/onboarding-checklist";

const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SECRET_KEY!,
  { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } },
);
const privateHeaders = { "Cache-Control": "private, no-store", Vary: "Authorization" };

export async function GET(request: Request) {
  const accessToken = request.headers.get("authorization")?.match(/^Bearer\s+(\S+)$/i)?.[1];
  if (!accessToken) return NextResponse.json({ error: "Nincs jogosultság." }, { status: 401, headers: privateHeaders });

  try {
    const { data: { user }, error: userError } = await admin.auth.getUser(accessToken);
    if (userError || !user) return NextResponse.json({ error: "Nincs jogosultság." }, { status: 401, headers: privateHeaders });
    const { data: profile, error: profileError } = await admin.from("users")
      .select("company_id,role,is_active").eq("id", user.id).single();
    if (profileError || !profile?.company_id || profile.is_active === false) {
      return NextResponse.json({ error: "A felhasználó vállalkozása nem azonosítható." }, { status: 403, headers: privateHeaders });
    }
    if (profile.role !== "owner") {
      return NextResponse.json({ error: "Az indulási ellenőrzőlistát csak a tulajdonos láthatja." }, { status: 403, headers: privateHeaders });
    }

    const companyId = profile.company_id;
    const [companyResult, settingsResult, connectionResult, credentialResult, membersResult, progressResult] = await Promise.all([
      admin.from("companies").select("name,public_slug,logo_url").eq("id", companyId).single(),
      admin.from("company_settings").select(
        "auto_reply_mode,email_signature_enabled,email_signer_name,email_address,privacy_notice_enabled,privacy_contact_email,privacy_company_address,privacy_retention_months",
      ).eq("company_id", companyId).single(),
      admin.from("company_make_connections").select("mode,enabled,new_lead_webhook_url,approved_reply_webhook_url")
        .eq("company_id", companyId).maybeSingle(),
      admin.from("make_credentials").select("id").eq("company_id", companyId).is("revoked_at", null).limit(1).maybeSingle(),
      admin.from("users").select("id").eq("company_id", companyId).eq("is_active", true),
      admin.from("company_onboarding_progress").select(
        "owner_login_verified_at,new_lead_flow_verified_at,approved_reply_flow_verified_at,tenant_isolation_verified_at",
      ).eq("company_id", companyId).maybeSingle(),
    ]);
    if (companyResult.error || settingsResult.error || connectionResult.error || credentialResult.error
      || membersResult.error || progressResult.error || !companyResult.data || !settingsResult.data) {
      return NextResponse.json({ error: "Az indulási állapot most nem ellenőrizhető." }, { status: 503, headers: privateHeaders });
    }

    const makeStatus = makeConnectionStatus(
      connectionResult.data,
      Boolean(credentialResult.data),
      process.env.MAKE_NEW_LEAD_WEBHOOK_URL,
      process.env.MAKE_SEND_APPROVED_REPLY_WEBHOOK_URL,
    );
    const company = companyResult.data;
    const settings = settingsResult.data;
    const progress = progressResult.data;
    const checklist = buildOnboardingChecklist({
      companyName: company.name,
      companySlug: company.public_slug,
      logoUrl: company.logo_url,
      signatureEnabled: settings.email_signature_enabled,
      signerName: settings.email_signer_name,
      signatureEmail: settings.email_address,
      privacyEnabled: settings.privacy_notice_enabled,
      privacyEmail: settings.privacy_contact_email,
      privacyAddress: settings.privacy_company_address,
      privacyRetentionMonths: settings.privacy_retention_months,
      replyMode: settings.auto_reply_mode,
      activeMemberCount: membersResult.data?.length ?? 0,
      makeConnectionReady: makeStatus === "company_active",
      newLeadVerifiedAt: progress?.new_lead_flow_verified_at,
      approvedReplyVerifiedAt: progress?.approved_reply_flow_verified_at,
      ownerLoginVerifiedAt: progress?.owner_login_verified_at,
      tenantIsolationVerifiedAt: progress?.tenant_isolation_verified_at,
    });
    return NextResponse.json(checklist, { headers: privateHeaders });
  } catch {
    return NextResponse.json({ error: "Az indulási állapot most nem ellenőrizhető." }, { status: 503, headers: privateHeaders });
  }
}
