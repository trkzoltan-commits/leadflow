"use client";

import { useState } from "react";
import Link from "next/link";
import { useLeadOverview } from "@/lib/use-lead-overview";
import { annualReport, annualReportCsv, reportYears, type ReportCounts } from "@/lib/lead-report";
import { AppShell } from "@/components/app-shell";

const monthNames = ["Január", "Február", "Március", "Április", "Május", "Június", "Július", "Augusztus", "Szeptember", "Október", "November", "December"];
const columns: { key: keyof ReportCounts; label: string; valueClass: string; borderColor: string }[] = [
  { key: "total", label: "Összes", valueClass: "accent-text", borderColor: "var(--leadflow-accent)" },
  { key: "won", label: "Megvalósult", valueClass: "text-green-700", borderColor: "#149a02" },
  { key: "lost", label: "Nem valósult meg", valueClass: "text-red-700", borderColor: "#dc2626" },
  { key: "active", label: "Aktív", valueClass: "text-amber-700", borderColor: "#e99800" },
  { key: "unknown", label: "Eredmény nélkül lezárt", valueClass: "text-slate-700", borderColor: "#64748b" },
];
function leadListHref(year: number, month: number | null, segment: keyof ReportCounts) {
  const params = new URLSearchParams({ year: String(year), segment });
  if (month !== null) params.set("month", String(month));
  return `/leads?${params.toString()}`;
}

