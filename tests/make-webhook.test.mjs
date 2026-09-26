import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";

const compiled = new Map();
const urlA = "https://hook.eu1.make.com/test-company-a";
const urlB = "https://hook.eu2.make.com/test-company-b";
function setup({ mode = "company", enabled = true, missing = false, broken = false, urls = true, sendFailure = null, initialMessageStatus = "draft" } = {}) {
  const calls = [];
  const claims = [];
  let messageStatus = initialMessageStatus;
  const client = {
    auth: { getUser: async () => ({ data: { user: { id: "user-a" } }, error: null }) },
    from(table) {
      const filters = {};
      let mutation;
      return {
        select() { return this; },
        eq(key, value) { filters[key] = value; return this; },
        insert(value) { mutation = value; return this; },
        update(value) { mutation = value; return this; },
        async single() {
          if (table === "company_make_connections") {
            if (broken) return { data: null, error: { message: "unavailable" } };
            assert.ok(filters.company_id);
            const url = filters.company_id === "a" ? urlA : urlB;
            return { data: missing ? null : { mode, enabled, new_lead_webhook_url: urls ? url : null, approved_reply_webhook_url: urls ? url : null }, error: null };
          }
          if (table === "companies") return { data: { id: "a", public_slug: "company-a" }, error: null };
          if (table === "users") return { data: { company_id: "a" }, error: null };
          if (table === "leads") return { data: { id: "lead-a", company_id: "a", email: "test@example.invalid", ...mutation }, error: null };
          if (mutation) { claims.push(mutation); messageStatus = mutation.status; }
          return { data: { id: "message-a", company_id: "a", lead_id: "lead-a", status: messageStatus, direction: "outgoing", content: "Test" }, error: null };
        },
        async maybeSingle() { return this.single(); },
      };
    },
  };
  const cache = new Map();
  function load(path) {
    if (cache.has(path)) return cache.get(path);
    if (!compiled.has(path)) compiled.set(path, ts.transpileModule(readFileSync(new URL(`../${path}`, import.meta.url), "utf8"), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, esModuleInterop: true },
    }).outputText);
    const context = {
      exports: {}, URL, console: { error() {}, warn() {} },
      process: { env: { MAKE_NEW_LEAD_WEBHOOK_URL: "https://hook.us1.make.com/legacy-new", MAKE_SEND_APPROVED_REPLY_WEBHOOK_URL: "https://hook.us1.make.com/legacy-reply" } },
      fetch: async (url, options) => { calls.push({ url, options }); if (sendFailure === "network") throw new Error("timeout"); return { ok: sendFailure !== "http" }; },
      require(name) {
        if (name === "@/lib/make-webhook") return load("lib/make-webhook.ts");
        if (name === "@supabase/supabase-js") return { createClient: () => client };
        if (name === "next/server") return { NextResponse: Response };
        throw new Error(name);
      },
    };
    vm.runInNewContext(compiled.get(path), context);
    cache.set(path, context.exports);
    return context.exports;
  }
  return { load, calls, claims };
}

test("company A and B resolve to separate webhook destinations", async () => {
  const { getMakeWebhook } = setup().load("lib/make-webhook.ts");
  for (const event of ["new_lead", "approved_reply"]) {
    assert.equal(await getMakeWebhook("a", event), urlA);
    assert.equal(await getMakeWebhook("b", event), urlB);
  }
});
for (const options of [{ missing: true }, { enabled: false }, { broken: true }, { urls: false }, { mode: "unknown" }]) {
  test(`no fallback or send for invalid routing: ${JSON.stringify(options)}`, async () => {
    const state = setup(options);
    assert.equal(await state.load("lib/make-webhook.ts").getMakeWebhook("a", "approved_reply"), null);
    const reply = await state.load("app/api/send-approved-reply/route.ts").POST(new Request("https://example.invalid", {
      method: "POST", headers: { Authorization: "Bearer test" }, body: JSON.stringify({ message_id: "message-a" }),
    }));
    assert.equal(reply.status, 503);
    assert.equal(state.calls.length, 0);
    assert.equal(state.claims.length, 0);
    const lead = await state.load("app/api/public-lead/route.ts").POST(new Request("https://example.invalid", {
      method: "POST", body: JSON.stringify({ company_slug: "company-a", name: "Test", email: "test@example.invalid" }),
    }));
    assert.equal(lead.status, 200); // Already saved: do not encourage duplicate submission.
    assert.equal(state.calls.length, 0);
  });
}
test("explicit legacy pilot routing retains both configured event URLs", async () => {
  const { getMakeWebhook } = setup({ mode: "legacy" }).load("lib/make-webhook.ts");
  assert.equal(await getMakeWebhook("a", "new_lead"), "https://hook.us1.make.com/legacy-new");
  assert.equal(await getMakeWebhook("a", "approved_reply"), "https://hook.us1.make.com/legacy-reply");
});
test("both routes use the server-resolved company, ignoring a forged company_id", async () => {
  for (const [path, body] of [
    ["app/api/public-lead/route.ts", { company_slug: "company-a", name: "Test", email: "test@example.invalid", company_id: "b" }],
    ["app/api/send-approved-reply/route.ts", { message_id: "message-a", company_id: "b" }],
  ]) {
    const state = setup();
    const response = await state.load(path).POST(new Request("https://example.invalid", {
      method: "POST", headers: { Authorization: "Bearer test" }, body: JSON.stringify(body),
    }));
    assert.equal(response.status, 200);
    assert.equal(state.calls.length, 1);
    assert.equal(state.calls[0].url, urlA);
    assert.equal(state.calls[0].options.redirect, "error");
    assert.equal(JSON.parse(state.calls[0].options.body).company_id, "a");
  }
});
test("URL validation rejects unexpected origins and credential-bearing URL components", () => {
  const { validMakeWebhook } = setup().load("lib/make-webhook.ts");
  for (const url of ["http://hook.eu1.make.com/test", "https://localhost/test", "https://hook.eu1.make.com.evil.test/test", "https://hook.eu1.make.com:8443/test", "https://user:pass@hook.eu1.make.com/test", `${urlA}?key=test`, `${urlA}#test`, "https://hook.eu1.make.com/"]) {
    assert.equal(validMakeWebhook(url), null);
  }
  assert.equal(validMakeWebhook(urlA), urlA);
});

for (const sendFailure of ["network", "http"]) {
  test(`uncertain ${sendFailure} outcome stays locked and rejects retry`, async () => {
    const state = setup({ sendFailure });
    const route = state.load("app/api/send-approved-reply/route.ts");
    const request = () => new Request("https://example.invalid", { method: "POST", headers: { Authorization: "Bearer test" }, body: JSON.stringify({message_id: "message-a"}) });
    const first = await route.POST(request());
    assert.equal(first.status, 502);
    assert.equal((await first.json()).status, "sending");
    assert.equal((await route.POST(request())).status, 409);
    assert.equal(state.calls.length, 1);
    assert.deepEqual(state.claims.map(x => x.status), ["sending"]);
  });
}

test("a definitively failed delivery can be claimed for one safe retry", async () => {
  const state = setup({ initialMessageStatus: "failed" });
  const route = state.load("app/api/send-approved-reply/route.ts");
  const request = () => new Request("https://example.invalid", { method: "POST", headers: { Authorization: "Bearer test" }, body: JSON.stringify({message_id: "message-a"}) });
  assert.equal((await route.POST(request())).status, 200);
  assert.equal((await route.POST(request())).status, 409);
  assert.equal(state.calls.length, 1);
  assert.deepEqual(state.claims.map(x => x.status), ["sending"]);
});
