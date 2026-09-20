import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";

const source = ts.transpileModule(readFileSync(new URL("../lib/lead-report.ts", import.meta.url), "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS },
}).outputText;
const context = { exports: {}, Intl, Date, Number, Set };
vm.runInNewContext(source, context);
const { annualReport, reportYears } = context.exports;

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
