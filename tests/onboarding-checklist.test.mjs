import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { buildOnboardingChecklist } from "../lib/onboarding-checklist.ts";

const completeInput = {
  companyName: "Példa Kft.", companySlug: "pelda-kft", logoUrl: "https://example.com/logo.png",
  signatureEnabled: true, signerName: "Kovács Péter", signatureEmail: "info@example.com",
  privacyEnabled: true, privacyEmail: "privacy@example.com", privacyAddress: "1111 Budapest, Példa utca 1.", privacyRetentionMonths: 24,
  replyMode: "manual", activeMemberCount: 2, makeConnectionReady: true,
  newLeadVerifiedAt: "2026-10-01T10:00:00.000Z", approvedReplyVerifiedAt: "2026-10-01T10:05:00.000Z",
  ownerLoginVerifiedAt: "2026-10-01T09:00:00.000Z", tenantIsolationVerifiedAt: "2026-10-01T11:00:00.000Z",
};

const route = readFileSync(new URL("../app/api/onboarding-checklist/route.ts", import.meta.url), "utf8");
const settings = readFileSync(new URL("../app/settings/page.tsx", import.meta.url), "utf8");
const component = readFileSync(new URL("../components/onboarding-checklist.tsx", import.meta.url), "utf8");

test("a complete tenant exposes nine finished onboarding checks", () => {
  const result = buildOnboardingChecklist(completeInput);
  assert.equal(result.completed, 9);
  assert.equal(result.total, 9);
  assert.equal(result.ready, true);
  assert.equal(result.details.activeMemberCount, 2);
  assert.equal(result.details.replyMode, "manual");
});

test("missing operational setup stays incomplete without making optional logo mandatory", () => {
  const result = buildOnboardingChecklist({
    ...completeInput,
    logoUrl: null,
    signatureEmail: null,
    privacyEnabled: false,
    activeMemberCount: 0,
    makeConnectionReady: false,
    approvedReplyVerifiedAt: null,
    tenantIsolationVerifiedAt: null,
  });
  assert.equal(result.items.companyProfile, true);
  assert.equal(result.details.logoConfigured, false);
  assert.equal(result.items.emailSignature, false);
  assert.equal(result.items.privacyNotice, false);
  assert.equal(result.items.teamAccess, false);
  assert.equal(result.items.makeConnection, false);
  assert.equal(result.items.approvedReplyTest, false);
  assert.equal(result.items.securityReview, false);
  assert.equal(result.ready, false);
});

test("checklist API is owner-only, tenant-derived and returns no connection secret", () => {
  assert.match(route, /profile\.role !== "owner"/);
  assert.match(route, /const companyId = profile\.company_id/);
  assert.match(route, /\.eq\("company_id", companyId\)/);
  assert.match(route, /makeStatus === "company_active"/);
  assert.doesNotMatch(route, /NextResponse\.json\([^\n]*(webhook|credential)/i);
  assert.match(route, /"Cache-Control": "private, no-store"/);
});

test("settings shows onboarding only to owners with direct next-step links", () => {
  assert.match(settings, /userRole === "owner"\s*\? settingsSections/);
  assert.match(settings, /activeSection === "onboarding" && userRole === "owner"/);
  assert.match(component, /Indulási ellenőrzőlista/);
  assert.match(component, /onSelectSection/);
  assert.match(component, /\/ajanlatkeres\/\$\{companySlug\}/);
  assert.match(component, /href: "\/leads"/);
});
