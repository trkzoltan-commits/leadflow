import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import test from "node:test";
import {
  clearBlueprintProviderBindings,
  patchBlueprintSecrets,
  prepareCompanyMakeBlueprints,
  validateExternalPath,
  validatePreparedBlueprint,
} from "../scripts/prepare-company-make-blueprints.mjs";

const token = `lfmk_${"a".repeat(64)}`;
const oldToken = `lfmk_${"b".repeat(64)}`;
const header = () => ({ name: "x-leadflow-secret", value: oldToken });
const gmail = (id, mapper = {}) => ({
  id,
  module: "google-email:sendAnEmail",
  parameters: { __IMTCONN__: 12345 },
  mapper,
  metadata: { restore: { parameters: { __IMTCONN__: { data: { scoped: "true", connection: "old" }, label: "pilot@example.com" } } } },
});

function unifiedBlueprint() {
  return {
    name: "Pilot",
    flow: [
      { id: 1, module: "gateway:CustomWebHook", parameters: { hook: 987, maxResults: 1 }, metadata: { restore: { parameters: { hook: { data: {}, label: "Pilot hook" } } } } },
      { id: 2, module: "builtin:BasicRouter", routes: [
        { filter: { label: "lead.created" }, flow: [gmail(3, { to: ["pilot@example.com"] }), { id: 4, module: "http:MakeRequest", mapper: { headers: [header()] } }] },
        { filter: { label: "approved_reply.send" }, flow: [gmail(5, { to: ["{{1.email}}"] }), { id: 6, module: "http:MakeRequest", mapper: { headers: [header()] } }] },
      ] },
    ],
    metadata: { designer: { orphans: [[gmail(99)]] } },
  };
}

function reconciliationBlueprint() {
  return {
    name: "Reconciliation",
    flow: [
      { id: 1, module: "http:MakeRequest", mapper: { url: "https://leadflow.example/api/messages/reconciliation", headers: [header()] } },
      { id: 2, module: "google-email:executeEmailSearchQuery", parameters: { __IMTCONN__: 12345 }, mapper: { q: "{{1.gmail_search_query}}" }, metadata: { restore: { parameters: { __IMTCONN__: { data: { connection: "old" }, label: "pilot@example.com" } } } } },
      { id: 3, module: "http:MakeRequest", mapper: { headers: [header()] } },
    ],
    metadata: { designer: {} },
  };
}

test("patches every LeadFlow header without changing unrelated headers", () => {
  const source = { flow: [{ mapper: { headers: [{ name: "content-type", value: "application/json" }, header()] } }] };
  const result = patchBlueprintSecrets(source, token);
  assert.equal(result.replaced, 1);
  assert.equal(source.flow[0].mapper.headers[0].value, "application/json");
  assert.equal(source.flow[0].mapper.headers[1].value, token);
});

test("rejects invalid keys and blueprints without a LeadFlow header", () => {
  assert.throws(() => patchBlueprintSecrets(unifiedBlueprint(), "wrong"));
  assert.throws(() => patchBlueprintSecrets({ flow: [] }, token));
});

test("clears tenant-specific Make bindings and literal notification recipients", () => {
  const source = unifiedBlueprint();
  const result = clearBlueprintProviderBindings(source);
  assert.deepEqual(result, {
    gmailConnectionsCleared: 2,
    webhooksCleared: 1,
    literalRecipientsCleared: 1,
    orphansCleared: 1,
  });
  assert.equal(source.flow[0].parameters.hook, undefined);
  assert.equal(source.flow[1].routes[0].flow[0].parameters.__IMTCONN__, undefined);
  assert.deepEqual(source.flow[1].routes[0].flow[0].mapper.to, ["BEALLITANDO_BELSO_ERTESITESI_EMAIL"]);
  assert.equal(source.metadata.designer.orphans, undefined);
});

test("prepared blueprints contain only the issued key and no account e-mail", () => {
  const source = unifiedBlueprint();
  patchBlueprintSecrets(source, token);
  clearBlueprintProviderBindings(source);
  assert.equal(validatePreparedBlueprint(source, token), true);
  source.name = "owner@example.com";
  assert.throws(() => validatePreparedBlueprint(source, token), /e-mail-címet/);
});

