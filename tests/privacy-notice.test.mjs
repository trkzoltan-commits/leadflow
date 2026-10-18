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
  const originalVersion = privacyNoticeVersion({ companyName: "Példa Kft.", contactEmail: "INFO@example.hu", companyAddress: "1111 Budapest", retentionMonths: 24 });
  assert.match(originalVersion, /^2026-10-17:[0-9a-f]{24}$/);
  assert.equal(originalVersion, privacyNoticeVersion({ companyName: " Példa Kft. ", contactEmail: "info@example.hu", companyAddress: " 1111 Budapest ", retentionMonths: 24 }));
  assert.notEqual(originalVersion, privacyNoticeVersion({ companyName: "Új Példa Kft.", contactEmail: "info@example.hu", companyAddress: "1111 Budapest", retentionMonths: 24 }));
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

test("privacy notice revision timestamp changes only with notice content", async () => {
  const sql = await readFile(new URL("../supabase/migrations/202610180001_privacy_notice_revision.sql", import.meta.url), "utf8");
  assert.match(sql, /before insert or update of[\s\S]*privacy_notice_enabled[\s\S]*privacy_contact_email[\s\S]*privacy_company_address[\s\S]*privacy_retention_months/i);
  assert.match(sql, /after update of name on public\.companies/i);
  assert.match(sql, /new\.name is distinct from old\.name/i);
  assert.match(sql, /update public\.company_settings[\s\S]*privacy_notice_updated_at = now\(\)/i);
});

test("lead details expose the stored privacy acknowledgement without cluttering non-web leads", async () => {
  const details = await readFile(new URL("../app/leads/[id]/page.tsx", import.meta.url), "utf8");
  assert.match(details, /privacy_notice_acknowledged_at/);
  assert.match(details, /privacy_notice_version/);
  assert.match(details, /lead\.source === "web"/);
  assert.match(details, /Elolvasás visszaigazolva/);
  assert.match(details, /Naplózási részletek/);
});
