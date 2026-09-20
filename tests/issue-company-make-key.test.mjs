import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { issueCompanyMakeKey, validateOutputPath } from "../scripts/issue-company-make-key.mjs";

function fakeClient({ connection = { mode: "company", enabled: false }, existing = null, errorTable = null, insertError = false } = {}) {
  const writes = [];
  return {
    writes,
    from(table) {
      return {
        select() { return this; }, eq() { return this; }, is() { return this; }, limit() { return this; },
        async maybeSingle() {
          if (table === errorTable) return { data: null, error: { message: "private database detail" } };
          return { data: { companies: { id: "company-id" }, company_make_connections: connection, make_credentials: existing }[table], error: null };
        },
        async insert(row) {
          writes.push({ table, row });
          return { error: insertError ? { message: "private database detail" } : null };
        },
      };
    },
  };
}

test("dry run checks tenant setup without issuing a credential", async () => {
  const client = fakeClient();
  assert.deepEqual(await issueCompanyMakeKey(client, "pelda-kft"), { issued: false });
  assert.equal(client.writes.length, 0);
});

test("existing credential and enabled or legacy connection block issuance", async () => {
  for (const client of [fakeClient({ existing: { id: "old" } }), fakeClient({ connection: { mode: "legacy", enabled: false } }), fakeClient({ connection: { mode: "company", enabled: true } }), fakeClient({ errorTable: "make_credentials" })]) {
    await assert.rejects(issueCompanyMakeKey(client, "pelda-kft", { issue: true, outputPath: join(tmpdir(), "unused-key") }));
    assert.equal(client.writes.length, 0);
  }
});

test("secret stays in an exclusive file and only its SHA-256 hash is stored", async () => {
  const folder = await mkdtemp(join(tmpdir(), "leadflow-key-test-"));
  try {
    const outputPath = join(folder, "make-key.txt");
    const client = fakeClient();
    assert.deepEqual(await issueCompanyMakeKey(client, "pelda-kft", { issue: true, outputPath }), { issued: true });
    const token = (await readFile(outputPath, "utf8")).trim();
    assert.match(token, /^lfmk_[0-9a-f]{64}$/);
    assert.deepEqual(client.writes, [{ table: "make_credentials", row: {
      company_id: "company-id", token_hash: createHash("sha256").update(token).digest("hex"),
    } }]);
    await assert.rejects(issueCompanyMakeKey(fakeClient(), "pelda-kft", { issue: true, outputPath }));
    assert.equal((await readFile(outputPath, "utf8")).trim(), token);
  } finally {
    await rm(folder, { recursive: true, force: true });
  }
});

test("failed database insert removes the temporary secret file", async () => {
  const folder = await mkdtemp(join(tmpdir(), "leadflow-key-test-"));
  try {
    await assert.rejects(issueCompanyMakeKey(fakeClient({ insertError: true }), "pelda-kft", { issue: true, outputPath: join(folder, "key.txt") }));
    assert.deepEqual(await readdir(folder), []);
  } finally {
    await rm(folder, { recursive: true, force: true });
  }
});

test("output file must be absolute and outside the repository", () => {
  assert.throws(() => validateOutputPath("relative.txt"));
  assert.throws(() => validateOutputPath(join(process.cwd(), "secret.txt")));
});
