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
    exports: {}, URL, Request, Response,
    process: { env: {
      NEXT_PUBLIC_SUPABASE_URL: "https://example.invalid",
      NEXT_PUBLIC_SUPABASE_ANON_KEY: "anon",
      SUPABASE_SECRET_KEY: "secret",
      MAKE_NEW_LEAD_WEBHOOK_URL: "https://hook.eu1.make.com/legacy-new",
      MAKE_SEND_APPROVED_REPLY_WEBHOOK_URL: "https://hook.eu1.make.com/legacy-reply",
    } },
    require(name) {
      if (name === "@/lib/automation-health" || name === "./automation-health") {
        return load("lib/automation-health.ts", overrides);
      }
      if (name === "@/lib/lead-overview" || name === "./lead-overview") {
        return load("lib/lead-overview.ts", overrides);
      }
      if (name === "@/lib/make-connection-status") return load("lib/make-connection-status.ts", overrides);
      if (name === "./make-webhook") return load("lib/make-webhook.ts", overrides);
      if (name === "react") return {
        useEffect() {},
        useState(initial) { return [initial, () => {}]; },
      };
      if (name === "./supabase" || name === "@/lib/supabase") return { supabase: {} };
      if (name === "@supabase/supabase-js") return { createClient: overrides.createClient || (() => ({})) };
      if (name === "next/server") return { NextResponse: Response };
      throw new Error(name);
    },
  };
  vm.runInNewContext(js, context);
  return context.exports;
}

const now = new Date("2026-10-13T12:00:00.000Z");
const minutesAgo = value => new Date(now.getTime() - value * 60_000).toISOString();

test("automation health uses the exact 1, 15 and 60 minute boundaries", () => {
  const { deriveAutomationHealth } = load("lib/automation-health.ts");
  const before = deriveAutomationHealth({
    connectionStatus: "company_active",
    now,
    signals: [
      { eventType: "new_lead", status: "pending", occurredAt: minutesAgo(0.99) },
      { eventType: "new_lead", status: "accepted", occurredAt: minutesAgo(14.99) },
      { eventType: "approved_reply", status: "accepted", occurredAt: minutesAgo(59.99) },
    ],
  });
  assert.equal(before.status, "processing");
  assert.equal(before.totals.processing, 3);
  assert.equal(before.totals.attentionRequired, 0);

  const atBoundary = deriveAutomationHealth({
    connectionStatus: "company_active",
    now,
    signals: [
      { eventType: "new_lead", status: "pending", occurredAt: minutesAgo(1) },
      { eventType: "new_lead", status: "accepted", occurredAt: minutesAgo(15) },
      { eventType: "approved_reply", status: "accepted", occurredAt: minutesAgo(60) },
    ],
  });
  assert.equal(atBoundary.status, "attention_required");
  assert.equal(atBoundary.totals.attentionRequired, 3);
  assert.equal(atBoundary.flows.newLead.reasons.stalled, 2);
  assert.equal(atBoundary.flows.approvedReply.reasons.stalled, 1);
});

test("definitive, uncertain, unconfigured and malformed signals fail safely", () => {
  const { deriveAutomationHealth } = load("lib/automation-health.ts");
  const health = deriveAutomationHealth({
    connectionStatus: "company_active",
    now,
    signals: [
      { eventType: "new_lead", status: "uncertain", occurredAt: minutesAgo(0.1) },
      { eventType: "new_lead", status: "unconfigured", occurredAt: minutesAgo(0.1) },
      { eventType: "approved_reply", status: "failed", occurredAt: minutesAgo(0.1) },
      { eventType: "approved_reply", status: "accepted", occurredAt: "invalid" },
    ],
  });
  assert.equal(health.status, "attention_required");
  assert.equal(health.totals.attentionRequired, 4);
  assert.equal(health.flows.newLead.reasons.uncertain, 1);
  assert.equal(health.flows.newLead.reasons.setupRequired, 1);
  assert.equal(health.flows.approvedReply.reasons.failed, 1);
  assert.equal(health.flows.approvedReply.reasons.stalled, 1);
});

