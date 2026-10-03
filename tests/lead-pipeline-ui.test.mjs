import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const pipelineUrl = new URL("../app/pipeline/page.tsx", import.meta.url);
const migrationUrl = new URL("../supabase/migrations/202610030004_lead_pipeline_statuses.sql", import.meta.url);

test("pipeline supports drag, direct status selection and explicit closure outcome", async () => {
  const source = await readFile(pipelineUrl, "utf8");
  assert.match(source, /draggable=/);
  assert.match(source, /onDrop=/);
  assert.match(source, /Állapot módosítása/);
  assert.match(source, /Megvalósult/);
  assert.match(source, /Nem valósult meg/);
  assert.match(source, /nextStatus === "processed" && !outcome/);
  assert.match(source, /role="tooltip"/);
  assert.match(source, /group-hover:block group-focus:block/);
  assert.match(source, /lg:grid-cols-6/);
  assert.match(source, /pipeline-drop-placeholder/);
  assert.match(source, /dragTargetStatus === column\.status/);
});

test("pipeline updates stay tenant scoped through authenticated RLS", async () => {
  const source = await readFile(pipelineUrl, "utf8");
  assert.match(source, /supabase\.from\("leads"\)\.update/);
  assert.match(source, /\.eq\("id", lead\.id\)/);
  assert.doesNotMatch(source, /company_id:/);
});

test("database accepts only the six approved pipeline statuses", async () => {
  const sql = await readFile(migrationUrl, "utf8");
  for (const status of ["new", "contacted", "waiting", "offer_sent", "decision", "processed"]) {
    assert.match(sql, new RegExp(`'${status}'`));
  }
  assert.match(sql, /validate constraint leads_pipeline_status_valid/i);
});

