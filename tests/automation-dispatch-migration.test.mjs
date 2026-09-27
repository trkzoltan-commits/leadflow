import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const sql = await readFile(new URL("../supabase/migrations/202609270002_automation_dispatches.sql", import.meta.url), "utf8");

test("automation dispatch audit is tenant-linked, unique and server-only", () => {
  assert.match(sql, /company_id uuid not null references public\.companies/i);
  assert.match(sql, /unique \(event_type, entity_id\)/i);
  assert.match(sql, /enable row level security/i);
  assert.match(sql, /revoke all on public\.automation_dispatches from public, anon, authenticated/i);
  assert.doesNotMatch(sql, /create policy/i);
});

test("audit rows cannot contain webhook URLs or message bodies", () => {
  assert.doesNotMatch(sql, /webhook_url/i);
  assert.doesNotMatch(sql, /recipient_email/i);
  assert.doesNotMatch(sql, /content text/i);
});
