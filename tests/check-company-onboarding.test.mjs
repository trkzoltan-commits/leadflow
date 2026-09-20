import assert from "node:assert/strict";
import test from "node:test";
import { checkCompanyOnboarding } from "../scripts/check-company-onboarding.mjs";

const webhook = "https://hook.eu1.make.com/example_123";
function clientFor(rows = {}, errorTable = null) {
  const tables = {
    companies: { id: "company-a" }, company_settings: { auto_reply_mode: "manual" },
    users: { id: "owner-a" }, make_credentials: { id: "credential-a" },
    company_make_connections: { mode: "company", enabled: true,
      new_lead_webhook_url: webhook, approved_reply_webhook_url: webhook },
    ...rows,
  };
  return {
    from(table) {
      return {
        select() { return this; }, eq() { return this; }, is() { return this; }, limit() { return this; },
        async maybeSingle() {
          return { data: tables[table], error: table === errorTable ? { message: "secret detail" } : null };
        },
      };
    },
  };
}

test("complete tenant setup passes without returning secrets", async () => {
  const result = await checkCompanyOnboarding(clientFor(), "pelda-kft");
  assert.equal(result.ready, true);
  assert.ok(Object.values(result.checks).every(Boolean));
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
