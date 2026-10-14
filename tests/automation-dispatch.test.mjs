import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import ts from "typescript";
import vm from "node:vm";

async function load() {
  const source = await readFile(new URL("../lib/automation-dispatch.ts", import.meta.url), "utf8");
  const js = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
  const testModule = { exports: {} };
  vm.runInNewContext(`(function(module,exports){${js}\n})(testModule,testModule.exports)`, { testModule });
  return testModule.exports;
}

test("successful Make acknowledgement is accepted", async () => {
  const { webhookAttemptResult } = await load();
  assert.equal(JSON.stringify(webhookAttemptResult({ ok: true, status: 200 })), JSON.stringify({
    status: "accepted", httpStatus: 200, errorCode: null,
  }));
});

test("HTTP and network failures remain uncertain to prevent duplicate delivery", async () => {
  const { webhookAttemptResult } = await load();
  assert.equal(JSON.stringify(webhookAttemptResult({ ok: false, status: 503 })), JSON.stringify({
    status: "uncertain", httpStatus: 503, errorCode: "http",
  }));
  assert.equal(JSON.stringify(webhookAttemptResult(null)), JSON.stringify({
    status: "uncertain", httpStatus: null, errorCode: "network",
  }));
});

test("dispatch creation scopes lookup and conflict identity to the tenant", async () => {
  const { beginAutomationDispatch } = await load();
  const filters = [];
  let upsert = null;
  const query = {
    select() { return this; },
    eq(key, value) { filters.push([key, value]); return this; },
    async maybeSingle() { return { data: { attempt_count: 2 }, error: null }; },
  };
  const client = {
    from() {
      return {
        ...query,
        async upsert(value, options) {
          upsert = { value, options };
          return { error: null };
        },
      };
    },
  };
  assert.equal(await beginAutomationDispatch(client, {
    companyId: "company-a", eventType: "new_lead", entityId: "lead-a",
  }), true);
  assert.deepEqual(filters, [
    ["company_id", "company-a"], ["event_type", "new_lead"], ["entity_id", "lead-a"],
  ]);
  assert.equal(upsert.options.onConflict, "company_id,event_type,entity_id");
  assert.equal(upsert.value.company_id, "company-a");
  assert.equal(upsert.value.attempt_count, 3);
});

test("dispatch completion is tenant scoped and fails when no row was updated", async () => {
  const { finishAutomationDispatch } = await load();
  async function finishWith(data) {
    const filters = [];
    const chain = {
      eq(key, value) { filters.push([key, value]); return this; },
      select() { return this; },
      async maybeSingle() { return { data, error: null }; },
    };
    const client = { from: () => ({ update: () => chain }) };
    const result = await finishAutomationDispatch(client, {
      companyId: "company-a", eventType: "approved_reply", entityId: "message-a", status: "completed",
    });
    return { result, filters };
  }
  const missing = await finishWith(null);
  assert.equal(missing.result, false);
  const updated = await finishWith({ id: "audit-a" });
  assert.equal(updated.result, true);
  assert.deepEqual(updated.filters, [
    ["company_id", "company-a"], ["event_type", "approved_reply"], ["entity_id", "message-a"],
  ]);
});
