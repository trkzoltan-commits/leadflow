import { beginAutomationDispatch, finishAutomationDispatch, webhookAttemptResult } from "@/lib/automation-dispatch";
import { getMakeWebhook } from "@/lib/make-webhook";
import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SECRET_KEY!, {
  auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
});

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const PRIVATE_HEADERS = { "Cache-Control": "private, no-store", Vary: "Authorization" };

function json(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: PRIVATE_HEADERS });
}

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const accessToken = request.headers.get("authorization")?.match(/^Bearer\s+(\S+)$/i)?.[1];
  if (!accessToken) return json({ error: "Nincs jogosultság." }, 401);

  try {
    const [{ id }, authResult] = await Promise.all([context.params, admin.auth.getUser(accessToken)]);
    if (!uuidPattern.test(id)) return json({ error: "Érvénytelen érdeklődő." }, 400);
    const user = authResult.data.user;
    if (authResult.error || !user) return json({ error: "Nincs jogosultság." }, 401);

    const { data: profile, error: profileError } = await admin.from("users")
      .select("company_id,is_active").eq("id", user.id).maybeSingle();
    if (profileError || !profile?.company_id || profile.is_active === false) {
      return json({ error: "A felhasználó vállalkozása nem azonosítható." }, 403);
    }

    const { data: lead, error: leadError } = await admin.from("leads")
      .select("id,status,new_lead_dispatch_status,anonymized_at")
      .eq("id", id).eq("company_id", profile.company_id).maybeSingle();
    if (leadError) return json({ error: "Az érdeklődő nem ellenőrizhető." }, 503);
    if (!lead) return json({ error: "Az érdeklődő nem található." }, 404);
    if (lead.anonymized_at || lead.status === "processed") {
      return json({ error: "Lezárt vagy anonimizált ügy feldolgozása nem indítható újra." }, 409);
    }
    if (lead.new_lead_dispatch_status !== "unconfigured") {
      return json({ error: "Az automatizálás csak igazoltan el nem indított állapotból indítható újra." }, 409);
    }

    const [webhookUrl, companyResult] = await Promise.all([
      getMakeWebhook(profile.company_id, "new_lead"),
      admin.from("companies").select("public_slug").eq("id", profile.company_id).maybeSingle(),
    ]);
    if (!webhookUrl || companyResult.error || !companyResult.data?.public_slug) {
      return json({ error: "A cég Make-kapcsolata még nem használható." }, 503);
    }

    // The conditional update is the dispatch claim: concurrent clicks cannot send twice.
    const { data: claimed, error: claimError } = await admin.from("leads")
      .update({ new_lead_dispatch_status: "pending" })
      .eq("id", lead.id)
      .eq("company_id", profile.company_id)
      .eq("new_lead_dispatch_status", "unconfigured")
      .neq("status", "processed")
      .is("anonymized_at", null)
      .select("id")
      .maybeSingle();
    if (claimError) return json({ error: "Az automatizálás nem indítható újra." }, 503);
    if (!claimed) return json({ error: "Az automatizálás állapota időközben megváltozott." }, 409);

    const auditStarted = await beginAutomationDispatch(admin, {
      companyId: profile.company_id, eventType: "new_lead", entityId: lead.id,
    });
    if (!auditStarted) {
      await admin.from("leads").update({ new_lead_dispatch_status: "unconfigured" })
        .eq("id", lead.id).eq("company_id", profile.company_id).eq("new_lead_dispatch_status", "pending");
      return json({ error: "Az automatizálás indítási naplója nem hozható létre." }, 503);
    }

    try {
      const response = await fetch(webhookUrl, {
        method: "POST",
        redirect: "error",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          event: "lead.created",
          lead_id: lead.id,
          company_id: profile.company_id,
          company_slug: companyResult.data.public_slug,
          timestamp: new Date().toISOString(),
        }),
      });
      const attempt = webhookAttemptResult(response);
      await Promise.all([
        admin.from("leads").update({ new_lead_dispatch_status: attempt.status })
          .eq("id", lead.id).eq("company_id", profile.company_id).eq("new_lead_dispatch_status", "pending"),
        finishAutomationDispatch(admin, {
          companyId: profile.company_id, eventType: "new_lead", entityId: lead.id,
          status: attempt.status, httpStatus: attempt.httpStatus, errorCode: attempt.errorCode,
        }),
      ]);
      if (!response.ok) return json({
        error: "A Make nem igazolta vissza az indítást. Ellenőrizd a Make futását; ne indítsd újra ismét.",
        status: "uncertain",
      }, 502);
      return json({ success: true, status: "accepted" });
    } catch {
      await Promise.all([
        admin.from("leads").update({ new_lead_dispatch_status: "uncertain" })
          .eq("id", lead.id).eq("company_id", profile.company_id).eq("new_lead_dispatch_status", "pending"),
        finishAutomationDispatch(admin, {
          companyId: profile.company_id, eventType: "new_lead", entityId: lead.id,
          status: "uncertain", errorCode: "network",
        }),
      ]);
      return json({
        error: "A Make nem igazolta vissza az indítást. Ellenőrizd a Make futását; ne indítsd újra ismét.",
        status: "uncertain",
      }, 502);
    }
  } catch {
    return json({ error: "Az automatizálás nem indítható újra." }, 503);
  }
}
