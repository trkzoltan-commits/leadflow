import assert from "node:assert/strict";
import test from "node:test";
import { inviteCompanyOwner, validateInviteInput } from "../scripts/invite-company-owner.mjs";

function fakeClient({ missing = false, existingOwner = false, inviteFails = false, linkFails = false } = {}) {
  const calls = [];
  return {
    calls,
    auth: { admin: { async inviteUserByEmail(email, options) {
      calls.push({ action: "invite", email, options });
      return inviteFails ? { data: null, error: new Error("failed") } :
        { data: { user: { id: "invited-user" } }, error: null };
    } } },
    from(table) {
      const filters = {};
      return {
        select() { return this; },
        eq(key, value) { filters[key] = value; return this; },
        limit() { return this; },
        async maybeSingle() {
          calls.push({ action: "lookup", table, filters: { ...filters } });
          if (table === "companies") return { data: missing ? null : { id: "company-a" }, error: null };
          return { data: existingOwner ? { id: "owner-a" } : null, error: null };
        },
        async insert(row) {
          calls.push({ action: "link", table, row });
          return { error: linkFails ? new Error("failed") : null };
        },
      };
    },
  };
}

test("preflight checks company and owner without sending an invitation", async () => {
  const client = fakeClient();
  assert.deepEqual(await inviteCompanyOwner(client, "pelda-kft", "owner@example.com"), { sent: false });
  assert.deepEqual(client.calls.map(call => call.action), ["lookup", "lookup"]);
  assert.equal(client.calls[0].filters.public_slug, "pelda-kft");
  assert.equal(client.calls[1].filters.company_id, "company-a");
});

test("send links only the invited Auth ID to the company resolved by slug", async () => {
  const client = fakeClient();
  assert.deepEqual(await inviteCompanyOwner(client, "pelda-kft", "owner@example.com", true), { sent: true });
  assert.deepEqual(client.calls.map(call => call.action), ["lookup", "lookup", "invite", "link"]);
  assert.equal(client.calls[2].options.redirectTo, "https://leadflow-three-psi.vercel.app/meghivas");
  assert.deepEqual(client.calls[3].row, { id: "invited-user", company_id: "company-a", role: "owner" });
});

test("unknown company, existing owner, and failed invitation never create a link", async () => {
  for (const option of [{ missing: true }, { existingOwner: true }, { inviteFails: true }]) {
    const client = fakeClient(option);
    await assert.rejects(inviteCompanyOwner(client, "pelda-kft", "owner@example.com", true));
    assert.equal(client.calls.some(call => call.action === "link"), false);
  }
});

test("failed linking is reported distinctly after an invitation was sent", async () => {
  const client = fakeClient({ linkFails: true });
  await assert.rejects(inviteCompanyOwner(client, "pelda-kft", "owner@example.com", true), /meghívó kiment/);
});

test("invalid input is rejected before accessing the database", async () => {
  assert.throws(() => validateInviteInput("Bad-Slug", "owner@example.com"));
  assert.throws(() => validateInviteInput("valid-slug", "no-email"));
  const client = fakeClient();
  await assert.rejects(inviteCompanyOwner(client, "bad;slug", "owner@example.com", true));
  assert.equal(client.calls.length, 0);
});
