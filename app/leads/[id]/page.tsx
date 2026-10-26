"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { displayReceivedAt, isDelayedSending, missingAiDraftWarning, newLeadDispatchWarning, preferredReplyMessage } from "@/lib/lead-overview";
import { budapestDateOffset, displayNextActionDueDate, isValidDateOnly, NEXT_ACTION_MAX_LENGTH, nextActionDueState } from "@/lib/lead-next-action";
import { AppShell } from "@/components/app-shell";
import { LeadNotes } from "@/components/lead-notes";
import { VoiceDictationButton } from "@/components/voice-dictation-button";
import { StructuredVoiceCapture } from "@/components/structured-voice-capture";

type Lead = {
  id: string;
  company_id: string;
  assigned_user_id: string | null;
  next_action: string | null;
  next_action_due_date: string | null;
  name: string | null;
  email: string | null;
  phone: string | null;
  service: string | null;
  description: string | null;
  location: string | null;
  priority: string | null;
  status: string | null;
  outcome: string | null;
  source: string | null;
  new_lead_dispatch_status: string | null;
  privacy_notice_acknowledged_at: string | null;
  privacy_notice_version: string | null;
  anonymized_at: string | null;
  created_at: string;
  ai_summary: string | null;
  ai_safe_to_send: boolean | null;
  ai_requires_human_review: boolean | null;
  ai_risk_level: string | null;
  ai_risk_reason: string | null;
};

type Message = {
  id: string;
  direction: string;
  sender: string | null;
  content: string;
  channel: string | null;
  status: string | null;
  created_at: string;
  sending_started_at: string | null;
  delivery_confirmed_at: string | null;
  delivery_failed_at: string | null;
  delivery_resolution_source: string | null;
};

type DeliveryAudit = { status: string | null; attemptCount: number; lastAttemptAt: string | null; updatedAt: string | null };
type LeadAssignee = { id: string; email: string; role: string };

const messageSelect = "id, direction, sender, content, channel, status, created_at, sending_started_at, delivery_confirmed_at, delivery_failed_at, delivery_resolution_source";

