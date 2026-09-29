import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";

function loadRoute({ role = "owner" } = {}) {
  const updates = [];
  const client = {
    auth: { getUser: async () => ({ data: { user: { id: "user-a" } }, error: null }) },
    from(table) {
      let mutation = null;
      return {
        select() { return this; },
        update(value) { mutation = value; return this; },
        eq() { return this; },
        async single() {
          if (table === "users") return { data: { company_id: "company-a", role }, error: null };
          if (table === "companies" && mutation) {
            updates.push(mutation);
            return { data: { name: mutation.name }, error: null };
          }
          return { data: null, error: null };
        },
      };
    },
  };
  const source = ts.transpileModule(readFileSync(new URL("../app/api/account-profile/route.ts", import.meta.url), "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, esModuleInterop: true },
  }).outputText;
  const context = {
    exports: {}, Request, Response,
    process: { env: {} },
    require(name) {
      if (name === "@supabase/supabase-js") return { createClient: () => client };
      if (name === "next/server") return { NextResponse: Response };
      throw new Error(name);
    },
  };
  vm.runInNewContext(source, context);
  return { route: context.exports, updates };
}

function request(companyName = "Új Cégnév Kft.") {
  return new Request("https://example.invalid/api/account-profile", {
    method: "PATCH",
    headers: { Authorization: "Bearer token", "Content-Type": "application/json" },
    body: JSON.stringify({ companyName }),
  });
}

test("only an owner can change the tenant company name", async () => {
  const owner = loadRoute();
  const response = await owner.route.PATCH(request("  Új Cégnév Kft.  "));
  assert.equal(response.status, 200);
  assert.equal(owner.updates.length, 1);
  assert.equal(owner.updates[0].name, "Új Cégnév Kft.");

  const member = loadRoute({ role: "user" });
  assert.equal((await member.route.PATCH(request())).status, 403);
  assert.equal(member.updates.length, 0);
});

test("invalid company names are rejected before update", async () => {
  for (const name of ["   ", "x".repeat(201)]) {
    const state = loadRoute();
    assert.equal((await state.route.PATCH(request(name))).status, 400);
    assert.equal(state.updates.length, 0);
  }
});
