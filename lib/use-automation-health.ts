"use client";

import { useEffect, useState } from "react";
import type { AutomationHealth, AutomationHealthFlow, AutomationHealthStatus } from "./automation-health";
import { supabase } from "./supabase";

const HEALTH_STATUSES = new Set<AutomationHealthStatus>([
  "attention_required", "processing", "healthy", "idle",
]);
const CONNECTION_STATUSES = new Set(["company_active", "legacy_fallback", "setup_required"]);

function nonNegativeInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}

function validTimestamp(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0 && Number.isFinite(Date.parse(value));
}

function nullableTimestamp(value: unknown): value is string | null {
  return value === null || validTimestamp(value);
}

function validReasons(value: unknown): value is AutomationHealthFlow["reasons"] {
  if (!value || typeof value !== "object") return false;
  const reasons = value as Partial<AutomationHealthFlow["reasons"]>;
  return nonNegativeInteger(reasons.setupRequired) && nonNegativeInteger(reasons.uncertain) &&
    nonNegativeInteger(reasons.failed) && nonNegativeInteger(reasons.stalled);
}

function validFlow(value: unknown): value is AutomationHealthFlow {
  if (!value || typeof value !== "object") return false;
  const flow = value as Partial<AutomationHealthFlow>;
  return typeof flow.status === "string" && HEALTH_STATUSES.has(flow.status as AutomationHealthStatus) &&
    nonNegativeInteger(flow.processing) && nonNegativeInteger(flow.attentionRequired) &&
    nonNegativeInteger(flow.completed24h) && nullableTimestamp(flow.lastCompletedAt) &&
    nullableTimestamp(flow.oldestAttentionAt) && validReasons(flow.reasons);
}

export function parseAutomationHealth(value: unknown): AutomationHealth | null {
  if (!value || typeof value !== "object") return null;
  const health = value as Partial<AutomationHealth>;
  if (typeof health.status !== "string" || !HEALTH_STATUSES.has(health.status as AutomationHealthStatus)) return null;
  if (typeof health.connectionStatus !== "string" || !CONNECTION_STATUSES.has(health.connectionStatus)) return null;
  if (!health.totals || !nonNegativeInteger(health.totals.processing) ||
      !nonNegativeInteger(health.totals.attentionRequired) || !nonNegativeInteger(health.totals.completed24h)) return null;
  if (!health.flows || !validFlow(health.flows.newLead) || !validFlow(health.flows.approvedReply)) return null;
  if (!validTimestamp(health.checkedAt)) return null;
  return health as AutomationHealth;
}

export function useAutomationHealth(refreshMs = 30_000) {
  const [health, setHealth] = useState<AutomationHealth | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    let runningPromise: Promise<void> | null = null;
    let queuedPromise: Promise<void> | null = null;
    async function runLoad() {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) throw new Error("A munkamenet lejárt. Jelentkezz be újra.");
        const response = await fetch("/api/automation-health", {
          headers: { Authorization: `Bearer ${session.access_token}` },
          cache: "no-store",
        });
        const result: unknown = await response.json();
        if (!response.ok) {
          const message = result && typeof result === "object" && "error" in result &&
            typeof (result as { error?: unknown }).error === "string"
            ? (result as { error: string }).error
            : "Az automatizálás állapota nem ellenőrizhető.";
          throw new Error(message);
        }
        const parsed = parseAutomationHealth(result);
        if (!parsed) throw new Error("Az automatizálás állapota nem ellenőrizhető.");
        if (!cancelled) {
          setHealth(parsed);
          setError("");
        }
      } catch (loadError) {
        if (!cancelled) {
          setHealth(null);
          setError(loadError instanceof Error
            ? loadError.message
            : "Az automatizálás állapota nem ellenőrizhető.");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    function load(): Promise<void> {
      if (cancelled) return Promise.resolve();
      if (runningPromise) {
        if (!queuedPromise) {
          queuedPromise = runningPromise.then(() => {
            queuedPromise = null;
            return load();
          });
        }
        return queuedPromise;
      }
      const task = runLoad().finally(() => {
        if (runningPromise === task) runningPromise = null;
      });
      runningPromise = task;
      return task;
    }

    void load();
    const tick = () => { if (!document.hidden) void load(); };
    const interval = window.setInterval(tick, refreshMs);
    document.addEventListener("visibilitychange", tick);
    return () => {
      cancelled = true;
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", tick);
    };
  }, [refreshMs]);

  return { health, loading, error };
}
