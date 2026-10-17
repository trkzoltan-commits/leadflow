import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const migrationUrl = new URL("../supabase/migrations/202610170001_public_lead_idempotency.sql", import.meta.url);

test("public lead idempotency is tenant-scoped and allows historical rows without a key", async () => {
  const sql = await readFile(migrationUrl, "utf8");
  assert.match(sql, /add column if not exists public_submission_id uuid/i);
  assert.match(sql, /on public\.leads \(company_id, public_submission_id\)/i);
  assert.match(sql, /where public_submission_id is not null/i);
});
