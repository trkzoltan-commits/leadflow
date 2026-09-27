import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const sql = await readFile(new URL("../supabase/migrations/202609270003_message_delivery_receipts.sql", import.meta.url), "utf8");

test("delivery receipt migration stores opaque ids with tenant-scoped uniqueness", () => {
  assert.match(sql, /add column provider_message_id text/i);
  assert.match(sql, /\(company_id, provider_message_id\)/i);
  assert.match(sql, /where provider_message_id is not null/i);
  assert.match(sql, /delivery_confirmed_at timestamptz/i);
  assert.match(sql, /delivery_failed_at timestamptz/i);
});