test("connection setup is visible without dispatches and completed history distinguishes healthy from idle", () => {
  const { deriveAutomationHealth } = load("lib/automation-health.ts");
  const setup = deriveAutomationHealth({ connectionStatus: "setup_required", signals: [], now });
  assert.equal(setup.status, "attention_required");
  assert.equal(setup.totals.attentionRequired, 2);

  const idle = deriveAutomationHealth({ connectionStatus: "company_active", signals: [], now });
  assert.equal(idle.status, "idle");
  const healthy = deriveAutomationHealth({
    connectionStatus: "company_active", signals: [], now,
    completed24h: { new_lead: 2, approved_reply: 3 },
    lastCompletedAt: { approved_reply: minutesAgo(2) },
  });
  assert.equal(healthy.status, "healthy");
  assert.equal(healthy.totals.completed24h, 5);
  assert.equal(healthy.flows.approvedReply.lastCompletedAt, minutesAgo(2));
});

test("runtime signals follow the current meaningful reply and preserve uncertain delivery", () => {
  const { buildAutomationHealthSignals } = load("lib/automation-health.ts");
  const baseLead = {
    id: "lead-a",
    new_lead_dispatch_status: "accepted",
    created_at: minutesAgo(16),
  };
  const baseMessage = {
    lead_id: "lead-a", sender: "LeadFlow AI", created_at: minutesAgo(5),
    sending_started_at: null, delivery_confirmed_at: null, delivery_failed_at: null,
  };

  const plain = value => JSON.parse(JSON.stringify(value));
  assert.deepEqual(plain(buildAutomationHealthSignals({ leads: [baseLead], messages: [] })), [{
    eventType: "new_lead", status: "accepted", occurredAt: baseLead.created_at,
  }]);
  assert.deepEqual(plain(buildAutomationHealthSignals({
    leads: [baseLead],
    messages: [{ ...baseMessage, id: "draft-a", status: "draft" }],
  })), []);

  const severeLeadState = buildAutomationHealthSignals({
    leads: [{ ...baseLead, new_lead_dispatch_status: "uncertain" }],
    messages: [],
    audits: [{
      event_type: "new_lead", entity_id: "lead-a", status: "accepted",
      last_attempt_at: minutesAgo(1), updated_at: minutesAgo(1),
    }],
  });
  assert.equal(severeLeadState[0].status, "uncertain");

  const supersededFailure = buildAutomationHealthSignals({
    leads: [baseLead],
    messages: [
      { ...baseMessage, id: "failed-old", status: "failed", created_at: minutesAgo(10), delivery_failed_at: minutesAgo(9) },
      { ...baseMessage, id: "sent-new", status: "sent", created_at: minutesAgo(2), delivery_confirmed_at: minutesAgo(1) },
    ],
    audits: [{
      event_type: "approved_reply", entity_id: "failed-old", status: "failed",
      last_attempt_at: minutesAgo(10), updated_at: minutesAgo(9),
    }],
  });
  assert.deepEqual(plain(supersededFailure), []);

  const uncertainAt = minutesAgo(0.5);
  const uncertain = buildAutomationHealthSignals({
    leads: [baseLead],
    messages: [{
      ...baseMessage, id: "sending-new", status: "sending",
      created_at: minutesAgo(1), sending_started_at: minutesAgo(1),
    }],
    audits: [{
      event_type: "approved_reply", entity_id: "sending-new", status: "uncertain",
      last_attempt_at: uncertainAt, updated_at: uncertainAt,
    }],
  });
  assert.deepEqual(plain(uncertain), [{
    eventType: "approved_reply", status: "uncertain", occurredAt: uncertainAt,
  }]);

  const failedDespiteStaleAudit = buildAutomationHealthSignals({
    leads: [baseLead],
    messages: [{
      ...baseMessage, id: "failed-new", status: "failed",
      delivery_failed_at: minutesAgo(1),
    }],
    audits: [{
      event_type: "approved_reply", entity_id: "failed-new", status: "completed",
      last_attempt_at: minutesAgo(5), updated_at: minutesAgo(1),
    }],
  });
  assert.equal(failedDespiteStaleAudit.at(-1).status, "failed");
});

