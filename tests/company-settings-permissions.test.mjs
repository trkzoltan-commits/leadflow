import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const route = readFileSync(new URL("../app/api/company-settings/route.ts", import.meta.url), "utf8");
const settings = readFileSync(new URL("../app/settings/page.tsx", import.meta.url), "utf8");
const migration = readFileSync(new URL("../supabase/migrations/202609300002_company_settings_server_write.sql", import.meta.url), "utf8");

test("company settings server route resolves the tenant and requires owner or admin", () => {
  assert.match(route, /select\("company_id,role,is_active"\)/);
  assert.match(route, /profile\.role !== "owner" && profile\.role !== "admin"/);
  assert.match(route, /eq\("company_id", profile\.company_id\)/);
});

test("authenticated clients cannot bypass role checks with direct updates", () => {
  assert.match(migration, /revoke update on table public\.company_settings from authenticated/i);
  assert.doesNotMatch(settings, /from\("company_settings"\)\s*\.update/);
  assert.match(settings, /fetch\("\/api\/company-settings"/);
});

test("regular users keep personal preferences but company controls are disabled", () => {
  assert.match(settings, /canManageCompany = userRole === "owner" \|\| userRole === "admin"/);
  assert.match(settings, /<fieldset disabled=\{!canManageCompany\}/);
  assert.match(settings, /Saját megjelenés mentése/);
});
