"use client";

import Link from "next/link";
import { useState } from "react";
import { DashboardBrandLink } from "@/components/dashboard-brand-link";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { useLeadOverview } from "@/lib/use-lead-overview";
import { dailyCounts, displayDate, filterLeads, isDelayedSending, leadLabel, missingAiDraftWarning, newLeadDispatchWarning, replyLabel, type OverviewLead } from "@/lib/lead-overview";
import { budapestDateOffset, displayNextActionDueDate, isValidDateOnly, nextActionDueState, urgentNextActionLeads } from "@/lib/lead-next-action";
import { useLeadAssignees } from "@/lib/use-lead-assignees";

type DashboardTaskScope = "mine" | "unassigned" | "team";

export default function Home() {
  const router = useRouter();
  const { leads, messages, replies, loading, error, updatedAt, refresh } = useLeadOverview();
  const { assignees, currentUserId, canAssign, loading: assigneesLoading, error: assigneeError } = useLeadAssignees();
  const [taskScope, setTaskScope] = useState<DashboardTaskScope>("mine");
  const [reschedulingLeadId, setReschedulingLeadId] = useState<string | null>(null);
  const [rescheduleDueDate, setRescheduleDueDate] = useState("");
  const [savingTaskLeadId, setSavingTaskLeadId] = useState<string | null>(null);
  const [taskActionError, setTaskActionError] = useState("");
  const [taskActionSuccess, setTaskActionSuccess] = useState("");
  if (loading || assigneesLoading) return <main className="partner-surface flex min-h-screen items-center justify-center bg-slate-50">Betöltés…</main>;
  const attention = leads.filter(lead => lead.status !== "processed" && ["draft", "sending", "failed"].includes(replies.get(lead.id)?.status ?? ""))
    .sort((a, b) => Number(replies.get(b.id)?.status === "failed") - Number(replies.get(a.id)?.status === "failed") || Number(isDelayedSending(replies.get(b.id))) - Number(isDelayedSending(replies.get(a.id))));
  const delayedCount = attention.filter(lead => isDelayedSending(replies.get(lead.id))).length;
  const failedCount = attention.filter(lead => replies.get(lead.id)?.status === "failed").length;
  const makeAttention = filterLeads(leads, replies, "make");
  const missingDraftCount = makeAttention.filter(lead => missingAiDraftWarning(lead, replies.has(lead.id)) !== null).length;
  const now = new Date();
  const allUrgentNextActions = urgentNextActionLeads(leads, now);
  const myUrgentNextActions = currentUserId
    ? allUrgentNextActions.filter(lead => lead.assigned_user_id === currentUserId)
    : [];
  const unassignedUrgentNextActions = allUrgentNextActions.filter(lead => !lead.assigned_user_id);
  const effectiveTaskScope = !currentUserId ? "team" : !canAssign ? "mine" : taskScope;
  const urgentNextActions = effectiveTaskScope === "mine"
    ? myUrgentNextActions
    : effectiveTaskScope === "unassigned" ? unassignedUrgentNextActions : allUrgentNextActions;
  const overdueNextActionCount = urgentNextActions.filter(lead => nextActionDueState(lead.next_action_due_date, now) === "overdue").length;
  const todayNextActionCount = urgentNextActions.length - overdueNextActionCount;
  const assigneeById = new Map(assignees.map(member => [member.id, member.email]));
  const days = dailyCounts(leads);
  const max = Math.max(1, ...days.map(day => day.count));
  const leadMap = new Map(leads.map(lead => [lead.id, lead]));
  const activities = [
    ...leads.map(lead => ({ id: "lead-" + lead.id, leadId: lead.id, title: "Új érdeklődő érkezett", date: lead.created_at })),
    ...messages.filter(message => leadMap.has(message.lead_id)).map(message => ({ id: "message-" + message.id, leadId: message.lead_id, title: "Kimenő üzenet létrehozva", date: message.created_at })),
  ].sort((a,b) => b.date.localeCompare(a.date)).slice(0,6);
  const kpis = [
    ["Összes érdeklődő", leads.length],
    ["Új érdeklődő", leads.filter(lead => lead.status === "new").length],
    ["Ellenőrizendő piszkozat", attention.filter(lead => replies.get(lead.id)?.status === "draft").length],
    ["Küldési visszaigazolásra vár", attention.filter(lead => replies.get(lead.id)?.status === "sending").length],
    ["Sikertelen küldés", failedCount],
    ["Késő visszaigazolás", delayedCount],
    ["Automatizálás ellenőrizendő", makeAttention.length],
  ];

  function canManageTask(lead: OverviewLead) {
    return canAssign || Boolean(currentUserId && lead.assigned_user_id === currentUserId);
  }

  function startRescheduling(lead: OverviewLead) {
    setReschedulingLeadId(lead.id);
    setRescheduleDueDate(budapestDateOffset(1));
    setTaskActionError("");
    setTaskActionSuccess("");
  }

  async function persistDashboardTask(lead: OverviewLead, dueDate: string | null) {
    if (savingTaskLeadId || !lead.next_action || (dueDate !== null && !isValidDateOnly(dueDate))) return;
    setSavingTaskLeadId(lead.id);
    setTaskActionError("");
    setTaskActionSuccess("");
    let failureMessage = "A teendő módosítása nem sikerült. Frissítsd az oldalt, majd próbáld újra.";
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
          nextAction: dueDate === null ? null : lead.next_action,
          dueDate,
          expectedNextAction: lead.next_action,
          expectedDueDate: lead.next_action_due_date,
        }),
      });
      let result: { error?: unknown } = {};
      try {
        result = await response.json() as typeof result;
      } catch {
        result = {};
      }
      if (!response.ok) {
        if (typeof result.error === "string" && result.error) failureMessage = result.error;
        throw new Error("request failed");
      }
      setReschedulingLeadId(null);
      setTaskActionSuccess(dueDate === null
        ? `${lead.name || "Az érdeklődő"} teendője elvégezve. Az érdeklődő és a riportadatai megmaradtak.`
        : `${lead.name || "Az érdeklődő"} teendője átütemezve.`);
      await refresh();
    } catch {
      setTaskActionError(failureMessage);
    } finally {
      setSavingTaskLeadId(null);
    }
  }

  function completeTask(lead: OverviewLead) {
    const confirmed = window.confirm("Elvégezted ezt a teendőt? A teendő eltűnik a napi listából, de az érdeklődő és a riportadatai megmaradnak.");
    if (confirmed) void persistDashboardTask(lead, null);
  }

  return <main className="partner-surface min-h-screen bg-slate-50 p-4 text-slate-900 sm:p-5 md:p-8">
    <div className="mx-auto max-w-7xl">
      <header className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div><DashboardBrandLink /><h1 className="mt-1 text-3xl font-bold">Áttekintés</h1><p className="mt-2 text-slate-600">Érdeklődők, válaszok és következő teendők.</p></div>
        <nav aria-label="Fő navigáció" className="grid w-full grid-cols-2 gap-2 text-sm font-semibold sm:flex sm:w-auto sm:flex-wrap sm:gap-3">
          <Link href="/leads" className="rounded-xl bg-violet-600 px-4 py-3 text-white">Érdeklődők</Link>
          <Link href="/pipeline" className="rounded-xl border border-slate-200 bg-white px-4 py-3">Pipeline</Link>
          <Link href="/reports" className="rounded-xl border border-slate-200 bg-white px-4 py-3">Riportok</Link>
          <Link href="/settings" aria-label="Saját adatok és beállítások" className="rounded-xl border border-slate-200 bg-white px-4 py-3 text-center">⚙ Beállítások</Link>
          <button onClick={async () => { await supabase.auth.signOut(); router.replace("/login"); }} className="rounded-xl border border-slate-200 bg-white px-4 py-3">Kijelentkezés</button>
        </nav>
      </header>
      <div role="status" className={error ? "mb-6 rounded-xl bg-amber-50 p-4 text-amber-800" : "mb-6 text-sm text-slate-500"}>
        {error ? (updatedAt ? "A frissítés nem sikerült. Az utolsó sikeresen betöltött adatokat látod." : "Az adatokat nem sikerült betölteni.") : "Automatikus frissítés 10 másodpercenként."}
        {updatedAt && <span> Utolsó frissítés: {displayDate(updatedAt)}.</span>}
        {error && <button onClick={() => void refresh()} className="ml-3 font-semibold underline">Újrapróbálás</button>}
      </div>
      {updatedAt && <>
        <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">{kpis.map(([label,count]) => <div key={label} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><p className="text-sm text-slate-600">{label}</p><p className="mt-2 text-3xl font-bold">{count}</p></div>)}</div>
        {makeAttention.length > 0 && <section role="alert" className="mb-6 rounded-2xl border border-amber-300 bg-amber-50 p-5 text-amber-950 shadow-sm">
          <h2 className="font-bold">{makeAttention.length} érdeklődő automatizálása figyelmet igényel</h2>
          <p className="mt-2 text-sm">Ebből {missingDraftCount} esetben 15 perc után sincs AI-választervezet. Ellenőrizd a saját Make-futást, mielőtt bármit újraindítasz.</p>
          <Link href="/leads?filter=make" className="mt-3 inline-block text-sm font-semibold underline">Érintett érdeklődők megnyitása →</Link>
        </section>}
        <section className="mb-6 rounded-2xl border border-blue-200 bg-white p-5 shadow-sm sm:p-6">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="text-xl font-bold">{effectiveTaskScope === "mine" ? "Saját mai és lejárt teendők" : effectiveTaskScope === "unassigned" ? "Kiosztatlan mai és lejárt teendők" : "A csapat mai és lejárt teendői"}</h2>
              <p className="mt-2 text-sm text-slate-500">
                {urgentNextActions.length === 0
                  ? "Nincs mára esedékes vagy lejárt teendő."
                  : `${overdueNextActionCount} lejárt, ${todayNextActionCount} ma esedékes teendő.`}
              </p>
            </div>
            <Link href="/pipeline" className="accent-text text-sm font-semibold">Pipeline megnyitása →</Link>
          </div>
          {canAssign && <div className="mt-4 flex flex-wrap gap-2" aria-label="Teendők hatóköre">
            {([
              ["mine", "Saját", myUrgentNextActions.length],
              ["unassigned", "Kiosztatlan", unassignedUrgentNextActions.length],
              ["team", "Csapat összes", allUrgentNextActions.length],
            ] as const).map(([scope, label, count]) => <button key={scope} type="button"
              aria-pressed={effectiveTaskScope === scope}
              onClick={() => setTaskScope(scope)}
              className={effectiveTaskScope === scope
                ? "accent-bg rounded-xl px-3 py-2 text-sm font-semibold text-white shadow-sm"
                : "rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 shadow-sm"}>
              {label} ({count})
            </button>)}
          </div>}
          {assigneeError && <p className="mt-3 rounded-xl bg-amber-50 p-3 text-sm text-amber-900">A felelősök adatai most nem tölthetők be, ezért a teljes csapat teendőit látod.</p>}
          {taskActionError && <p role="alert" className="mt-3 rounded-xl bg-red-50 p-3 text-sm font-semibold text-red-800">{taskActionError}</p>}
          {taskActionSuccess && <p role="status" className="mt-3 rounded-xl bg-emerald-50 p-3 text-sm font-semibold text-emerald-800">{taskActionSuccess}</p>}
          {urgentNextActions.length > 0 && <ul className="mt-5 grid gap-3 md:grid-cols-2">
            {urgentNextActions.slice(0, 6).map(lead => {
              const dueState = nextActionDueState(lead.next_action_due_date, now);
              const isSaving = savingTaskLeadId === lead.id;
              const isRescheduling = reschedulingLeadId === lead.id;
              return <li key={lead.id} className="flex h-full flex-col rounded-xl border border-slate-200 p-4 transition hover:border-blue-300 hover:bg-blue-50">
                <Link href={`/leads/${lead.id}`} className="block">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <span className="font-bold text-slate-900">{lead.name || "Névtelen érdeklődő"}</span>
                    <span className={`rounded-full px-2 py-1 text-xs font-semibold ${dueState === "overdue" ? "next-action-due-overdue" : "next-action-due-today"}`}>
                      {displayNextActionDueDate(lead.next_action_due_date, now)}
                    </span>
                  </div>
                  <p className="mt-2 break-words text-sm font-semibold text-slate-800">{lead.next_action}</p>
                  <p className="mt-1 text-xs text-slate-500">{lead.service || "Nincs szolgáltatás"}</p>
                  {effectiveTaskScope !== "mine" && <p className="mt-2 text-xs font-medium text-slate-600">Felelős: {lead.assigned_user_id ? assigneeById.get(lead.assigned_user_id) || "Inaktív vagy már nem elérhető" : "Nincs felelős"}</p>}
                </Link>
                {canManageTask(lead) && (isRescheduling ? <form className="mt-4 border-t border-slate-200 pt-3" onSubmit={event => { event.preventDefault(); void persistDashboardTask(lead, rescheduleDueDate); }}>
                  <label htmlFor={`dashboard-task-date-${lead.id}`} className="text-xs font-semibold text-slate-700">Új határidő</label>
                  <div className="mt-2 flex flex-wrap gap-2">
                    <input id={`dashboard-task-date-${lead.id}`} type="date" required min={budapestDateOffset(0, now)} value={rescheduleDueDate}
                      onChange={event => setRescheduleDueDate(event.target.value)} disabled={isSaving}
                      className="min-w-0 flex-1 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm" />
                    <button type="submit" disabled={isSaving || !isValidDateOnly(rescheduleDueDate)} className="accent-bg rounded-lg px-3 py-2 text-sm font-semibold text-white disabled:opacity-50">
                      {isSaving ? "Mentés…" : "Mentés"}
                    </button>
                    <button type="button" disabled={isSaving} onClick={() => setReschedulingLeadId(null)} className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-700 disabled:opacity-50">Mégse</button>
                  </div>
                </form> : <div className="mt-auto flex flex-wrap gap-2 border-t border-slate-200 pt-3">
                  <button type="button" disabled={isSaving} onClick={() => completeTask(lead)} className="rounded-lg bg-emerald-600 px-3 py-2 text-sm font-semibold text-white disabled:opacity-50">
                    {isSaving ? "Mentés…" : "Elvégezve"}
                  </button>
                  <button type="button" disabled={isSaving} onClick={() => startRescheduling(lead)} className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-700 disabled:opacity-50">Átütemezés</button>
                </div>)}
              </li>;
            })}
          </ul>}
          {urgentNextActions.length > 6 && <p className="mt-4 text-sm text-slate-500">További {urgentNextActions.length - 6} sürgős teendő a Pipeline-ban látható.</p>}
        </section>
        <section className="mb-6 rounded-2xl border border-violet-100 bg-white p-6 shadow-sm">
          <h2 className="text-xl font-bold">Figyelmet igénylő válaszok</h2>
          <p className="mt-2 text-sm text-slate-500">A legutóbbi válasz állapota alapján. A piszkozatot az automatizálás még feldolgozhatja.</p>
          {failedCount > 0 && <p className="mt-4 rounded-xl bg-red-50 p-4 text-sm font-semibold text-red-800">{failedCount} igazoltan sikertelen küldés újrapróbálható. Nyisd meg az érintett érdeklődőt, ellenőrizd a választ, majd indítsd újra.</p>}
          {delayedCount > 0 && <p className="mt-4 rounded-xl bg-red-50 p-4 text-sm font-semibold text-red-800">{delayedCount} küldés visszaigazolása több mint 60 perce késik. Ellenőrizd a saját Make-futást és a Gmail Elküldött levelek mappát; ne indíts újraküldést.</p>}
          {attention.length === 0 ? <p className="mt-4 text-slate-600">Nincs ellenőrizendő piszkozat vagy küldési probléma.</p> : <ul className="mt-4 divide-y divide-slate-100">{attention.map(lead => <li key={lead.id}><Link href={`/leads/${lead.id}`} className="flex flex-wrap justify-between gap-2 rounded-lg py-3 hover:bg-violet-50"><span className="font-semibold">{lead.name || "Névtelen érdeklődő"} <span className="font-normal text-slate-500">· {lead.service || "Nincs szolgáltatás"}</span></span><span className={isDelayedSending(replies.get(lead.id)) || replies.get(lead.id)?.status === "failed" ? "text-sm font-semibold text-red-700" : "text-sm text-amber-800"}>{replyLabel(replies.get(lead.id)?.status, replies.get(lead.id)?.sending_started_at)} →</span></Link></li>)}</ul>}
        </section>
        <div className="grid gap-6 lg:grid-cols-[2fr_1fr]">
          <div className="min-w-0 space-y-6">
            <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
              <h2 className="text-xl font-bold">Érdeklődők az elmúlt 7 napban</h2><p className="mt-1 text-sm text-slate-500">Érkezési dátum szerint, magyarországi időzónában.</p>
              <div className="mt-6 flex h-44 items-end gap-2" aria-label="Napi érdeklődőszám">{days.map(day => <div key={day.day} className="flex h-full min-w-0 flex-1 flex-col justify-end gap-2 text-center"><span className="text-sm font-semibold">{day.count}</span><div className="rounded-t-lg bg-violet-500" style={{height: `${day.count / max * 105}px`}} /><span className="text-xs text-slate-500">{day.label}</span></div>)}</div>
            </section>
            <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
              <div className="flex flex-wrap justify-between gap-3 p-6"><h2 className="text-xl font-bold">Legújabb érdeklődők</h2><Link className="font-semibold text-violet-600" href="/leads">Összes megtekintése →</Link></div>
              {leads.length === 0 ? <p className="px-6 pb-6 text-slate-500">Még nincs érdeklődő.</p> : <div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead className="bg-slate-50 text-slate-500"><tr>{["Név / szolgáltatás","Érkezett","Állapot","Válasz"].map(label => <th key={label} className="px-5 py-3">{label}</th>)}</tr></thead><tbody>{leads.slice(0,10).map(lead => <tr key={lead.id} className="border-t border-slate-100"><td className="px-5 py-4"><Link href={`/leads/${lead.id}`} className="font-semibold text-violet-700 underline-offset-4 hover:underline">{lead.name || "Névtelen érdeklődő"}</Link><p className="mt-1 text-slate-500">{lead.service || "—"}</p></td><td className="px-5 py-4">{displayDate(lead.created_at)}</td><td className="px-5 py-4">{leadLabel(lead.status)}{newLeadDispatchWarning(lead.new_lead_dispatch_status, lead.created_at) && <p className="mt-1 text-xs font-semibold text-amber-800">Make-indítás ellenőrizendő</p>}{missingAiDraftWarning(lead, replies.has(lead.id)) && <p className="mt-1 text-xs font-semibold text-amber-800">AI-választervezet késik</p>}</td><td className="px-5 py-4">{replyLabel(replies.get(lead.id)?.status, replies.get(lead.id)?.sending_started_at)}</td></tr>)}</tbody></table></div>}
            </section>
          </div>
          <section className="h-fit rounded-2xl border border-slate-200 bg-white p-6 shadow-sm"><h2 className="text-xl font-bold">Legutóbbi események</h2><p className="mt-2 text-sm text-slate-500">Az érdeklődők és üzenetek létrehozási időpontja szerint.</p><ul className="mt-5 space-y-5">{activities.map(activity => <li key={activity.id}><Link href={`/leads/${activity.leadId}`} className="block rounded-lg hover:bg-violet-50"><p className="font-semibold">{activity.title}</p><p className="text-sm text-slate-600">{leadMap.get(activity.leadId)?.name || "Névtelen érdeklődő"}</p><p className="mt-1 text-xs text-slate-500">{displayDate(activity.date)}</p></Link></li>)}</ul>{activities.length === 0 && <p className="mt-4 text-slate-500">Még nincs megjeleníthető esemény.</p>}</section>
        </div>
      </>}
    </div>
  </main>;
}
