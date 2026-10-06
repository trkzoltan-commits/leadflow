import assert from "node:assert/strict";
import { join } from "node:path";
import { tmpdir } from "node:os";
import test from "node:test";
import {
  nextGuidedOnboardingStep, runGuidedOnboarding, validateManifestPath, validateOnboardingManifest,
} from "../scripts/onboard-company.mjs";

const baseChecks = {
  settings: true, owner: true, companyMakeMode: true, activeMakeKey: true,
  newLeadWebhook: true, approvedReplyWebhook: true, makeEnabled: true,
  ownerLoginVerified: true, newLeadFlowVerified: true,
  approvedReplyFlowVerified: true, tenantIsolationVerified: true,
};

test("guided onboarding validates a secret-free manifest outside the repository", () => {
  const manifestPath = join(tmpdir(), "leadflow-onboarding.json");
  const manifest = validateOnboardingManifest({
    companyName: " Példa Kft. ",
    companySlug: "pelda-kft",
    ownerEmail: "owner@example.com",
    makeKeyPath: join(tmpdir(), "pelda-kft-make-key.txt"),
    webhookConfigPath: join(tmpdir(), "pelda-kft-webhooks.json"),
  });
  validateManifestPath(manifestPath);
  assert.equal(manifest.companyName, "Példa Kft.");
  assert.equal(manifest.companySlug, "pelda-kft");
  assert.throws(() => validateOnboardingManifest({ ...manifest, makeSecret: "forbidden" }), /ismeretlen mezőt/);
  assert.throws(() => validateManifestPath(join(process.cwd(), "onboarding.json")), /projektmappában/);
});

test("guided onboarding always exposes one safe next step", () => {
  assert.equal(nextGuidedOnboardingStep({ companyExists: false, checks: null, hasWebhookConfig: false }).code, "create_company");
  assert.equal(nextGuidedOnboardingStep({ companyExists: true, checks: { ...baseChecks, owner: false }, hasWebhookConfig: false }).code, "invite_owner");
  assert.equal(nextGuidedOnboardingStep({ companyExists: true, checks: { ...baseChecks, activeMakeKey: false }, hasWebhookConfig: false }).code, "issue_make_key");
  assert.equal(nextGuidedOnboardingStep({ companyExists: true, checks: { ...baseChecks, newLeadWebhook: false }, hasWebhookConfig: false }).code, "provide_webhook_config");
  assert.equal(nextGuidedOnboardingStep({ companyExists: true, checks: { ...baseChecks, newLeadWebhook: false }, hasWebhookConfig: true }).code, "stage_webhooks");
  assert.equal(nextGuidedOnboardingStep({ companyExists: true, checks: { ...baseChecks, makeEnabled: false }, hasWebhookConfig: true }).code, "enable_make");
  assert.equal(nextGuidedOnboardingStep({ companyExists: true, checks: { ...baseChecks, ownerLoginVerified: false }, hasWebhookConfig: true }).milestone, "owner-login");
  assert.equal(nextGuidedOnboardingStep({ companyExists: true, checks: { ...baseChecks, newLeadFlowVerified: false }, hasWebhookConfig: true }).milestone, "new-lead-flow");
  assert.equal(nextGuidedOnboardingStep({ companyExists: true, checks: { ...baseChecks, approvedReplyFlowVerified: false }, hasWebhookConfig: true }).milestone, "approved-reply-flow");
  assert.equal(nextGuidedOnboardingStep({ companyExists: true, checks: { ...baseChecks, tenantIsolationVerified: false }, hasWebhookConfig: true }).milestone, "tenant-isolation");
  assert.equal(nextGuidedOnboardingStep({ companyExists: true, checks: baseChecks, hasWebhookConfig: true }).code, "pilot_ready");
});

test("guided onboarding rejects an out-of-order live confirmation before writing", async () => {
  const calls = [];
  const rows = {
    companies: { id: "company-a" },
    company_settings: { auto_reply_mode: "manual" },
    users: { id: "owner-a" },
    make_credentials: { id: "credential-a" },
    company_make_connections: {
      mode: "company",
      enabled: true,
      new_lead_webhook_url: "https://hook.eu1.make.com/example_123",
      approved_reply_webhook_url: "https://hook.eu1.make.com/example_456",
    },
    company_onboarding_progress: {
      owner_login_verified_at: null,
      new_lead_flow_verified_at: null,
      approved_reply_flow_verified_at: null,
      tenant_isolation_verified_at: null,
    },
  };
  const client = {
    from(table) {
      return {
        select() { return this; },
        eq() { return this; },
        is() { return this; },
        limit() { return this; },
        async maybeSingle() { return { data: rows[table], error: null }; },
        async upsert(payload) { calls.push({ table, payload }); return { error: null }; },
      };
    },
  };
  const manifest = {
    companyName: "Példa Kft.",
    companySlug: "pelda-kft",
    ownerEmail: "owner@example.com",
    makeKeyPath: join(tmpdir(), "pelda-kft-make-key.txt"),
  };

  await assert.rejects(
    runGuidedOnboarding(client, manifest, "confirm", "tenant-isolation"),
    /még nem következik/,
  );
  assert.equal(calls.length, 0);
});
