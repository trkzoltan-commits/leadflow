"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { latestReplies, type OverviewLead, type OverviewMessage } from "@/lib/lead-overview";

export function useLeadOverview() {
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
    let running = false;
    async function load() {
      if (running || cancelled) return;
      running = true;
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
              .select("id, name, email, phone, service, location, priority, status, outcome, source, new_lead_dispatch_status, created_at")
              .order("created_at", { ascending: false }).order("id", { ascending: false })
              .range(offset, offset + 499);
            if (error) throw error;
            rows.push(...(data ?? []));
            if (!data || data.length < 500) break;
          }
          return rows;
        };
        const loadMessages = async () => {
          const rows: OverviewMessage[] = [];
          for (let offset = 0; !cancelled; offset += 500) {
            const { data, error } = await supabase.from("messages")
              .select("id, lead_id, status, created_at, sending_started_at")
              .eq("direction", "outgoing")
              .order("created_at", { ascending: false }).order("id", { ascending: false })
              .range(offset, offset + 499);
            if (error) throw error;
            rows.push(...(data ?? []));
            if (!data || data.length < 500) break;
          }
          return rows;
        };
        const [nextLeads, nextMessages] = await Promise.all([loadLeads(), loadMessages()]);
        if (cancelled) return;
        setLeads(nextLeads); setMessages(nextMessages);
        setUpdatedAt(new Date().toISOString()); setError(false);
      } catch {
        if (!cancelled) setError(true);
      } finally {
        running = false;
        if (!cancelled) setLoading(false);
      }
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
  }, [router]);

  return { leads, messages, replies: latestReplies(messages), loading, error, updatedAt, refresh };
}
