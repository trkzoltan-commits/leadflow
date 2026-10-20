import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  CompanyBrandingValidationError,
  DEFAULT_COMPANY_BRANDING,
  normalizeCompanyBranding,
  parseCompanyBranding,
} from "../lib/company-branding.ts";

test("company branding accepts and normalizes the supported public appearance", () => {
  assert.deepEqual(parseCompanyBranding({
    logoUrl: " https://example.com/logo.png ",
    brandPrimary: "#002BFF",
    brandSecondary: "#DCEFF8",
    brandingMode: "logo_and_name",
    showCompanyName: true,
  }), {
    logoUrl: "https://example.com/logo.png",
    brandPrimary: "#002bff",
    brandSecondary: "#dceff8",
    brandingMode: "logo_and_name",
    showCompanyName: true,
  });

  assert.equal(parseCompanyBranding({
    logoUrl: "",
    brandPrimary: "#149a02",
    brandSecondary: "#ffffff",
    brandingMode: "combined_image",
    showCompanyName: false,
  }).logoUrl, "");
});

test("company branding rejects unsafe or malformed values", () => {
  const valid = {
    logoUrl: "https://example.com/logo.png",
    brandPrimary: "#002bff",
    brandSecondary: "#dceff8",
    brandingMode: "logo_and_name",
    showCompanyName: true,
  };
  for (const invalid of [
    { ...valid, logoUrl: "javascript:alert(1)" },
    { ...valid, logoUrl: "https://user:secret@example.com/logo.png" },
    { ...valid, brandPrimary: "blue" },
    { ...valid, brandSecondary: "#fff" },
    { ...valid, brandingMode: "custom_html" },
    { ...valid, showCompanyName: "true" },
  ]) {
    assert.throws(() => parseCompanyBranding(invalid), CompanyBrandingValidationError);
  }
});

test("stored branding falls back to stable public defaults", () => {
  assert.deepEqual(normalizeCompanyBranding(null), DEFAULT_COMPANY_BRANDING);
  assert.deepEqual(normalizeCompanyBranding({
    logo_url: "not-a-url",
    brand_primary: "bad",
    brand_secondary: null,
    branding_mode: "unexpected",
    show_company_name: null,
  }), DEFAULT_COMPANY_BRANDING);
});

test("branding updates are owner-only and tenant-scoped", async () => {
  const [route, settings] = await Promise.all([
    readFile(new URL("../app/api/company-branding/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/settings/page.tsx", import.meta.url), "utf8"),
  ]);
  assert.match(route, /profile\.role !== "owner"/);
  assert.match(route, /\.from\("companies"\)[\s\S]*\.eq\("id", profile\.company_id\)/);
  assert.doesNotMatch(route, /companyId[^\n]+request|body\?\.companyId/);
  assert.match(settings, /fetch\("\/api\/company-branding"/);
  assert.match(settings, /userRole !== "owner"/);
  assert.doesNotMatch(settings, /from\("companies"\)\.update/);
});
