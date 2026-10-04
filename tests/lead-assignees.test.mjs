import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const route = readFileSync(new URL("../app/api/lead-assignees/route.ts", import.meta.url), "utf8");
const migration = readFileSync(new URL("../supabase/migrations/202610040001_lead_assignees.sql", import.meta.url), "utf8");

test("assignee directory returns only active members of the authenticated tenant", () => {
  assert.match(route, /select\("company_id,role,is_active"\)/);
  assert.match(route, /profile\.is_active === false/);
  assert.match(route, /eq\("company_id", access\.companyId\)/);
  assert.match(route, /eq\("is_active", true\)/);
  assert.match(route, /currentUserId: access\.userId/);
  assert.match(route, /canAssign: assignmentRoles\.has/);
});

test("only owner and admin can assign a same-tenant active member", () => {
  assert.match(route, /new Set\(\["owner", "admin"\]\)/);
  assert.match(route, /if \(!assignmentRoles\.has\(access\.role/);
  assert.match(route, /\.eq\("id", assignedUserId\)[\s\S]*?\.eq\("company_id", access\.companyId\)[\s\S]*?\.eq\("is_active", true\)/);
  assert.match(route, /\.update\(\{ assigned_user_id: assignedUserId \}\)[\s\S]*?\.eq\("id", leadId\)[\s\S]*?\.eq\("company_id", access\.companyId\)/);
  assert.match(route, /await access\.userClient[\s\S]*?\.from\("leads"\)[\s\S]*?\.update\(\{ assigned_user_id/);
  assert.doesNotMatch(route, /input\.company_id|body\.company_id/);
});

test("database keeps lead assignments inside the tenant and blocks direct regular-user changes", () => {
  assert.match(migration, /foreign key \(company_id, assigned_user_id\)/i);
  assert.match(migration, /references public\.users \(company_id, id\)/i);
  assert.match(migration, /target\.is_active = true/i);
  assert.match(migration, /actor\.role in \('owner', 'admin'\)/i);
  assert.match(migration, /actor_id uuid := auth\.uid\(\)/i);
  assert.match(migration, /actor_role text := auth\.role\(\)/i);
  assert.match(migration, /company_changed and coalesce\(actor_role, ''\) <> 'service_role'/i);
  assert.match(migration, /actor_id is null[\s\S]*?coalesce\(actor_role, ''\) <> 'service_role'/i);
  assert.match(migration, /before insert or update of assigned_user_id, company_id/i);
});
