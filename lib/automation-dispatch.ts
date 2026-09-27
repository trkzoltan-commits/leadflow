export type AutomationEvent = "new_lead" | "approved_reply";
export type AutomationDispatchStatus =
  | "pending"
  | "accepted"
  | "uncertain"
  | "failed"
  | "completed"
  | "unconfigured";

export type WebhookAttemptResult = {
  status: "accepted" | "uncertain";
  httpStatus: number | null;
  errorCode: "network" | "http" | null;
};

export function webhookAttemptResult(response?: { ok: boolean; status: number } | null): WebhookAttemptResult {
  if (!response) return { status: "uncertain", httpStatus: null, errorCode: "network" };
  if (response.ok) return { status: "accepted", httpStatus: response.status, errorCode: null };
  return { status: "uncertain", httpStatus: response.status, errorCode: "http" };
}

export async function beginAutomationDispatch(
  client: SupabaseClient,
  input: { companyId: string; eventType: AutomationEvent; entityId: string }
) {
  const existing = await client.from("automation_dispatches")
    .select("attempt_count")
    .eq("event_type", input.eventType)
    .eq("entity_id", input.entityId)
    .maybeSingle();
  if (existing.error) return false;

  const now = new Date().toISOString();
  const { error } = await client.from("automation_dispatches").upsert({
    company_id: input.companyId,
    event_type: input.eventType,
    entity_id: input.entityId,
    status: "pending",
    attempt_count: (existing.data?.attempt_count || 0) + 1,
    last_attempt_at: now,
    last_http_status: null,
    last_error_code: null,
    completed_at: null,
    updated_at: now,
  }, { onConflict: "event_type,entity_id" });
  return !error;
}

export async function finishAutomationDispatch(
  client: SupabaseClient,
  input: {
    companyId: string;
    eventType: AutomationEvent;
    entityId: string;
    status: AutomationDispatchStatus;
    httpStatus?: number | null;
    errorCode?: "network" | "http" | "unconfigured" | "callback_failed" | null;
  }
) {
  const now = new Date().toISOString();
  const { error } = await client.from("automation_dispatches").update({
    status: input.status,
    last_http_status: input.httpStatus ?? null,
    last_error_code: input.errorCode ?? null,
    completed_at: input.status === "completed" ? now : null,
    updated_at: now,
  }).eq("company_id", input.companyId)
    .eq("event_type", input.eventType)
    .eq("entity_id", input.entityId);
  return !error;
}
import type { SupabaseClient } from "@supabase/supabase-js";