export default function LeadDetailsPage() {
  const router = useRouter();
  const params = useParams();

  const leadId = params.id as string;

  const [lead, setLead] = useState<Lead | null>(null);
  const [loading, setLoading] = useState(true);

  const [saving, setSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);

  const [aiLoading, setAiLoading] = useState(false);
  const [aiResult, setAiResult] = useState("");
  const [aiError, setAiError] = useState("");

  const [replyLoading, setReplyLoading] = useState(false);
  const [replyDraft, setReplyDraft] = useState("");
  const [replyError, setReplyError] = useState("");
  const [replyDirty, setReplyDirty] = useState(false);
  const [riskLoading, setRiskLoading] = useState(false);
  const [riskError, setRiskError] = useState("");
  const [riskSuccess, setRiskSuccess] = useState("");
  const [syncError, setSyncError] = useState(false);
  const [dispatchRetrying, setDispatchRetrying] = useState(false);
  const [dispatchRetryError, setDispatchRetryError] = useState("");
  const [dispatchRetrySuccess, setDispatchRetrySuccess] = useState("");

  const [draftMessageId, setDraftMessageId] = useState<string | null>(null);
  const [messageStatus, setMessageStatus] = useState<string | null>(null);

  const [draftSaving, setDraftSaving] = useState(false);
  const [draftSaveSuccess, setDraftSaveSuccess] = useState(false);
  const [draftSaveError, setDraftSaveError] = useState("");

  const [markingSent, setMarkingSent] = useState(false);
  const [markSentError, setMarkSentError] = useState("");
  const [resolvingDelivery, setResolvingDelivery] = useState(false);

  const [messageHistory, setMessageHistory] = useState<Message[]>([]);
  const [deliveryAudit, setDeliveryAudit] = useState<DeliveryAudit | null>(null);

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [service, setService] = useState("");
  const [description, setDescription] = useState("");
  const [location, setLocation] = useState("");
  const [status, setStatus] = useState("");
  const [outcome, setOutcome] = useState("");
  const [saveError, setSaveError] = useState("");
  const [priority, setPriority] = useState("");
  const [nextActionEditorOpen, setNextActionEditorOpen] = useState(false);
  const [nextActionDraft, setNextActionDraft] = useState("");
  const [nextActionDueDateDraft, setNextActionDueDateDraft] = useState("");
  const [nextActionExpected, setNextActionExpected] = useState<{ nextAction: string | null; dueDate: string | null }>({ nextAction: null, dueDate: null });
  const [nextActionSaving, setNextActionSaving] = useState(false);
  const [nextActionError, setNextActionError] = useState("");
  const [nextActionSuccess, setNextActionSuccess] = useState("");
  const [nextActionCurrentUserId, setNextActionCurrentUserId] = useState<string | null>(null);
  const [nextActionManagerAccess, setNextActionManagerAccess] = useState(false);
  const [leadAssignees, setLeadAssignees] = useState<LeadAssignee[]>([]);
  const [noteDirty, setNoteDirty] = useState(false);
  const [structuredCaptureDirty, setStructuredCaptureDirty] = useState(false);

  async function handleRetryLeadAutomation() {
    if (!lead || lead.new_lead_dispatch_status !== "unconfigured" || dispatchRetrying) return;
    setDispatchRetrying(true);
    setDispatchRetryError("");
    setDispatchRetrySuccess("");
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        router.replace("/login");
        return;
      }
      const response = await fetch(`/api/leads/${lead.id}/retry-automation`, {
        method: "POST",
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      const result = await response.json() as { error?: unknown; status?: unknown };
      if (!response.ok) {
        if (result.status === "uncertain") {
          setLead(current => current ? { ...current, new_lead_dispatch_status: "uncertain" } : current);
        }
        setDispatchRetryError(typeof result.error === "string" ? result.error : "Az automatizálás nem indítható újra.");
        return;
      }
      setLead(current => current ? { ...current, new_lead_dispatch_status: "accepted" } : current);
      setDispatchRetrySuccess("Az automatizálás elindult. A választervezet automatikusan megjelenik, amikor elkészült.");
    } catch {
      setDispatchRetryError("Az automatizálás nem indítható újra. Ellenőrizd a hálózati kapcsolatot.");
    } finally {
      setDispatchRetrying(false);
    }
  }

  useEffect(() => {
    async function initializePage() {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session) {
        router.replace("/login");
        return;
      }

      const { data, error } = await supabase
        .from("leads")
        .select(
          `
          id,
          company_id,
          assigned_user_id,
          next_action,
          next_action_due_date,
          name,
          email,
          phone,
          service,
          description,
          location,
          priority,
          status,
          outcome,
          source,
          new_lead_dispatch_status,
          privacy_notice_acknowledged_at,
          privacy_notice_version,
          anonymized_at,
          created_at,
          ai_summary,
          ai_safe_to_send,
          ai_requires_human_review,
          ai_risk_level,
          ai_risk_reason
          `
        )
        .eq("id", leadId)
        .single();

      if (error) {
        console.error("Lead betöltési hiba:", error);
        setLoading(false);
        return;
      }

      setLead(data);

      setName(data.name ?? "");
      setEmail(data.email ?? "");
      setPhone(data.phone ?? "");
      setService(data.service ?? "");
      setDescription(data.description ?? "");
      setLocation(data.location ?? "");
      setStatus(data.status ?? "new");
      setOutcome(data.outcome ?? "");
      setPriority(data.priority ?? "medium");
      setAiResult(data.ai_summary ?? "");

      const { data: messagesData, error: messagesError } = await supabase
        .from("messages")
        .select(messageSelect)
        .eq("lead_id", leadId)
        .order("created_at", { ascending: true });

      if (messagesError) {
        console.error("Üzenetek betöltési hiba:", messagesError);
      }

      try {
        const accessResponse = await fetch("/api/lead-assignees", {
          headers: { Authorization: `Bearer ${session.access_token}` },
          cache: "no-store",
        });
        if (accessResponse.ok) {
          const accessResult = await accessResponse.json() as { members?: unknown; currentUserId?: unknown; canAssign?: unknown };
          const members = Array.isArray(accessResult.members)
            ? accessResult.members.filter((member): member is LeadAssignee => Boolean(
              member &&
              typeof member === "object" &&
              typeof (member as LeadAssignee).id === "string" &&
              typeof (member as LeadAssignee).email === "string" &&
              typeof (member as LeadAssignee).role === "string"
            ))
            : [];
          setLeadAssignees(members);
          setNextActionCurrentUserId(typeof accessResult.currentUserId === "string" ? accessResult.currentUserId : null);
          setNextActionManagerAccess(accessResult.canAssign === true);
        }
      } catch {
        // The task remains visible and can still be managed from the Pipeline.
      }

      const messages = messagesData ?? [];

      setMessageHistory(messages);

      const selectedOutgoing = preferredReplyMessage(messages);

      if (selectedOutgoing) {
        setDraftMessageId(selectedOutgoing.id);
        setReplyDraft(selectedOutgoing.content ?? "");
        setMessageStatus(selectedOutgoing.status ?? "draft");
      }

      setLoading(false);
    }

    initializePage();
  }, [leadId, router]);

  useEffect(() => {
    if (loading || !lead || saving || draftSaving || replyLoading || aiLoading || riskLoading || markingSent || resolvingDelivery) return;
    let cancelled = false;
    let running = false;
    async function refresh() {
      if (running || document.hidden) return;
      running = true;
      try {
        const [leadResult, messagesResult] = await Promise.all([
          supabase.from("leads").select("status, assigned_user_id, next_action, next_action_due_date, new_lead_dispatch_status, anonymized_at, ai_summary, ai_safe_to_send, ai_requires_human_review, ai_risk_level, ai_risk_reason").eq("id", leadId).single(),
          supabase.from("messages").select(messageSelect).eq("lead_id", leadId).order("created_at", { ascending: true }),
        ]);
        if (cancelled) return;
        if (leadResult.error || messagesResult.error || !leadResult.data) {
          setSyncError(true);
          return;
        }
        setSyncError(false);
        const fresh = leadResult.data;
        setStatus(current => current === lead!.status ? fresh.status : current);
        setLead(current => current ? { ...current, ...fresh } : current);
        setAiResult(fresh.ai_summary ?? "");
        const messages = messagesResult.data ?? [];
        setMessageHistory(messages);
        const selected = replyDirty
          ? messages.find(message => message.id === draftMessageId && message.direction === "outgoing")
          : preferredReplyMessage(messages);
        if (selected) {
          // Preserve unsaved text, but still reflect a send completed elsewhere.
          if (!replyDirty) {
            setDraftMessageId(selected.id);
            setReplyDraft(selected.content ?? "");
          }
          if (!replyDirty || selected.id === draftMessageId) setMessageStatus(selected.status);
          if (selected.status === "sent") setMarkSentError("");
        }
      } catch {
        if (!cancelled) setSyncError(true);
      } finally { running = false; }
    }
    const timer = window.setInterval(refresh, 5000);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, [loading, lead, leadId, draftMessageId, replyDirty, saving, draftSaving, replyLoading, aiLoading, riskLoading, markingSent, resolvingDelivery]);

  useEffect(() => {
    if (!draftMessageId) return;
    let cancelled = false;
    async function loadDeliveryAudit() {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session || cancelled) return;
      const response = await fetch(`/api/messages/${draftMessageId}/delivery-status`, {
        headers: { Authorization: `Bearer ${session.access_token}` }, cache: "no-store",
      });
      if (!response.ok || cancelled) return;
      const result = await response.json();
      if (!cancelled) setDeliveryAudit(result);
    }
    void loadDeliveryAudit();
    return () => { cancelled = true; };
  }, [draftMessageId, messageStatus]);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();

    if (!lead) return;

    setSaving(true);
    setSaveSuccess(false);
    setSaveError("");

    if (status === "processed" && !outcome) {
      setSaveError("A lezáráshoz válaszd ki, hogy az ügylet megvalósult-e.");
      setSaving(false);
      return;
    }

    const { error } = await supabase
      .from("leads")
      .update({
        name,
        email,
        phone,
        service,
        description,
        location,
        status,
        outcome: status === "processed" ? outcome : null,
        priority,
        updated_at: new Date().toISOString(),
      })
      .eq("id", lead.id);

    if (error) {
      console.error("Mentési hiba:", error);
      setSaveError("A módosítások mentése nem sikerült. Próbáld újra.");
      setSaving(false);
      return;
    }

    setLead({
      ...lead,
      name,
      email,
      phone,
      service,
      description,
      location,
      status,
      outcome: status === "processed" ? outcome : null,
      priority,
      next_action: status === "processed" ? null : lead.next_action,
      next_action_due_date: status === "processed" ? null : lead.next_action_due_date,
    });

    setSaving(false);
    setSaveSuccess(true);

    setTimeout(() => {
      setSaveSuccess(false);
    }, 2500);
  }

  async function handleAiAnalysis() {
    if (!lead) return;

    setAiLoading(true);
    setAiError("");

    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session) {
        throw new Error("A felhasználói munkamenet nem érhető el.");
      }

      const response = await fetch("/api/analyze-lead", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          lead_id: lead.id,
          name,
          email,
          phone,
          service,
          description,
          location,
          priority,
          status,
          source: lead.source,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Az AI-feldolgozás sikertelen.");
      }

      const result =
        data.result || "Az AI nem adott vissza eredményt.";

      const { error: saveAiError } = await supabase
        .from("leads")
        .update({
          ai_summary: result,
          updated_at: new Date().toISOString(),
        })
        .eq("id", lead.id);

      if (saveAiError) {
        console.error("AI eredmény mentési hiba:", saveAiError);

        throw new Error(
          "Az AI elemzés elkészült, de nem sikerült elmenteni az adatbázisba."
        );
      }

      setAiResult(result);

      setLead({
        ...lead,
        ai_summary: result,
      });
    } catch (error) {
      console.error("AI feldolgozási hiba:", error);

      setAiError(
        error instanceof Error
          ? error.message
          : "Ismeretlen hiba történt az AI-feldolgozás során."
      );
    } finally {
      setAiLoading(false);
    }
  }

  async function handleGenerateReply() {
    if (!lead) return;

    setReplyLoading(true);
    setReplyError("");
    setDraftSaveSuccess(false);
    setDraftSaveError("");
    setMarkSentError("");

    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session) {
        throw new Error(
          "A felhasználói munkamenet nem érhető el."
        );
      }

      const response = await fetch("/api/generate-reply", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          name,
          email,
          phone,
          service,
          description,
          location,
          priority,
          status,
          source: lead.source,
          aiSummary: aiResult,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(
          data.error ||
            "A választervezet elkészítése sikertelen."
        );
      }

      setReplyDirty(true);
      setReplyDraft(
        data.reply ||
          "Az AI nem adott vissza választervezetet."
      );

      if (
        messageStatus === "sent" ||
        messageStatus === "sending"
      ) {
        setDraftMessageId(null);
        setDeliveryAudit(null);
        setMessageStatus(null);
      }
    } catch (error) {
      console.error("Választervezet hiba:", error);

      setReplyError(
        error instanceof Error
          ? error.message
          : "Ismeretlen hiba történt a választervezet készítése során."
      );
    } finally {
      setReplyLoading(false);
    }
  }

  async function handleSaveDraft() {
    if (!lead || !replyDraft.trim()) return;

    if (messageStatus === "sending") {
      setDraftSaveError(
        "Küldés közben a válasz már nem módosítható."
      );
      return;
    }

    setDraftSaving(true);
    setDraftSaveSuccess(false);
    setDraftSaveError("");
    setMarkSentError("");

    try {
      if (
        draftMessageId &&
        messageStatus === "draft"
      ) {
        const { error } = await supabase
          .from("messages")
          .update({
            content: replyDraft,
          })
          .eq("id", draftMessageId);

        if (error) {
          throw error;
        }

        setMessageHistory((current) =>
          current.map((message) =>
            message.id === draftMessageId
              ? {
                  ...message,
                  content: replyDraft,
                }
              : message
          )
        );
      } else {
        const { data, error } = await supabase
          .from("messages")
          .insert({
            company_id: lead.company_id,
            lead_id: lead.id,
            direction: "outgoing",
            sender: "company",
            content: replyDraft,
            channel: lead.source || "manual",
            status: "draft",
          })
          .select(messageSelect)
          .single();

        if (error) {
          throw error;
        }

        setDraftMessageId(data.id);
        setMessageStatus("draft");

        setMessageHistory((current) => [
          ...current,
          data,
        ]);
      }

      setReplyDirty(false);
      setDraftSaveSuccess(true);

      if (
        lead.ai_safe_to_send !== null ||
        lead.ai_requires_human_review !== null ||
        lead.ai_risk_level ||
        lead.ai_risk_reason
      ) {
        const { error: resetRiskError } = await supabase
          .from("leads")
          .update({
            ai_safe_to_send: null,
            ai_requires_human_review: null,
            ai_risk_level: null,
            ai_risk_reason: null,
            updated_at: new Date().toISOString(),
          })
          .eq("id", lead.id)
          .eq("company_id", lead.company_id);

        if (resetRiskError) {
          throw new Error(
            "A piszkozat elmentve, de a korábbi kockázatértékelést nem sikerült törölni. Frissítsd az oldalt, majd indíts új értékelést."
          );
        }

        setLead((current) => current ? {
          ...current,
          ai_safe_to_send: null,
          ai_requires_human_review: null,
          ai_risk_level: null,
          ai_risk_reason: null,
        } : current);
      }

      setRiskError("");
      setRiskSuccess("");

      setTimeout(() => {
        setDraftSaveSuccess(false);
      }, 2500);
    } catch (error) {
      console.error("Piszkozat mentési hiba:", error);

      setDraftSaveError(
        error instanceof Error
          ? error.message
          : "Nem sikerült elmenteni a választervezetet."
      );
    } finally {
      setDraftSaving(false);
    }
  }

  async function handleEvaluateReply() {
    if (!lead || !draftMessageId || replyDirty || !replyDraft.trim() || riskLoading) return;

    setRiskLoading(true);
    setRiskError("");
    setRiskSuccess("");

    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session) {
        throw new Error("A felhasználói munkamenet nem érhető el.");
      }

      const response = await fetch("/api/evaluate-reply", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          lead_id: lead.id,
          reply: replyDraft,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(
          data.error || "A válasz biztonsági értékelése sikertelen."
        );
      }

      setLead((current) => current ? {
        ...current,
        ai_safe_to_send: data.safe_to_send,
        ai_requires_human_review: data.requires_human_review,
        ai_risk_reason: data.risk_reason,
        ai_risk_level: data.risk_level,
      } : current);
      setRiskSuccess("A kockázatértékelés elkészült.");
    } catch (error) {
      setRiskError(
        error instanceof Error
          ? error.message
          : "A válasz biztonsági értékelése sikertelen."
      );
    } finally {
      setRiskLoading(false);
    }
  }

  async function handleMarkAsSent() {
    if (!draftMessageId || replyDirty || markingSent) return;

    setMarkingSent(true);
    setMarkSentError("");
    setDraftSaveSuccess(false);

    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session) {
        throw new Error(
          "A felhasználói munkamenet nem érhető el."
        );
      }

      const currentMessageId = draftMessageId;

      const response = await fetch(
        "/api/send-approved-reply",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({
            message_id: currentMessageId,
          }),
        }
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(
          data.error ||
            "Nem sikerült elindítani az e-mail küldést."
        );
      }

      setMessageStatus("sending");

      setMessageHistory((current) =>
        current.map((message) =>
          message.id === currentMessageId
            ? {
                ...message,
                status: "sending",
              }
            : message
        )
      );

      // Background refresh keeps following the persisted status.
    } catch (error) {
      // A lost browser response may follow an accepted send request.
      setMessageStatus("sending");
      try {
        const { data: currentMessage } = await supabase
          .from("messages").select("status").eq("id", draftMessageId).single();
        if (currentMessage) setMessageStatus(currentMessage.status);
      } catch { /* Keep locked until the persisted state is available. */ }
      console.error("E-mail küldési hiba:", error);

      setMarkSentError(
        error instanceof Error
          ? error.message
          : "Nem sikerült elindítani az e-mail küldést."
      );
    } finally {
      setMarkingSent(false);
    }
  }

  async function handleResolveDelivery(result: "sent" | "failed") {
    if (!draftMessageId || resolvingDelivery || !delayedSending) return;
    if (result === "failed" && !window.confirm("Csak akkor folytasd, ha a Make futását és a Gmail Elküldött levelek mappát is ellenőrizted, és biztos vagy benne, hogy az üzenet nem ment ki. Sikertelennek jelöljük?")) return;

    setResolvingDelivery(true);
    setMarkSentError("");
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error("A felhasználói munkamenet nem érhető el.");
      const response = await fetch(`/api/messages/${draftMessageId}/resolve-delivery`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({ result }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "A küldés állapota nem rendezhető.");
      setMessageStatus(data.message.status);
      setMessageHistory(current => current.map(message => message.id === draftMessageId
        ? { ...message, ...data.message }
        : message));
    } catch (error) {
      setMarkSentError(error instanceof Error ? error.message : "A küldés állapota nem rendezhető.");
    } finally {
      setResolvingDelivery(false);
    }
  }

  function openNextActionEditor() {
    if (!lead || lead.status === "processed") return;
    setNextActionDraft(lead.next_action ?? "");
    setNextActionDueDateDraft(lead.next_action_due_date ?? budapestDateOffset(1));
    setNextActionExpected({ nextAction: lead.next_action, dueDate: lead.next_action_due_date });
    setNextActionError("");
    setNextActionSuccess("");
    setNextActionEditorOpen(true);
  }

  function closeNextActionEditor() {
    if (nextActionSaving) return;
    const hasDraftChanges = nextActionDraft !== (nextActionExpected.nextAction ?? "")
      || nextActionDueDateDraft !== (nextActionExpected.dueDate ?? "");
    if (hasDraftChanges && !window.confirm("A teendő módosításai nincsenek elmentve. Biztosan elveted őket?")) return;
    setNextActionEditorOpen(false);
    setNextActionError("");
  }

  async function persistNextAction(clear = false) {
    if (!lead || nextActionSaving) return;
    const nextAction = nextActionDraft.trim();
    if (!clear && (!nextAction || nextAction.length > NEXT_ACTION_MAX_LENGTH || !isValidDateOnly(nextActionDueDateDraft))) {
      setNextActionError(`Írd le a következő teendőt, és válassz határidőt. A leírás legfeljebb ${NEXT_ACTION_MAX_LENGTH} karakter lehet.`);
      return;
    }

    setNextActionSaving(true);
    setNextActionError("");
    setNextActionSuccess("");
    let failureMessage = "A következő teendő mentése nem sikerült. Frissítsd az oldalt, majd próbáld újra.";
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        failureMessage = "A munkamenet lejárt. Jelentkezz be újra.";
        throw new Error("missing session");
      }
      const response = await fetch("/api/lead-next-action", {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${session.access_token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          leadId: lead.id,
          nextAction: clear ? null : nextAction,
          dueDate: clear ? null : nextActionDueDateDraft,
          expectedNextAction: nextActionExpected.nextAction,
          expectedDueDate: nextActionExpected.dueDate,
        }),
      });
      let result: { error?: unknown; nextAction?: string | null; dueDate?: string | null } = {};
      try {
        result = await response.json() as typeof result;
      } catch {
        result = {};
      }
      if (!response.ok) {
        if (typeof result.error === "string" && result.error) failureMessage = result.error;
        throw new Error("request failed");
      }
      const savedNextAction = typeof result.nextAction === "string" ? result.nextAction : null;
      const savedDueDate = typeof result.dueDate === "string" ? result.dueDate : null;
      setLead(current => current ? { ...current, next_action: savedNextAction, next_action_due_date: savedDueDate } : current);
      setNextActionExpected({ nextAction: savedNextAction, dueDate: savedDueDate });
      setNextActionEditorOpen(false);
      setNextActionSuccess(clear ? "A teendő törölve." : "A teendő elmentve.");
    } catch {
      setNextActionError(failureMessage);
    } finally {
      setNextActionSaving(false);
    }
  }

  function getSourceLabel(source: string | null) {
    if (source === "manual") return "Kézi felvétel";
    if (source === "email") return "E-mail";
    if (source === "web") return "Weboldal";
    if (source === "messenger") return "Messenger";

    return source || "—";
  }

  function getLeadStatusLabel(leadStatus: string | null) {
    if (leadStatus === "new") return "Új";
    if (leadStatus === "contacted") return "Kapcsolatfelvétel megtörtént";
    if (leadStatus === "waiting") return "Válaszra vár";
    if (leadStatus === "offer_sent") return "Ajánlat elküldve";
    if (leadStatus === "decision") return "Döntésre vár";
    if (leadStatus === "processed") return "Feldolgozott";

    return leadStatus || "—";
  }

  function getPriorityLabel(leadPriority: string | null) {
    if (leadPriority === "low") return "Alacsony";
    if (leadPriority === "medium") return "Közepes";
    if (leadPriority === "high") return "Magas";

    return leadPriority || "—";
  }

  function getMessageStatusLabel(
    messageStatus: string | null
  ) {
    if (messageStatus === "draft") return "Piszkozat";
    if (messageStatus === "sending")
      return "Küldés folyamatban";
    if (messageStatus === "sent") return "Elküldött";
    if (messageStatus === "failed") return "Sikertelen";
    if (messageStatus === "received") return "Beérkezett";

    return messageStatus || "—";
  }

  function getDirectionLabel(direction: string) {
    if (direction === "outgoing") return "Kimenő";
    if (direction === "incoming") return "Bejövő";

    return direction;
  }

  function getChannelLabel(channel: string | null) {
    if (channel === "manual") return "Kézi";
    if (channel === "email") return "E-mail";
    if (channel === "web") return "Weboldal";
    if (channel === "messenger") return "Messenger";

    return channel || "—";
  }

  function getRiskLevelLabel(
    riskLevel: string | null
  ) {
    if (riskLevel === "low") return "Alacsony";
    if (riskLevel === "medium") return "Közepes";
    if (riskLevel === "high") return "Magas";

    return riskLevel || "Nincs értékelés";
  }

  function getRiskLevelClasses(
    riskLevel: string | null
  ) {
    if (riskLevel === "low") {
      return "border-emerald-200 bg-emerald-50 text-emerald-800";
    }

    if (riskLevel === "medium") {
      return "border-amber-200 bg-amber-50 text-amber-800";
    }

    if (riskLevel === "high") {
      return "border-red-200 bg-red-50 text-red-800";
    }

    return "border-slate-200 bg-slate-50 text-slate-700";
  }

  function formatMessageDate(date: string) {
    return new Intl.DateTimeFormat("hu-HU", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    }).format(new Date(date));
  }

  const hasUnsavedLeadChanges = Boolean(lead && (
    name !== (lead.name ?? "") ||
    email !== (lead.email ?? "") ||
    phone !== (lead.phone ?? "") ||
    service !== (lead.service ?? "") ||
    description !== (lead.description ?? "") ||
    location !== (lead.location ?? "") ||
    status !== (lead.status ?? "new") ||
    outcome !== (lead.outcome ?? "") ||
    priority !== (lead.priority ?? "medium")
  ));
  const hasUnsavedNextAction = nextActionEditorOpen && (
    nextActionDraft !== (nextActionExpected.nextAction ?? "") ||
    nextActionDueDateDraft !== (nextActionExpected.dueDate ?? "")
  );
  const hasUnsavedChanges = hasUnsavedLeadChanges || hasUnsavedNextAction || replyDirty || noteDirty || structuredCaptureDirty;

  useEffect(() => {
    if (!hasUnsavedChanges) return;
    function warnBeforeLeaving(event: BeforeUnloadEvent) {
      event.preventDefault();
      event.returnValue = "";
    }
    window.addEventListener("beforeunload", warnBeforeLeaving);
    return () => window.removeEventListener("beforeunload", warnBeforeLeaving);
  }, [hasUnsavedChanges]);

  function returnToLeadList() {
    if (hasUnsavedChanges && !window.confirm("Mentetlen módosításaid vannak. Biztosan visszalépsz az érdeklődők listájához?")) return;
    router.push("/leads");
  }

  if (loading) {
    return (
      <AppShell>
        <div className="flex min-h-[50vh] items-center justify-center text-lg font-semibold text-slate-600">
          Betöltés...
        </div>
      </AppShell>
    );
  }

  if (!lead) {
    return (
      <AppShell>
        <div className="flex min-h-[50vh] items-center justify-center text-center">
          <div>
          <h1 className="text-2xl font-bold text-slate-900">
            Az érdeklődő nem található
          </h1>

          <button
            onClick={() => router.push("/leads")}
            className="mt-6 rounded-xl bg-violet-600 px-5 py-3 font-semibold text-white"
          >
            Vissza az érdeklődőkhöz
          </button>
          </div>
        </div>
      </AppShell>
    );
  }

  if (lead.anonymized_at) {
    const outcomeText = lead.outcome === "won"
      ? "Megvalósult"
      : lead.outcome === "lost" ? "Nem valósult meg" : "Eredmény nélkül lezárt";
    const sourceText = lead.source === "web"
      ? "Weboldal"
      : lead.source === "email" ? "E-mail"
        : lead.source === "messenger" ? "Messenger"
          : lead.source === "manual" ? "Kézi felvétel" : lead.source || "—";
    return (
      <AppShell>
          <button onClick={() => router.push("/leads")} className="mb-5 block text-sm font-medium text-violet-600 hover:text-violet-700">
            ← Vissza az érdeklődőkhöz
          </button>
          <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
            <span className="inline-flex rounded-full bg-slate-200 px-3 py-1 text-xs font-semibold text-slate-700">Anonimizált ügy</span>
            <h1 className="mt-4 text-3xl font-bold text-slate-900">Anonimizált érdeklődő</h1>
            <p className="mt-3 leading-7 text-slate-600">
              A megőrzési idő lejárta után a személyes adatok, üzenetek, belső megjegyzések és AI-tartalmak véglegesen törlődtek. A riportokhoz szükséges nem személyes adatok megmaradtak.
            </p>
            <dl className="mt-6 grid gap-4 sm:grid-cols-2">
              <div className="rounded-xl bg-slate-50 p-4"><dt className="text-sm text-slate-500">Érkezett</dt><dd className="mt-1 font-semibold text-slate-900">{displayReceivedAt(lead.created_at)}</dd></div>
              <div className="rounded-xl bg-slate-50 p-4"><dt className="text-sm text-slate-500">Lezárás eredménye</dt><dd className="mt-1 font-semibold text-slate-900">{outcomeText}</dd></div>
              <div className="rounded-xl bg-slate-50 p-4"><dt className="text-sm text-slate-500">Forrás</dt><dd className="mt-1 font-semibold text-slate-900">{sourceText}</dd></div>
              <div className="rounded-xl bg-slate-50 p-4"><dt className="text-sm text-slate-500">Anonimizálva</dt><dd className="mt-1 font-semibold text-slate-900">{displayReceivedAt(lead.anonymized_at)}</dd></div>
            </dl>
            <p className="mt-6 text-sm text-slate-500">Az anonimizálás nem vonható vissza, és ehhez az ügyhöz új tartalom már nem rögzíthető.</p>
          </section>
      </AppShell>
    );
  }

  const hasRiskEvaluation =
    lead.ai_safe_to_send !== null ||
    lead.ai_requires_human_review !== null ||
    Boolean(lead.ai_risk_level) ||
    Boolean(lead.ai_risk_reason);

  const messageLocked =
    messageStatus === "sent" ||
    messageStatus === "sending";
  const sendingStartedAt = messageHistory.find(message => message.id === draftMessageId)?.sending_started_at;
  const selectedMessage = messageHistory.find(message => message.id === draftMessageId);
  const deliveryConfirmedAt = selectedMessage?.delivery_confirmed_at ?? null;
  const deliveryFailedAt = selectedMessage?.delivery_failed_at ?? null;
  const deliveryResolutionSource = selectedMessage?.delivery_resolution_source ?? null;
  const delayedSending = isDelayedSending({ status: messageStatus, sending_started_at: sendingStartedAt ?? null });
  const dispatchWarning = newLeadDispatchWarning(lead.new_lead_dispatch_status, lead.created_at);
  const draftWarning = missingAiDraftWarning(lead, messageHistory.some(message => message.direction === "outgoing"));
  const canEditNextAction = nextActionManagerAccess || Boolean(nextActionCurrentUserId && lead.assigned_user_id === nextActionCurrentUserId);
  const currentNextActionDueState = nextActionDueState(lead.next_action_due_date);
  const currentNextActionDueClass = currentNextActionDueState === "overdue"
    ? "next-action-due-overdue"
    : currentNextActionDueState === "today"
      ? "next-action-due-today"
      : currentNextActionDueState === "soon"
        ? "next-action-due-soon"
        : "bg-slate-100 text-slate-700";
  const assignedAssignee = lead.assigned_user_id
    ? leadAssignees.find((assignee) => assignee.id === lead.assigned_user_id) ?? null
    : null;
  const assignedAssigneeLabel = assignedAssignee?.email
    ?? (lead.assigned_user_id ? "Kijelölt felelős" : "Nincs kijelölve");

  return (
    <AppShell hasUnsavedChanges={hasUnsavedChanges}>
        <header id="lead-summary" className="mb-8 scroll-mt-24">
          <button
            onClick={returnToLeadList}
            className="mb-4 block text-sm font-medium text-violet-600 hover:text-violet-700"
          >
            ← Vissza az érdeklődőkhöz
          </button>

          <h1 className="text-3xl font-bold text-slate-900">
            {name || "Névtelen érdeklődő"}
          </h1>

          <p className="mt-2 text-slate-500">
            Érdeklődő adatlap és szerkesztés
          </p>
          <p className="mt-2 text-sm text-slate-600">
            Érkezett: <time dateTime={lead.created_at}>{displayReceivedAt(lead.created_at)}</time>
          </p>

          <dl className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
            <div className="min-w-0 rounded-xl border border-slate-200 bg-blue-50 px-4 py-3">
              <dt className="text-xs font-semibold uppercase tracking-wide text-blue-700">Állapot</dt>
              <dd className="mt-1 truncate font-bold text-slate-900" title={getLeadStatusLabel(status)}>{getLeadStatusLabel(status)}</dd>
            </div>
            <div className="min-w-0 rounded-xl border border-slate-200 bg-white px-4 py-3">
              <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">Felelős</dt>
              <dd className="mt-1 truncate font-bold text-slate-900" title={assignedAssigneeLabel}>{assignedAssigneeLabel}</dd>
            </div>
            <div className="min-w-0 rounded-xl border border-slate-200 bg-amber-50 px-4 py-3">
              <dt className="text-xs font-semibold uppercase tracking-wide text-amber-700">Prioritás</dt>
              <dd className="mt-1 font-bold text-slate-900">{getPriorityLabel(priority)}</dd>
            </div>
            <div className="min-w-0 rounded-xl border border-slate-200 bg-green-50 px-4 py-3">
              <dt className="text-xs font-semibold uppercase tracking-wide text-green-700">Szolgáltatás</dt>
              <dd className="mt-1 truncate font-bold text-slate-900" title={service || "Nincs megadva"}>{service || "Nincs megadva"}</dd>
            </div>
            <div className="min-w-0 rounded-xl border border-slate-200 bg-white px-4 py-3">
              <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">Forrás</dt>
              <dd className="mt-1 font-bold text-slate-900">{getSourceLabel(lead.source)}</dd>
            </div>
          </dl>

          <nav aria-label="Ugrás az adatlap szakaszaihoz" className="mt-4 flex gap-2 overflow-x-auto pb-1">
            {[
              ["#next-action", "Teendő"],
              ["#lead-data", "Ügyféladatok"],
              ["#ai-response", "AI és válasz"],
              ["#lead-communication", "Előzmények"],
              ["#internal-notes", "Belső jegyzetek"],
            ].map(([href, label]) => (
              <a key={href} href={href} className="shrink-0 rounded-full border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 shadow-sm hover:border-blue-300 hover:text-blue-700">
                {label}
              </a>
            ))}
          </nav>
        </header>

        {dispatchWarning && <section role="alert" className="mb-6 rounded-2xl border border-amber-300 bg-amber-50 p-5 text-amber-950 shadow-sm">
          <h2 className="font-bold">Az automatizálás indítása figyelmet igényel</h2>
          <p className="mt-2 text-sm leading-6">{dispatchWarning}</p>
          {lead.new_lead_dispatch_status === "unconfigured" && <button type="button" disabled={dispatchRetrying}
            onClick={() => void handleRetryLeadAutomation()}
            className="mt-4 rounded-xl bg-amber-900 px-4 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-60">
            {dispatchRetrying ? "Újraindítás…" : "Automatizálás újraindítása"}
          </button>}
          {dispatchRetryError && <p className="mt-3 text-sm font-semibold text-red-700">{dispatchRetryError}</p>}
        </section>}
        {dispatchRetrySuccess && <p role="status" className="mb-6 rounded-2xl border border-green-200 bg-green-50 p-5 text-sm font-semibold text-green-800">{dispatchRetrySuccess}</p>}
        {draftWarning && <section role="alert" className="mb-6 rounded-2xl border border-amber-300 bg-amber-50 p-5 text-amber-950 shadow-sm">
          <h2 className="font-bold">Az AI-választervezet késik</h2>
          <p className="mt-2 text-sm leading-6">{draftWarning}</p>
        </section>}

        <section aria-label="Válasz állapota" className={delayedSending || messageStatus === "failed" ? "mb-8 rounded-2xl border border-red-200 bg-red-50 p-4 shadow-sm sm:p-6" : "mb-8 rounded-2xl border border-violet-100 bg-white p-4 shadow-sm sm:p-6"}>
          <p className="text-xs font-semibold uppercase tracking-wide text-violet-600">Válasz állapota</p>
          <h2 role="status" className="mt-2 text-xl font-bold text-slate-900">
            {messageStatus === "failed" ? "A válasz küldése sikertelen" : delayedSending ? "A küldési visszaigazolás késik" : messageStatus === "sending" ? "Küldés visszaigazolására várunk" : messageStatus === "sent" ? "Válasz elküldve" : replyLoading ? "Válasz készül…" : replyDraft ? "Válasz ellenőrzése" : "Még nincs választervezet"}
          </h2>
          <p className="mt-2 text-sm leading-6 text-slate-600">
            {messageStatus === "failed" && deliveryFailedAt ? `${deliveryResolutionSource === "manual" ? "Kézi ellenőrzés" : "A Gmail"} ${displayReceivedAt(deliveryFailedAt)} időpontban igazolta, hogy az üzenet nem ment ki. Ellenőrzés után biztonságosan újrapróbálhatod a küldést.` : messageStatus === "failed" ? "A Make igazolta, hogy a Gmail nem küldte el az üzenetet. Ellenőrzés után biztonságosan újrapróbálhatod a küldést." : delayedSending ? "A visszaigazolás több mint 60 perce késik. Ellenőrizd a saját Make-futást és a Gmail Elküldött levelek mappát. Ne küldd újra az üzenetet, amíg a kézbesítés eredménye nem tisztázott." : messageStatus === "sending" ? "Az újraküldés zárolva van. A visszaigazolás automatikusan megjelenik." : messageStatus === "sent" && deliveryConfirmedAt ? `${deliveryResolutionSource === "manual" ? "Kézi ellenőrzés" : "A Gmail"} ${displayReceivedAt(deliveryConfirmedAt)} időpontban visszaigazolta a küldést. Most az érdeklődő válaszát várhatod.` : messageStatus === "sent" ? "Az üzenet elküldöttként van rögzítve. Most az érdeklődő válaszát várhatod." : replyDirty ? "A válaszban nem mentett módosítás van. Küldés előtt mentsd a piszkozatot." : replyDraft ? "Olvasd át a választ és ellenőrizd a címzettet. A küldés a válasz alatt indítható." : "A háttérben elkészülő válasz itt automatikusan megjelenik. Szükség esetén kézzel is készíthetsz tervezetet."}
          </p>
          {deliveryAudit && deliveryAudit.attemptCount > 0 && <p className="mt-3 text-sm font-medium text-slate-700">Küldési próbálkozások: {deliveryAudit.attemptCount}{deliveryAudit.lastAttemptAt ? ` · Utolsó indítás: ${displayReceivedAt(deliveryAudit.lastAttemptAt)}` : ""}</p>}
          <a href="#reply" className="mt-4 inline-flex rounded-xl bg-violet-600 px-4 py-2 font-semibold text-white">{messageStatus === "sent" ? "Elküldött válasz megtekintése" : "Ugrás a válaszhoz"}</a>
          <p className={syncError ? "mt-3 text-sm text-amber-700" : "mt-3 text-xs text-slate-500"} role="status">
            {syncError ? "Az automatikus frissítés átmenetileg nem érhető el. Újrapróbáljuk; a szerkesztett szöveg megmarad." : "Az állapot és az üzenetek 5 másodpercenként automatikusan frissülnek."}
          </p>
        </section>
        <form onSubmit={handleSave}>
          <div className="space-y-10">
            <section aria-labelledby="daily-work-title">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-blue-600">Napi munka</p>
                <h2 id="daily-work-title" className="mt-1 text-2xl font-bold text-slate-900">Munkafókusz</h2>
                <p className="mt-2 text-sm leading-6 text-slate-600">Rögzítsd a következő teendőt, majd tartsd naprakészen az ügy állapotát és prioritását.</p>
              </div>
              <div className="mt-5 grid items-start gap-6 lg:grid-cols-2">
                <section id="next-action" className="h-full scroll-mt-24 rounded-2xl border border-blue-200 bg-white p-4 shadow-sm sm:p-6">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <h2 className="text-xl font-bold text-slate-900">Következő teendő</h2>
                      <p className="mt-1 text-sm leading-6 text-slate-500">Az ügyhöz tartozó aktuális feladat és határidő.</p>
                    </div>
                    {!nextActionEditorOpen && lead.status !== "processed" && canEditNextAction && <button type="button" onClick={openNextActionEditor}
                      className="rounded-xl border border-blue-200 px-3 py-2 text-sm font-semibold text-blue-700 hover:bg-blue-50">
                      {lead.next_action ? "Módosítás" : "+ Teendő"}
                    </button>}
                  </div>

                  {lead.status === "processed" ? <p className="mt-5 rounded-xl bg-slate-50 p-4 text-sm text-slate-600">A lezárt ügyhöz nincs aktív teendő.</p>
                    : nextActionEditorOpen ? <div className="mt-5 space-y-4">
                      <div>
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <label htmlFor="lead-next-action" className="text-sm font-semibold text-slate-700">Mit kell elintézni?</label>
                          <VoiceDictationButton value={nextActionDraft} onChange={setNextActionDraft} disabled={nextActionSaving}
                            maxLength={NEXT_ACTION_MAX_LENGTH} fieldLabel="Következő teendő" />
                        </div>
                        <textarea id="lead-next-action" rows={4} maxLength={NEXT_ACTION_MAX_LENGTH} value={nextActionDraft}
                          onChange={event => setNextActionDraft(event.target.value)} disabled={nextActionSaving}
                          className="mt-2 w-full resize-y rounded-xl border border-slate-300 bg-white px-3 py-3 text-slate-900 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                          placeholder="Például: Telefonos egyeztetés az ajánlat részleteiről" />
                      </div>
                      <p className="text-right text-xs text-slate-500">{nextActionDraft.length}/{NEXT_ACTION_MAX_LENGTH}</p>
                      <label className="block text-sm font-semibold text-slate-700">Határidő
                        <input type="date" value={nextActionDueDateDraft} onChange={event => setNextActionDueDateDraft(event.target.value)} disabled={nextActionSaving}
                          className="mt-2 w-full rounded-xl border border-slate-300 bg-white px-3 py-3 text-slate-900 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100" />
                      </label>
                      <div className="flex flex-wrap gap-2" aria-label="Gyors határidő választás">
                        {([[0, "Ma"], [1, "Holnap"], [3, "+3 nap"]] as const).map(([days, label]) => <button key={days} type="button"
                          disabled={nextActionSaving} onClick={() => setNextActionDueDateDraft(budapestDateOffset(days))}
                          className="rounded-lg border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-700 disabled:opacity-50">
                          {label}
                        </button>)}
                      </div>
                      {nextActionError && <p role="alert" className="rounded-xl bg-red-50 p-3 text-sm font-medium text-red-800">{nextActionError}</p>}
                      <div className="grid gap-3 sm:grid-cols-2">
                        <button type="button" onClick={() => void persistNextAction()} disabled={nextActionSaving || !nextActionDraft.trim() || !isValidDateOnly(nextActionDueDateDraft)}
                          className="rounded-xl bg-blue-600 px-4 py-3 font-semibold text-white disabled:opacity-50">
                          {nextActionSaving ? "Mentés…" : "Teendő mentése"}
                        </button>
                        <button type="button" onClick={closeNextActionEditor} disabled={nextActionSaving}
                          className="rounded-xl border border-slate-200 px-4 py-3 font-semibold text-slate-700 disabled:opacity-50">Mégse</button>
                      </div>
                      {lead.next_action && <button type="button" disabled={nextActionSaving}
                        onClick={() => { if (window.confirm("Biztosan törlöd az aktuális teendőt?")) void persistNextAction(true); }}
                        className="w-full rounded-xl px-4 py-3 text-sm font-semibold text-red-700 hover:bg-red-50 disabled:opacity-50">
                        Teendő törlése
                      </button>}
                    </div> : lead.next_action ? <div className="mt-5 rounded-xl border border-slate-200 bg-slate-50 p-4">
                      <p className="break-words font-semibold text-slate-900">{lead.next_action}</p>
                      <span className={`mt-3 inline-flex rounded-full px-3 py-1 text-xs font-semibold ${currentNextActionDueClass}`}>
                        {displayNextActionDueDate(lead.next_action_due_date)}
                      </span>
                    </div> : <p className="mt-5 rounded-xl border border-dashed border-slate-300 p-4 text-sm text-slate-500">Ehhez az ügyhöz még nincs következő teendő.</p>}

                  {!canEditNextAction && lead.status !== "processed" && <p className="mt-4 text-xs leading-5 text-slate-500">A teendőt a felelős, a tulajdonos vagy egy adminisztrátor módosíthatja.</p>}
                  {nextActionSuccess && !nextActionEditorOpen && <p role="status" className="mt-4 rounded-xl bg-emerald-50 p-3 text-sm font-medium text-emerald-700">✓ {nextActionSuccess}</p>}
                  {nextActionError && !nextActionEditorOpen && <p role="alert" className="mt-4 rounded-xl bg-red-50 p-3 text-sm font-medium text-red-800">{nextActionError}</p>}
                  <Link href="/pipeline" className="accent-text mt-4 inline-flex text-sm font-semibold">Pipeline megnyitása →</Link>
                </section>

                <div className="h-full rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6">
                  <h2 className="mb-6 text-xl font-bold">
                    Ügy állapota
                  </h2>

                  <div className="space-y-5">
                    <div>
                      <label className="mb-2 block text-sm font-medium text-slate-700">
                        Állapot
                      </label>

                      <select
                        value={status}
                        onChange={(e) => {
                          setStatus(e.target.value);
                          if (e.target.value !== "processed") setOutcome("");
                          setSaveError("");
                        }}
                        className="w-full rounded-xl border border-slate-200 px-4 py-3 outline-none focus:border-violet-400"
                      >
                        <option value="new">Új</option>

                        <option value="contacted">
                          Kapcsolatfelvétel megtörtént
                        </option>

                        <option value="waiting">
                          Válaszra vár
                        </option>

                        <option value="offer_sent">
                          Ajánlat elküldve
                        </option>

                        <option value="decision">
                          Döntésre vár
                        </option>

                        <option value="processed">
                          Feldolgozott
                        </option>
                      </select>
                    </div>

                    {status === "processed" && (
                      <div>
                        <label htmlFor="lead-outcome" className="mb-2 block text-sm font-medium text-slate-700">
                          Eredmény
                        </label>
                        <select id="lead-outcome" value={outcome}
                          onChange={(e) => { setOutcome(e.target.value); setSaveError(""); }}
                          required
                          className="w-full rounded-xl border border-slate-200 px-4 py-3 outline-none focus:border-violet-400"
                        >
                          <option value="">Válassz eredményt</option>
                          <option value="won">Megvalósult</option>
                          <option value="lost">Nem valósult meg</option>
                        </select>
                        {!lead.outcome && <p className="mt-2 text-xs text-slate-500">A korábban lezárt ügyek eredménye csak rögzítés után jelenik meg a riportokban.</p>}
                      </div>
                    )}

                    <div>
                      <label className="mb-2 block text-sm font-medium text-slate-700">
                        Prioritás
                      </label>

                      <select
                        value={priority}
                        onChange={(e) =>
                          setPriority(e.target.value)
                        }
                        className="w-full rounded-xl border border-slate-200 px-4 py-3 outline-none focus:border-violet-400"
                      >
                        <option value="low">
                          Alacsony
                        </option>
                        <option value="medium">
                          Közepes
                        </option>
                        <option value="high">
                          Magas
                        </option>
                      </select>
                    </div>

                    <button
                      type="submit"
                      disabled={saving}
                      className="w-full rounded-xl bg-violet-600 px-4 py-3 font-semibold text-white hover:bg-violet-700 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {saving
                        ? "Mentés..."
                        : "Módosítások mentése"}
                    </button>

                    {saveSuccess && (
                      <div className="rounded-xl bg-green-50 px-4 py-3 text-sm font-medium text-green-700">
                        ✓ A módosítások elmentve.
                      </div>
                    )}
                    {saveError && <p role="alert" className="text-sm text-red-700">{saveError}</p>}
                  </div>
                </div>
              </div>
            </section>

            <section id="lead-data" aria-labelledby="lead-data-title" className="scroll-mt-24">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-emerald-600">Ügyfél és igény</p>
                <h2 id="lead-data-title" className="mt-1 text-2xl font-bold text-slate-900">Érdeklődő adatai</h2>
                <p className="mt-2 text-sm leading-6 text-slate-600">Az elérhetőségek, az igény és az adatkezelési visszaigazolás egy helyen.</p>
              </div>
              <div className="mt-5 grid items-start gap-6 xl:grid-cols-2">
                <div className="h-full rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6">
                  <h2 className="mb-6 text-xl font-bold">
                    Kapcsolattartási adatok
                  </h2>

                  <div className="grid gap-5 sm:grid-cols-2">
                    <div>
                      <label className="mb-2 block text-sm font-medium text-slate-700">
                        Név
                      </label>

                      <input
                        type="text"
                        value={name}
                        onChange={(e) =>
                          setName(e.target.value)
                        }
                        className="w-full rounded-xl border border-slate-200 px-4 py-3 outline-none focus:border-violet-400"
                        required
                      />
                    </div>

                    <div>
                      <label className="mb-2 block text-sm font-medium text-slate-700">
                        Telefonszám
                      </label>

                      <input
                        type="text"
                        value={phone}
                        onChange={(e) =>
                          setPhone(e.target.value)
                        }
                        className="w-full rounded-xl border border-slate-200 px-4 py-3 outline-none focus:border-violet-400"
                      />
                    </div>

                    <div>
                      <label className="mb-2 block text-sm font-medium text-slate-700">
                        E-mail
                      </label>

                      <input
                        type="email"
                        value={email}
                        onChange={(e) =>
                          setEmail(e.target.value)
                        }
                        className="w-full rounded-xl border border-slate-200 px-4 py-3 outline-none focus:border-violet-400"
                      />
                    </div>

                    <div>
                      <label className="mb-2 block text-sm font-medium text-slate-700">
                        Helyszín
                      </label>

                      <input
                        type="text"
                        value={location}
                        onChange={(e) =>
                          setLocation(e.target.value)
                        }
                        className="w-full rounded-xl border border-slate-200 px-4 py-3 outline-none focus:border-violet-400"
                      />
                    </div>
                  </div>
                </div>

                <div className="h-full rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6">
                  <h2 className="mb-6 text-xl font-bold">
                    Érdeklődés
                  </h2>

                  <StructuredVoiceCapture
                    leadId={lead.id}
                    currentValues={{ service, location, description }}
                    onApply={suggestions => {
                      if (suggestions.service !== undefined) setService(suggestions.service);
                      if (suggestions.location !== undefined) setLocation(suggestions.location);
                      if (suggestions.description !== undefined) setDescription(suggestions.description);
                    }}
                    onDirtyChange={setStructuredCaptureDirty}
                  />

                  <div className="space-y-5">
                    <div>
                      <label className="mb-2 block text-sm font-medium text-slate-700">
                        Szolgáltatás
                      </label>

                      <input
                        type="text"
                        value={service}
                        onChange={(e) =>
                          setService(e.target.value)
                        }
                        className="w-full rounded-xl border border-slate-200 px-4 py-3 outline-none focus:border-violet-400"
                      />
                    </div>

                    <div>
                      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                        <label htmlFor="lead-description" className="block text-sm font-medium text-slate-700">
                          Leírás
                        </label>
                        <VoiceDictationButton value={description} onChange={setDescription} fieldLabel="Érdeklődés leírása" />
                      </div>

                      <textarea
                        id="lead-description"
                        value={description}
                        onChange={(e) =>
                          setDescription(e.target.value)
                        }
                        className="min-h-40 w-full rounded-xl border border-slate-200 px-4 py-3 outline-none focus:border-violet-400"
                      />
                    </div>

                    <div>
                      <div className="text-sm font-medium text-slate-700">
                        Forrás
                      </div>

                      <div className="mt-2 rounded-xl bg-slate-50 px-4 py-3 text-slate-700">
                        {getSourceLabel(lead.source)}
                      </div>
                    </div>

                    {lead.source === "web" && <div>
                      <div className="text-sm font-medium text-slate-700">
                        Adatkezelési tájékoztató
                      </div>

                      {lead.privacy_notice_acknowledged_at ? <div className="mt-2 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-950">
                        <p className="font-semibold">Elolvasás visszaigazolva</p>
                        <p className="mt-1">
                          Rögzítve: <time dateTime={lead.privacy_notice_acknowledged_at}>{displayReceivedAt(lead.privacy_notice_acknowledged_at)}</time>
                        </p>
                        {lead.privacy_notice_version && <details className="mt-2 text-xs text-emerald-800">
                          <summary className="cursor-pointer font-medium">Naplózási részletek</summary>
                          <p className="mt-1 break-all">Tájékoztató verziója: {lead.privacy_notice_version}</p>
                        </details>}
                      </div> : <div className="mt-2 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm leading-6 text-slate-600">
                        Ehhez az ajánlatkéréshez nincs rögzített visszaigazolás. Régebbi, az adatkezelési tájékoztató aktiválása előtt érkezett érdeklődés lehet.
                      </div>}
                    </div>}
                  </div>
                </div>
              </div>
              <div className="mt-5 flex flex-col gap-4 rounded-2xl border border-slate-200 bg-slate-50 p-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="font-semibold text-slate-900">Az adatlap módosításainak mentése</p>
                  <p className="mt-1 text-sm leading-6 text-slate-600">A kapcsolati adatok, az igény, az állapot és a prioritás együtt kerül mentésre.</p>
                  {saveSuccess && <p className="mt-2 text-sm font-semibold text-green-700">✓ A módosítások elmentve.</p>}
                  {saveError && <p className="mt-2 text-sm font-semibold text-red-700">{saveError}</p>}
                </div>
                <button
                  type="submit"
                  disabled={saving}
                  className="shrink-0 rounded-xl bg-violet-600 px-5 py-3 font-semibold text-white hover:bg-violet-700 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {saving ? "Mentés..." : "Adatok mentése"}
                </button>
              </div>
            </section>

            <section id="ai-response" aria-labelledby="ai-response-title" className="scroll-mt-24">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-violet-600">AI támogatás</p>
                <h2 id="ai-response-title" className="mt-1 text-2xl font-bold text-slate-900">Elemzés és válasz</h2>
                <p className="mt-2 text-sm leading-6 text-slate-600">Az elemzés és a biztonsági értékelés segíti a kiküldendő válasz ellenőrzését.</p>
              </div>
              <div className="mt-5 grid items-start gap-6 lg:grid-cols-[minmax(18rem,0.8fr)_minmax(0,1.5fr)]">
                <div className="space-y-6">
                  <div className="h-full rounded-2xl bg-gradient-to-br from-violet-600 to-purple-500 p-4 text-white shadow-lg sm:p-6">
                    <div className="text-lg font-bold">
                      ✨ AI feldolgozás
                    </div>

                    {!aiResult && !aiError && (
                      <p className="mt-3 leading-7 text-violet-50">
                        Az AI elemzi az érdeklődőt,
                        összefoglalja az igényt, megkeresi a
                        hiányzó információkat és javaslatot ad
                        a következő lépésre.
                      </p>
                    )}

                    <button
                      type="button"
                      onClick={handleAiAnalysis}
                      disabled={aiLoading}
                      className="mt-5 w-full rounded-xl bg-white px-4 py-3 font-semibold text-violet-700 transition hover:bg-violet-50 disabled:cursor-not-allowed disabled:opacity-70"
                    >
                      {aiLoading
                        ? "AI dolgozik..."
                        : aiResult
                          ? "AI elemzés újra"
                          : "AI feldolgozás indítása"}
                    </button>

                    {aiError && (
                      <div className="mt-4 rounded-xl bg-red-50 p-4 text-sm font-medium text-red-700">
                        {aiError}
                      </div>
                    )}

                    {aiResult && (
                      <div className="mt-5 rounded-xl bg-white/10 p-4">
                        <div className="mb-2 font-semibold">
                          AI eredmény
                        </div>

                        <div className="whitespace-pre-wrap text-sm leading-6 text-white">
                          {aiResult}
                        </div>
                      </div>
                    )}
                  </div>

                  <div className="h-full rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6">
                    <h2 className="text-xl font-bold text-slate-900">
                      AI biztonsági döntés
                    </h2>

                    <p className="mt-2 text-sm leading-6 text-slate-500">
                      A rendszer értékeli, hogy az AI-válasz
                      emberi ellenőrzés nélkül elküldhető-e.
                    </p>

                    {!hasRiskEvaluation ? (
                      <div className="mt-5 rounded-xl bg-slate-50 p-4 text-sm text-slate-500">
                        Ehhez az érdeklődőhöz még nincs AI
                        kockázati értékelés.
                      </div>
                    ) : (
                      <div className="mt-5 space-y-4">
                        <div
                          className={`rounded-xl border p-4 ${
                            lead.ai_requires_human_review
                              ? "border-amber-200 bg-amber-50"
                              : "border-emerald-200 bg-emerald-50"
                          }`}
                        >
                          <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                            AI döntés
                          </div>

                          <div
                            className={`mt-1 font-bold ${
                              lead.ai_requires_human_review
                                ? "text-amber-800"
                                : "text-emerald-800"
                            }`}
                          >
                            {lead.ai_requires_human_review
                              ? "Kézi ellenőrzés szükséges"
                              : lead.ai_safe_to_send
                                ? "Automatikusan küldhető"
                                : "Automatikus küldés nem javasolt"}
                          </div>
                        </div>

                        <div
                          className={`rounded-xl border p-4 ${getRiskLevelClasses(
                            lead.ai_risk_level
                          )}`}
                        >
                          <div className="text-xs font-semibold uppercase tracking-wide opacity-70">
                            Kockázati szint
                          </div>

                          <div className="mt-1 font-bold">
                            {getRiskLevelLabel(
                              lead.ai_risk_level
                            )}
                          </div>
                        </div>

                        <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                          <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                            Indoklás
                          </div>

                          <div className="mt-2 whitespace-pre-wrap text-sm leading-6 text-slate-700">
                            {lead.ai_risk_reason ||
                              "Nincs megadott indoklás."}
                          </div>
                        </div>

                        <div className="grid gap-3 sm:grid-cols-2">
                          <div className="rounded-xl bg-slate-50 p-3">
                            <div className="text-xs text-slate-500">
                              Válasz biztonságos
                            </div>

                            <div className="mt-1 font-semibold text-slate-900">
                              {lead.ai_safe_to_send === true
                                ? "Igen"
                                : lead.ai_safe_to_send ===
                                    false
                                  ? "Nem"
                                  : "—"}
                            </div>
                          </div>

                          <div className="rounded-xl bg-slate-50 p-3">
                            <div className="text-xs text-slate-500">
                              Emberi döntés kell
                            </div>

                            <div className="mt-1 font-semibold text-slate-900">
                              {lead.ai_requires_human_review ===
                              true
                                ? "Igen"
                                : lead.ai_requires_human_review ===
                                    false
                                  ? "Nem"
                                  : "—"}
                            </div>
                          </div>
                        </div>
                      </div>
                    )}

                    <button
                      type="button"
                      onClick={handleEvaluateReply}
                      disabled={riskLoading || !draftMessageId || replyDirty || !replyDraft.trim() || messageLocked}
                      className="mt-5 w-full rounded-xl bg-slate-900 px-4 py-3 font-semibold text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {riskLoading
                        ? "Kockázatértékelés készítése..."
                        : hasRiskEvaluation
                          ? "Kockázatértékelés frissítése"
                          : "Kockázatértékelés indítása"}
                    </button>

                    {!draftMessageId && (
                      <p className="mt-3 text-xs leading-5 text-slate-500">
                        Előbb készíts és ments el egy választervezetet.
                      </p>
                    )}

                    {replyDirty && draftMessageId && (
                      <p className="mt-3 text-xs leading-5 text-amber-700">
                        A módosított piszkozatot mentsd el az értékelés előtt.
                      </p>
                    )}

                    {riskError && (
                      <p className="mt-3 rounded-xl bg-red-50 px-4 py-3 text-sm font-medium text-red-700">
                        {riskError}
                      </p>
                    )}

                    {riskSuccess && (
                      <p className="mt-3 rounded-xl bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-700">
                        {riskSuccess}
                      </p>
                    )}
                  </div>
                </div>

                <div id="reply" className="h-full scroll-mt-24 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6">
                  <h2 className="text-xl font-bold text-slate-900">
                    Válasz az érdeklődőnek
                  </h2>

                  <p className="mt-2 text-sm leading-6 text-slate-500">
                    Az AI az érdeklődő adatai és a korábbi
                    elemzés alapján elkészíti a
                    választervezetet.
                  </p>

                  <button
                    type="button"
                    onClick={handleGenerateReply}
                    disabled={
                      replyLoading ||
                      messageStatus === "sending"
                    }
                    className="mt-5 w-full rounded-xl bg-slate-900 px-4 py-3 font-semibold text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {replyLoading
                      ? "Válasz készítése..."
                      : replyDraft
                        ? "Új választervezet készítése"
                        : "Választervezet készítése"}
                  </button>

                  {replyError && (
                    <div className="mt-4 rounded-xl bg-red-50 px-4 py-3 text-sm font-medium text-red-700">
                      {replyError}
                    </div>
                  )}

                  {replyDraft && (
                    <div className="mt-5">
                      <p className="mb-3 text-sm text-slate-600">Címzett: {lead.email || "Nincs e-mail-cím megadva"}{replyDirty ? " · Nem mentett módosítás" : ""}</p>
                      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                        <label htmlFor="lead-reply-draft" className="block text-sm font-medium text-slate-700">
                          Válasz
                        </label>
                        <VoiceDictationButton
                          value={replyDraft}
                          onChange={value => {
                            setReplyDirty(true);
                            setReplyDraft(value);
                            setDraftSaveSuccess(false);
                          }}
                          disabled={messageLocked}
                          fieldLabel="Válaszpiszkozat"
                        />
                      </div>

                      <textarea
                        id="lead-reply-draft"
                        value={replyDraft}
                        onChange={(e) => {
                          setReplyDirty(true);
                          setReplyDraft(e.target.value);
                          setDraftSaveSuccess(false);
                        }}
                        disabled={messageLocked}
                        className="min-h-64 w-full rounded-xl border border-slate-200 px-4 py-3 leading-7 outline-none focus:border-violet-400 disabled:bg-slate-50 disabled:text-slate-600"
                      />

                      {!messageLocked && (
                        <>
                          <button
                            type="button"
                            onClick={handleSaveDraft}
                            disabled={
                              draftSaving ||
                              !replyDraft.trim()
                            }
                            className="mt-4 w-full rounded-xl bg-violet-600 px-4 py-3 font-semibold text-white hover:bg-violet-700 disabled:cursor-not-allowed disabled:opacity-50"
                          >
                            {draftSaving
                              ? "Piszkozat mentése..."
                              : "Piszkozat mentése"}
                          </button>

                          {draftMessageId &&
                            (messageStatus === "draft" || messageStatus === "failed") && (
                              <button
                                type="button"
                                onClick={handleMarkAsSent}
                                disabled={markingSent || replyDirty || draftSaving}
                                className="mt-3 w-full rounded-xl bg-emerald-600 px-4 py-3 font-semibold text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
                              >
                                {markingSent
                                  ? "Küldés folyamatban..."
                                  : messageStatus === "failed" ? "Küldés újrapróbálása" : "Válasz elküldése"}
                              </button>
                            )}

                          <p className="mt-3 text-xs leading-5 text-slate-500">
                            A „Válasz elküldése” gomb
                            ténylegesen elküldi a jóváhagyott
                            e-mailt az érdeklődőnek.
                          </p>
                        </>
                      )}

                      {messageStatus === "sending" && (
                        <div className={delayedSending ? "mt-4 rounded-xl bg-red-50 px-4 py-3 text-sm font-semibold text-red-700" : "mt-4 rounded-xl bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-700"}>
                          {delayedSending ? "A küldési visszaigazolás késik. Ellenőrizd a saját Make-futást és a Gmail Elküldött levelek mappát. Ezután rögzítsd a tényleges eredményt." : "A küldés visszaigazolására várunk. Az üzenetet jelenleg nem lehet módosítani vagy újra elküldeni. Az állapot automatikusan frissül."}
                          {delayedSending && <div className="mt-4 grid gap-3 sm:grid-cols-2">
                            <button type="button" disabled={resolvingDelivery} onClick={() => handleResolveDelivery("sent")}
                              className="rounded-xl bg-emerald-600 px-4 py-3 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50">
                              Megtaláltam az elküldött levelet
                            </button>
                            <button type="button" disabled={resolvingDelivery} onClick={() => handleResolveDelivery("failed")}
                              className="rounded-xl border border-red-300 bg-white px-4 py-3 text-sm font-semibold text-red-700 hover:bg-red-100 disabled:opacity-50">
                              Biztosan nem ment ki
                            </button>
                          </div>}
                        </div>
                      )}

                      {messageStatus === "failed" && (
                        <div className="mt-4 rounded-xl bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">
                          {deliveryFailedAt
                            ? `A Gmail ${displayReceivedAt(deliveryFailedAt)} időpontban igazolta, hogy a küldés sikertelen volt. Ellenőrzés után az újrapróbálás gombbal ismét elindíthatod.`
                            : "A Gmail-küldés igazoltan sikertelen volt. Ellenőrzés után az újrapróbálás gombbal ismét elindíthatod."}
                        </div>
                      )}

                      {draftSaveSuccess && (
                        <div className="mt-3 rounded-xl bg-green-50 px-4 py-3 text-sm font-medium text-green-700">
                          ✓ A piszkozat elmentve.
                        </div>
                      )}

                      {draftSaveError && (
                        <div className="mt-3 rounded-xl bg-red-50 px-4 py-3 text-sm font-medium text-red-700">
                          {draftSaveError}
                        </div>
                      )}

                      {markSentError && (
                        <div className="mt-3 rounded-xl bg-red-50 px-4 py-3 text-sm font-medium text-red-700">
                          {markSentError}
                        </div>
                      )}

                      {messageStatus === "sent" && (
                        <div className="mt-4 rounded-xl bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-700">
                          {deliveryConfirmedAt
                            ? deliveryResolutionSource === "manual"
                              ? `✓ Kézzel ellenőrizve elküldött: ${displayReceivedAt(deliveryConfirmedAt)}.`
                              : `✓ A Gmail visszaigazolta a küldést: ${displayReceivedAt(deliveryConfirmedAt)}.`
                            : "✓ Az üzenet elküldöttként van rögzítve."}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </section>

            <section id="lead-communication" aria-labelledby="lead-communication-title" className="scroll-mt-24">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-amber-600">Kapcsolattartás</p>
                <h2 id="lead-communication-title" className="mt-1 text-2xl font-bold text-slate-900">Előzmények és belső jegyzetek</h2>
                <p className="mt-2 text-sm leading-6 text-slate-600">A kiküldött üzenetek és a csapat belső feljegyzései elkülönítve maradnak.</p>
              </div>
              <div className="mt-5 grid items-start gap-6 xl:grid-cols-[minmax(0,1.35fr)_minmax(20rem,0.85fr)]">
                <div className="h-full rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6">
                  <div className="flex flex-wrap items-start justify-between gap-4">
                    <div>
                      <h2 className="text-xl font-bold text-slate-900">
                        Kommunikációs előzmények
                      </h2>

                      <p className="mt-1 text-sm text-slate-500">
                        Az érdeklődőhöz tartozó korábbi
                        üzenetek.
                      </p>
                    </div>

                    <div className="rounded-full bg-slate-100 px-3 py-1 text-sm font-semibold text-slate-600">
                      {messageHistory.length} üzenet
                    </div>
                  </div>

                  {messageHistory.length === 0 ? (
                    <div className="mt-6 rounded-xl bg-slate-50 p-5 text-sm text-slate-500">
                      Még nincs mentett kommunikáció ehhez
                      az érdeklődőhöz.
                    </div>
                  ) : (
                    <div className="mt-6 space-y-4">
                      {messageHistory.map((message) => (
                        <div
                          key={message.id}
                          className={`rounded-2xl border p-5 ${
                            message.direction === "incoming"
                              ? "border-blue-100 bg-blue-50"
                              : "border-slate-200 bg-slate-50"
                          }`}
                        >
                          <div className="flex flex-wrap items-center justify-between gap-3">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="rounded-full bg-white px-3 py-1 text-xs font-semibold text-slate-700">
                                {getDirectionLabel(
                                  message.direction
                                )}
                              </span>

                              <span className="rounded-full bg-white px-3 py-1 text-xs font-semibold text-slate-700">
                                {getMessageStatusLabel(
                                  message.status
                                )}
                              </span>

                              <span className="rounded-full bg-white px-3 py-1 text-xs font-medium text-slate-500">
                                {getChannelLabel(
                                  message.channel
                                )}
                              </span>
                            </div>

                            <div className="text-xs text-slate-500">
                              {formatMessageDate(
                                message.created_at
                              )}
                            </div>
                          </div>

                          <div className="mt-4 whitespace-pre-wrap text-sm leading-7 text-slate-700">
                            {message.content}
                          </div>
                          {message.direction === "outgoing" && message.delivery_confirmed_at && (
                            <p className="mt-3 text-xs font-semibold text-emerald-700">
                              {message.delivery_resolution_source === "manual" ? "Kézzel ellenőrizve elküldött" : "Gmail-visszaigazolás"}: {displayReceivedAt(message.delivery_confirmed_at)}
                            </p>
                          )}
                          {message.direction === "outgoing" && message.delivery_failed_at && (
                            <p className="mt-3 text-xs font-semibold text-red-700">
                              {message.delivery_resolution_source === "manual" ? "Kézzel ellenőrizve sikertelen" : "Sikertelen Gmail-küldés visszaigazolva"}: {displayReceivedAt(message.delivery_failed_at)}
                            </p>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <LeadNotes leadId={lead.id} onDirtyChange={setNoteDirty} />
              </div>
            </section>
          </div>
        </form>
    </AppShell>
  );
}
