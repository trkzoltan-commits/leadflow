"use client";

import { useState } from "react";
import Link from "next/link";
import { useLeadOverview } from "@/lib/use-lead-overview";
import { annualReport, reportYears, type ReportCounts } from "@/lib/lead-report";

const monthNames = ["Január", "Február", "Március", "Április", "Május", "Június", "Július", "Augusztus", "Szeptember", "Október", "November", "December"];
const columns: { key: keyof ReportCounts; label: string }[] = [
  { key: "total", label: "Összes" },
  { key: "won", label: "Megvalósult" },
  { key: "lost", label: "Nem valósult meg" },
  { key: "active", label: "Aktív" },
  { key: "unknown", label: "Eredmény nélkül lezárt" },
];

export default function ReportsPage() {
  const { leads, loading, error, updatedAt, refresh } = useLeadOverview();
  const [selectedYear, setSelectedYear] = useState<number | null>(null);

  if (loading) return <main className="flex min-h-screen items-center justify-center bg-slate-50">Betöltés…</main>;

  const years = reportYears(leads);
  const year = selectedYear !== null && years.includes(selectedYear) ? selectedYear : reportYears([])[0];
  const report = annualReport(leads, year);

  return <main className="min-h-screen bg-slate-50 p-6 text-slate-900 md:p-10">
    <div className="mx-auto max-w-6xl">
      <div className="mb-8 flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="font-semibold text-violet-600">LeadFlow</p>
          <h1 className="mt-1 text-3xl font-bold">Riportok</h1>
          <p className="mt-2 text-slate-600">Éves összesítés havi bontásban, az érdeklődők érkezési dátuma szerint.</p>
        </div>
        <Link href="/" className="rounded-xl border border-slate-200 bg-white px-4 py-2 font-medium shadow-sm">← Dashboard</Link>
      </div>

      <div role="status" className={error ? "mb-6 rounded-xl bg-amber-50 p-4 text-amber-800" : "mb-6 text-sm text-slate-500"}>
        {error ? (updatedAt ? "A frissítés nem sikerült. Az utolsó sikeres adatokat látod." : "Az adatokat nem sikerült betölteni.") : "A riport 10 másodpercenként automatikusan frissül."}
        {error && <button type="button" onClick={() => void refresh()} className="ml-3 font-semibold underline">Újrapróbálás</button>}
      </div>

      {updatedAt && <>
        <div className="mb-6 flex flex-wrap items-center gap-3">
          <label htmlFor="report-year" className="font-semibold">Év</label>
          <select id="report-year" value={year} onChange={event => setSelectedYear(Number(event.target.value))}
            className="rounded-xl border border-slate-200 bg-white px-4 py-2">
            {years.map(item => <option key={item} value={item}>{item}</option>)}
          </select>
        </div>

        <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
          {columns.map(({ key, label }) => <div key={key} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <p className="text-sm text-slate-600">{label}</p><p className="mt-2 text-3xl font-bold">{report.total[key]}</p>
          </div>)}
        </div>

        <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="p-6">
            <h2 className="text-xl font-bold">{year}. évi havi bontás</h2>
            <p className="mt-2 text-sm text-slate-600">A megvalósulás a jelenleg rögzített eredmény. Egy később lezárt ügy eredménye az eredeti érkezési hónapjánál jelenik meg.</p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[650px] text-left text-sm">
              <thead className="bg-slate-50 text-slate-600"><tr><th className="px-5 py-3">Hónap</th>{columns.map(({ key, label }) => <th key={key} className="px-5 py-3">{label}</th>)}</tr></thead>
              <tbody>{report.months.map((month, index) => <tr key={monthNames[index]} className="border-t border-slate-100">
                <th scope="row" className="px-5 py-3 font-medium">{monthNames[index]}</th>
                {columns.map(({ key }) => <td key={key} className="px-5 py-3">{month[key]}</td>)}
              </tr>)}</tbody>
              <tfoot><tr className="border-t-2 border-slate-200 bg-slate-50 font-bold"><th scope="row" className="px-5 py-3">Éves összesen</th>{columns.map(({ key }) => <td key={key} className="px-5 py-3">{report.total[key]}</td>)}</tr></tfoot>
            </table>
          </div>
        </section>
      </>}
    </div>
  </main>;
}
