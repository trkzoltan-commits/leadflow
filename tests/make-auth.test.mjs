import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import * as crypto from "node:crypto";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";

const tokenA = `lfmk_${"a".repeat(64)}`;
const tokenB = `lfmk_${"b".repeat(64)}`;
const hash = (token) => crypto.createHash("sha256").update(token).digest("hex");
const compiled = new Map();
function setup({ revoked = false, dbError = false, legacy = "operator-test-only", messageStatus = "draft" } = {}) {
  const writes = [];
  let aiCalls = 0;
  const records = {
    make_credentials: revoked ? [] : [
      { token_hash: hash(tokenA), company_id: "a", revoked_at: null },
      { token_hash: hash(tokenB), company_id: "b", revoked_at: null },
    ],
    leads: [{ id: "lead-a", company_id: "a" }, { id: "lead-b", company_id: "b" }],
    messages: [{ id: "message-a", company_id: "a", status: messageStatus, direction: "outgoing" }, { id: "message-b", company_id: "b" }],
    company_settings: [{ company_id: "a", auto_reply_mode: "manual" }],
  };
  const client = {
    from(table) {
      const filters = [];
      let mutation;
      return {
        select() { return this; },
        eq(key, value) { filters.push([key, value]); return this; },
        is(key, value) { filters.push([key, value]); return this; },
        update(value) { mutation = value; return this; },
        insert(value) { mutation = value; return this; },
        async single() {
          if (dbError && table === "make_credentials") throw new Error("Database unavailable");
          const row = records[table]?.find((item) => filters.every(([key, value]) => item[key] === value));
          if (mutation) writes.push({ table, filters, mutation });
          return { data: row ?? null, error: null };
        },
        async maybeSingle() { return this.single(); },
      };
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
      exports: {}, Buffer,
      process: { env: { MAKE_API_SECRET: legacy } },
      console: { error() {} },
      require(name) {
        if (name === "node:crypto") return crypto;
        if (name === "next/server") return { NextResponse: Response };
        if (name === "@supabase/supabase-js") return { createClient: () => client };
        if (name === "@/lib/make-auth") return load("lib/make-auth.ts");
        if (name === "openai") return class {
          responses = { create: async () => {
            aiCalls++;
            return { output_text: JSON.stringify({ safe_to_send: true }) };
          } };
        };
        throw new Error(`Unexpected module ${name}`);
      },
    };
    vm.runInNewContext(compiled.get(path), context);
    cache.set(path, context.exports);
    return context.exports;
  }
  return { load, writes, aiCalls: () => aiCalls };
}
function request(token, method = "GET", body) {
  return new Request("https://example.invalid/api", {
    method, headers: token ? { "x-leadflow-secret": token } : {},
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
}

for (const [label, token, options] of [
  ["missing", null, {}], ["malformed", "wrong", {}],
  ["unknown", `lfmk_${"c".repeat(64)}`, {}],
  ["revoked", tokenA, { revoked: true }],
  ["database unavailable", tokenA, { dbError: true }],
]) {
  test(`Make auth fails closed: ${label}`, async () => {
    const { load } = setup(options);
    const auth = await load("lib/make-auth.ts").authenticateMake(request(token));
    assert.equal(auth.ok, false);
    assert.equal(auth.response.status, 401);
  });
}
test("tenant credential works without the legacy shared secret", async () => {
  const { load } = setup({ legacy: null });
  const auth = await load("lib/make-auth.ts").authenticateMake(request(tokenA));
  assert.equal(auth.ok, true);
  assert.equal(auth.companyId, "a");
});
test("legacy operator secret remains usable during migration", async () => {
  const { load } = setup({ dbError: true });
  const auth = await load("lib/make-auth.ts").authenticateMake(request("operator-test-only"));
  assert.equal(auth.ok, true);
  assert.equal(auth.companyId, null);
});

for (const [path, method, id, body] of [
  ["app/api/leads/[id]/route.ts", "GET", "lead-a", undefined],
  ["app/api/leads/[id]/route.ts", "PATCH", "lead-a", { status: "contacted", company_id: "a" }],
  ["app/api/messages/[id]/route.ts", "PATCH", "message-a", { status: "sent", company_id: "a" }],
  ["app/api/messages/route.ts", "POST", null, { lead_id: "lead-a", content: "Test", company_id: "a" }],
]) {
  test(`${method} ${path}: own company allowed, other company denied even with forged body`, async () => {
    for (const [token, expected] of [[tokenA, 200], [tokenB, 404], [null, 401]]) {
      const { load, writes } = setup();
      const response = await load(path)[method](request(token, method, body), { params: Promise.resolve({ id }) });
      assert.equal(response.status, expected);
      if (expected !== 200) assert.equal(writes.length, 0);
      if (method !== "GET" && expected === 200) {
        assert.equal(writes.length, 1);
        const write = writes[0];
        if (method === "POST") assert.equal(write.mutation.company_id, "a");
        else assert.ok(write.filters.some(([key, value]) => key === "company_id" && value === "a"));
      }
    }
  });
}
for (const path of ["app/api/generate-reply/route.ts", "app/api/evaluate-reply/route.ts"]) {
  test(`${path}: AI calls require a valid credential`, async () => {
    for (const [token, expected] of [[tokenA, 200], ["wrong", 401]]) {
      const context = setup();
      const response = await context.load(path).POST(request(token, "POST", { reply: "Test" }));
      assert.equal(response.status, expected);
      assert.equal(context.aiCalls(), expected === 200 ? 1 : 0);
    }
  });
}

for (const [before, after, expected] of [["sending","sent",200],["sending","failed",200],["failed","failed",200],["failed","sent",200],["sent","sent",200],["sent","failed",409],["sent","draft",409],["sending","draft",409],["sent","sending",409],["draft","failed",409]]) {
 test(`callback ${before} -> ${after}: ${expected}`, async () => {
   const {load,writes}=setup({messageStatus:before});
   const response=await load("app/api/messages/[id]/route.ts").PATCH(request(tokenA,"PATCH",{status:after}),{params:Promise.resolve({id:"message-a"})});
   assert.equal(response.status,expected);
   assert.equal(writes.length,expected===200?1:0);
   if(expected===200) assert.ok(writes[0].filters.some(([k,v])=>k==="status"&&v===before));
 });
}
