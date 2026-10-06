"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { DashboardBrandLink } from "@/components/dashboard-brand-link";
import { displayReceivedAt, isDelayedSending, missingAiDraftWarning, newLeadDispatchWarning, outcomeLabel, replyLabel, searchLeads, type OverviewLead } from "@/lib/lead-overview";
import {
  budapestDateOffset,
  displayNextActionDueDate,
  filterLeadsByNextAction,
  isValidDateOnly,
  NEXT_ACTION_MAX_LENGTH,
  nextActionDueState,
  type NextActionFilter,
  type NextActionDueState,
} from "@/lib/lead-next-action";
import {
  PIPELINE_COLUMNS,
  filterPipelineLeads,
  filterPipelineLeadsByPriority,
  isPipelineStatus,
  pipelineGroups,
  type PipelineAssigneeFilter,
  type PipelinePriorityFilter,
  type PipelineStatus,
} from "@/lib/lead-pipeline";
import { sortPipelineLeads, type PipelineSort } from "@/lib/lead-pipeline-sort";
import { parsePipelineView, pipelineViewStorageKey, serializePipelineView } from "@/lib/lead-pipeline-view";
import { supabase } from "@/lib/supabase";
import { useLeadAssignees } from "@/lib/use-lead-assignees";
import { useLeadOverview } from "@/lib/use-lead-overview";

type LeadPriority = "low" | "medium" | "high";

function normalizedPriority(value: string | null): LeadPriority {
  return value === "high" || value === "low" ? value : "medium";
}

const columnClass: Record<PipelineStatus, string> = {
  new: "pipeline-new",
  contacted: "pipeline-contacted",
  waiting: "pipeline-waiting",
  offer_sent: "pipeline-offer-sent",
  decision: "pipeline-decision",
  processed: "pipeline-processed",
};

const nextActionDueClass: Record<NextActionDueState, string> = {
  overdue: "next-action-due-overdue",
  today: "next-action-due-today",
  soon: "next-action-due-soon",
  later: "bg-slate-100 text-slate-700",
  invalid: "bg-slate-100 text-slate-700",
};