test("automation health response parser rejects malformed nested values", () => {
  const { deriveAutomationHealth } = load("lib/automation-health.ts");
  const { parseAutomationHealth } = load("lib/use-automation-health.ts");
  const valid = deriveAutomationHealth({
    connectionStatus: "company_active", signals: [], now,
    completed24h: { new_lead: 1 }, lastCompletedAt: { new_lead: minutesAgo(2) },
  });
  assert.deepEqual(parseAutomationHealth(valid), valid);

  const mutations = [
    value => { value.totals.processing = -1; },
    value => { value.totals.completed24h = 1.5; },
    value => { value.flows.newLead.reasons.failed = -1; },
    value => { delete value.flows.newLead.reasons.stalled; },
    value => { value.flows.newLead.lastCompletedAt = "not-a-date"; },
    value => { value.flows.approvedReply.oldestAttentionAt = "not-a-date"; },
    value => { value.checkedAt = "not-a-date"; },
    value => { value.connectionStatus = "unknown"; },
  ];
  for (const mutate of mutations) {
    const candidate = structuredClone(valid);
    mutate(candidate);
    assert.equal(parseAutomationHealth(candidate), null);
  }
});

function routeSetup({
  active = true, invalidUser = false, profileError = false,
  leadRows = [], messageRows = [], auditRows = [],
} = {}) {
  const calls = [];
  let clientIndex = 0;

  function builder(table) {
    const call = { table, filters: {}, select: "", options: {} };
    calls.push(call);
    const chain = {
      select(columns, options = {}) { call.select = columns; call.options = options; return this; },
      eq(key, value) { call.filters[key] = value; return this; },
      neq(key, value) { call.filters[`neq:${key}`] = value; return this; },
      in(key, value) { call.filters[`in:${key}`] = value; return this; },
      is(key, value) { call.filters[`is:${key}`] = value; return this; },
      gte(key, value) { call.filters[`gte:${key}`] = value; return this; },
      order() { return this; }, limit() { return this; }, range() { return this; },
      async maybeSingle() {
        if (table === "users") {
          if (profileError) return { data: null, error: { message: "db unavailable" } };
          return { data: active ? { company_id: "company-a", is_active: true } : { company_id: "company-a", is_active: false }, error: null };
        }
        if (table === "company_make_connections") return { data: {
          mode: "company", enabled: true,
          new_lead_webhook_url: "https://hook.eu1.make.com/company-new",
          approved_reply_webhook_url: "https://hook.eu1.make.com/company-reply",
        }, error: null };
        if (table === "make_credentials") return { data: { id: "credential-a" }, error: null };
        if (table === "automation_dispatches") return { data: null, error: null };
        return { data: null, error: null };
      },
      then(resolve) {
        if (table === "automation_dispatches" && call.options.head) {
          return Promise.resolve({ data: null, error: null, count: 0 }).then(resolve);
        }
        if (table === "leads") return Promise.resolve({ data: leadRows, error: null }).then(resolve);
        if (table === "messages") return Promise.resolve({ data: messageRows, error: null }).then(resolve);
        if (table === "automation_dispatches" && call.select.includes("event_type")) {
          return Promise.resolve({ data: auditRows, error: null }).then(resolve);
        }
        return Promise.resolve({ data: [], error: null, count: null }).then(resolve);
      },
    };
    return chain;
  }

  const createClient = () => {
    const isUserClient = clientIndex++ === 0;
    return {
      auth: { getUser: async () => invalidUser
        ? ({ data: { user: null }, error: { message: "invalid" } })
        : ({ data: { user: { id: "user-a" } }, error: null }) },
      from: table => builder(table, isUserClient),
    };
  };
  const { GET } = load("app/api/automation-health/route.ts", { createClient });
  return { GET, calls };
}

