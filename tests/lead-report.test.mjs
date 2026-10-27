import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";

const source = ts.transpileModule(readFileSync(new URL("../lib/lead-report.ts", import.meta.url), "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS },
}).outputText;
const context = { exports: {}, Intl, Date, Number, Set, URLSearchParams };
vm.runInNewContext(source, context);
const { annualReport, annualReportCsv, reportYears, filterReportLeads, monthlyPerformance, parseReportSelection } = context.exports;

test("report drill-down matches monthly and annual counts at Budapest month boundaries", () => {
  const leads = [
    { id: "a", created_at: "2025-12-31T23:30:00Z", status: "processed", outcome: "won" },
    { id: "b", created_at: "2026-01-31T23:30:00Z", status: "processed", outcome: "lost" },
    { id: "c", created_at: "2026-02-15T12:00:00Z", status: "processed", outcome: null },
    { id: "d", created_at: "2026-02-20T12:00:00Z", status: "waiting", outcome: null },
  ];
  const selection = parseReportSelection(new URLSearchParams("year=2026&month=1&segment=won"));
  assert.deepEqual(filterReportLeads(leads, selection).map(lead => lead.id), ["a"]);
  assert.deepEqual(filterReportLeads(leads, { year: 2026, month: 2, segment: "lost" }).map(lead => lead.id), ["b"]);
  assert.deepEqual(filterReportLeads(leads, { year: 2026, month: 2, segment: "unknown" }).map(lead => lead.id), ["c"]);
  assert.deepEqual(filterReportLeads(leads, { year: 2026, month: null, segment: "active" }).map(lead => lead.id), ["d"]);
  for (const [segment, count] of Object.entries(annualReport(leads, 2026).total)) {
    assert.equal(filterReportLeads(leads, { year: 2026, month: null, segment }).length, count);
  }
  assert.equal(parseReportSelection(new URLSearchParams("year=2026&month=13&segment=won")), null);
  assert.equal(parseReportSelection(new URLSearchParams("year=2026&segment=other")), null);
});

test("annual report groups arrival month in Budapest and keeps unknown closed outcomes separate", () => {
  const leads = [
    { created_at: "2025-12-31T23:30:00Z", status: "processed", outcome: "won" },
    { created_at: "2026-01-31T23:30:00Z", status: "processed", outcome: "lost" },
    { created_at: "2026-02-15T12:00:00Z", status: "processed", outcome: null },
    { created_at: "2026-02-20T12:00:00Z", status: "waiting", outcome: null },
    { created_at: "2027-02-20T12:00:00Z", status: "processed", outcome: "won" },
  ];
  const report = annualReport(leads, 2026);
  assert.deepEqual({ ...report.months[0] }, { total: 1, won: 1, lost: 0, active: 0, unknown: 0 });
  assert.deepEqual({ ...report.months[1] }, { total: 3, won: 0, lost: 1, active: 1, unknown: 1 });
  assert.deepEqual({ ...report.total }, { total: 4, won: 1, lost: 1, active: 1, unknown: 1 });
  assert.deepEqual([...reportYears(leads, new Date("2026-09-20T10:00:00Z"))], [2027, 2026]);
});

test("annual report CSV is Excel-compatible and contains only aggregate monthly data", () => {
  const report = annualReport([
    { created_at: "2026-01-10T12:00:00Z", status: "processed", outcome: "won" },
    { created_at: "2026-01-11T12:00:00Z", status: "waiting", outcome: null },
  ], 2026);
  const csv = annualReportCsv(report, 2026);
  assert.ok(csv.startsWith("\uFEFFsep=;\r\n2026. évi LeadFlow riport\r\n"));
  assert.match(csv, /Hónap;Összes;Megvalósult;Nem valósult meg;Aktív;Eredmény nélkül lezárt/);
  assert.match(csv, /Január;2;1;0;1;0/);
  assert.match(csv, /Éves összesen;2;1;0;1;0/);
  assert.doesNotMatch(csv, /@|ügyfél|customer/i);
});

test("monthly performance compares Budapest calendar months and outcome conversion", () => {
  const performance = monthlyPerformance([
    { created_at: "2025-12-15T12:00:00Z", status: "processed", outcome: "won" },
    { created_at: "2025-12-20T12:00:00Z", status: "processed", outcome: "lost" },
    { created_at: "2026-01-01T00:30:00Z", status: "processed", outcome: "won" },
    { created_at: "2026-01-10T12:00:00Z", status: "processed", outcome: "won" },
    { created_at: "2026-01-11T12:00:00Z", status: "processed", outcome: "lost" },
    { created_at: "2026-01-12T12:00:00Z", status: "waiting", outcome: null },
  ], new Date("2026-01-20T12:00:00Z"));

  assert.deepEqual({ ...performance.currentPeriod }, { year: 2026, month: 1 });
  assert.deepEqual({ ...performance.previousPeriod }, { year: 2025, month: 12 });
  assert.deepEqual({ ...performance.current }, { total: 4, won: 2, lost: 1, active: 1, unknown: 0 });
  assert.deepEqual({ ...performance.previous }, { total: 2, won: 1, lost: 1, active: 0, unknown: 0 });
  assert.equal(performance.conversionRate, 66.7);
  assert.equal(performance.previousConversionRate, 50);
  assert.equal(performance.totalDifference, 2);
  assert.equal(performance.conversionPointDifference, 16.7);
});

test("monthly performance avoids misleading conversion when no outcomes are recorded", () => {
  const performance = monthlyPerformance([
    { created_at: "2026-03-01T12:00:00Z", status: "waiting", outcome: null },
    { created_at: "2026-02-15T12:00:00Z", status: "processed", outcome: null },
  ], new Date("2026-03-20T12:00:00Z"));

  assert.equal(performance.conversionRate, null);
  assert.equal(performance.previousConversionRate, null);
  assert.equal(performance.conversionPointDifference, null);
});
