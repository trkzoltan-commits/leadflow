import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const route = readFileSync(new URL("../app/api/team-members/route.ts", import.meta.url), "utf8");
const component = readFileSync(new URL("../components/team-management.tsx", import.meta.url), "utf8");

test("team management is restricted to the tenant owner", () => {
  assert.match(route, /profile\.role !== "owner"/);
  assert.match(route, /eq\("company_id", access\.companyId\)/);
  assert.match(route, /memberId === access\.user\.id/);
  assert.match(route, /target\.role === "owner"/);
  assert.match(route, /profile\.is_active === false/);
});

test("owners can only assign non-owner operational roles", () => {
  assert.match(route, /new Set\(\["admin", "user"\]\)/);
  assert.match(route, /inviteUserByEmail/);
  assert.match(route, /deleteUser\(invited\.user\.id\)/);
  assert.match(route, /updateUserById\(memberId/);
  assert.match(route, /ban_duration: active \? "none" : "876000h"/);
});

test("settings exposes invitation and role controls only to owners", () => {
  const settings = readFileSync(new URL("../app/settings/page.tsx", import.meta.url), "utf8");
  assert.match(settings, /<TeamManagement isOwner=\{userRole === "owner"\}/);
  assert.match(component, /if \(!isOwner\) return null/);
  assert.match(component, /Munkatársak és jogosultságok/);
  assert.match(component, /Inaktiválás/);
  assert.match(component, /Újraaktiválás/);
});
