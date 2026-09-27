import assert from "node:assert/strict";
import { unlink } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import test from "node:test";
import { prepareCompanyOnboarding } from "../scripts/prepare-company-onboarding.mjs";

function fakeClient({ keyInsertFails = false } = {}) {
  const calls = [];
  let companyCreated = false;
  return {
    calls,
    from(table) {
      const filters = {};
      return {
        select() { return this; },
        eq(key, value) { filters[key] = value; return this; },
        is(key, value) { filters[key] = value; return this; },
        limit() { return this; },
        async maybeSingle() {
          calls.push({ action: "lookup", table, filters: { ...filters } });
          if (table === "companies") return { data: companyCreated ? { id: "company-a" } : null, error: null };
          if (table === "company_make_connections") return { data: { mode: "company", enabled: false }, error: null };
          return { data: null, error: null };
        },
        async insert() {
          calls.push({ action: "insert", table });
          return { error: keyInsertFails ? new Error("failed") : null };
        },
      };
    },
    async rpc(name, args) {
      calls.push({ action: "rpc", name, args });
      companyCreated = true;
      return { data: [{ id: "company-a", name: args.company_name, public_slug: args.company_slug }], error: null };
    },
  };
}

test("preflight validates the new company without writing or issuing a key", async () => {
  const client = fakeClient();
  assert.deepEqual(await prepareCompanyOnboarding(client, " Példa Kft. ", "pelda-kft"), {
    created: false, companyName: "Példa Kft.", companySlug: "pelda-kft",
  });
  assert.deepEqual(client.calls.map(call => call.action), ["lookup"]);
});

test("create provisions the tenant and issues its first Make key in one operation", async () => {
  const client = fakeClient();
  const keyPath = join(tmpdir(), `leadflow-onboarding-${process.pid}-${Date.now()}.txt`);
  try {
    const result = await prepareCompanyOnboarding(client, "Példa Kft.", "pelda-kft", {
      create: true, keyPath, projectRoot: process.cwd(),
    });
    assert.equal(result.created, true);
    assert.equal(result.company.public_slug, "pelda-kft");
    assert.equal(result.keyPath, keyPath);
    assert.deepEqual(client.calls.map(call => `${call.action}:${call.table ?? call.name}`), [
      "lookup:companies", "rpc:provision_company", "lookup:companies",
      "lookup:company_make_connections", "lookup:make_credentials", "insert:make_credentials",
    ]);
  } finally {
    await unlink(keyPath).catch(() => {});
  }
});

test("a key failure reports that the already-created company must be resumed", async () => {
  const client = fakeClient({ keyInsertFails: true });
  const keyPath = join(tmpdir(), `leadflow-onboarding-fail-${process.pid}-${Date.now()}.txt`);
  await assert.rejects(
    prepareCompanyOnboarding(client, "Példa Kft.", "pelda-kft", {
      create: true, keyPath, projectRoot: process.cwd(),
    }),
    /A cég elkészült.*Ne hozd létre újra/,
  );
  assert.equal(client.calls.some(call => call.action === "rpc"), true);
});