export default function ReportsPage() {
  const { leads, loading, error, updatedAt, refresh } = useLeadOverview();
  const [selectedYear, setSelectedYear] = useState<number | null>(null);

  if (loading) return <AppShell><div className="flex min-h-[50vh] items-center justify-center">Betöltés…</div></AppShell>;

  const years = reportYears(leads);
  const year = selectedYear !== null && years.includes(selectedYear) ? selectedYear : reportYears([])[0];
  const report = annualReport(leads, year);

  function downloadCsv() {
    const url = URL.createObjectURL(new Blob([annualReportCsv(report, year)], { type: "text/csv;charset=utf-8" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = `leadflow-riport-${year}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }

  return <AppShell>
      <div className="mb-8">
        <p className="text-xs font-bold uppercase tracking-wider accent-text">Eredmények</p>
        <h1 className="mt-1 text-3xl font-bold tracking-tight">Riportok</h1>
        <p className="mt-2 text-slate-600">Éves összesítés havi bontásban, az érdeklődők érkezési dátuma szerint.</p>
      </div>

      <div role="status" aria-live="polite" aria-atomic="true" className={error ? "mb-6 rounded-xl bg-amber-50 p-4 text-amber-800" : "mb-6 text-sm text-slate-500"}>
        {error ? (updatedAt ? "A frissítés nem sikerült. Az utolsó sikeres adatokat látod." : "Az adatokat nem sikerült betölteni.") : "A riport 10 másodpercenként automatikusan frissül."}
        {error && <button type="button" onClick={() => void refresh()} className="ml-3 font-semibold underline">Újrapróbálás</button>}
      </div>

      {updatedAt && <>
        <section aria-label="Riport beállításai" className="mb-6 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:flex sm:items-end sm:gap-4">
          <div>
            <label htmlFor="report-year" className="block text-xs font-bold uppercase tracking-wider text-slate-500">Kimutatási év</label>
            <select id="report-year" value={year} onChange={event => setSelectedYear(Number(event.target.value))}
              className="mt-2 w-full min-w-32 rounded-xl border border-slate-200 bg-white px-4 py-2.5 font-semibold sm:w-auto">
              {years.map(item => <option key={item} value={item}>{item}</option>)}
            </select>
          </div>
          <div className="mt-4 sm:ml-auto sm:mt-0 sm:text-right">
            <button type="button" onClick={downloadCsv}
              className="accent-bg inline-flex w-full items-center justify-center gap-2 rounded-xl px-4 py-2.5 font-semibold text-white shadow-sm sm:w-auto">
              <svg aria-hidden="true" viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 3v12m0 0 4-4m-4 4-4-4" /><path d="M5 21h14" /></svg>
              CSV letöltése
            </button>
            <p className="mt-2 text-xs text-slate-500">A fájl csak összesített havi adatokat tartalmaz.</p>
          </div>
        </section>

        <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
          {columns.map(({ key, label, valueClass, borderColor }) => <div key={key} className="rounded-2xl border border-t-4 border-slate-200 bg-white p-5 shadow-sm" style={{ borderTopColor: borderColor }}>
            <p className="min-h-10 text-sm font-semibold text-slate-600">{label}</p>
            <Link href={leadListHref(year, null, key)} className={`mt-2 inline-block rounded text-3xl font-bold tabular-nums hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-current ${valueClass}`} aria-label={`${year}. év – ${label}: ${report.total[key]} érdeklődő megnyitása`}>{report.total[key]}</Link>
            <p className="mt-1 text-xs text-slate-500">érdeklődő</p>
          </div>)}
        </div>

        {report.total.total === 0 && <p role="status" className="rounded-2xl border border-blue-200 bg-blue-50 p-5 text-sm font-medium text-blue-700 shadow-sm">Ebben az évben még nincs riportálható érdeklődő. Válassz másik évet, vagy térj vissza később.</p>}

        {report.total.total > 0 && <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-100 p-5 sm:p-6">
            <p className="text-xs font-bold uppercase tracking-wider accent-text">Havi részletek</p>
            <h2 className="mt-1 text-xl font-bold">{year}. évi havi bontás</h2>
            <p className="mt-2 text-sm text-slate-600">A megvalósulás a jelenleg rögzített eredmény. Egy később lezárt ügy eredménye az eredeti érkezési hónapjánál jelenik meg.</p>
          </div>

          <div className="grid gap-3 bg-slate-50 p-4 sm:grid-cols-2 lg:hidden" aria-label="Havi bontás kártyanézetben">
            {report.months.map((month, index) => <article key={monthNames[index]} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm" aria-labelledby={`report-month-${index}`}>
              <div className="flex items-center justify-between gap-4">
                <h3 id={`report-month-${index}`} className="font-bold text-slate-900">{monthNames[index]}</h3>
                <Link href={leadListHref(year, index + 1, "total")} className="text-sm font-bold accent-text hover:underline" aria-label={`${year}. ${monthNames[index]} – Összes: ${month.total} érdeklődő megnyitása`}>
                  {month.total} összesen →
                </Link>
              </div>
              <dl className="mt-4 grid grid-cols-2 gap-3">
                {columns.slice(1).map(({ key, label, valueClass }) => <div key={key} className="rounded-xl bg-slate-50 p-3">
                  <dt className="text-xs leading-5 text-slate-500">{label}</dt>
                  <dd className="mt-1"><Link href={leadListHref(year, index + 1, key)} className={`text-xl font-bold hover:underline ${valueClass}`} aria-label={`${year}. ${monthNames[index]} – ${label}: ${month[key]} érdeklődő megnyitása`}>{month[key]}</Link></dd>
                </div>)}
              </dl>
            </article>)}
          </div>

          <div className="hidden overflow-x-auto lg:block">
            <table className="w-full min-w-[650px] text-left text-sm">
              <caption className="sr-only">{year}. évi érdeklődői eredmények havi bontásban</caption>
              <thead className="bg-slate-50 text-slate-600"><tr><th className="px-5 py-3">Hónap</th>{columns.map(({ key, label }) => <th key={key} className="px-5 py-3 text-right">{label}</th>)}</tr></thead>
              <tbody>{report.months.map((month, index) => <tr key={monthNames[index]} className="border-t border-slate-100 transition hover:bg-violet-50">
                <th scope="row" className="px-5 py-3 font-medium">{monthNames[index]}</th>
                {columns.map(({ key, label, valueClass }) => <td key={key} className="px-5 py-3 text-right tabular-nums"><Link href={leadListHref(year, index + 1, key)} className={`rounded font-semibold hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-current ${valueClass}`} aria-label={`${year}. ${monthNames[index]} – ${label}: ${month[key]} érdeklődő megnyitása`}>{month[key]}</Link></td>)}
              </tr>)}</tbody>
              <tfoot><tr className="border-t-2 border-slate-200 bg-slate-50 font-bold"><th scope="row" className="px-5 py-3">Éves összesen</th>{columns.map(({ key, label, valueClass }) => <td key={key} className="px-5 py-3 text-right tabular-nums"><Link href={leadListHref(year, null, key)} className={`rounded hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-current ${valueClass}`} aria-label={`${year}. év – ${label}: ${report.total[key]} érdeklődő megnyitása`}>{report.total[key]}</Link></td>)}</tr></tfoot>
            </table>
          </div>
        </section>}
      </>}
  </AppShell>;
}
