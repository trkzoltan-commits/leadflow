import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = path => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

test("every authenticated partner page exposes the shared Dashboard brand link", () => {
  for (const path of [
    "app/page.tsx",
    "app/leads/page.tsx",
    "app/leads/[id]/page.tsx",
    "app/pipeline/page.tsx",
    "app/reports/page.tsx",
    "app/settings/page.tsx",
  ]) {
    assert.match(read(path), /<DashboardBrandLink\s*\/>/, path);
  }

  const component = read("components/dashboard-brand-link.tsx");
  assert.match(component, /href="\/"/);
  assert.match(component, /LeadFlow Dashboard – Áttekintés/);
});

test("dashboard and lead list expose the pipeline", () => {
  const dashboard = read("app/page.tsx");
  assert.match(dashboard, /href="\/pipeline"/);
  assert.match(dashboard, /Saját mai és lejárt teendők/);
  assert.match(dashboard, /Kiosztatlan mai és lejárt teendők/);
  assert.match(dashboard, /A csapat mai és lejárt teendői/);
  assert.match(dashboard, /useLeadAssignees/);
  assert.match(dashboard, /assigned_user_id === currentUserId/);
  assert.match(dashboard, /!canAssign \? "mine"/);
  assert.match(dashboard, /canAssign && <div[^>]+aria-label="Teendők hatóköre"/);
  assert.match(dashboard, /Teendők hatóköre/);
  assert.match(dashboard, /urgentNextActionLeads/);
  assert.match(dashboard, /href=\{`\/leads\/\$\{lead\.id\}`\}/);
  assert.match(dashboard, /Elvégezve/);
  assert.match(dashboard, /Átütemezés/);
  assert.match(dashboard, /fetch\("\/api\/lead-next-action"/);
  assert.match(dashboard, /expectedNextAction: lead\.next_action/);
  assert.match(dashboard, /az érdeklődő és a riportadatai megmaradnak/i);
  assert.match(dashboard, /recentActivities\(leads, messages\)/);
  assert.doesNotMatch(dashboard, /title: "Kimenő üzenet létrehozva"/);
  assert.match(read("app/leads/page.tsx"), /href="\/pipeline"/);
});
