import type { AutomationDispatchStatus, AutomationEvent } from "./automation-dispatch";
import { latestReplies, type OverviewMessage } from "./lead-overview";

export type AutomationHealthStatus = "attention_required" | "processing" | "healthy" | "idle";
export type AutomationConnectionStatus = "company_active" | "legacy_fallback" | "setup_required";

export type AutomationHealthSignal = {
  eventType: AutomationEvent;
  status: AutomationDispatchStatus;
  occurredAt: string | null;
};

export type AutomationRuntimeLead = {
  id: string;
  new_lead_dispatch_status: AutomationDispatchStatus | null;
  created_at: string;
};

export type AutomationRuntimeMessage = OverviewMessage;

export type AutomationRuntimeAudit = {
  event_type: AutomationEvent;
  entity_id: string;
  status: AutomationDispatchStatus;
  last_attempt_at: string | null;
  updated_at: string | null;
};

export type AutomationHealthFlow = {
  status: AutomationHealthStatus;
  processing: number;
  attentionRequired: number;
  completed24h: number;
  lastCompletedAt: string | null;
  oldestAttentionAt: string | null;
  reasons: {
    setupRequired: number;
    uncertain: number;
    failed: number;
    stalled: number;
  };
};

export type AutomationHealth = {
  status: AutomationHealthStatus;
  connectionStatus: AutomationConnectionStatus;
  totals: {
    processing: number;
    attentionRequired: number;
    completed24h: number;
  };
  flows: {
    newLead: AutomationHealthFlow;
    approvedReply: AutomationHealthFlow;
  };
  checkedAt: string;
};

export const AUTOMATION_HEALTH_MINUTES = {
  pending: 1,
  newLeadAccepted: 15,
  approvedReplyAccepted: 60,
} as const;

type FlowKey = keyof AutomationHealth["flows"];

function emptyFlow(completed24h: number, lastCompletedAt: string | null): AutomationHealthFlow {
  return {
    status: "idle",
    processing: 0,
    attentionRequired: 0,
    completed24h: nonNegativeInteger(completed24h),
    lastCompletedAt: validIso(lastCompletedAt),
    oldestAttentionAt: null,
    reasons: { setupRequired: 0, uncertain: 0, failed: 0, stalled: 0 },
  };
}

function nonNegativeInteger(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? Math.floor(value) : 0;
}

function validIso(value: unknown) {
  if (typeof value !== "string" || !value) return null;
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? new Date(timestamp).toISOString() : null;
}

function flowKey(eventType: AutomationEvent): FlowKey {
  return eventType === "new_lead" ? "newLead" : "approvedReply";
}

function auditKey(eventType: AutomationEvent, entityId: string) {
  return `${eventType}:${entityId}`;
}

const DISPATCH_STATUS_SEVERITY: Record<Exclude<AutomationDispatchStatus, "completed">, number> = {
  accepted: 1,
  pending: 2,
  uncertain: 3,
  failed: 4,
  unconfigured: 5,
};

function unresolvedStatus(
  auditStatus: AutomationDispatchStatus | undefined,
  recordStatus: AutomationDispatchStatus | null
) {
  if (auditStatus === "completed") return "completed";
  const candidates = [auditStatus, recordStatus]
    .filter((status): status is Exclude<AutomationDispatchStatus, "completed"> => Boolean(status && status !== "completed"));
  return candidates.sort((left, right) => DISPATCH_STATUS_SEVERITY[right] - DISPATCH_STATUS_SEVERITY[left])[0] ?? null;
}

export function buildAutomationHealthSignals(input: {
  leads: AutomationRuntimeLead[];
  messages: AutomationRuntimeMessage[];
  audits?: AutomationRuntimeAudit[];
}): AutomationHealthSignal[] {
  const audits = new Map((input.audits ?? []).map(audit => [
    auditKey(audit.event_type, audit.entity_id), audit,
  ]));
  const replies = latestReplies(input.messages);
  const signals: AutomationHealthSignal[] = [];

  for (const lead of input.leads) {
    const audit = audits.get(auditKey("new_lead", lead.id));
    const status = unresolvedStatus(audit?.status, lead.new_lead_dispatch_status);
    if (!status || status === "completed") continue;
    // An outgoing reply resolves the expected 15-minute draft wait. Definitive
    // setup or dispatch uncertainty remains visible until its audit is closed.
    if (status === "accepted" && replies.has(lead.id)) continue;
    signals.push({
      eventType: "new_lead",
      status,
      occurredAt: audit?.last_attempt_at || audit?.updated_at || lead.created_at,
    });
  }

  for (const message of Array.from(replies.values())) {
    if (message.status !== "sending" && message.status !== "failed") continue;
    const audit = audits.get(auditKey("approved_reply", message.id));
    if (message.status === "sending" && audit?.status === "completed") continue;
    const auditProblem = audit?.status === "uncertain" || audit?.status === "failed" ||
      audit?.status === "unconfigured" ? audit.status : null;
    signals.push({
      eventType: "approved_reply",
      status: message.status === "failed" ? "failed" : auditProblem ?? "accepted",
      occurredAt: audit?.last_attempt_at || audit?.updated_at ||
        (message.status === "failed"
          ? message.delivery_failed_at || message.sending_started_at || message.created_at
          : message.sending_started_at || message.created_at),
    });
  }

  return signals;
}

