import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { privacyNoticeReady, privacyNoticeVersion, validPrivacyAddress, validPrivacyEmail, validRetentionMonths } from "../lib/privacy-notice.ts";

test("privacy notice can be enabled only with complete bounded company data", () => {
  assert.equal(validPrivacyEmail(" info@example.hu "), "info@example.hu");
  assert.equal(validPrivacyEmail("hibas"), null);
  assert.equal(validPrivacyAddress(" 1111 Budapest, Példa utca 1. "), "1111 Budapest, Példa utca 1.");
  assert.equal(validPrivacyAddress("x"), null);
  assert.equal(validRetentionMonths(24), 24);
  assert.equal(validRetentionMonths(0), null);
  assert.equal(privacyNoticeReady({ enabled: true, contactEmail: "info@example.hu", companyAddress: "1111 Budapest", retentionMonths: 24, updatedAt: null }), true);
  assert.equal(privacyNoticeReady({ enabled: true, contactEmail: null, companyAddress: "1111 Budapest", retentionMonths: 24, updatedAt: null }), false);
  assert.equal(privacyNoticeReady({ enabled: true, contactEmail: "hibas", companyAddress: "1111 Budapest", retentionMonths: 24, updatedAt: null }), false);
  assert.match(privacyNoticeVersion("2026-10-17T12:00:00.000Z"), /^2026-10-17:2026-10-17T12:00:00\.000Z$/);
});

test("public submissions require acknowledgement only after a complete tenant notice is enabled", async () => {
  const [form, route, settings] = await Promise.all([
    readFile(new URL("../app/ajanlatkeres/[slug]/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/api/public-lead/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/settings/page.tsx", import.meta.url), "utf8"),
  ]);
  assert.match(form, /type="checkbox" required checked=\{privacyAcknowledged\}/);
  assert.match(form, /privacy_acknowledged: privacyAcknowledged/);
  assert.match(route, /privacyEnabled && !privacy_acknowledged/);
  assert.match(settings, /canManageCompany.*owner.*admin/);
  assert.match(settings, /Adatkezelési tájékoztató aktiválása/);
});

test("privacy migration stores tenant settings and acknowledgement evidence", async () => {
  const sql = await readFile(new URL("../supabase/migrations/202610170002_privacy_notice.sql", import.meta.url), "utf8");
  assert.match(sql, /privacy_notice_enabled boolean not null default false/i);
  assert.match(sql, /privacy_retention_months integer not null default 24/i);
  assert.match(sql, /privacy_notice_acknowledged_at timestamptz/i);
  assert.match(sql, /privacy_notice_version text/i);
});
