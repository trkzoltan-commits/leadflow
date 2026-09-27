import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import ts from "typescript";
import vm from "node:vm";

async function load() {
  const source = await readFile(new URL("../lib/delivery-receipt.ts", import.meta.url), "utf8");
  const js = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
  const testModule = { exports: {} };
  vm.runInNewContext(`(function(module,exports){${js}\n})(testModule,testModule.exports)`, { testModule });
  return testModule.exports;
}

test("sent receipt normalizes the Gmail id and records confirmation time", async () => {
  const { deliveryReceiptUpdate } = await load();
  const result = deliveryReceiptUpdate("sent", " 18f0abc_DEF-123 ", new Date("2026-09-27T12:00:00Z"));
  assert.equal(result.ok, true);
  assert.equal(result.values.provider_message_id, "18f0abc_DEF-123");
  assert.equal(result.values.delivery_confirmed_at, "2026-09-27T12:00:00.000Z");
  assert.equal(result.values.delivery_failed_at, null);
});

test("failed receipt records a definitive failure without inventing a Gmail id", async () => {
  const { deliveryReceiptUpdate } = await load();
  const result = deliveryReceiptUpdate("failed", undefined, new Date("2026-09-27T12:00:00Z"));
  assert.equal(result.ok, true);
  assert.equal(result.values.delivery_failed_at, "2026-09-27T12:00:00.000Z");
  assert.equal(Object.hasOwn(result.values, "provider_message_id"), false);
});

test("malformed or oversized provider ids are rejected", async () => {
  const { deliveryReceiptUpdate, normalizeProviderMessageId } = await load();
  for (const value of ["short", "contains spaces", "x".repeat(256), 123]) {
    assert.equal(normalizeProviderMessageId(value), null);
    assert.equal(deliveryReceiptUpdate("sent", value).ok, false);
  }
});
