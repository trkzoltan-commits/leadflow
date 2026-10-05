import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  budapestDateKey,
  budapestDateOffset,
  displayNextActionDueDate,
  filterLeadsByNextAction,
  isValidDateOnly,
  nextActionDueState,
  sortLeadsByNextAction,
  urgentNextActionLeads,
} from "../lib/lead-next-action.ts";

const route = readFileSync(new URL("../app/api/lead-next-action/route.ts", import.meta.url), "utf8");
const migration = readFileSync(new URL("../supabase/migrations/202610040002_lead_next_actions.sql", import.meta.url), "utf8");

test("date-only deadlines are validated as real calendar dates", () => {
  assert.equal(isValidDateOnly("2026-02-28"), true);
  assert.equal(isValidDateOnly("2028-02-29"), true);
  assert.equal(isValidDateOnly("2026-02-29"), false);
  assert.equal(isValidDateOnly("2026-13-01"), false);
  assert.equal(isValidDateOnly("04.10.2026"), false);
  assert.equal(isValidDateOnly(null), false);
});

test("deadline state follows Budapest calendar days", () => {
  const now = new Date("2026-10-04T08:00:00Z");
  assert.equal(nextActionDueState("2026-10-03", now), "overdue");
  assert.equal(nextActionDueState("2026-10-04", now), "today");
  assert.equal(nextActionDueState("2026-10-05", now), "soon");
  assert.equal(nextActionDueState("2026-10-07", now), "soon");
  assert.equal(nextActionDueState("2026-10-08", now), "later");
  assert.equal(nextActionDueState(null, now), "invalid");
});

test("Budapest midnight and DST boundaries do not shift due dates", () => {
  assert.equal(budapestDateKey(new Date("2026-10-03T21:59:00Z")), "2026-10-03");
  assert.equal(budapestDateKey(new Date("2026-10-03T22:01:00Z")), "2026-10-04");
  assert.equal(nextActionDueState("2026-10-04", new Date("2026-10-03T21:59:00Z")), "soon");
  assert.equal(nextActionDueState("2026-10-04", new Date("2026-10-03T22:01:00Z")), "today");
  assert.equal(budapestDateKey(new Date("2026-03-29T00:30:00Z")), "2026-03-29");
  assert.equal(budapestDateKey(new Date("2026-10-25T00:30:00Z")), "2026-10-25");
});

test("quick deadlines and display labels stay calendar based", () => {
  const now = new Date("2026-10-04T08:00:00Z");
  assert.equal(budapestDateOffset(0, now), "2026-10-04");
  assert.equal(budapestDateOffset(1, now), "2026-10-05");
  assert.match(displayNextActionDueDate("2026-10-03", now), /^Lejárt ·/);
  assert.match(displayNextActionDueDate("2026-10-04", now), /^Ma ·/);
  assert.match(displayNextActionDueDate("2026-10-05", now), /^Holnap ·/);
});

test("task filters exclude closed leads and keep the ranges distinct", () => {
  const now = new Date("2026-10-05T08:00:00Z");
  const leads = [
    { id: "overdue", status: "contacted", next_action: "Visszahívás", next_action_due_date: "2026-10-04", created_at: "2026-10-01T08:00:00Z" },
    { id: "today", status: "waiting", next_action: "Ajánlat ellenőrzése", next_action_due_date: "2026-10-05", created_at: "2026-10-02T08:00:00Z" },
    { id: "soon", status: "decision", next_action: "Érdeklődés", next_action_due_date: "2026-10-08", created_at: "2026-10-03T08:00:00Z" },
    { id: "later", status: "new", next_action: "Helyszíni mérés", next_action_due_date: "2026-10-09", created_at: "2026-10-04T08:00:00Z" },
    { id: "missing", status: "offer_sent", next_action: null, next_action_due_date: null, created_at: "2026-10-05T08:00:00Z" },
    { id: "closed", status: "processed", next_action: "Régi teendő", next_action_due_date: "2026-10-04", created_at: "2026-10-05T09:00:00Z" },
  ];

  assert.deepEqual(filterLeadsByNextAction(leads, "overdue", now).map(lead => lead.id), ["overdue"]);
  assert.deepEqual(filterLeadsByNextAction(leads, "today", now).map(lead => lead.id), ["today"]);
  assert.deepEqual(filterLeadsByNextAction(leads, "soon", now).map(lead => lead.id), ["soon"]);
  assert.deepEqual(filterLeadsByNextAction(leads, "missing", now).map(lead => lead.id), ["missing"]);
  assert.equal(filterLeadsByNextAction(leads, "all", now), leads);
});

test("pipeline and dashboard order the most urgent tasks first", () => {
  const now = new Date("2026-10-05T08:00:00Z");
  const leads = [
    { id: "missing", status: "new", next_action: null, next_action_due_date: null, created_at: "2026-10-05T08:00:00Z" },
    { id: "tomorrow", status: "waiting", next_action: "Visszahívás", next_action_due_date: "2026-10-06", created_at: "2026-10-03T08:00:00Z" },
    { id: "today", status: "contacted", next_action: "Ajánlat", next_action_due_date: "2026-10-05", created_at: "2026-10-02T08:00:00Z" },
    { id: "overdue", status: "decision", next_action: "Döntés kérése", next_action_due_date: "2026-10-03", created_at: "2026-10-01T08:00:00Z" },
  ];

  assert.deepEqual(sortLeadsByNextAction(leads).map(lead => lead.id), ["overdue", "today", "tomorrow", "missing"]);
  assert.deepEqual(urgentNextActionLeads(leads, now).map(lead => lead.id), ["overdue", "today"]);
});

test("next-action API is authenticated, tenant scoped and writes with the caller JWT", () => {
  assert.match(route, /select\("company_id,role,is_active"\)/);
  assert.match(route, /\.eq\("company_id", access\.companyId\)/);
  assert.match(route, /lead\.assigned_user_id !== access\.userId/);
  assert.match(route, /new Set\(\["owner", "admin"\]\)/);
  assert.match(route, /let updateQuery = access\.userClient[\s\S]*?\.from\("leads"\)[\s\S]*?\.update\(/);
  assert.match(route, /next_action: isClearRequest \? null : nextAction/);
  assert.match(route, /expectedNextAction/);
  assert.match(route, /\.in\("status", \["new", "contacted", "waiting", "offer_sent", "decision"\]\)/);
  assert.match(route, /\.is\("next_action", null\)/);
  assert.match(route, /status: 409/);
  assert.doesNotMatch(route, /input\.company_id|body\.company_id/);
});

test("database stores a paired task, protects writes and clears it on closure", () => {
  assert.match(migration, /next_action text/i);
  assert.match(migration, /next_action_due_date date/i);
  assert.match(migration, /\(next_action is null\) = \(next_action_due_date is null\)/i);
  assert.match(migration, /char_length\(btrim\(next_action\)\) between 1 and 300/i);
  assert.match(migration, /new\.status = 'processed'[\s\S]*?new\.next_action := null/i);
  assert.match(migration, /actor\.role in \('owner', 'admin'\) or new\.assigned_user_id = actor_id/i);
  assert.match(migration, /actor\.is_active = true/i);
  assert.match(migration, /coalesce\(actor_role, ''\) <> 'service_role'/i);
  assert.match(migration, /before insert or update of status, next_action, next_action_due_date/i);
  assert.doesNotMatch(migration, /not closing_lead/i);
});
