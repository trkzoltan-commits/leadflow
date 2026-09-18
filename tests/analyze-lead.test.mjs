import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";

const leadId = "11111111-1111-4111-8111-111111111111";
const source = readFileSync(new URL("../app/api/analyze-lead/route.ts", import.meta.url), "utf8");
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, esModuleInterop: true },
}).outputText;

function setup({ validToken = true, companyId = "company-a", leadCompany = "company-a" } = {}) {
  const calls = { ai: [], tokens: [], clients: [] };
  const client = {
    auth: {
      async getUser(token) {
        calls.tokens.push(token);
        return { data: { user: validToken ? { id: "user-a" } : null }, error: null };
      },
    },
    from(table) {
      const filters = {};
      return {
        select() { return this; },
        eq(key, value) { filters[key] = value; return this; },
        async single() {
          if (table === "users") {
            assert.equal(filters.id, "user-a");
            return { data: { company_id: companyId }, error: null };
          }
          assert.equal(table, "leads");
          // Require both ownership and record filters, independently of the mock RLS.
          assert.equal(filters.company_id, companyId);
          assert.equal(filters.id, leadId);
          return { data: leadCompany === companyId ? { id: leadId } : null, error: null };
        },
      };
    },
  };
  const modules = {
    openai: class {
      responses = { create: async (input) => {
        calls.ai.push(input);
        return { output_text: "Teszt elemzés" };
      } };
    },
    "@supabase/supabase-js": { createClient: (...args) => {
      calls.clients.push(args);
      return client;
    } },
    "next/server": { NextResponse: Response },
  };
  const context = {
    exports: {},
    require(name) {
      assert.ok(name in modules, `Unexpected dependency: ${name}`);
      return modules[name];
    },
    process: { env: {
      NEXT_PUBLIC_SUPABASE_URL: "https://example.invalid",
      NEXT_PUBLIC_SUPABASE_ANON_KEY: "test-anon-key",
      OPENAI_API_KEY: "test-only",
    } },
    console: { error() {} },
  };
  vm.runInNewContext(compiled, context);
  return { calls, post: context.exports.POST };
}

function request(authorization = "Bearer test-token", body = { lead_id: leadId, name: "Szerkesztett név" }) {
  return new Request("http://localhost/api/analyze-lead", {
    method: "POST",
    headers: authorization ? { Authorization: authorization } : {},
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

for (const authorization of [null, "Basic test-token", "Bearer", "Bearer token extra"]) {
  test(`rejects missing or malformed authorization: ${authorization}`, async () => {
    const { post, calls } = setup();
    assert.equal((await post(request(authorization))).status, 401);
    assert.equal(calls.clients.length, 0);
    assert.equal(calls.ai.length, 0);
  });
}

for (const [label, options, status] of [
  ["invalid or expired token", { validToken: false }, 401],
  ["user without company", { companyId: null }, 403],
  ["another company's lead", { leadCompany: "company-b" }, 404],
  ["missing lead", { leadCompany: null }, 404],
]) {
  test(`rejects ${label} before calling OpenAI`, async () => {
    const { post, calls } = setup(options);
    assert.equal((await post(request())).status, status);
    assert.equal(calls.ai.length, 0);
  });
}

for (const body of [{}, { lead_id: 123 }, { lead_id: "invalid" }, "{", "null"]) {
  test(`rejects invalid body: ${JSON.stringify(body)}`, async () => {
    const { post, calls } = setup();
    assert.equal((await post(request("Bearer test-token", body))).status, 400);
    assert.equal(calls.ai.length, 0);
  });
}

test("analyzes an accessible lead with the user token and preserves edited fields", async () => {
  const { post, calls } = setup();
  const response = await post(request());
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { result: "Teszt elemzés" });
  assert.deepEqual(calls.tokens, ["test-token"]);
  assert.equal(calls.clients[0][1], "test-anon-key");
  assert.equal(calls.clients[0][2].global.headers.Authorization, "Bearer test-token");
  assert.equal(calls.ai.length, 1);
  assert.match(calls.ai[0].input, /Szerkesztett név/);
});
