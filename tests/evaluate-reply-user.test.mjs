import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";

const leadId = "11111111-1111-4111-8111-111111111111";
const source = readFileSync(new URL("../app/api/evaluate-reply/route.ts", import.meta.url), "utf8");
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, esModuleInterop: true },
}).outputText;

function setup({ validToken = true, companyId = "company-a", leadCompany = "company-a", saveError = null } = {}) {
  const calls = { ai: [], tokens: [], writes: [] };
  const lead = {
    id: leadId,
    company_id: leadCompany,
    name: "Adatbázisból betöltött név",
    email: "lead@example.com",
    phone: null,
    service: "Teszt szolgáltatás",
    description: "Teszt érdeklődés",
    location: "Budapest",
    priority: "high",
    source: "web",
  };

  const client = {
    auth: {
      async getUser(token) {
        calls.tokens.push(token);
        return { data: { user: validToken ? { id: "user-a" } : null }, error: null };
      },
    },
    from(table) {
      const filters = {};
      let mutation = null;
      const query = {
        select() { return this; },
        update(value) { mutation = value; return this; },
        eq(key, value) { filters[key] = value; return this; },
        async single() {
          if (table === "users") {
            return { data: companyId ? { company_id: companyId, is_active: true } : null, error: null };
          }
          assert.equal(table, "leads");
          assert.equal(filters.id, leadId);
          assert.equal(filters.company_id, companyId);
          return { data: leadCompany === companyId ? lead : null, error: null };
        },
        then(resolve) {
          if (mutation) calls.writes.push({ table, filters, mutation });
          return Promise.resolve({ data: null, error: saveError }).then(resolve);
        },
      };
      return query;
    },
  };

  const modules = {
    openai: class {
      responses = { create: async (input) => {
        calls.ai.push(input);
        return { output_text: JSON.stringify({
          safe_to_send: true,
          requires_human_review: false,
          risk_reason: "Biztonságos tesztválasz.",
          risk_level: "low",
        }) };
      } };
    },
    "@supabase/supabase-js": { createClient: () => client },
    "@/lib/make-auth": { authenticateMake: async () => { throw new Error("Make auth should not run"); } },
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

function request(authorization = "Bearer test-token", body = { lead_id: leadId, reply: "Mentett választervezet" }) {
  return new Request("http://localhost/api/evaluate-reply", {
    method: "POST",
    headers: authorization ? { Authorization: authorization } : {},
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

for (const authorization of [null, "Basic test-token", "Bearer", "Bearer token extra"]) {
  test(`rejects missing or malformed user authorization: ${authorization}`, async () => {
    const { post, calls } = setup();
    assert.equal((await post(request(authorization))).status, 401);
    assert.equal(calls.ai.length, 0);
  });
}

for (const [label, options, status] of [
  ["invalid token", { validToken: false }, 401],
  ["user without company", { companyId: null }, 403],
  ["another company's lead", { leadCompany: "company-b" }, 404],
]) {
  test(`rejects ${label} before calling OpenAI`, async () => {
    const { post, calls } = setup(options);
    assert.equal((await post(request())).status, status);
    assert.equal(calls.ai.length, 0);
  });
}

for (const body of [{}, { lead_id: "invalid", reply: "Teszt" }, { lead_id: leadId }, "{"]) {
  test(`rejects invalid body: ${JSON.stringify(body)}`, async () => {
    const { post, calls } = setup();
    assert.equal((await post(request("Bearer test-token", body))).status, 400);
    assert.equal(calls.ai.length, 0);
  });
}

test("evaluates the saved reply for an accessible tenant lead and stores the result", async () => {
  const { post, calls } = setup();
  const response = await post(request("Bearer test-token", {
    lead_id: leadId,
    reply: "Mentett választervezet",
    name: "Hamisított név",
  }));
  assert.equal(response.status, 200);
  assert.equal(calls.ai.length, 1);
  assert.match(calls.ai[0].input, /Adatbázisból betöltött név/);
  assert.doesNotMatch(calls.ai[0].input, /Hamisított név/);
  assert.deepEqual(calls.tokens, ["test-token"]);
  assert.equal(calls.writes.length, 1);
  assert.equal(calls.writes[0].table, "leads");
  assert.equal(calls.writes[0].filters.id, leadId);
  assert.equal(calls.writes[0].filters.company_id, "company-a");
  assert.equal(calls.writes[0].mutation.ai_risk_level, "low");
});

test("reports a persistence failure after evaluation", async () => {
  const { post, calls } = setup({ saveError: { message: "write failed" } });
  const response = await post(request());
  assert.equal(response.status, 503);
  assert.equal(calls.ai.length, 1);
});

test("lead detail exposes a manual, saved-draft-only risk evaluation action", () => {
  const page = readFileSync(new URL("../app/leads/[id]/page.tsx", import.meta.url), "utf8");
  assert.match(page, /fetch\("\/api\/evaluate-reply"/);
  assert.match(page, /lead_id: lead\.id/);
  assert.match(page, /!draftMessageId \|\| replyDirty \|\| !replyDraft\.trim\(\)/);
  assert.match(page, /Kockázatértékelés indítása/);
  assert.match(page, /ai_safe_to_send: null/);
  assert.match(page, /\.eq\("company_id", lead\.company_id\)/);
});
