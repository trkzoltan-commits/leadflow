"use client";

import Link from "next/link";
import { useState } from "react";
import { DashboardBrandLink } from "@/components/dashboard-brand-link";
import { displayReceivedAt, isDelayedSending, missingAiDraftWarning, newLeadDispatchWarning, outcomeLabel, replyLabel, type OverviewLead } from "@/lib/lead-overview";
import { PIPELINE_COLUMNS, isPipelineStatus, pipelineGroups, type PipelineStatus } from "@/lib/lead-pipeline";
import { supabase } from "@/lib/supabase";
import { useLeadOverview } from "@/lib/use-lead-overview";

function priorityLabel(value: string | null) {
  return value === "high" ? "Magas" : value === "low" ? "Alacsony" : "Közepes";
}

const columnClass: Record<PipelineStatus, string> = {
  new: "pipeline-new",
  contacted: "pipeline-contacted",
  waiting: "pipeline-waiting",
  offer_sent: "pipeline-offer-sent",
  decision: "pipeline-decision",
  processed: "pipeline-processed",
};

export default function PipelinePage() {
  const { leads, replies, loading, error, updatedAt, refresh } = useLeadOverview();
  const [draggedLeadId, setDraggedLeadId] = useState<string | null>(null);
  const [dragTargetStatus, setDragTargetStatus] = useState<PipelineStatus | null>(null);
  const [savingLeadId, setSavingLeadId] = useState<string | null>(null);
  const [pendingClose, setPendingClose] = useState<OverviewLead | null>(null);
  const [showClosed, setShowClosed] = useState(false);
  const [saveError, setSaveError] = useState("");
  const groups = pipelineGroups(leads);
  const draggedLead = leads.find(lead => lead.id === draggedLeadId);

  async function persistStatus(lead: OverviewLead, nextStatus: PipelineStatus, outcome: "won" | "lost" | null = null) {
    if (lead.status === nextStatus && (nextStatus !== "processed" || lead.outcome === outcome)) return;
    if (nextStatus === "processed" && !outcome) { setPendingClose(lead); return; }
    setSavingLeadId(lead.id);
    setSaveError("");
    const { error: updateError } = await supabase.from("leads").update({
      status: nextStatus,
      outcome: nextStatus === "processed" ? outcome : null,
      updated_at: new Date().toISOString(),
    }).eq("id", lead.id);
    if (updateError) setSaveError("Az állapot módosítása nem sikerült. Próbáld újra.");
    else { setPendingClose(null); await refresh(); }
    setSavingLeadId(null);
  }

  function requestMove(lead: OverviewLead, value: string) {
    if (isPipelineStatus(value)) void persistStatus(lead, value);
  }

  if (loading) return <main className="partner-surface flex min-h-screen items-center justify-center bg-slate-50">Betöltés…</main>;

  return <main className="partner-surface min-h-screen bg-slate-50 p-4 text-slate-900 sm:p-6 md:p-8">
    <div className="mx-auto max-w-[1800px]">
      <header className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div><DashboardBrandLink /><h1 className="mt-1 text-3xl font-bold">Pipeline</h1><p className="mt-2 text-slate-600">Az érdeklődők aktuális üzleti szakaszai.</p></div>
        <Link href="/leads" className="rounded-xl border border-slate-200 bg-white px-4 py-3 font-semibold shadow-sm">Lista nézet</Link>
      </header>
      <div role="status" className={error || saveError ? "mb-5 rounded-xl bg-amber-50 p-4 text-amber-900" : "mb-5 text-sm text-slate-500"}>
        {saveError || (error ? "Az adatok frissítése nem sikerült. Az utolsó betöltött állapotot látod." : "A Pipeline 10 másodpercenként automatikusan frissül.")}
      </div>

      {updatedAt && <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-6">
        {PIPELINE_COLUMNS.map(column => {
          const columnLeads = groups.get(column.status) ?? [];
          const closedCollapsed = column.status === "processed" && !showClosed;
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
                {column.status === "processed" && <button type="button" onClick={() => setShowClosed(false)} className="w-full text-sm font-medium text-slate-600 underline">Lezárt ügyek összecsukása</button>}
                {columnLeads.map(lead => {
                  const reply = replies.get(lead.id);
                  const automationWarning = newLeadDispatchWarning(lead.new_lead_dispatch_status, lead.created_at) || missingAiDraftWarning(lead, replies.has(lead.id));
                  const replyWarning = reply?.status === "failed" || isDelayedSending(reply);
                  return <article key={lead.id} draggable={savingLeadId !== lead.id}
                    onDragStart={() => { setDraggedLeadId(lead.id); setDragTargetStatus(null); }}
                    onDragEnd={() => { setDraggedLeadId(null); setDragTargetStatus(null); }}
                    className={`pipeline-card rounded-xl border bg-white p-3 shadow-sm ${automationWarning || replyWarning ? "border-amber-300" : "border-slate-200"} ${savingLeadId === lead.id ? "opacity-50" : "cursor-grab"}`}>
                    <Link href={`/leads/${lead.id}`} className="text-sm font-bold text-slate-900 hover:underline">{lead.name || "Névtelen érdeklődő"}</Link>
                    <p className="mt-1 text-xs text-slate-600">{lead.service || "Nincs szolgáltatás"}</p>
                    <div className="mt-2 flex flex-wrap gap-1.5 text-[11px]">
                      <span className="rounded-lg bg-slate-100 px-2 py-1 font-semibold">{priorityLabel(lead.priority)}</span>
                      <span className="rounded-lg bg-slate-100 px-2 py-1">{displayReceivedAt(lead.created_at)}</span>
                    </div>
                    {column.status === "processed" && <p className="mt-3 text-xs font-semibold text-slate-600">{outcomeLabel(lead.outcome)}</p>}
                    <p className={`mt-2 text-xs font-semibold ${replyWarning ? "text-red-700" : "text-slate-600"}`}>{replyLabel(reply?.status, reply?.sending_started_at)}</p>
                    {automationWarning && <p className="mt-2 rounded-lg bg-amber-50 p-2 text-xs font-semibold text-amber-900">Automatizálás ellenőrizendő</p>}
                    <label className="mt-3 block text-xs font-medium text-slate-500">Állapot módosítása
                      <select value={isPipelineStatus(lead.status) ? lead.status : "new"} disabled={savingLeadId === lead.id}
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
  </main>;
}

