"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { latestReplies, type OverviewLead, type OverviewMessage } from "@/lib/lead-overview";
import { countLeadNotes } from "@/lib/lead-notes";

export function useLeadOverview({ includeNoteCounts = false }: { includeNoteCounts?: boolean } = {}) {
  const router = useRouter();
  const [leads, setLeads] = useState<OverviewLead[]>([]);
  const [messages, setMessages] = useState<OverviewMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);
  const refreshRef = useRef<() => Promise<void>>(async () => {});
  const refresh = useCallback(() => refreshRef.current(), []);

  useEffect(() => {
    let cancelled = false;
    let runningPromise: Promise<void> | null = null;
    let queuedPromise: Promise<void> | null = null;
    async function runLoad() {
      if (cancelled) return;
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (cancelled) return;
        if (!session) {
          setLeads([]); setMessages([]);
          router.replace("/login");
          return;
        }
        // Use the authenticated browser client: every page is subject to tenant RLS.
        // Page through records so Supabase's row limit cannot silently truncate totals.
        const loadLeads = async () => {
          const rows: OverviewLead[] = [];
          for (let offset = 0; !cancelled; offset += 500) {
            const { data, error } = await supabase.from("leads")
              .select("id, assigned_user_id, next_action, next_action_due_date, name, email, phone, service, location, priority, status, outcome, source, new_lead_dispatch_status, created_at")
              .order("created_at", { ascending: false }).order("id", { ascending: false })
              .range(offset, offset + 499);
            if (error) throw error;
            rows.push(...(data ?? []).map((lead) => ({ ...lead, note_count: 0 })));
            if (!data || data.length < 500) break;
          }
          return rows;
        };
        const loadNoteCounts = async () => {
          if (!includeNoteCounts) return new Map<string, number>();
          const rows: Array<{ lead_id: string }> = [];
          for (let offset = 0; !cancelled; offset += 500) {
            // Only the tenant-scoped relation key is loaded; note text and authors stay private.
            const { data, error } = await supabase.from("lead_notes")
              .select("lead_id")
              .order("id", { ascending: true })
              .range(offset, offset + 499);
            if (error) throw error;
            rows.push(...(data ?? []));
            if (!data || data.length < 500) break;
          }
          return countLeadNotes(rows);
        };
        const loadMessages = async () => {
          const rows: OverviewMessage[] = [];
          for (let offset = 0; !cancelled; offset += 500) {
            const { data, error } = await supabase.from("messages")
              .select("id, lead_id, status, sender, created_at, sending_started_at, delivery_confirmed_at, delivery_failed_at")
              .eq("direction", "outgoing")
              .order("created_at", { ascending: false }).order("id", { ascending: false })
              .range(offset, offset + 499);
            if (error) throw error;
            rows.push(...(data ?? []));
            if (!data || data.length < 500) break;
          }
          return rows;
        };
        const [nextLeads, nextMessages, nextNoteCounts] = await Promise.all([
          loadLeads(), loadMessages(), loadNoteCounts(),
        ]);
        if (cancelled) return;
        setLeads(nextLeads.map((lead) => ({ ...lead, note_count: nextNoteCounts.get(lead.id) || 0 })));
        setMessages(nextMessages);
        setUpdatedAt(new Date().toISOString()); setError(false);
      } catch {
        if (!cancelled) setError(true);
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
    refreshRef.current = load;
    void load();
    const tick = () => { if (!document.hidden) void load(); };
    const timer = window.setInterval(tick, 10000);
    document.addEventListener("visibilitychange", tick);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", tick);
    };
  }, [includeNoteCounts, router]);

  return { leads, messages, replies: latestReplies(messages), loading, error, updatedAt, refresh };
}
