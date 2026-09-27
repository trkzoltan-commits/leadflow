import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import ts from "typescript";
import vm from "node:vm";

async function load() {
  const source = await readFile(new URL("../lib/automation-dispatch.ts", import.meta.url), "utf8");
  const js = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
  const testModule = { exports: {} };
  vm.runInNewContext(`(function(module,exports){${js}\n})(testModule,testModule.exports)`, { testModule });
  return testModule.exports;
}

test("successful Make acknowledgement is accepted", async () => {
  const { webhookAttemptResult } = await load();
  assert.equal(JSON.stringify(webhookAttemptResult({ ok: true, status: 200 })), JSON.stringify({
    status: "accepted", httpStatus: 200, errorCode: null,
  }));
});

test("HTTP and network failures remain uncertain to prevent duplicate delivery", async () => {
  const { webhookAttemptResult } = await load();
  assert.equal(JSON.stringify(webhookAttemptResult({ ok: false, status: 503 })), JSON.stringify({
    status: "uncertain", httpStatus: 503, errorCode: "http",
  }));
  assert.equal(JSON.stringify(webhookAttemptResult(null)), JSON.stringify({
    status: "uncertain", httpStatus: null, errorCode: "network",
  }));
});
