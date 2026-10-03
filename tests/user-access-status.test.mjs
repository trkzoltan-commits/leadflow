import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migration = readFileSync(new URL("../supabase/migrations/202610030001_user_access_status.sql", import.meta.url), "utf8");

test("inactive memberships cannot resolve a tenant through RLS", () => {
  assert.match(migration, /is_active boolean not null default true/i);
  assert.match(migration, /create or replace function public\.current_company_id\(\)/i);
  assert.match(migration, /and is_active = true/i);
  assert.match(migration, /security definer[\s\S]*set search_path = public/i);
});

test("server routes that use elevated clients reject inactive members", () => {
  for (const file of ["account-profile", "company-settings", "send-approved-reply", "team-members"]) {
    const source = readFileSync(new URL(`../app/api/${file}/route.ts`, import.meta.url), "utf8");
    assert.match(source, /is_active/);
    assert.match(source, /is_active === false/);
  }
});
