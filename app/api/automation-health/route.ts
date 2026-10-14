import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import {
  buildAutomationHealthSignals,
  deriveAutomationHealth,
  type AutomationRuntimeAudit,
  type AutomationRuntimeLead,
  type AutomationRuntimeMessage,
  type AutomationConnectionStatus,
} from "@/lib/automation-health";
import { makeConnectionStatus } from "@/lib/make-connection-status";
import type { AutomationEvent } from "@/lib/automation-dispatch";

const PAGE_SIZE = 1_000;
const FILTER_CHUNK_SIZE = 100;
const PRIVATE_HEADERS = {
  "Cache-Control": "private, no-store",
  Vary: "Authorization",
};

function json(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: PRIVATE_HEADERS });
}

async function loadConnectionStatus(admin: SupabaseClient, companyId: string): Promise<AutomationConnectionStatus> {
  const { data: connection, error: connectionError } = await admin
    .from("company_make_connections")
    .select("mode, enabled, new_lead_webhook_url, approved_reply_webhook_url")
    .eq("company_id", companyId)
    .maybeSingle();
  if (connectionError) throw new Error("connection unavailable");

  let hasCompanyCredential = false;
  if (connection?.mode === "company" && connection.enabled) {
    const { data: credential, error: credentialError } = await admin
      .from("make_credentials")
      .select("id")
      .eq("company_id", companyId)
      .is("revoked_at", null)
      .limit(1)
      .maybeSingle();
    if (credentialError) throw new Error("credential unavailable");
    hasCompanyCredential = Boolean(credential);
  }

  const status = makeConnectionStatus(
    connection,
    hasCompanyCredential,
    process.env.MAKE_NEW_LEAD_WEBHOOK_URL,
    process.env.MAKE_SEND_APPROVED_REPLY_WEBHOOK_URL
  );
  return status === "legacy" ? "legacy_fallback" : status;
}

async function loadActiveLeads(admin: SupabaseClient, companyId: string) {
  const leads: AutomationRuntimeLead[] = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await admin.from("leads")
      .select("id,new_lead_dispatch_status,created_at")
      .eq("company_id", companyId)
      .in("status", ["new", "contacted", "waiting", "offer_sent", "decision"])
      .order("created_at", { ascending: true })
      .order("id", { ascending: true })
      .range(from, from + PAGE_SIZE - 1);
    if (error) throw new Error("lead runtime unavailable");
    const rows = (data ?? []) as AutomationRuntimeLead[];
    leads.push(...rows);
    if (rows.length < PAGE_SIZE) break;
  }
  return leads;
}

async function loadOutgoingMessages(admin: SupabaseClient, companyId: string, leadIds: string[]) {
  const messages: AutomationRuntimeMessage[] = [];
  for (let index = 0; index < leadIds.length; index += FILTER_CHUNK_SIZE) {
    const chunk = leadIds.slice(index, index + FILTER_CHUNK_SIZE);
    for (let from = 0; ; from += PAGE_SIZE) {
      const { data, error } = await admin.from("messages")
        .select("id,lead_id,status,sender,created_at,sending_started_at,delivery_confirmed_at,delivery_failed_at")
        .eq("company_id", companyId)
        .eq("direction", "outgoing")
        .in("lead_id", chunk)
        .order("created_at", { ascending: true })
        .order("id", { ascending: true })
        .range(from, from + PAGE_SIZE - 1);
      if (error) throw new Error("reply runtime unavailable");
      const rows = (data ?? []) as AutomationRuntimeMessage[];
      messages.push(...rows);
      if (rows.length < PAGE_SIZE) break;
    }
  }
  return messages;
}