export default function PipelinePage() {
  const { leads, replies, loading, error, updatedAt, refresh } = useLeadOverview();
  const [draggedLeadId, setDraggedLeadId] = useState<string | null>(null);
  const [dragTargetStatus, setDragTargetStatus] = useState<PipelineStatus | null>(null);
  const [savingLeadId, setSavingLeadId] = useState<string | null>(null);
  const [pendingClose, setPendingClose] = useState<OverviewLead | null>(null);
  const [showClosed, setShowClosed] = useState(false);
  const [saveError, setSaveError] = useState("");
  const {
    assignees,
    currentUserId,
    canAssign,
    loading: assigneesLoading,
    error: assigneeError,
  } = useLeadAssignees();
  const [assigneeFilter, setAssigneeFilter] = useState<PipelineAssigneeFilter>("all");
  const [nextActionFilter, setNextActionFilter] = useState<NextActionFilter>("all");
  const [priorityFilter, setPriorityFilter] = useState<PipelinePriorityFilter>("all");
  const [pipelineSort, setPipelineSort] = useState<PipelineSort>("due");
  const [pipelineViewHydrated, setPipelineViewHydrated] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [assigningLeadIds, setAssigningLeadIds] = useState<Set<string>>(() => new Set());
  const [pendingNextAction, setPendingNextAction] = useState<OverviewLead | null>(null);
  const [nextActionDraft, setNextActionDraft] = useState("");
  const [nextActionDueDateDraft, setNextActionDueDateDraft] = useState("");
  const [nextActionError, setNextActionError] = useState("");
  const [savingNextActionLeadId, setSavingNextActionLeadId] = useState<string | null>(null);
  const nextActionDialogRef = useRef<HTMLFormElement | null>(null);
  const nextActionTriggerRef = useRef<HTMLButtonElement | null>(null);
  const assigneeFilteredLeads = filterPipelineLeads(leads, assigneeFilter, currentUserId);
  const searchedLeads = searchLeads(assigneeFilteredLeads, searchQuery);
  const scopedLeads = filterPipelineLeadsByPriority(searchedLeads, priorityFilter);
  const now = new Date();
  const nextActionCounts = {
    overdue: filterLeadsByNextAction(scopedLeads, "overdue", now).length,
    today: filterLeadsByNextAction(scopedLeads, "today", now).length,
    soon: filterLeadsByNextAction(scopedLeads, "soon", now).length,
    missing: filterLeadsByNextAction(scopedLeads, "missing", now).length,
  };
  const filteredLeads = sortPipelineLeads(filterLeadsByNextAction(scopedLeads, nextActionFilter, now), pipelineSort);
  const groups = pipelineGroups(filteredLeads);
  const assigneeCounts = leads.reduce((counts, lead) => {
    if (lead.assigned_user_id) counts.set(lead.assigned_user_id, (counts.get(lead.assigned_user_id) ?? 0) + 1);
    return counts;
  }, new Map<string, number>());
  const draggedLead = leads.find(lead => lead.id === draggedLeadId);
  const hasFocusedFilters = Boolean(searchQuery.trim()) || priorityFilter !== "all" || nextActionFilter !== "all";

  function canEditLeadNextAction(lead: OverviewLead) {
    return canAssign || Boolean(currentUserId && lead.assigned_user_id === currentUserId);
  }

  useEffect(() => {
    if (assigneesLoading) return;
    const frame = window.requestAnimationFrame(() => {
      if (!currentUserId) {
        setPipelineViewHydrated(true);
        return;
      }
      try {
        const storedView = parsePipelineView(window.localStorage.getItem(pipelineViewStorageKey(currentUserId)), {
          canAssign,
          memberIds: new Set(assignees.map(member => member.id)),
        });
        setAssigneeFilter(storedView.assigneeFilter);
        setNextActionFilter(storedView.nextActionFilter);
        setPriorityFilter(storedView.priorityFilter);
        setPipelineSort(storedView.sort);
      } catch {
        // A böngésző letilthatja a helyi tárolást; ilyenkor az alapnézet marad használatban.
      }
      setPipelineViewHydrated(true);
    });
    return () => window.cancelAnimationFrame(frame);
  }, [assignees, assigneesLoading, canAssign, currentUserId]);

  useEffect(() => {
    if (!pipelineViewHydrated || !currentUserId) return;
    try {
      window.localStorage.setItem(pipelineViewStorageKey(currentUserId), serializePipelineView({
        assigneeFilter,
        nextActionFilter,
        priorityFilter,
        sort: pipelineSort,
      }));
    } catch {
      // A Pipeline ettől még működik, csak a nézet nem marad meg a következő megnyitásig.
    }
  }, [assigneeFilter, currentUserId, nextActionFilter, pipelineSort, pipelineViewHydrated, priorityFilter]);

  useEffect(() => {
    if (!pendingNextAction) return;
    const dialog = nextActionDialogRef.current;
    if (!dialog) return;

    const focusableSelector = "button:not([disabled]), input:not([disabled]), textarea:not([disabled]), select:not([disabled]), [href], [tabindex]:not([tabindex='-1'])";
    const focusable = () => Array.from(dialog.querySelectorAll<HTMLElement>(focusableSelector));
    focusable()[0]?.focus();

    function keepFocusInside(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        if (!savingNextActionLeadId) {
          setPendingNextAction(null);
          setNextActionError("");
          requestAnimationFrame(() => nextActionTriggerRef.current?.focus());
        }
        return;
      }
      if (event.key !== "Tab") return;
      const elements = focusable();
      if (elements.length === 0) { event.preventDefault(); return; }
      const first = elements[0];
      const last = elements[elements.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }

    document.addEventListener("keydown", keepFocusInside);
    return () => document.removeEventListener("keydown", keepFocusInside);
  }, [pendingNextAction, savingNextActionLeadId]);

  async function persistStatus(lead: OverviewLead, nextStatus: PipelineStatus, outcome: "won" | "lost" | null = null) {
    if (lead.status === nextStatus && (nextStatus !== "processed" || lead.outcome === outcome)) return;
    if (nextStatus === "processed" && lead.next_action && !canEditLeadNextAction(lead)) {
      setSaveError("A teendővel rendelkező ügyet csak a felelős, a tulajdonos vagy egy adminisztrátor zárhatja le.");
      return;
    }
    if (nextStatus === "processed" && !outcome) { setPendingClose(lead); return; }
    setSavingLeadId(lead.id);
    setSaveError("");
    const { error: updateError } = await supabase.from("leads").update({
      status: nextStatus,
      outcome: nextStatus === "processed" ? outcome : null,
      ...(nextStatus === "processed" ? { next_action: null, next_action_due_date: null } : {}),
      updated_at: new Date().toISOString(),
    }).eq("id", lead.id);
    if (updateError) setSaveError("Az állapot módosítása nem sikerült. Próbáld újra.");
    else { setPendingClose(null); await refresh(); }
    setSavingLeadId(null);
  }

  async function persistPriority(lead: OverviewLead, nextPriority: LeadPriority) {
    if (normalizedPriority(lead.priority) === nextPriority || savingLeadId === lead.id) return;
    setSavingLeadId(lead.id);
    setSaveError("");
    const { error: updateError } = await supabase.from("leads").update({
      priority: nextPriority,
      updated_at: new Date().toISOString(),
    }).eq("id", lead.id);
    if (updateError) setSaveError("A prioritás módosítása nem sikerült. Próbáld újra.");
    else await refresh();
    setSavingLeadId(null);
  }

  function requestMove(lead: OverviewLead, value: string) {
    if (isPipelineStatus(value)) void persistStatus(lead, value);
  }

  async function persistAssignee(lead: OverviewLead, assignedUserId: string | null) {
    if (!canAssign || assigningLeadIds.has(lead.id) || lead.assigned_user_id === assignedUserId) return;
    setAssigningLeadIds(current => new Set(current).add(lead.id));
    setSaveError("");
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error("Nincs aktív munkamenet.");
      const response = await fetch("/api/lead-assignees", {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${session.access_token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ leadId: lead.id, assignedUserId }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result?.error || "A felelős mentése nem sikerült.");
      await refresh();
    } catch (assignError) {
      setSaveError(assignError instanceof Error ? assignError.message : "A felelős mentése nem sikerült. Próbáld újra.");
    } finally {
      setAssigningLeadIds(current => {
        const next = new Set(current);
        next.delete(lead.id);
        return next;
      });
    }
  }

  function openNextActionEditor(lead: OverviewLead, trigger: HTMLButtonElement) {
    nextActionTriggerRef.current = trigger;
    setPendingNextAction(lead);
    setNextActionDraft(lead.next_action ?? "");
    setNextActionDueDateDraft(lead.next_action_due_date ?? budapestDateOffset(1));
    setNextActionError("");
  }

  function closeNextActionEditor() {
    if (savingNextActionLeadId) return;
    setPendingNextAction(null);
    setNextActionError("");
    requestAnimationFrame(() => nextActionTriggerRef.current?.focus());
  }

  async function persistNextAction(lead: OverviewLead, clear = false) {
    const nextAction = nextActionDraft.trim();
    if (!clear && (!nextAction || nextAction.length > NEXT_ACTION_MAX_LENGTH || !isValidDateOnly(nextActionDueDateDraft))) {
      setNextActionError(`Írd le a következő teendőt, és válassz határidőt. A leírás legfeljebb ${NEXT_ACTION_MAX_LENGTH} karakter lehet.`);
      return;
    }

    setSavingNextActionLeadId(lead.id);
    setNextActionError("");
    let failureMessage = "A következő teendő mentése nem sikerült. Frissítsd az oldalt, majd próbáld újra.";
    let saved = false;
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
          expectedNextAction: lead.next_action,
          expectedDueDate: lead.next_action_due_date,
        }),
      });
      let result: { error?: unknown } = {};
      try {
        result = await response.json() as { error?: unknown };
      } catch {
        result = {};
      }
      if (!response.ok) {
        if (typeof result.error === "string" && result.error) failureMessage = result.error;
        throw new Error("request failed");
      }
      setPendingNextAction(null);
      saved = true;
      await refresh();
    } catch {
      setNextActionError(failureMessage);
    } finally {
      setSavingNextActionLeadId(null);
      if (saved) requestAnimationFrame(() => nextActionTriggerRef.current?.focus());
    }
  }

  if (loading) return <main className="partner-surface flex min-h-screen items-center justify-center bg-slate-50">Betöltés…</main>;

  return <main className="partner-surface min-h-screen bg-slate-50 p-4 text-slate-900 sm:p-6 md:p-8">
    <div className="mx-auto max-w-[1800px]">
      <header className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div><DashboardBrandLink /><h1 className="mt-1 text-3xl font-bold">Pipeline</h1><p className="mt-2 text-slate-600">Az érdeklődők aktuális üzleti szakaszai.</p></div>
        <Link href="/leads" className="rounded-xl border border-slate-200 bg-white px-4 py-3 font-semibold shadow-sm">Lista nézet</Link>
      </header>
      <div role="status" className={error || saveError || assigneeError ? "mb-5 rounded-xl bg-amber-50 p-4 text-amber-900" : "mb-5 text-sm text-slate-500"}>
        {saveError || assigneeError || (error ? "Az adatok frissítése nem sikerült. Az utolsó betöltött állapotot látod." : "A Pipeline 10 másodpercenként automatikusan frissül.")}
      </div>

      <section aria-label="Pipeline keresés és prioritás" className="mb-5 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="grid gap-4 lg:grid-cols-[minmax(16rem,1fr)_auto] lg:items-end xl:grid-cols-[minmax(16rem,1fr)_auto_auto]">
          <label className="block text-sm font-semibold text-slate-700">Keresés
            <input type="search" value={searchQuery} onChange={event => setSearchQuery(event.target.value)}
              placeholder="Név, e-mail, telefonszám, szolgáltatás vagy helyszín"
              className="mt-2 w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-slate-900 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100" />
          </label>
          <div className="flex flex-wrap items-center gap-2" aria-label="Prioritás szerinti szűrés">
            <span className="mr-1 text-sm font-semibold text-slate-700">Prioritás:</span>
            {([[
              "all", "Mind"
            ], ["high", "Magas"], ["medium", "Közepes"], ["low", "Alacsony"]] as const).map(([value, label]) => <button key={value} type="button"
              aria-pressed={priorityFilter === value} onClick={() => setPriorityFilter(value)}
              className={priorityFilter === value
                ? "accent-bg rounded-xl px-3 py-2 text-sm font-semibold text-white shadow-sm"
                : "rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 shadow-sm"}>
              {label}
            </button>)}
          </div>
          <label className="block text-sm font-semibold text-slate-700">Rendezés
            <select value={pipelineSort} onChange={event => setPipelineSort(event.target.value as PipelineSort)}
              className="mt-2 w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-slate-900 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100">
              <option value="due">Határidő szerint</option>
              <option value="priority">Prioritás szerint</option>
              <option value="newest">Legújabb érkezés</option>
            </select>
          </label>
        </div>
        <div className="mt-3 flex flex-wrap items-center justify-between gap-3 text-sm text-slate-500">
          <span>{filteredLeads.length} érdeklődő látható · A nézet automatikusan megmarad</span>
          {(searchQuery.trim() || priorityFilter !== "all" || assigneeFilter !== "all" || nextActionFilter !== "all") && <button type="button"
            onClick={() => { setSearchQuery(""); setPriorityFilter("all"); setAssigneeFilter("all"); setNextActionFilter("all"); }}
            className="font-semibold text-blue-700 underline underline-offset-2">Szűrők törlése</button>}
        </div>
      </section>

      <div className="mb-5 flex flex-wrap items-center gap-2" aria-label="Felelős szerinti szűrés">
        <span className="mr-1 text-sm font-semibold text-slate-700">Felelős:</span>
        {([
          ["all", "Minden ügy", leads.length],
          ["mine", "Saját ügyeim", currentUserId && !assigneeError ? leads.filter(lead => lead.assigned_user_id === currentUserId).length : null],
          ["unassigned", "Nincs felelős", leads.filter(lead => !lead.assigned_user_id).length],
        ] as const).map(([value, label, count]) => <button key={value} type="button"
          disabled={value === "mine" && (assigneesLoading || Boolean(assigneeError))}
          aria-pressed={assigneeFilter === value}
          onClick={() => setAssigneeFilter(value)}
          className={assigneeFilter === value
            ? "rounded-xl bg-slate-900 px-3 py-2 text-sm font-semibold text-white shadow-sm"
            : "rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 shadow-sm disabled:opacity-50"}>
          {label}{count === null ? "" : ` (${count})`}
        </button>)}
        {canAssign && assignees.length > 0 && <label className="ml-1 flex items-center gap-2 text-sm font-semibold text-slate-700">Munkatárs:
          <select aria-label="Munkatárs ügyei"
            value={assigneeFilter.startsWith("member:") ? assigneeFilter : ""}
            onChange={event => setAssigneeFilter(event.target.value ? event.target.value as PipelineAssigneeFilter : "all")}
            className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 shadow-sm">
            <option value="">Válassz munkatársat</option>
            {assignees.map(member => <option key={member.id} value={`member:${member.id}`}>
              {member.email} ({assigneeCounts.get(member.id) ?? 0})
            </option>)}
          </select>
        </label>}
      </div>

      <div className="mb-5 flex flex-wrap items-center gap-2" aria-label="Határidő szerinti szűrés">
        <span className="mr-1 text-sm font-semibold text-slate-700">Teendő:</span>
        {([
          ["all", "Összes", null],
          ["overdue", "Lejárt", nextActionCounts.overdue],
          ["today", "Ma", nextActionCounts.today],
          ["soon", "3 napon belül", nextActionCounts.soon],
          ["missing", "Nincs teendő", nextActionCounts.missing],
        ] as const).map(([value, label, count]) => <button key={value} type="button"
          aria-pressed={nextActionFilter === value}
          onClick={() => setNextActionFilter(value)}
          className={nextActionFilter === value
            ? "accent-bg rounded-xl px-3 py-2 text-sm font-semibold text-white shadow-sm"
            : "rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 shadow-sm"}>
          {label}{count === null ? "" : ` (${count})`}
        </button>)}
      </div>

      {updatedAt && <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-6">
        {PIPELINE_COLUMNS.map(column => {
          const columnLeads = groups.get(column.status) ?? [];
          const closedCollapsed = column.status === "processed" && !hasFocusedFilters && !showClosed;
          const showDropPlaceholder = Boolean(draggedLead && draggedLead.status !== column.status && dragTargetStatus === column.status);
          return <section key={column.status} aria-label={column.label}
            onDragEnter={event => { event.preventDefault(); setDragTargetStatus(column.status); }}
            onDragOver={event => { event.preventDefault(); if (dragTargetStatus !== column.status) setDragTargetStatus(column.status); }}
            onDragLeave={event => {
              if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setDragTargetStatus(current => current === column.status ? null : current);
            }}
            onDrop={() => {
              const lead = leads.find(item => item.id === draggedLeadId);
              setDraggedLeadId(null); setDragTargetStatus(null);
              if (lead) requestMove(lead, column.status);
            }}
            className={`pipeline-column min-w-0 rounded-2xl border p-2.5 transition ${columnClass[column.status]} ${showDropPlaceholder ? "pipeline-drop-active" : ""}`}>
            <div className="mb-2.5 flex items-center justify-between gap-1 px-0.5">
              <div className="flex min-w-0 items-center gap-1.5">
                <h2 className="truncate text-sm font-bold">{column.label}</h2>
                <span tabIndex={0} role="button" aria-label={`${column.label}: ${column.description}`}
                  className="group relative flex h-5 w-5 flex-none cursor-help items-center justify-center rounded-full border border-slate-300 bg-white text-xs font-bold text-slate-600 focus:outline-none focus:ring-2 focus:ring-violet-500">
                  i
                  <span role="tooltip" className="pointer-events-none absolute left-1/2 top-7 z-20 hidden w-56 -translate-x-1/2 rounded-lg bg-slate-900 p-3 text-left text-xs font-medium leading-5 text-white shadow-xl group-hover:block group-focus:block">
                    {column.description}
                  </span>
                </span>
              </div>
              <span className="rounded-full bg-white px-2 py-0.5 text-xs font-semibold">{columnLeads.length}</span>
            </div>
            {closedCollapsed ? <button type="button" onClick={() => setShowClosed(true)} className="w-full rounded-xl border border-slate-200 bg-white p-4 text-sm font-semibold text-slate-700 shadow-sm">Lezárt ügyek megjelenítése</button>
              : <div className="space-y-3">
                {column.status === "processed" && !hasFocusedFilters && <button type="button" onClick={() => setShowClosed(false)} className="w-full text-sm font-medium text-slate-600 underline">Lezárt ügyek összecsukása</button>}
                {columnLeads.map(lead => {
                  const reply = replies.get(lead.id);
                  const automationWarning = newLeadDispatchWarning(lead.new_lead_dispatch_status, lead.created_at) || missingAiDraftWarning(lead, replies.has(lead.id));
                  const replyWarning = reply?.status === "failed" || isDelayedSending(reply);
                  const assignedMember = assignees.find(member => member.id === lead.assigned_user_id);
                  const unlistedAssignee = Boolean(lead.assigned_user_id && !assignedMember);
                  const canEditNextAction = canEditLeadNextAction(lead);
                  const dueState = nextActionDueState(lead.next_action_due_date);
                  const nextActionDescriptionId = `next-action-description-${lead.id}`;
                  const cardSaving = savingLeadId === lead.id || assigningLeadIds.has(lead.id) || savingNextActionLeadId === lead.id;
                  return <article key={lead.id} draggable={!cardSaving}
                    onDragStart={event => {
                      if ((event.target as HTMLElement).closest("a, button, input, select, textarea")) { event.preventDefault(); return; }
                      setDraggedLeadId(lead.id); setDragTargetStatus(null);
                    }}
                    onDragEnd={() => { setDraggedLeadId(null); setDragTargetStatus(null); }}
                    className={`pipeline-card rounded-xl border bg-white p-3 shadow-sm ${automationWarning || replyWarning ? "border-amber-300" : "border-slate-200"} ${cardSaving ? "opacity-50" : "cursor-grab"}`}>
                    <Link href={`/leads/${lead.id}`} className="text-sm font-bold text-slate-900 hover:underline">{lead.name || "Névtelen érdeklődő"}</Link>
                    <p className="mt-1 text-xs text-slate-600">{lead.service || "Nincs szolgáltatás"}</p>
                    <div className="mt-2 flex flex-wrap gap-1.5 text-[11px]">
                      <label className="sr-only" htmlFor={`priority-${lead.id}`}>{lead.name || "Névtelen érdeklődő"} prioritása</label>
                      <select id={`priority-${lead.id}`} aria-label={`${lead.name || "Névtelen érdeklődő"} prioritása`}
                        value={normalizedPriority(lead.priority)} disabled={cardSaving}
                        onChange={event => void persistPriority(lead, event.target.value as LeadPriority)}
                        className="rounded-lg border-0 bg-slate-100 px-2 py-1 font-semibold text-slate-800 outline-none focus:ring-2 focus:ring-blue-400 disabled:opacity-50">
                        <option value="high">Magas</option>
                        <option value="medium">Közepes</option>
                        <option value="low">Alacsony</option>
                      </select>
                      <span className="rounded-lg bg-slate-100 px-2 py-1">{displayReceivedAt(lead.created_at)}</span>
                    </div>
                    {column.status === "processed" && <p className="mt-3 text-xs font-semibold text-slate-600">{outcomeLabel(lead.outcome)}</p>}
                    <p className={`mt-2 text-xs font-semibold ${replyWarning ? "text-red-700" : "text-slate-600"}`}>{replyLabel(reply?.status, reply?.sending_started_at)}</p>
                    {automationWarning && <p className="mt-2 rounded-lg bg-amber-50 p-2 text-xs font-semibold text-amber-900">Automatizálás ellenőrizendő</p>}
                    {column.status !== "processed" && <div className="mt-3">
                      {lead.next_action ? (canEditNextAction ? <button type="button"
                        aria-label={`${lead.name || "Névtelen érdeklődő"} következő teendőjének módosítása`}
                        aria-describedby={nextActionDescriptionId}
                        onClick={event => openNextActionEditor(lead, event.currentTarget)} disabled={cardSaving || assigneesLoading}
                        className="w-full rounded-lg border border-slate-200 bg-slate-50 p-2.5 text-left disabled:opacity-50">
                        <span id={nextActionDescriptionId} className="block">
                          <span className="block text-[11px] font-semibold uppercase tracking-wide text-slate-500">Következő teendő</span>
                          <span className="mt-1 block break-words text-xs font-semibold text-slate-900">{lead.next_action}</span>
                          <span className={`mt-2 inline-flex rounded-full px-2 py-1 text-[11px] font-semibold ${nextActionDueClass[dueState]}`}>
                            {displayNextActionDueDate(lead.next_action_due_date)}
                          </span>
                        </span>
                      </button> : <div className="rounded-lg border border-slate-200 bg-slate-50 p-2.5">
                        <span className="block text-[11px] font-semibold uppercase tracking-wide text-slate-500">Következő teendő</span>
                        <span className="mt-1 block break-words text-xs font-semibold text-slate-900">{lead.next_action}</span>
                        <span className={`mt-2 inline-flex rounded-full px-2 py-1 text-[11px] font-semibold ${nextActionDueClass[dueState]}`}>
                          {displayNextActionDueDate(lead.next_action_due_date)}
                        </span>
                      </div>) : canEditNextAction ? <button type="button"
                        onClick={event => openNextActionEditor(lead, event.currentTarget)} disabled={cardSaving || assigneesLoading}
                        className="w-full rounded-lg border border-dashed border-slate-300 px-3 py-2 text-xs font-semibold text-slate-600 hover:border-slate-400 hover:bg-slate-50 disabled:opacity-50">
                        + Teendő hozzáadása
                      </button> : <p className="rounded-lg border border-dashed border-slate-200 px-3 py-2 text-xs text-slate-500">Nincs következő teendő</p>}
                    </div>}
                    <div className="mt-3 text-xs font-medium text-slate-500">Felelős
                      {canAssign && !assigneeError ? <select aria-label={`${lead.name || "Névtelen érdeklődő"} felelőse`}
                        value={lead.assigned_user_id ?? ""} disabled={cardSaving || assigneesLoading}
                        onChange={event => void persistAssignee(lead, event.target.value || null)}
                        className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800">
                        <option value="">Nincs felelős</option>
                        {unlistedAssignee && <option value={lead.assigned_user_id ?? ""}>Inaktív vagy már nem elérhető</option>}
                        {assignees.map(member => <option key={member.id} value={member.id}>
                          {member.email}{member.id === currentUserId ? " (én)" : ""}
                        </option>)}
                      </select> : <p className="mt-1 rounded-lg bg-slate-100 px-3 py-2 text-sm text-slate-800">
                        {assigneeError && lead.assigned_user_id
                          ? "A felelős most nem tölthető be"
                          : assignedMember?.email || (lead.assigned_user_id ? "Inaktív vagy már nem elérhető" : "Nincs felelős")}
                      </p>}
                    </div>
                    <label className="mt-3 block text-xs font-medium text-slate-500">Állapot módosítása
                      <select value={isPipelineStatus(lead.status) ? lead.status : "new"} disabled={cardSaving}
                        onChange={event => requestMove(lead, event.target.value)} className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800">
                        {PIPELINE_COLUMNS.map(option => <option key={option.status} value={option.status}>{option.label}</option>)}
                      </select>
                    </label>
                  </article>;
                })}
                {showDropPlaceholder && <div aria-hidden="true" className="pipeline-drop-placeholder rounded-xl border-2 border-dashed p-5 text-center text-xs font-semibold">Ide helyezheted</div>}
                {columnLeads.length === 0 && !showDropPlaceholder && <p className="rounded-xl border border-dashed border-slate-300 p-4 text-center text-sm text-slate-500">Nincs érdeklődő</p>}
              </div>}
          </section>;
        })}
      </div>}
    </div>

    {pendingClose && <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4" role="dialog" aria-modal="true" aria-labelledby="close-title">
      <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
        <h2 id="close-title" className="text-xl font-bold">Mi lett az ügy eredménye?</h2>
        <p className="mt-2 text-sm text-slate-600">A lezárás eredménye bekerül a havi és éves riportokba.</p>
        <div className="mt-6 grid gap-3 sm:grid-cols-2">
          <button type="button" disabled={savingLeadId === pendingClose.id} onClick={() => void persistStatus(pendingClose, "processed", "won")} className="rounded-xl bg-emerald-600 px-4 py-3 font-semibold text-white disabled:opacity-50">Megvalósult</button>
          <button type="button" disabled={savingLeadId === pendingClose.id} onClick={() => void persistStatus(pendingClose, "processed", "lost")} className="rounded-xl bg-slate-700 px-4 py-3 font-semibold text-white disabled:opacity-50">Nem valósult meg</button>
        </div>
        <button type="button" disabled={savingLeadId === pendingClose.id} onClick={() => setPendingClose(null)} className="mt-3 w-full rounded-xl border border-slate-200 px-4 py-3 font-semibold disabled:opacity-50">Mégse</button>
      </div>
    </div>}

    {pendingNextAction && <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-950/50 p-4 sm:items-center"
      role="dialog" aria-modal="true" aria-labelledby="next-action-title">
      <form onSubmit={event => { event.preventDefault(); void persistNextAction(pendingNextAction); }}
        ref={nextActionDialogRef}
        className="max-h-[calc(100dvh-2rem)] w-full max-w-lg overflow-y-auto rounded-2xl bg-white p-5 shadow-xl sm:p-6">
        <h2 id="next-action-title" className="text-xl font-bold">Következő teendő</h2>
        <p className="mt-1 text-sm text-slate-600">{pendingNextAction.name || "Névtelen érdeklődő"}</p>

        <label className="mt-5 block text-sm font-semibold text-slate-700">Mit kell elintézni?
          <textarea autoFocus rows={3} maxLength={NEXT_ACTION_MAX_LENGTH} value={nextActionDraft}
            onChange={event => setNextActionDraft(event.target.value)} disabled={savingNextActionLeadId === pendingNextAction.id}
            className="mt-2 w-full resize-y rounded-xl border border-slate-300 bg-white px-3 py-3 text-slate-900 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
            placeholder="Például: Telefonos egyeztetés az ajánlat részleteiről" />
        </label>
        <div className="mt-1 text-right text-xs text-slate-500">{nextActionDraft.length}/{NEXT_ACTION_MAX_LENGTH}</div>

        <label className="mt-4 block text-sm font-semibold text-slate-700">Határidő
          <input type="date" value={nextActionDueDateDraft}
            onChange={event => setNextActionDueDateDraft(event.target.value)} disabled={savingNextActionLeadId === pendingNextAction.id}
            className="mt-2 w-full rounded-xl border border-slate-300 bg-white px-3 py-3 text-slate-900 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100" />
        </label>
        <div className="mt-3 flex flex-wrap gap-2" aria-label="Gyors határidő választás">
          {([[0, "Ma"], [1, "Holnap"], [3, "+3 nap"]] as const).map(([days, label]) => <button key={days}
            type="button" disabled={savingNextActionLeadId === pendingNextAction.id}
            onClick={() => setNextActionDueDateDraft(budapestDateOffset(days))}
            className="rounded-lg border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-700 disabled:opacity-50">
            {label}
          </button>)}
        </div>

        {nextActionError && <p role="alert" className="mt-4 rounded-xl bg-red-50 p-3 text-sm font-medium text-red-800">{nextActionError}</p>}

        <div className="mt-6 grid gap-3 sm:grid-cols-2">
          <button type="submit" disabled={savingNextActionLeadId === pendingNextAction.id || !nextActionDraft.trim() || !isValidDateOnly(nextActionDueDateDraft)}
            className="rounded-xl bg-blue-600 px-4 py-3 font-semibold text-white disabled:opacity-50">
            {savingNextActionLeadId === pendingNextAction.id ? "Mentés…" : "Teendő mentése"}
          </button>
          <button type="button" onClick={closeNextActionEditor} disabled={savingNextActionLeadId === pendingNextAction.id}
            className="rounded-xl border border-slate-200 px-4 py-3 font-semibold text-slate-700 disabled:opacity-50">Mégse</button>
        </div>
        {pendingNextAction.next_action && <button type="button" onClick={() => void persistNextAction(pendingNextAction, true)}
          disabled={savingNextActionLeadId === pendingNextAction.id}
          className="mt-3 w-full rounded-xl px-4 py-3 text-sm font-semibold text-red-700 hover:bg-red-50 disabled:opacity-50">
          Teendő törlése
        </button>}
      </form>
    </div>}
  </main>;
}

