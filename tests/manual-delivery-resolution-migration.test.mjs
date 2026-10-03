import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("manual delivery resolution records its source and actor", async () => {
  const sql = await readFile(new URL("../supabase/migrations/202610030003_manual_delivery_resolution.sql", import.meta.url), "utf8");
  assert.match(sql, /delivery_resolution_source text/i);
  assert.match(sql, /delivery_resolved_by uuid/i);
  assert.match(sql, /in \('make', 'manual'\)/i);
  assert.match(sql, /set delivery_resolution_source = 'make'/i);
});
