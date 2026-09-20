"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { useLeadOverview } from "@/lib/use-lead-overview";
import { dailyCounts, displayDate, filterLeads, isDelayedSending, leadLabel, missingAiDraftWarning, newLeadDispatchWarning, replyLabel } from "@/lib/lead-overview";

export default function Home() {
  const router = useRouter();
  const { leads, messages, replies, loading, error, updatedAt, refresh } = useLeadOverview();
  if (loading) return <main className="flex min-h-screen items-center justify-center bg-slate-50">Betöltés…</main>;
  const attention = leads.filter(lead => lead.status !== "processed" && ["draft", "sending"].includes(replies.get(lead.id)?.status ?? ""))
    .sort((a, b) => Number(isDelayedSending(replies.get(b.id))) - Number(isDelayedSending(replies.get(a.id))));
  const delayedCount = attention.filter(lead => isDelayedSending(replies.get(lead.id))).length;
  const makeAttention = filterLeads(leads, replies, "make");
  const missingDraftCount = makeAttention.filter(lead => missingAiDraftWarning(lead, replies.has(lead.id)) !== null).length;
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
    ["Késő visszaigazolás", delayedCount],
    ["Automatizálás ellenőrizendő", makeAttention.length],
  ];
  return <main className="min-h-screen bg-slate-50 p-5 text-slate-900 md:p-8">
    <div className="mx-auto max-w-7xl">
      <header className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div><p className="font-semibold text-violet-600">LeadFlow</p><h1 className="mt-1 text-3xl font-bold">Áttekintés</h1><p className="mt-2 text-slate-600">Érdeklődők, válaszok és következő teendők.</p></div>
        <nav aria-label="Fő navigáció" className="flex flex-wrap gap-3 text-sm font-semibold">
          <Link href="/leads" className="rounded-xl bg-violet-600 px-4 py-3 text-white">Érdeklődők</Link>
          <Link href="/reports" className="rounded-xl border border-slate-200 bg-white px-4 py-3">Riportok</Link>
          <Link href="/settings" className="rounded-xl border border-slate-200 bg-white px-4 py-3">Beállítások</Link>
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
        <section className="mb-6 rounded-2xl border border-violet-100 bg-white p-6 shadow-sm">
          <h2 className="text-xl font-bold">Figyelmet igénylő válaszok</h2>
          <p className="mt-2 text-sm text-slate-500">A legutóbbi válasz állapota alapján. A piszkozatot az automatizálás még feldolgozhatja.</p>
          {delayedCount > 0 && <p className="mt-4 rounded-xl bg-red-50 p-4 text-sm font-semibold text-red-800">{delayedCount} küldés visszaigazolása több mint 60 perce késik. Ellenőrizd a saját Make-futást és a Gmail Elküldött levelek mappát; ne indíts újraküldést.</p>}
          {attention.length === 0 ? <p className="mt-4 text-slate-600">Nincs ellenőrizendő piszkozat vagy visszaigazolásra váró küldés.</p> : <ul className="mt-4 divide-y divide-slate-100">{attention.map(lead => <li key={lead.id}><Link href={`/leads/${lead.id}`} className="flex flex-wrap justify-between gap-2 rounded-lg py-3 hover:bg-violet-50"><span className="font-semibold">{lead.name || "Névtelen érdeklődő"} <span className="font-normal text-slate-500">· {lead.service || "Nincs szolgáltatás"}</span></span><span className={isDelayedSending(replies.get(lead.id)) ? "text-sm font-semibold text-red-700" : "text-sm text-amber-800"}>{replyLabel(replies.get(lead.id)?.status, replies.get(lead.id)?.sending_started_at)} →</span></Link></li>)}</ul>}
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
