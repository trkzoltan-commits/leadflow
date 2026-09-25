import assert from "node:assert/strict";
import { join } from "node:path";
import test from "node:test";
import { configureCompanyMake, validateConfigPath, validMakeWebhook } from "../scripts/configure-company-make.mjs";

const config = {
  newLeadWebhookUrl: "https://hook.eu1.make.com/new_lead_123",
  approvedReplyWebhookUrl: "https://hook.eu1.make.com/reply_456",
};

function fakeClient({ connection = { mode: "company", enabled: false }, credential = { id: "key-a" }, errorTable = null, updateFails = false } = {}) {
  const writes = [];
  return {
    writes,
    from(table) {
      const filters = [];
      let mutation;
      return {
        select() { return this; },
        eq(key, value) { filters.push([key, value]); return this; },
        is(key, value) { filters.push([key, value]); return this; },
        limit() { return this; },
        update(value) { mutation = value; return this; },
        async maybeSingle() {
          if (table === errorTable) return { data: null, error: { message: "private detail" } };
          if (mutation) {
            writes.push({ table, filters, mutation });
            return { data: updateFails ? null : { company_id: "company-a" }, error: updateFails ? {} : null };
          }
          return { data: { companies: { id: "company-a" }, company_make_connections: connection,
            make_credentials: credential }[table], error: null };
        },
      };
    },
  };
}

test("accepts only secret-free Make webhook shapes", () => {
  assert.equal(validMakeWebhook(config.newLeadWebhookUrl), true);
  for (const value of ["http://hook.eu1.make.com/x", "https://evil.example/x",
    "https://hook.eu1.make.com/x?secret=y", "https://user:pass@hook.eu1.make.com/x", "invalid"]) {
    assert.equal(validMakeWebhook(value), false);
  }
});

test("preflight validates setup without changing the connection", async () => {
  const client = fakeClient();
  assert.deepEqual(await configureCompanyMake(client, "pelda-kft", config), { applied: false });
  assert.equal(client.writes.length, 0);
});

test("apply sets both webhooks and enables only the disabled company connection", async () => {
  const client = fakeClient();
  assert.deepEqual(await configureCompanyMake(client, "pelda-kft", config, true), { applied: true });
  assert.deepEqual(client.writes[0].mutation, {
    new_lead_webhook_url: config.newLeadWebhookUrl,
    approved_reply_webhook_url: config.approvedReplyWebhookUrl,
    enabled: true,
  });
  assert.ok(client.writes[0].filters.some(([key, value]) => key === "enabled" && value === false));
});

test("missing key, enabled connection and database failure block all writes", async () => {
  for (const client of [fakeClient({ credential: null }), fakeClient({ connection: { mode: "company", enabled: true } }),
    fakeClient({ connection: { mode: "legacy", enabled: false } }), fakeClient({ errorTable: "make_credentials" })]) {
    await assert.rejects(configureCompanyMake(client, "pelda-kft", config, true));
    assert.equal(client.writes.length, 0);
  }
  await assert.rejects(configureCompanyMake(fakeClient({ updateFails: true }), "pelda-kft", config, true));
});

test("configuration file must be absolute and outside the repository", () => {
  assert.throws(() => validateConfigPath("webhooks.json"));
  assert.throws(() => validateConfigPath(join(process.cwd(), "webhooks.json")));
});
