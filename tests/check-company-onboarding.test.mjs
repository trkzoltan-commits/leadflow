import assert from "node:assert/strict";
import test from "node:test";
import { checkCompanyOnboarding, confirmOnboardingMilestone, nextOnboardingStep } from "../scripts/check-company-onboarding.mjs";

const webhook = "https://hook.eu1.make.com/example_123";
function clientFor(rows = {}, errorTable = null) {
  const calls = [];
  const tables = {
    companies: { id: "company-a" }, company_settings: { auto_reply_mode: "manual" },
    users: { id: "owner-a" }, make_credentials: { id: "credential-a" },
    company_make_connections: { mode: "company", enabled: true,
      new_lead_webhook_url: webhook, approved_reply_webhook_url: webhook },
    company_onboarding_progress: {
      owner_login_verified_at: "2026-10-03T10:00:00.000Z",
      new_lead_flow_verified_at: "2026-10-03T10:05:00.000Z",
      approved_reply_flow_verified_at: "2026-10-03T10:10:00.000Z",
      tenant_isolation_verified_at: "2026-10-03T10:15:00.000Z",
    },
    ...rows,
  };
  return {
    from(table) {
      return {
        select() { return this; }, eq() { return this; }, is() { return this; }, limit() { return this; },
        async maybeSingle() {
          return { data: tables[table], error: table === errorTable ? { message: "secret detail" } : null };
        },
        async upsert(payload) {
          calls.push({ table, payload });
          return { error: table === errorTable ? { message: "secret detail" } : null };
        },
      };
    },
    calls,
  };
}

test("complete tenant setup passes without returning secrets", async () => {
  const result = await checkCompanyOnboarding(clientFor(), "pelda-kft");
  assert.equal(result.ready, true);
  assert.ok(Object.values(result.checks).every(Boolean));
  assert.equal(result.nextStep.code, "pilot_ready");
  assert.equal(JSON.stringify(result).includes("hook."), false);
});

test("missing owner, key, webhook or disabled Make blocks readiness", async () => {
  for (const rows of [
    { users: null }, { make_credentials: null },
    { company_make_connections: { mode: "company", enabled: false, new_lead_webhook_url: webhook, approved_reply_webhook_url: webhook } },
    { company_make_connections: { mode: "company", enabled: true, new_lead_webhook_url: "https://evil.example/hook", approved_reply_webhook_url: webhook } },
  ]) {
    assert.equal((await checkCompanyOnboarding(clientFor(rows), "pelda-kft")).ready, false);
  }
});

test("database error and invalid slug fail closed", async () => {
  await assert.rejects(checkCompanyOnboarding(clientFor({}, "make_credentials"), "pelda-kft"));
  await assert.rejects(checkCompanyOnboarding(clientFor(), "Bad-Slug"));
});

test("next step follows the safe onboarding order", () => {
  const complete = {
    settings: true, owner: true, companyMakeMode: true, activeMakeKey: true,
    newLeadWebhook: true, approvedReplyWebhook: true, makeEnabled: true,
    ownerLoginVerified: true, newLeadFlowVerified: true,
    approvedReplyFlowVerified: true, tenantIsolationVerified: true,
  };
  const cases = [
    ["settings", "repair_provisioning"],
    ["companyMakeMode", "repair_provisioning"],
    ["owner", "invite_owner"],
    ["activeMakeKey", "issue_make_key"],
    ["newLeadWebhook", "configure_webhooks"],
    ["approvedReplyWebhook", "configure_webhooks"],
    ["makeEnabled", "verify_and_enable"],
    ["ownerLoginVerified", "verify_owner_login"],
    ["newLeadFlowVerified", "verify_new_lead_flow"],
    ["approvedReplyFlowVerified", "verify_approved_reply_flow"],
    ["tenantIsolationVerified", "verify_tenant_isolation"],
  ];
  for (const [missing, expected] of cases) {
    assert.equal(nextOnboardingStep({ ...complete, [missing]: false }).code, expected);
  }
  assert.equal(nextOnboardingStep(complete).code, "pilot_ready");
});

test("an explicit confirmation stores only the selected milestone timestamp", async () => {
  const client = clientFor();
  const result = await confirmOnboardingMilestone(
    client, "pelda-kft", "new-lead-flow", new Date("2026-10-03T12:00:00.000Z"),
  );
  assert.equal(result.checkKey, "newLeadFlowVerified");
  const write = client.calls.find(call => call.table === "company_onboarding_progress");
  assert.deepEqual(write.payload, {
    company_id: "company-a",
    new_lead_flow_verified_at: "2026-10-03T12:00:00.000Z",
    updated_at: "2026-10-03T12:00:00.000Z",
  });
  assert.equal(JSON.stringify(write).includes("hook."), false);
});

test("unknown milestones fail before any database write", async () => {
  const client = clientFor();
  await assert.rejects(confirmOnboardingMilestone(client, "pelda-kft", "anything"), /Ismeretlen/);
  assert.equal(client.calls.length, 0);
});
