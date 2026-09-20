import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";

function load(path, overrides = {}) {
  const source = readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
  const js = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, esModuleInterop: true },
  }).outputText;
  const context = {
    exports: {}, URL, Response, process: { env: {
      NEXT_PUBLIC_SUPABASE_URL: "https://example.invalid",
      NEXT_PUBLIC_SUPABASE_ANON_KEY: "anon",
      SUPABASE_SECRET_KEY: "secret",
      MAKE_NEW_LEAD_WEBHOOK_URL: "https://hook.eu1.make.com/legacy-new",
      MAKE_SEND_APPROVED_REPLY_WEBHOOK_URL: "https://hook.eu1.make.com/legacy-reply",
    } },
    require(name) {
      if (name === "./make-webhook") return load("lib/make-webhook.ts", overrides);
      if (name === "@/lib/make-connection-status") return load("lib/make-connection-status.ts", overrides);
      if (name === "@supabase/supabase-js") return { createClient: overrides.createClient || (() => ({})) };
      if (name === "next/server") return { NextResponse: Response };
      throw new Error(name);
    },
  };
  vm.runInNewContext(js, context);
  return context.exports;
}

test("connection status requires both valid company URLs or both legacy URLs", () => {
  const { makeConnectionStatus: status } = load("lib/make-connection-status.ts");
  const valid = "https://hook.eu1.make.com/company-secret";
  const company = { mode: "company", enabled: true, new_lead_webhook_url: valid, approved_reply_webhook_url: valid };
  assert.equal(status(company), "company_active");
  assert.equal(status({ ...company, approved_reply_webhook_url: null }), "setup_required");
  assert.equal(status({ ...company, enabled: false }), "setup_required");
  assert.equal(status(null), "setup_required");
  assert.equal(status({ ...company, mode: "legacy" }, valid, valid), "legacy");
  assert.equal(status({ ...company, mode: "legacy" }, valid), "setup_required");
});

test("status API derives tenant from authenticated user and returns no webhook secret", async () => {
  const filters = [];
  let clients = 0;
  const createClient = () => {
    clients++;
    return {
      auth: { getUser: async () => ({ data: { user: { id: "user-a" } }, error: null }) },
      from(table) {
        const filter = { table };
        filters.push(filter);
        return {
          select() { return this; },
          eq(key, value) { filter[key] = value; return this; },
          async single() { return { data: { company_id: "company-a" }, error: null }; },
          async maybeSingle() { return { data: {
            mode: "company", enabled: true,
            new_lead_webhook_url: "https://hook.eu1.make.com/company-secret",
            approved_reply_webhook_url: "https://hook.eu1.make.com/company-secret",
          }, error: null }; },
        };
      },
    };
  };
  const { GET } = load("app/api/make-connection-status/route.ts", { createClient });
  const response = await GET(new Request("https://example.invalid/api/make-connection-status?company_id=company-b", {
    headers: { Authorization: "Bearer user-token" },
  }));
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("Cache-Control"), "no-store");
  assert.deepEqual(await response.json(), { status: "company_active" });
  assert.equal(clients, 2);
  assert.equal(filters[0].id, "user-a");
  assert.equal(filters[1].company_id, "company-a");
  assert.equal((await GET(new Request("https://example.invalid/api/make-connection-status"))).status, 401);
});
