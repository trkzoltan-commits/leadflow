import assert from "node:assert/strict";
import test from "node:test";
import { PIPELINE_COLUMNS, filterPipelineLeads, filterPipelineLeadsByPriority, isPipelineStatus, pipelineGroups } from "../lib/lead-pipeline.ts";

test("pipeline contains the approved stages in business order", () => {
  assert.deepEqual(PIPELINE_COLUMNS.map(column => column.status), [
    "new", "contacted", "waiting", "offer_sent", "decision", "processed",
  ]);
  assert.deepEqual(PIPELINE_COLUMNS.map(column => column.label), [
    "Új", "Kapcsolatfelvétel", "Válaszra vár", "Ajánlat elküldve", "Döntésre vár", "Lezárt",
  ]);
  assert.ok(PIPELINE_COLUMNS.every(column => column.description.length > 30));
});

test("leads are grouped without crossing pipeline stages", () => {
  const leads = [
    { id: "a", status: "new" }, { id: "b", status: "offer_sent" },
    { id: "c", status: "decision" }, { id: "d", status: "processed" },
  ];
  const groups = pipelineGroups(leads);
  assert.deepEqual(groups.get("new").map(lead => lead.id), ["a"]);
  assert.deepEqual(groups.get("offer_sent").map(lead => lead.id), ["b"]);
  assert.deepEqual(groups.get("decision").map(lead => lead.id), ["c"]);
  assert.deepEqual(groups.get("processed").map(lead => lead.id), ["d"]);
});

test("unknown statuses cannot be written through pipeline controls", () => {
  assert.equal(isPipelineStatus("offer_sent"), true);
  assert.equal(isPipelineStatus("decision"), true);
  assert.equal(isPipelineStatus("unknown"), false);
  assert.equal(isPipelineStatus(null), false);
});

test("pipeline assignee filters isolate personal and unassigned work", () => {
  const leads = [
    { id: "a", assigned_user_id: "user-a" },
    { id: "b", assigned_user_id: "user-b" },
    { id: "c", assigned_user_id: null },
  ];
  assert.deepEqual(filterPipelineLeads(leads, "all", "user-a").map(lead => lead.id), ["a", "b", "c"]);
  assert.deepEqual(filterPipelineLeads(leads, "mine", "user-a").map(lead => lead.id), ["a"]);
  assert.deepEqual(filterPipelineLeads(leads, "mine", null), []);
  assert.deepEqual(filterPipelineLeads(leads, "unassigned", "user-a").map(lead => lead.id), ["c"]);
});

test("pipeline priority filters treat legacy missing priority as medium", () => {
  const leads = [
    { id: "high", priority: "high" },
    { id: "medium", priority: "medium" },
    { id: "legacy", priority: null },
    { id: "low", priority: "low" },
  ];
  assert.deepEqual(filterPipelineLeadsByPriority(leads, "high").map(lead => lead.id), ["high"]);
  assert.deepEqual(filterPipelineLeadsByPriority(leads, "medium").map(lead => lead.id), ["medium", "legacy"]);
  assert.deepEqual(filterPipelineLeadsByPriority(leads, "low").map(lead => lead.id), ["low"]);
  assert.equal(filterPipelineLeadsByPriority(leads, "all"), leads);
});

