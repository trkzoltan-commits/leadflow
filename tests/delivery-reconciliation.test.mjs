import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";

const compiled = new Map();
const messageId = "6ba7b810-9dad-4f96-80b1-3c995b1ca567";

function setup({ companyId = "company-a", dbError = false } = {}) {
  const operations = [];
  const client = {
    from(table) {
      const builder = {
        select(value) { operations.push(["select", table, value]); return this; },
        eq(key, value) { operations.push(["eq", key, value]); return this; },
        is(key, value) { operations.push(["is", key, value]); return this; },
        lte(key, value) { operations.push(["lte", key, value]); return this; },
        order(key, value) { operations.push(["order", key, value]); return this; },
        async limit(value) {
          operations.push(["limit", value]);
          return {
            data: dbError ? null : [{ id: messageId, sending_started_at: "2026-10-15T09:00:00.000Z" }],
            error: dbError ? { message: "unavailable" } : null,
          };
        },
      };
      return builder;
    },
  };
  const cache = new Map();
  function load(path) {
    if (cache.has(path)) return cache.get(path);
    if (!compiled.has(path)) compiled.set(path, ts.transpileModule(
      readFileSync(new URL(`../${path}`, import.meta.url), "utf8"),
      { compilerOptions: { module: ts.ModuleKind.CommonJS, esModuleInterop: true } }
    ).outputText);
    const context = {
      exports: {}, URL, Request, Response,
      process: { env: {} },
      require(name) {
        if (name === "@/lib/make-auth") return {
          authenticateMake: async () => companyId === "denied"
            ? { ok: false, response: Response.json({ error: "Nincs jogosultság." }, { status: 401 }) }
            : { ok: true, companyId },
        };
        if (name === "@/lib/delivery-reconciliation") return load("lib/delivery-reconciliation.ts");
        if (name === "@supabase/supabase-js") return { createClient: () => client };
        if (name === "next/server") return { NextResponse: Response };
        throw new Error(`Unexpected module ${name}`);
      },
    };
    vm.runInNewContext(compiled.get(path), context);
    cache.set(path, context.exports);
    return context.exports;
  }
  return { load, operations };
}

test("delivery references use a fixed safe Gmail header", () => {
  const { deliveryReference, deliveryReconciliationCutoff } = setup().load("lib/delivery-reconciliation.ts");
  assert.deepEqual(JSON.parse(JSON.stringify(deliveryReference(messageId))), {
    headerName: "X-LeadFlow-Message-ID",
    headerValue: messageId,
    gmailSearchQuery: `in:sent header:X-LeadFlow-Message-ID:${messageId}`,
  });
  assert.equal(deliveryReference("not-an-id"), null);
  assert.equal(deliveryReconciliationCutoff(new Date("2026-10-15T10:00:00.000Z")), "2026-10-15T09:55:00.000Z");
});

test("reconciliation queue is tenant-scoped and contains no customer data", async () => {
  const state = setup();
  const response = await state.load("app/api/messages/reconciliation/route.ts").GET(
    new Request("https://example.invalid/api/messages/reconciliation")
  );
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("cache-control"), "private, no-store");
  const body = await response.json();
  assert.deepEqual(body, {
    messages: [{
      message_id: messageId,
      sending_started_at: "2026-10-15T09:00:00.000Z",
      gmail_search_query: `in:sent header:X-LeadFlow-Message-ID:${messageId}`,
    }],
    has_more: false,
  });
  assert.ok(state.operations.some(([op, key, value]) => op === "eq" && key === "company_id" && value === "company-a"));
  assert.ok(state.operations.some(([op, key, value]) => op === "eq" && key === "status" && value === "sending"));
  assert.ok(state.operations.some(([op, key, value]) => op === "is" && key === "provider_message_id" && value === null));
  assert.doesNotMatch(JSON.stringify(body), /recipient|content|email|company/i);
});

test("reconciliation queue rejects the shared operator credential", async () => {
  const response = await setup({ companyId: null }).load("app/api/messages/reconciliation/route.ts").GET(
    new Request("https://example.invalid/api/messages/reconciliation")
  );
  assert.equal(response.status, 403);
});

test("reconciliation queue fails closed on authentication or database errors", async () => {
  const denied = await setup({ companyId: "denied" }).load("app/api/messages/reconciliation/route.ts").GET(
    new Request("https://example.invalid/api/messages/reconciliation")
  );
  assert.equal(denied.status, 401);

  const unavailable = await setup({ dbError: true }).load("app/api/messages/reconciliation/route.ts").GET(
    new Request("https://example.invalid/api/messages/reconciliation")
  );
  assert.equal(unavailable.status, 503);
});
