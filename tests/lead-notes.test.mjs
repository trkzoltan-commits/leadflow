import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { LEAD_NOTE_MAX_LENGTH, normalizeLeadNoteContent } from "../lib/lead-notes.ts";

const route = readFileSync(new URL("../app/api/lead-notes/route.ts", import.meta.url), "utf8");
const component = readFileSync(new URL("../components/lead-notes.tsx", import.meta.url), "utf8");
const leadDetail = readFileSync(new URL("../app/leads/[id]/page.tsx", import.meta.url), "utf8");
const migration = readFileSync(new URL("../supabase/migrations/202610060001_lead_notes.sql", import.meta.url), "utf8");

test("lead note content is trimmed and bounded", () => {
  assert.equal(LEAD_NOTE_MAX_LENGTH, 2000);
  assert.equal(normalizeLeadNoteContent("  Telefonon egyeztettünk.  "), "Telefonon egyeztettünk.");
  assert.equal(normalizeLeadNoteContent("   "), null);
  assert.equal(normalizeLeadNoteContent("a".repeat(2000)), "a".repeat(2000));
  assert.equal(normalizeLeadNoteContent("a".repeat(2001)), null);
  assert.equal(normalizeLeadNoteContent(null), null);
});

test("lead notes are tenant bound, immutable for clients and attributed by the database", () => {
  assert.match(migration, /create table if not exists public\.lead_notes/i);
  assert.match(migration, /foreign key \(company_id, lead_id\)[\s\S]*?references public\.leads \(company_id, id\)/i);
  assert.match(migration, /foreign key \(company_id, author_user_id\)[\s\S]*?references public\.users \(company_id, id\)/i);
  assert.match(migration, /new\.company_id := actor_company_id/i);
  assert.match(migration, /new\.author_user_id := auth\.uid\(\)/i);
  assert.match(migration, /new\.created_at := now\(\)/i);
  assert.match(migration, /enable row level security/i);
  assert.match(migration, /using \(company_id = public\.current_company_id\(\)\)/i);
  assert.match(migration, /with check \([\s\S]*?company_id = public\.current_company_id\(\)[\s\S]*?author_user_id = auth\.uid\(\)/i);
  assert.match(migration, /grant select, insert on table public\.lead_notes to authenticated/i);
  assert.doesNotMatch(migration, /grant[^;]*(update|delete)[^;]*lead_notes/i);
  assert.doesNotMatch(migration, /for (update|delete)/i);
});

test("lead notes API authenticates active members and scopes every lead to their tenant", () => {
  assert.match(route, /select\("company_id,is_active"\)/);
  assert.match(route, /profile\.is_active === false/);
  assert.match(route, /\.from\("leads"\)[\s\S]*?\.eq\("id", leadId\)[\s\S]*?\.eq\("company_id", companyId\)/);
  assert.match(route, /supabaseAdmin[\s\S]*?\.from\("lead_notes"\)[\s\S]*?\.insert\(\{[\s\S]*?company_id: access\.companyId,[\s\S]*?lead_id: leadId,[\s\S]*?author_user_id: access\.userId,[\s\S]*?content/);
  assert.doesNotMatch(route, /input\.companyId|input\.company_id|input\.authorUserId|input\.author_user_id/);
  assert.doesNotMatch(route, /export async function (PATCH|DELETE)/);
});

test("lead detail labels notes as internal and provides no edit or delete action", () => {
  assert.match(leadDetail, /<LeadNotes leadId=\{lead\.id\} \/>/);
  assert.match(component, /Belső megjegyzések/);
  assert.match(component, /Nem kerül AI-feldolgozásba, e-mailbe vagy Make-be/);
  assert.match(component, /authorEmail/);
  assert.match(component, /displayNoteDate/);
  assert.match(component, /response\.status !== 401/);
  assert.match(component, /supabase\.auth\.refreshSession\(\)/);
  assert.doesNotMatch(component, />\s*(Szerkesztés|Törlés)\s*</);
});
