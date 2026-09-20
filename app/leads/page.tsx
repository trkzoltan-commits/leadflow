"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useLeadOverview } from "@/lib/use-lead-overview";
import { displayReceivedAt, filterLeads, isDelayedSending, outcomeLabel, replyLabel, searchLeads, type ClosedOutcomeFilter, type LeadListFilter } from "@/lib/lead-overview";

export default function LeadsPage() {
  const router = useRouter();

  const { leads, replies, loading, error: loadError, updatedAt, refresh } = useLeadOverview();

  const [listFilter, setListFilter] = useState<LeadListFilter>("active");
  const [closedOutcome, setClosedOutcome] = useState<ClosedOutcomeFilter>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const visibleLeads = searchLeads(filterLeads(leads, replies, listFilter, closedOutcome), searchQuery);

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
      <main className="flex min-h-screen items-center justify-center bg-slate-50">
        <div className="text-lg font-semibold text-slate-600">
          Betöltés...
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-slate-50 p-6 md:p-10">
      <div className="mx-auto max-w-7xl">
        <div className="mb-8 flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-slate-900">
              Érdeklődők
            </h1>

            <p className="mt-2 text-slate-500">
              Beérkezett érdeklődők kezelése
            </p>
          </div>

          <button
            onClick={() => router.push("/")}
            className="rounded-xl border border-slate-200 bg-white px-4 py-2 font-medium shadow-sm hover:bg-slate-50"
          >
            ← Dashboard
          </button>
          <Link href="/reports" className="rounded-xl border border-slate-200 bg-white px-4 py-2 font-medium shadow-sm hover:bg-slate-50">Riportok</Link>
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
              <div className="mt-5 flex flex-wrap gap-2" role="group" aria-label="Érdeklődők szűrése">
                {([
                  ["active", "Aktív", leads.filter(lead => lead.status !== "processed").length],
                  ["closed", "Lezártak", leads.filter(lead => lead.status === "processed").length],
                  ["draft", "Ellenőrizendő", filterLeads(leads, replies, "draft").length],
                  ["delayed", "Késő visszaigazolás", filterLeads(leads, replies, "delayed").length],
                  ["sending", "Visszaigazolásra vár", filterLeads(leads, replies, "sending").length],
                  ["all", "Mind", leads.length],
                ] as const).map(([value, label, count]) => (
                  <button key={value} type="button" onClick={() => setListFilter(value)}
                    aria-pressed={listFilter === value}
                    className={listFilter === value
                      ? "rounded-xl bg-violet-600 px-3 py-2 text-sm font-semibold text-white"
                      : "rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"}>
                    {label} ({count})
                  </button>
                ))}
              </div>
              {listFilter === "closed" && (
                <div className="mt-4">
                  <label htmlFor="closed-outcome" className="mb-2 block text-sm font-medium text-slate-700">Lezárás eredménye</label>
                  <select id="closed-outcome" value={closedOutcome} onChange={event => setClosedOutcome(event.target.value as ClosedOutcomeFilter)}
                    className="w-full max-w-xs rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-700 focus:border-violet-400">
                    <option value="all">Minden lezárt ({filterLeads(leads, replies, "closed").length})</option>
                    <option value="won">Megvalósult ({filterLeads(leads, replies, "closed", "won").length})</option>
                    <option value="lost">Nem valósult meg ({filterLeads(leads, replies, "closed", "lost").length})</option>
                    <option value="unknown">Eredmény nélkül ({filterLeads(leads, replies, "closed", "unknown").length})</option>
                  </select>
                </div>
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

            <div className="overflow-x-auto">
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
      </div>
    </main>
  );
}