test("health API derives the tenant from the active user and returns only aggregates", async () => {
  const { GET, calls } = routeSetup({
    leadRows: [{
      id: "lead-a", new_lead_dispatch_status: "accepted", created_at: minutesAgo(20),
    }],
    messageRows: [
      {
        id: "failed-old", lead_id: "lead-a", status: "failed", sender: "LeadFlow AI",
        created_at: minutesAgo(10), sending_started_at: minutesAgo(11),
        delivery_confirmed_at: null, delivery_failed_at: minutesAgo(9),
      },
      {
        id: "sent-new", lead_id: "lead-a", status: "sent", sender: "company",
        created_at: minutesAgo(2), sending_started_at: minutesAgo(3),
        delivery_confirmed_at: minutesAgo(1), delivery_failed_at: null,
      },
    ],
    auditRows: [{
      event_type: "approved_reply", entity_id: "failed-old", status: "failed",
      last_attempt_at: minutesAgo(11), updated_at: minutesAgo(9),
    }],
  });
  const response = await GET(new Request("https://example.invalid/api/automation-health?company_id=company-b", {
    headers: { Authorization: "Bearer user-token" },
  }));
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("Cache-Control"), "private, no-store");
  assert.equal(response.headers.get("Vary"), "Authorization");
  const body = await response.json();
  assert.equal(body.connectionStatus, "company_active");
  assert.equal(body.status, "idle");
  assert.equal(body.totals.attentionRequired, 0);
  for (const call of calls.filter(call => call.table !== "users")) {
    assert.equal(call.filters.company_id, "company-a", `${call.table} must be tenant scoped`);
  }
  const serialized = JSON.stringify(body).toLowerCase();
  for (const forbidden of ["entity_id", "webhook_url", "recipient", "content", "secret", "token", "credential-a"]) {
    assert.equal(serialized.includes(forbidden), false, forbidden);
  }
  const source = readFileSync(new URL("../app/api/automation-health/route.ts", import.meta.url), "utf8");
  assert.doesNotMatch(source, /leads!inner/);
  assert.ok(calls.some(call => call.table === "messages" && call.filters.direction === "outgoing"));
});

test("health API rejects unauthenticated and inactive users and hides backend failures", async () => {
  const missing = routeSetup();
  assert.equal((await missing.GET(new Request("https://example.invalid/api/automation-health"))).status, 401);
  const invalid = routeSetup({ invalidUser: true });
  assert.equal((await invalid.GET(new Request("https://example.invalid/api/automation-health", {
    headers: { Authorization: "Bearer invalid" },
  }))).status, 401);
  const inactive = routeSetup({ active: false });
  assert.equal((await inactive.GET(new Request("https://example.invalid/api/automation-health", {
    headers: { Authorization: "Bearer user-token" },
  }))).status, 403);
  const backendFailure = routeSetup({ profileError: true });
  const response = await backendFailure.GET(new Request("https://example.invalid/api/automation-health", {
    headers: { Authorization: "Bearer user-token" },
  }));
  assert.equal(response.status, 503);
  assert.deepEqual(await response.json(), { error: "Az automatizálás állapota nem érhető el." });
});

test("partner UI uses the aggregate endpoint without adding an automatic retry action", () => {
  const hook = readFileSync(new URL("../lib/use-automation-health.ts", import.meta.url), "utf8");
  const dashboard = readFileSync(new URL("../app/page.tsx", import.meta.url), "utf8");
  const settings = readFileSync(new URL("../app/settings/page.tsx", import.meta.url), "utf8");
  assert.match(hook, /fetch\("\/api\/automation-health"/);
  assert.match(dashboard, /Figyelmet igényel/);
  assert.match(dashboard, /Nem ellenőrizhető/);
  assert.match(dashboard, /\/settings#automation/);
  assert.match(dashboard, /Nincs ismert hiba/);
  assert.match(dashboard, /A Make-fiók elérhetősége és kreditje innen nem ellenőrizhető/);
  assert.match(settings, /A Make-fiók elérhetősége és kreditje innen nem ellenőrizhető/);
  assert.match(settings, /id="automation"/);
  assert.match(settings, /Legutóbbi működés/);
  assert.match(hook, /runningPromise/);
  assert.match(hook, /document\.hidden/);
  assert.match(hook, /visibilitychange/);
  assert.match(hook, /setHealth\(null\)/);
  assert.doesNotMatch(`${dashboard}\n${settings}`, /Automatikus újraküldés|Újrapróbálás indítása/);
});
