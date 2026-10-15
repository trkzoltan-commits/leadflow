import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const sql = await readFile(new URL("../supabase/migrations/202609270002_automation_dispatches.sql", import.meta.url), "utf8");
const tenantKeySql = await readFile(new URL("../supabase/migrations/202610130002_automation_dispatch_tenant_key.sql", import.meta.url), "utf8");
const contractSql = await readFile(new URL("../supabase/migrations/202610150001_drop_legacy_automation_dispatch_key.sql", import.meta.url), "utf8");

test("automation dispatch audit is tenant-linked, unique and server-only", () => {
  assert.match(sql, /company_id uuid not null references public\.companies/i);
  assert.match(sql, /unique \(event_type, entity_id\)/i);
  assert.match(sql, /enable row level security/i);
  assert.match(sql, /revoke all on public\.automation_dispatches from public, anon, authenticated/i);
  assert.doesNotMatch(sql, /create policy/i);
});

test("automation dispatch identity is hardened with company scope", () => {
  assert.doesNotMatch(tenantKeySql, /drop constraint/i);
  assert.match(tenantKeySql, /add constraint automation_dispatches_event_type_entity_id_key[\s\S]*unique \(event_type, entity_id\)/i);
  assert.match(tenantKeySql, /unique \(company_id, event_type, entity_id\)/i);
  assert.match(tenantKeySql, /\(company_id, event_type, status, completed_at desc\)/i);
  assert.match(tenantKeySql, /public\.leads \(company_id, status, created_at, id\)/i);
  assert.match(tenantKeySql, /public\.messages \(company_id, direction, lead_id, created_at, id\)/i);
});

test("legacy dispatch identity is removed only after the tenant key is verified", () => {
  assert.match(contractSql, /conname = 'automation_dispatches_company_event_entity_key'/i);
  assert.match(contractSql, /raise exception 'Tenant-scoped automation dispatch key is missing\.'/i);
  assert.match(contractSql, /drop constraint if exists automation_dispatches_event_type_entity_id_key/i);
  assert.ok(
    contractSql.indexOf("automation_dispatches_company_event_entity_key") <
      contractSql.indexOf("drop constraint if exists automation_dispatches_event_type_entity_id_key")
  );
});

test("audit rows cannot contain webhook URLs or message bodies", () => {
  assert.doesNotMatch(sql, /webhook_url/i);
  assert.doesNotMatch(sql, /recipient_email/i);
  assert.doesNotMatch(sql, /content text/i);
});
