import assert from "node:assert/strict";
import test from "node:test";
import { provisionCompany, validateCompanyInput } from "../scripts/provision-company.mjs";

function fakeClient({ existing = false, lookupError = false, rpcError = false } = {}) {
  const calls = [];
  return {
    calls,
    from(table) {
      const filters = {};
      return {
        select() { return this; },
        eq(key, value) { filters[key] = value; return this; },
        async maybeSingle() {
          calls.push({ action: "lookup", table, filters: { ...filters } });
          return { data: existing ? { id: "existing" } : null, error: lookupError ? new Error("failed") : null };
        },
      };
    },
    async rpc(name, args) {
      calls.push({ action: "rpc", name, args });
      return rpcError
        ? { data: null, error: new Error("failed") }
        : { data: [{ id: "company-a", name: args.company_name, public_slug: args.company_slug }], error: null };
    },
  };
}

test("preflight validates availability without creating records", async () => {
  const client = fakeClient();
  assert.deepEqual(await provisionCompany(client, " Példa Kft. ", "pelda-kft"), {
    created: false, companyName: "Példa Kft.", companySlug: "pelda-kft",
  });
  assert.deepEqual(client.calls.map(call => call.action), ["lookup"]);
});

test("create uses the atomic service-role RPC and returns no secret", async () => {
  const client = fakeClient();
  const result = await provisionCompany(client, "Példa Kft.", "pelda-kft", true);
  assert.deepEqual(client.calls.map(call => call.action), ["lookup", "rpc"]);
  assert.deepEqual(client.calls[1], {
    action: "rpc", name: "provision_company",
    args: { company_name: "Példa Kft.", company_slug: "pelda-kft" },
  });
  assert.deepEqual(result, {
    created: true,
    company: { id: "company-a", name: "Példa Kft.", public_slug: "pelda-kft" },
  });
});

test("invalid input, occupied slug and database errors stop provisioning", async () => {
  for (const [name, slug] of [["", "valid-slug"], ["Cég", "Bad-Slug"], ["Cég", "a;drop"]]) {
    assert.throws(() => validateCompanyInput(name, slug));
  }
  for (const options of [{ existing: true }, { lookupError: true }, { rpcError: true }]) {
    const client = fakeClient(options);
    await assert.rejects(provisionCompany(client, "Példa Kft.", "pelda-kft", true));
  }
});
