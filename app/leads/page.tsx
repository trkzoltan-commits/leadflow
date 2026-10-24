"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { useLeadOverview } from "@/lib/use-lead-overview";
import { displayReceivedAt, filterLeads, isDelayedSending, missingAiDraftWarning, newLeadDispatchWarning, outcomeLabel, replyLabel, retentionReviewLeads, searchLeads, type ClosedOutcomeFilter, type LeadListFilter } from "@/lib/lead-overview";
import { filterReportLeads, parseReportSelection, type ReportSegment } from "@/lib/lead-report";
import { AppShell } from "@/components/app-shell";
import { supabase } from "@/lib/supabase";

const reportMonthNames = ["január", "február", "március", "április", "május", "június", "július", "augusztus", "szeptember", "október", "november", "december"];
const reportSegmentLabels: Record<ReportSegment, string> = { total: "Összes", won: "Megvalósult", lost: "Nem valósult meg", active: "Aktív", unknown: "Eredmény nélkül lezárt" };
const leadListFilters: LeadListFilter[] = ["active", "closed", "draft", "failed", "make", "retention", "delayed", "sending", "all"];

export default function LeadsPage() {
  return <Suspense fallback={<AppShell><div className="flex min-h-[50vh] items-center justify-center">Betöltés...</div></AppShell>}><LeadsContent /></Suspense>;
}

function LeadsContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const reportSelection = parseReportSelection(searchParams);

  const { leads, replies, loading, error: loadError, updatedAt, refresh } = useLeadOverview({ includeNoteCounts: true });

  const [listFilter, setListFilter] = useState<LeadListFilter | null>(null);
  const [closedOutcome, setClosedOutcome] = useState<ClosedOutcomeFilter>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [retentionCutoff, setRetentionCutoff] = useState<string | null>(null);
  const requestedFilter = searchParams.get("filter");
  const selectedFilter = listFilter ?? (requestedFilter && leadListFilters.includes(requestedFilter as LeadListFilter)
    ? requestedFilter as LeadListFilter
    : reportSelection ? "all" : "active");
  const scopedLeads = reportSelection ? filterReportLeads(leads, reportSelection) : leads;
  const retentionLeads = retentionReviewLeads(scopedLeads, retentionCutoff);
  const visibleLeads = searchLeads(
    selectedFilter === "retention" ? retentionLeads : filterLeads(scopedLeads, replies, selectedFilter, closedOutcome),
    searchQuery
  );

  useEffect(() => {
    let cancelled = false;
    let retryTimer: ReturnType<typeof setTimeout> | null = null;
    let retryCount = 0;

    async function loadRetentionCutoff() {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session || cancelled) return;
        const response = await fetch("/api/privacy-retention", {
          headers: { Authorization: `Bearer ${session.access_token}` },
          cache: "no-store",
        });
        if (!response.ok || cancelled) {
          if (response.status >= 500 && retryCount < 3) {
            retryCount += 1;
            retryTimer = setTimeout(() => void loadRetentionCutoff(), retryCount * 5000);
          }
          return;
        }
        const result = await response.json() as { cutoffAt?: unknown };
        if (typeof result.cutoffAt === "string" && Number.isFinite(new Date(result.cutoffAt).getTime())) {
          setRetentionCutoff(result.cutoffAt);
        }
      } catch {
        if (!cancelled && retryCount < 3) {
          retryCount += 1;
          retryTimer = setTimeout(() => void loadRetentionCutoff(), retryCount * 5000);
        }
      }
    }
    void loadRetentionCutoff();
    return () => {
      cancelled = true;
      if (retryTimer) clearTimeout(retryTimer);
    };
  }, []);

  function openLead(leadId: string) {
    router.push(`/leads/${leadId}`);
  }

  function getPriorityLabel(priority: string | null) {
    if (priority === "high") return "Magas";
    if (priority === "medium") return "Közepes";
    if (priority === "low") return "Alacsony";

    return "—";
  }

  function getStatusLabel(status: string | null) {
    if (status === "new") return "Új";
    if (status === "contacted") return "Kapcsolatfelvétel megtörtént";
    if (status === "waiting") return "Válaszra vár";
    if (status === "offer_sent") return "Ajánlat elküldve";
    if (status === "decision") return "Döntésre vár";
    if (status === "processed") return "Feldolgozott";

    return status || "—";
  }

  function getSourceLabel(source: string | null) {
    if (source === "manual") return "Kézi felvétel";
    if (source === "email") return "E-mail";
    if (source === "web") return "Weboldal";
    if (source === "messenger") return "Messenger";

    return source || "—";
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

  return (
    <AppShell>
        <div className="mb-8 flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-slate-900">
              Érdeklődők
            </h1>

            <p className="mt-2 text-slate-500">
              Beérkezett érdeklődők kezelése
            </p>
          </div>

        </div>

        <p role="status" className={loadError ? "mb-5 text-amber-700" : "mb-5 text-sm text-slate-500"}>
          {loadError ? "A frissítés nem sikerült. Újrapróbáljuk; az utolsó betöltött adatokat látod." : "A lista és a válaszállapotok 10 másodpercenként automatikusan frissülnek."}
          {loadError && <button onClick={() => void refresh()} className="ml-3 underline">Újrapróbálás</button>}
        </p>
        <div>
          <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
            <div className="border-b border-slate-100 p-6">
              <h2 className="text-xl font-bold">Érdeklődők</h2>

              <p className="mt-1 text-sm text-slate-500">
                {updatedAt ? `${leads.length} érdeklődő az adatbázisban` : "Az adatok nem érhetők el"}
              </p>

              <p className="mt-2 text-xs text-slate-400">
                Kattints egy érdeklődőre az adatlap megnyitásához.
              </p>
              {reportSelection && <div className="mt-4 flex flex-wrap items-center gap-3 rounded-xl bg-violet-50 p-4 text-sm text-violet-900">
                <span className="font-semibold">Riport: {reportSelection.year}. év{reportSelection.month !== null ? `, ${reportMonthNames[reportSelection.month - 1]}` : ""} – {reportSegmentLabels[reportSelection.segment]} ({scopedLeads.length})</span>
                <Link href="/leads" className="font-medium underline">Riportszűrő törlése</Link>
              </div>}
              <div className="mt-5 flex flex-wrap gap-2" role="group" aria-label="Érdeklődők szűrése">
                {([
                  ["active", "Aktív", scopedLeads.filter(lead => lead.status !== "processed").length],
                  ["closed", "Lezártak", scopedLeads.filter(lead => lead.status === "processed").length],
                  ["draft", "Ellenőrizendő", filterLeads(scopedLeads, replies, "draft").length],
                  ["failed", "Sikertelen küldés", filterLeads(scopedLeads, replies, "failed").length],
                  ["make", "Automatizálás ellenőrizendő", filterLeads(scopedLeads, replies, "make").length],
                  ...(retentionCutoff ? [["retention", "Adatmegőrzés", retentionLeads.length] as const] : []),
                  ["delayed", "Késő visszaigazolás", filterLeads(scopedLeads, replies, "delayed").length],
                  ["sending", "Visszaigazolásra vár", filterLeads(scopedLeads, replies, "sending").length],
                  ["all", "Mind", scopedLeads.length],
                ] as const).map(([value, label, count]) => (
                  <button key={value} type="button" onClick={() => setListFilter(value)}
                    aria-pressed={selectedFilter === value}
                    className={selectedFilter === value
                      ? "rounded-xl bg-violet-600 px-3 py-2 text-sm font-semibold text-white"
                      : "rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"}>
                    {label} ({count})
                  </button>
                ))}
              </div>
              {selectedFilter === "closed" && (
                <div className="mt-4">
                  <label htmlFor="closed-outcome" className="mb-2 block text-sm font-medium text-slate-700">Lezárás eredménye</label>
                  <select id="closed-outcome" value={closedOutcome} onChange={event => setClosedOutcome(event.target.value as ClosedOutcomeFilter)}
                    className="w-full max-w-xs rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-700 focus:border-violet-400">
                    <option value="all">Minden lezárt ({filterLeads(scopedLeads, replies, "closed").length})</option>
                    <option value="won">Megvalósult ({filterLeads(scopedLeads, replies, "closed", "won").length})</option>
                    <option value="lost">Nem valósult meg ({filterLeads(scopedLeads, replies, "closed", "lost").length})</option>
                    <option value="unknown">Eredmény nélkül ({filterLeads(scopedLeads, replies, "closed", "unknown").length})</option>
                  </select>
                </div>
              )}
              {selectedFilter === "retention" && (
                <p className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm leading-6 text-amber-950">
                  Ezek az aktív ügyek régebbiek a céges megőrzési határnapnál. Ellenőrizd, hogy lezárhatók-e; a rendszer aktív ügyet nem anonimizál automatikusan.
                </p>
              )}
              <p className="mt-3 text-xs text-slate-500">A lezárt érdeklődők megmaradnak a riportokhoz, és a „Lezártak” vagy „Mind” nézetben elérhetők.</p>
              <div className="mt-5 flex flex-wrap items-end gap-3">
                <div className="min-w-64 flex-1">
                  <label htmlFor="lead-search" className="mb-2 block text-sm font-medium text-slate-700">Keresés az érdeklődők között</label>
                  <input id="lead-search" type="search" value={searchQuery} onChange={event => setSearchQuery(event.target.value)}
                    placeholder="Név, e-mail, telefonszám, szolgáltatás vagy helyszín"
                    className="w-full rounded-xl border border-slate-200 px-4 py-3 outline-none focus:border-violet-400" />
                </div>
                {searchQuery && <button type="button" onClick={() => setSearchQuery("")} className="rounded-xl border border-slate-200 px-4 py-3 text-sm font-medium hover:bg-slate-50">Keresés törlése</button>}
              </div>
              {searchQuery.trim() && <p role="status" className="mt-3 text-sm text-slate-600">{visibleLeads.length} találat az aktuális nézetben.</p>}
            </div>

            <div className="divide-y divide-slate-100 xl:hidden">
              {updatedAt && visibleLeads.length === 0 && (
                <p className="p-6 text-slate-500">
                  {searchQuery.trim() ? "Nincs találat ebben a nézetben. Próbálj másik keresést vagy válts a Mind nézetre." : "Ebben a nézetben nincs érdeklődő."}
                </p>
              )}
              {visibleLeads.map((lead) => {
                const reply = replies.get(lead.id);
                const delayedReply = isDelayedSending(reply);
                return (
                  <article key={lead.id}>
                    <Link
                      href={`/leads/${lead.id}`}
                      className="block p-4 transition hover:bg-violet-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-violet-500"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <h3 className="truncate font-bold accent-text">{lead.name || "Névtelen érdeklődő"}</h3>
                          <p className="mt-1 truncate text-xs text-slate-500">{lead.phone || lead.email || "Nincs elérhetőség"}</p>
                        </div>
                        <time dateTime={lead.created_at} className="shrink-0 text-right text-xs font-medium text-slate-500">{displayReceivedAt(lead.created_at)}</time>
                      </div>

                      <dl className="mt-4 grid grid-cols-2 gap-3 text-sm">
                        <div>
                          <dt className="text-xs font-semibold uppercase tracking-wide text-slate-400">Szolgáltatás</dt>
                          <dd className="mt-1 font-medium text-slate-800">{lead.service || "—"}</dd>
                        </div>
                        <div>
                          <dt className="text-xs font-semibold uppercase tracking-wide text-slate-400">Helyszín</dt>
                          <dd className="mt-1 font-medium text-slate-800">{lead.location || "—"}</dd>
                        </div>
                      </dl>

                      <div className="mt-4 flex flex-wrap gap-2">
                        <span className="rounded-lg bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-700">{getStatusLabel(lead.status)}</span>
                        <span className="rounded-lg bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-700">{getPriorityLabel(lead.priority)} prioritás</span>
                        {lead.anonymized_at && <span className="rounded-lg bg-slate-200 px-2.5 py-1 text-xs font-semibold text-slate-700">Anonimizált</span>}
                      </div>
                      {lead.status === "processed" && <p className="mt-2 text-xs font-semibold text-slate-600">Eredmény: {outcomeLabel(lead.outcome)}</p>}

                      <div className="mt-4 rounded-xl bg-slate-50 p-3 text-sm">
                        <div className="flex items-start justify-between gap-3">
                          <span className="text-slate-500">Válasz</span>
                          <span className={delayedReply ? "text-right font-semibold text-red-700" : "text-right font-semibold text-slate-800"}>
                            {replyLabel(reply?.status, reply?.sending_started_at)}
                          </span>
                        </div>
                        <div className="mt-2 flex items-start justify-between gap-3">
                          <span className="text-slate-500">Forrás</span>
                          <span className="text-right font-medium text-slate-800">{getSourceLabel(lead.source)}</span>
                        </div>
                      </div>

                      {newLeadDispatchWarning(lead.new_lead_dispatch_status, lead.created_at) && <p className="mt-3 rounded-lg bg-amber-100 px-3 py-2 text-xs font-semibold text-amber-900">Make-indítás ellenőrizendő</p>}
                      {missingAiDraftWarning(lead, replies.has(lead.id)) && <p className="mt-3 rounded-lg bg-amber-100 px-3 py-2 text-xs font-semibold text-amber-900">AI-választervezet késik</p>}

                      <span className="mt-4 inline-flex text-sm font-semibold accent-text">Adatlap megnyitása →</span>
                    </Link>
                    {lead.note_count > 0 && (
                      <div className="px-4 pb-4">
                        <Link
                          href={`/leads/${lead.id}#internal-notes`}
                          aria-label={`${lead.note_count} belső megjegyzés megnyitása`}
                          className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2.5 py-1 text-xs font-semibold text-amber-900 hover:bg-amber-200"
                        >
                          <span aria-hidden="true">📝</span>
                          {lead.note_count} belső megjegyzés
                        </Link>
                      </div>
                    )}
                  </article>
                );
              })}
            </div>

            <div className="hidden overflow-x-auto xl:block">
              <table className="w-full text-left text-sm">
                <thead className="bg-slate-50 text-xs uppercase text-slate-500">
                  <tr>
                    <th className="px-6 py-3">
                      Név
                    </th>

                    <th className="px-6 py-3">Érkezett</th>

                    <th className="px-6 py-3">
                      Szolgáltatás
                    </th>

                    <th className="px-6 py-3">
                      Helyszín
                    </th>

                    <th className="px-6 py-3">
                      Prioritás
                    </th>

                    <th className="px-6 py-3">
                      Állapot
                    </th>

                    <th className="px-6 py-3">
                      Forrás
                    </th>
                    <th className="px-6 py-3">Válasz</th>
                  </tr>
                </thead>

                <tbody>
                  {updatedAt && visibleLeads.length === 0 && <tr><td colSpan={8} className="p-6 text-slate-500">{searchQuery.trim() ? "Nincs találat ebben a nézetben. Próbálj másik keresést vagy válts a Mind nézetre." : "Ebben a nézetben nincs érdeklődő."}</td></tr>}
                  {visibleLeads.map((lead) => (
                    <tr
                      key={lead.id}
                      onClick={() => openLead(lead.id)}
                      className="cursor-pointer border-t border-slate-100 transition hover:bg-violet-50"
                    >
                      <td className="px-6 py-4">
                        <div className="font-semibold text-slate-900">
                          <Link href={`/leads/${lead.id}`} className="text-violet-700 hover:underline">{lead.name || "Névtelen érdeklődő"}</Link>
                        </div>

                        <div className="text-xs text-slate-400">
                          {lead.phone || lead.email || "—"}
                        </div>
                        {lead.anonymized_at && (
                          <span className="mt-2 inline-flex rounded-full bg-slate-200 px-2.5 py-1 text-xs font-semibold text-slate-700">
                            Anonimizált
                          </span>
                        )}
                        {lead.note_count > 0 && (
                          <Link
                            href={`/leads/${lead.id}#internal-notes`}
                            onClick={(event) => event.stopPropagation()}
                            aria-label={`${lead.note_count} belső megjegyzés megnyitása`}
                            className="mt-2 inline-flex items-center gap-1 rounded-full bg-amber-100 px-2.5 py-1 text-xs font-semibold text-amber-900 hover:bg-amber-200"
                          >
                            <span aria-hidden="true">📝</span>
                            {lead.note_count} belső megjegyzés
                          </Link>
                        )}
                      </td>

                      <td className="whitespace-nowrap px-6 py-4">{displayReceivedAt(lead.created_at)}</td>

                      <td className="px-6 py-4">
                        {lead.service || "—"}
                      </td>

                      <td className="px-6 py-4">
                        {lead.location || "—"}
                      </td>

                      <td className="px-6 py-4">
                        <span className="rounded-lg bg-slate-100 px-3 py-1 text-xs font-semibold">
                          {getPriorityLabel(lead.priority)}
                        </span>
                      </td>

                      <td className="px-6 py-4">
                        <span className="rounded-lg bg-slate-100 px-3 py-1 text-xs font-semibold">
                          {getStatusLabel(lead.status)}
                        </span>
                        {lead.status === "processed" && <div className="mt-2 text-xs font-medium text-slate-600">{outcomeLabel(lead.outcome)}</div>}
                        {newLeadDispatchWarning(lead.new_lead_dispatch_status, lead.created_at) && <div className="mt-2 rounded-md bg-amber-100 px-2 py-1 text-xs font-semibold text-amber-900">Make-indítás ellenőrizendő</div>}
                        {missingAiDraftWarning(lead, replies.has(lead.id)) && <div className="mt-2 rounded-md bg-amber-100 px-2 py-1 text-xs font-semibold text-amber-900">AI-választervezet késik</div>}
                      </td>

                      <td className="px-6 py-4">
                        {getSourceLabel(lead.source)}
                      </td>
                      <td className={isDelayedSending(replies.get(lead.id)) ? "px-6 py-4 font-semibold text-red-700" : "px-6 py-4"}>
                        {replyLabel(replies.get(lead.id)?.status, replies.get(lead.id)?.sending_started_at)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
    </AppShell>
  );
}
