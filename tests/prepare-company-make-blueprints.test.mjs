import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import test from "node:test";
import { patchBlueprintSecrets, prepareCompanyMakeBlueprints, validateExternalPath } from "../scripts/prepare-company-make-blueprints.mjs";

const token = `lfmk_${"a".repeat(64)}`;
function blueprint(values = ["old-a", "old-b"]) {
  return { flow: values.map(value => ({ mapper: { headers: [
    { name: "content-type", value: "application/json" }, { name: "x-leadflow-secret", value },
  ] } })) };
}

test("patches every LeadFlow header without changing unrelated headers", () => {
  const source = blueprint();
  const result = patchBlueprintSecrets(source, token);
  assert.equal(result.replaced, 2);
  assert.deepEqual(source.flow.map(item => item.mapper.headers[0].value), ["application/json", "application/json"]);
  assert.deepEqual(source.flow.map(item => item.mapper.headers[1].value), [token, token]);
});

test("rejects invalid keys and blueprints without a LeadFlow header", () => {
  assert.throws(() => patchBlueprintSecrets(blueprint(), "wrong"));
  assert.throws(() => patchBlueprintSecrets({ flow: [] }, token));
});

test("writes two exclusive, tenant-named blueprints outside the repository", async () => {
  const folder = await mkdtemp(join(tmpdir(), "leadflow-blueprints-"));
  const keyPath = join(folder, "key.txt");
  const newLeadInput = join(folder, "new.json");
  const approvedReplyInput = join(folder, "reply.json");
  const outputDirectory = join(folder, "ready");
  try {
    await writeFile(keyPath, `${token}\n`);
    await writeFile(newLeadInput, JSON.stringify(blueprint(["old-a", "old-b"])));
    await writeFile(approvedReplyInput, JSON.stringify(blueprint(["old-c"])));
    const results = await prepareCompanyMakeBlueprints({ slug: "pelda-kft", keyPath, newLeadInput, approvedReplyInput, outputDirectory, projectRoot: process.cwd() });
    assert.deepEqual(results.map(result => result.replaced), [2, 1]);
    assert.deepEqual(results.map(result => result.output), [
      join(outputDirectory, "pelda-kft-new-lead.blueprint.json"), join(outputDirectory, "pelda-kft-send-approved-reply.blueprint.json"),
    ]);
    for (const result of results) assert.match(await readFile(result.output, "utf8"), new RegExp(token));
    await assert.rejects(prepareCompanyMakeBlueprints({ slug: "pelda-kft", keyPath, newLeadInput, approvedReplyInput, outputDirectory, projectRoot: process.cwd() }));
  } finally {
    await rm(folder, { recursive: true, force: true });
  }
});

test("invalid JSON cleans up any output created earlier in the same run", async () => {
  const folder = await mkdtemp(join(tmpdir(), "leadflow-blueprints-fail-"));
  const outputDirectory = join(folder, "ready");
  try {
    await writeFile(join(folder, "key.txt"), token);
    await writeFile(join(folder, "new.json"), JSON.stringify(blueprint(["old"])));
    await writeFile(join(folder, "reply.json"), "{");
    await assert.rejects(prepareCompanyMakeBlueprints({ slug: "pelda-kft", keyPath: join(folder, "key.txt"), newLeadInput: join(folder, "new.json"), approvedReplyInput: join(folder, "reply.json"), outputDirectory, projectRoot: process.cwd() }), /érvényes JSON/);
    await assert.rejects(readFile(join(outputDirectory, "pelda-kft-new-lead.blueprint.json")));
  } finally {
    await rm(folder, { recursive: true, force: true });
  }
});

test("all sensitive paths must be absolute and outside the repository", () => {
  assert.throws(() => validateExternalPath("relative.json"));
  assert.throws(() => validateExternalPath(join(process.cwd(), "inside.json")));
});