function markAttention(
  flow: AutomationHealthFlow,
  reason: keyof AutomationHealthFlow["reasons"],
  occurredAt: string | null
) {
  flow.attentionRequired += 1;
  flow.reasons[reason] += 1;
  const normalized = validIso(occurredAt);
  if (normalized && (!flow.oldestAttentionAt || normalized < flow.oldestAttentionAt)) {
    flow.oldestAttentionAt = normalized;
  }
}

function finalizeFlow(flow: AutomationHealthFlow) {
  flow.status = flow.attentionRequired > 0
    ? "attention_required"
    : flow.processing > 0
      ? "processing"
      : flow.lastCompletedAt || flow.completed24h > 0 ? "healthy" : "idle";
}

export function deriveAutomationHealth(input: {
  connectionStatus: AutomationConnectionStatus;
  signals: AutomationHealthSignal[];
  completed24h?: Partial<Record<AutomationEvent, number>>;
  lastCompletedAt?: Partial<Record<AutomationEvent, string | null>>;
  now?: Date;
}): AutomationHealth {
  const now = input.now ?? new Date();
  const nowMs = now.getTime();
  const flows = {
    newLead: emptyFlow(
      input.completed24h?.new_lead ?? 0,
      input.lastCompletedAt?.new_lead ?? null
    ),
    approvedReply: emptyFlow(
      input.completed24h?.approved_reply ?? 0,
      input.lastCompletedAt?.approved_reply ?? null
    ),
  };

  if (input.connectionStatus === "setup_required") {
    markAttention(flows.newLead, "setupRequired", null);
    markAttention(flows.approvedReply, "setupRequired", null);
  }

  for (const signal of input.signals) {
    const flow = flows[flowKey(signal.eventType)];
    if (signal.status === "completed") continue;
    if (signal.status === "unconfigured") {
      markAttention(flow, "setupRequired", signal.occurredAt);
      continue;
    }
    if (signal.status === "uncertain") {
      markAttention(flow, "uncertain", signal.occurredAt);
      continue;
    }
    if (signal.status === "failed") {
      markAttention(flow, "failed", signal.occurredAt);
      continue;
    }

    const occurredAt = validIso(signal.occurredAt);
    if (!occurredAt || !Number.isFinite(nowMs)) {
      markAttention(flow, "stalled", signal.occurredAt);
      continue;
    }

    const ageMinutes = Math.max(0, (nowMs - Date.parse(occurredAt)) / 60_000);
    const threshold = signal.status === "pending"
      ? AUTOMATION_HEALTH_MINUTES.pending
      : signal.eventType === "new_lead"
        ? AUTOMATION_HEALTH_MINUTES.newLeadAccepted
        : AUTOMATION_HEALTH_MINUTES.approvedReplyAccepted;
    if (ageMinutes >= threshold) markAttention(flow, "stalled", occurredAt);
    else flow.processing += 1;
  }

  finalizeFlow(flows.newLead);
  finalizeFlow(flows.approvedReply);
  const totals = {
    processing: flows.newLead.processing + flows.approvedReply.processing,
    attentionRequired: flows.newLead.attentionRequired + flows.approvedReply.attentionRequired,
    completed24h: flows.newLead.completed24h + flows.approvedReply.completed24h,
  };
  const status: AutomationHealthStatus = totals.attentionRequired > 0
    ? "attention_required"
    : totals.processing > 0
      ? "processing"
      : flows.newLead.status === "healthy" || flows.approvedReply.status === "healthy"
        ? "healthy"
        : "idle";

  return {
    status,
    connectionStatus: input.connectionStatus,
    totals,
    flows,
    checkedAt: Number.isFinite(nowMs) ? now.toISOString() : new Date(0).toISOString(),
  };
}
