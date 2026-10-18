import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const route = await readFile(new URL("../app/api/leads/[id]/retry-automation/route.ts", import.meta.url), "utf8");
const detail = await readFile(new URL("../app/leads/[id]/page.tsx", import.meta.url), "utf8");

test("new-lead retry is authenticated, tenant scoped and limited to definitively unconfigured work", () => {
  assert.match(route, /admin\.auth\.getUser\(accessToken\)/);
  assert.match(route, /eq\("company_id", profile\.company_id\)/);
  assert.match(route, /lead\.new_lead_dispatch_status !== "unconfigured"/);
  assert.match(route, /eq\("new_lead_dispatch_status", "unconfigured"\)/);
  assert.match(route, /neq\("status", "processed"\)/);
  assert.match(route, /is\("anonymized_at", null\)/);
});

test("new-lead retry claims the row before calling Make and preserves uncertain outcomes", () => {
  const claim = route.indexOf('update({ new_lead_dispatch_status: "pending" })');
  const send = route.indexOf("const response = await fetch(webhookUrl");
  assert.ok(claim >= 0 && send > claim);
  assert.match(route, /redirect: "error"/);
  assert.match(route, /new_lead_dispatch_status: "uncertain"/);
  assert.match(route, /ne indítsd újra ismét/);
});

test("only an unconfigured lead exposes the safe retry action", () => {
  assert.match(detail, /lead\.new_lead_dispatch_status === "unconfigured"/);
  assert.match(detail, /Automatizálás újraindítása/);
  assert.match(detail, /\/api\/leads\/\$\{lead\.id\}\/retry-automation/);
});