test("writes unified events and reconciliation blueprints outside the repository", async () => {
  const folder = await mkdtemp(join(tmpdir(), "leadflow-blueprints-"));
  const keyPath = join(folder, "key.txt");
  const unifiedInput = join(folder, "events.json");
  const reconciliationInput = join(folder, "reconciliation.json");
  const outputDirectory = join(folder, "ready");
  try {
    await writeFile(keyPath, `${token}\n`);
    await writeFile(unifiedInput, JSON.stringify(unifiedBlueprint()));
    await writeFile(reconciliationInput, JSON.stringify(reconciliationBlueprint()));
    const results = await prepareCompanyMakeBlueprints({ slug: "pelda-kft", keyPath, unifiedInput, reconciliationInput, outputDirectory, projectRoot: process.cwd() });
    assert.deepEqual(results.map(result => result.replaced), [2, 2]);
    assert.deepEqual(results.map(result => result.output), [
      join(outputDirectory, "pelda-kft-leadflow-events.blueprint.json"),
      join(outputDirectory, "pelda-kft-delivery-reconciliation.blueprint.json"),
    ]);
    for (const result of results) {
      const output = await readFile(result.output, "utf8");
      assert.match(output, new RegExp(token));
      assert.doesNotMatch(output, /pilot@example\.com/);
      assert.equal(validatePreparedBlueprint(JSON.parse(output), token), true);
    }
    await assert.rejects(prepareCompanyMakeBlueprints({ slug: "pelda-kft", keyPath, unifiedInput, reconciliationInput, outputDirectory, projectRoot: process.cwd() }));
  } finally {
    await rm(folder, { recursive: true, force: true });
  }
});

test("wrong-kind JSON cleans up output created earlier in the same run", async () => {
  const folder = await mkdtemp(join(tmpdir(), "leadflow-blueprints-fail-"));
  const outputDirectory = join(folder, "ready");
  try {
    await writeFile(join(folder, "key.txt"), token);
    await writeFile(join(folder, "events.json"), JSON.stringify(unifiedBlueprint()));
    await writeFile(join(folder, "reconciliation.json"), JSON.stringify({ flow: [] }));
    await assert.rejects(prepareCompanyMakeBlueprints({ slug: "pelda-kft", keyPath: join(folder, "key.txt"), unifiedInput: join(folder, "events.json"), reconciliationInput: join(folder, "reconciliation.json"), outputDirectory, projectRoot: process.cwd() }), /reconciliation/);
    await assert.rejects(readFile(join(outputDirectory, "pelda-kft-leadflow-events.blueprint.json")));
  } finally {
    await rm(folder, { recursive: true, force: true });
  }
});

test("invalid JSON never leaves a partial prepared blueprint", async () => {
  const folder = await mkdtemp(join(tmpdir(), "leadflow-blueprints-json-fail-"));
  const outputDirectory = join(folder, "ready");
  try {
    await writeFile(join(folder, "key.txt"), token);
    await writeFile(join(folder, "events.json"), JSON.stringify(unifiedBlueprint()));
    await writeFile(join(folder, "reconciliation.json"), "{");
    await assert.rejects(prepareCompanyMakeBlueprints({ slug: "pelda-kft", keyPath: join(folder, "key.txt"), unifiedInput: join(folder, "events.json"), reconciliationInput: join(folder, "reconciliation.json"), outputDirectory, projectRoot: process.cwd() }), /érvényes JSON/);
    await assert.rejects(readFile(join(outputDirectory, "pelda-kft-leadflow-events.blueprint.json")));
  } finally {
    await rm(folder, { recursive: true, force: true });
  }
});

test("all sensitive paths must be absolute and outside the repository", () => {
  assert.throws(() => validateExternalPath("relative.json"));
  assert.throws(() => validateExternalPath(join(process.cwd(), "inside.json")));
});
