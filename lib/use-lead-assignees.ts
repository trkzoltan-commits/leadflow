"use client";

import { useEffect, useState } from "react";
import type { LeadAssignee } from "./lead-pipeline";
import { supabase } from "./supabase";

export function useLeadAssignees() {
  const [assignees, setAssignees] = useState<LeadAssignee[]>([]);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [canAssign, setCanAssign] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    async function loadAssignees() {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) return;
        const response = await fetch("/api/lead-assignees", {
          headers: { Authorization: `Bearer ${session.access_token}` },
          cache: "no-store",
        });
        const result = await response.json();
        if (!response.ok) throw new Error(result?.error || "A felelősök nem tölthetők be.");
        if (!cancelled) {
          setAssignees(Array.isArray(result.members) ? result.members : []);
          setCurrentUserId(typeof result.currentUserId === "string" ? result.currentUserId : null);
          setCanAssign(result.canAssign === true);
          setError("");
        }
      } catch (loadError) {
        if (!cancelled) setError(loadError instanceof Error
          ? loadError.message
          : "A felelősök listája nem tölthető be. Frissítsd az oldalt, majd próbáld újra.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void loadAssignees();
    return () => { cancelled = true; };
  }, []);

  return { assignees, currentUserId, canAssign, loading, error };
}
