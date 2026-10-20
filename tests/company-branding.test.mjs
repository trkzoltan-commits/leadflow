import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  CompanyBrandingValidationError,
  COMPANY_LOGO_BUCKET,
  COMPANY_LOGO_MAX_BYTES,
  DEFAULT_COMPANY_BRANDING,
  companyLogoExtension,
  companyLogoStoragePath,
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

test("company logo uploads accept only bounded web image formats", () => {
  assert.equal(COMPANY_LOGO_BUCKET, "company-branding");
  assert.equal(COMPANY_LOGO_MAX_BYTES, 2 * 1024 * 1024);
  assert.equal(companyLogoExtension({ type: "image/jpeg", size: 1024 }), "jpg");
  assert.equal(companyLogoExtension({ type: "image/png", size: 1024 }), "png");
  assert.equal(companyLogoExtension({ type: "image/webp", size: COMPANY_LOGO_MAX_BYTES }), "webp");
  assert.throws(() => companyLogoExtension({ type: "image/svg+xml", size: 100 }), CompanyBrandingValidationError);
  assert.throws(() => companyLogoExtension({ type: "image/png", size: 0 }), CompanyBrandingValidationError);
  assert.throws(() => companyLogoExtension({ type: "image/png", size: COMPANY_LOGO_MAX_BYTES + 1 }), CompanyBrandingValidationError);
});

test("stored logo cleanup cannot cross tenant folders", () => {
  const ownUrl = "https://project.supabase.co/storage/v1/object/public/company-branding/company-a/logo.png";
  assert.equal(companyLogoStoragePath(ownUrl, "company-a"), "company-a/logo.png");
  assert.equal(companyLogoStoragePath(ownUrl, "company-b"), null);
  assert.equal(companyLogoStoragePath("https://example.com/company-a/logo.png", "company-a"), null);
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
  assert.match(route, /request\.formData\(\)/);
  assert.match(route, /profile\.company_id\}\/logo-/);
  assert.match(route, /storage[\s\S]*\.from\(COMPANY_LOGO_BUCKET\)[\s\S]*\.upload/);
  assert.match(settings, /userRole !== "owner"/);
  assert.doesNotMatch(settings, /from\("companies"\)\.update/);
});

test("branding storage is public-read and keeps all writes behind the server API", async () => {
  const migration = await readFile(new URL("../supabase/migrations/202610200001_company_branding_storage.sql", import.meta.url), "utf8");
  assert.match(migration, /insert into storage\.buckets/i);
  assert.match(migration, /'company-branding'/);
  assert.match(migration, /2097152/);
  assert.match(migration, /'image\/jpeg'.*'image\/png'.*'image\/webp'/s);
  assert.doesNotMatch(migration, /create policy/i);
});