async function loadAudits(
  admin: SupabaseClient,
  companyId: string,
  eventType: AutomationEvent,
  entityIds: string[]
) {
  const audits: AutomationRuntimeAudit[] = [];
  for (let index = 0; index < entityIds.length; index += FILTER_CHUNK_SIZE) {
    const chunk = entityIds.slice(index, index + FILTER_CHUNK_SIZE);
    const { data, error } = await admin.from("automation_dispatches")
      .select("event_type,entity_id,status,last_attempt_at,updated_at")
      .eq("company_id", companyId)
      .eq("event_type", eventType)
      .in("entity_id", chunk);
    if (error) throw new Error("dispatch runtime unavailable");
    audits.push(...((data ?? []) as AutomationRuntimeAudit[]));
  }
  return audits;
}

async function loadCompletedFlowStats(
  admin: SupabaseClient,
  companyId: string,
  eventType: AutomationEvent,
  since: string
) {
  const [countResult, latestResult] = await Promise.all([
    admin.from("automation_dispatches")
      .select("completed_at", { count: "exact", head: true })
      .eq("company_id", companyId)
      .eq("event_type", eventType)
      .eq("status", "completed")
      .gte("completed_at", since),
    admin.from("automation_dispatches")
      .select("completed_at")
      .eq("company_id", companyId)
      .eq("event_type", eventType)
      .eq("status", "completed")
      .order("completed_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);
  if (countResult.error || latestResult.error) throw new Error("completion history unavailable");
  return {
    completed24h: countResult.count ?? 0,
    lastCompletedAt: latestResult.data?.completed_at ?? null,
  };
}

export async function GET(request: Request) {
  const accessToken = request.headers.get("authorization")?.match(/^Bearer\s+(\S+)$/i)?.[1];
  if (!accessToken) return json({ error: "Nincs jogosultság." }, 401);

  try {
    const userClient = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        global: { headers: { Authorization: `Bearer ${accessToken}` } },
        auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
      }
    );
    const { data: { user }, error: userError } = await userClient.auth.getUser(accessToken);
    if (userError || !user) return json({ error: "Nincs jogosultság." }, 401);

    const { data: profile, error: profileError } = await userClient.from("users")
      .select("company_id,is_active")
      .eq("id", user.id)
      .maybeSingle();
    if (profileError) return json({ error: "Az automatizálás állapota nem érhető el." }, 503);
    if (!profile?.company_id || profile.is_active === false) {
      return json({ error: "A felhasználó vállalkozása nem azonosítható." }, 403);
    }

    const admin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SECRET_KEY!,
      { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } }
    );
    const checkedAt = new Date();
    const since = new Date(checkedAt.getTime() - 24 * 60 * 60_000).toISOString();
    const [connectionStatus, leads, newLeadCompleted, approvedReplyCompleted] = await Promise.all([
      loadConnectionStatus(admin, profile.company_id),
      loadActiveLeads(admin, profile.company_id),
      loadCompletedFlowStats(admin, profile.company_id, "new_lead", since),
      loadCompletedFlowStats(admin, profile.company_id, "approved_reply", since),
    ]);
    const messages = await loadOutgoingMessages(admin, profile.company_id, leads.map(lead => lead.id));
    const problemMessageIds = messages
      .filter(message => message.status === "sending" || message.status === "failed")
      .map(message => message.id);
    const [newLeadAudits, approvedReplyAudits] = await Promise.all([
      loadAudits(admin, profile.company_id, "new_lead", leads.map(lead => lead.id)),
      loadAudits(admin, profile.company_id, "approved_reply", problemMessageIds),
    ]);
    const signals = buildAutomationHealthSignals({
      leads,
      messages,
      audits: [...newLeadAudits, ...approvedReplyAudits],
    });

    return json(deriveAutomationHealth({
      connectionStatus,
      signals,
      completed24h: {
        new_lead: newLeadCompleted.completed24h,
        approved_reply: approvedReplyCompleted.completed24h,
      },
      lastCompletedAt: {
        new_lead: newLeadCompleted.lastCompletedAt,
        approved_reply: approvedReplyCompleted.lastCompletedAt,
      },
      now: checkedAt,
    }));
  } catch {
    // Never log or return raw database errors, tokens, automation keys, or customer data.
    return json({ error: "Az automatizálás állapota nem érhető el." }, 503);
  }
}
