import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { parseDataRetentionStatus } from "../lib/data-retention.ts";
import { runDataRetention } from "../scripts/enforce-data-retention.mjs";

const row = {
  cutoff_at: "2024-10-18T10:00:00.000Z",
  retention_months: 24,
  eligible_closed_count: 3,
  active_review_count: 1,
  anonymized_count: 0,
  last_run_at: null,
};

test("retention status parser accepts bounded aggregate data only", () => {
  assert.deepEqual(parseDataRetentionStatus(row), {
    cutoffAt: row.cutoff_at, retentionMonths: 24, eligibleClosedCount: 3,
    activeReviewCount: 1, anonymizedCount: 0, lastRunAt: null,
  });
  assert.equal(parseDataRetentionStatus({ ...row, eligible_closed_count: -1 }), null);
  assert.equal(parseDataRetentionStatus({ ...row, retention_months: 121 }), null);
  assert.equal(parseDataRetentionStatus({ ...row, cutoff_at: "invalid" }), null);
});

test("retention operator is dry-run by default and scopes the RPC to the resolved company", async () => {
  const calls = [];
  const client = {
    from: () => ({ select() { return this; }, eq() { return this; }, async maybeSingle() { return { data: { id: "company-a" }, error: null }; } }),
    async rpc(name, input) { calls.push({ name, input }); return { data: [row], error: null }; },
  };
  const preview = await runDataRetention(client, "pelda-kft");
  assert.equal(preview.eligible_closed_count, 3);
  assert.deepEqual(calls, [{ name: "preview_company_data_retention", input: { p_company_id: "company-a" } }]);
  calls.length = 0;
  await runDataRetention(client, "pelda-kft", true);
  assert.deepEqual(calls, [{ name: "apply_company_data_retention", input: { p_company_id: "company-a" } }]);
});

test("retention migration removes personal content but preserves reporting fields", async () => {
  const sql = await readFile(new URL("../supabase/migrations/202610180002_data_retention.sql", import.meta.url), "utf8");
  assert.match(sql, /anonymized_at timestamptz/i);
  assert.match(sql, /closed_at timestamptz/i);
  assert.match(sql, /status = 'processed'[\s\S]*coalesce\(closed_at, created_at\) < v_cutoff/i);
  assert.match(sql, /new\.status = 'processed'[\s\S]*new\.closed_at := now\(\)/i);
  assert.match(sql, /delete from public\.lead_notes/i);
  assert.match(sql, /delete from public\.messages/i);
  for (const field of ["email", "phone", "service", "description", "location", "ai_summary", "privacy_notice_version"]) {
    assert.match(sql, new RegExp(`${field} = null`, "i"));
  }
  assert.doesNotMatch(sql, /^\s*(?:created_at|status|outcome)\s*=\s*null/gmi);
  assert.match(sql, /status is distinct from 'processed'[\s\S]*created_at < v_cutoff/i);
  assert.match(sql, /reject_anonymized_message_write[\s\S]*before insert or update on public\.messages/i);
  assert.match(sql, /reject_anonymized_note_write[\s\S]*before insert or update on public\.lead_notes/i);
  assert.match(sql, /revoke all on function public\.apply_company_data_retention[\s\S]*authenticated/i);
});

test("retention status API is authenticated, tenant-derived and manager-only", async () => {
  const route = await readFile(new URL("../app/api/privacy-retention/route.ts", import.meta.url), "utf8");
  assert.match(route, /admin\.auth\.getUser\(accessToken\)/);
  assert.match(route, /select\("company_id,role,is_active"\)/);
  assert.match(route, /profile\.role !== "owner" && profile\.role !== "admin"/);
  assert.match(route, /p_company_id: profile\.company_id/);
});

test("partner UI exposes aggregate retention state and keeps anonymized cases read-only", async () => {
  const [settings, overviewHook, list, details] = await Promise.all([
    readFile(new URL("../app/settings/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../lib/use-lead-overview.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/leads/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/leads/[id]/page.tsx", import.meta.url), "utf8"),
  ]);
  assert.match(settings, /fetch\("\/api\/privacy-retention"/);
  assert.match(settings, /Adatmegőrzési állapot/);
  assert.match(settings, /aktív ügy[\s\S]*kézi felülvizsgálat szükséges/i);
  assert.match(settings, /\/leads\?filter=retention/);
  assert.match(overviewHook, /new_lead_dispatch_status, anonymized_at, created_at/);
  assert.match(list, /lead\.anonymized_at[\s\S]*Anonimizált/);
  assert.match(list, /Adatmegőrzés/);
  assert.match(details, /if \(lead\.anonymized_at\)/);
  assert.match(details, /Az anonimizálás nem vonható vissza/);
});
