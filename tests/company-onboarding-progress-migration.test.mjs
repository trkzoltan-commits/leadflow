import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const migrationUrl = new URL("../supabase/migrations/202610030002_company_onboarding_progress.sql", import.meta.url);

test("onboarding progress is server-only and tenant-linked", async () => {
  const sql = await readFile(migrationUrl, "utf8");
  assert.match(sql, /company_id uuid primary key references public\.companies\(id\) on delete cascade/i);
  assert.match(sql, /enable row level security/i);
  assert.match(sql, /revoke all on table public\.company_onboarding_progress from public, anon, authenticated/i);
  assert.match(sql, /grant all on table public\.company_onboarding_progress to service_role/i);
});
