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
  assert.match(dashboard, /Mai és lejárt teendők/);
  assert.match(dashboard, /urgentNextActionLeads/);
  assert.match(dashboard, /href=\{`\/leads\/\$\{lead\.id\}`\}/);
  assert.match(read("app/leads/page.tsx"), /href="\/pipeline"/);
});
