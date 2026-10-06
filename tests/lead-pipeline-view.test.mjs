import assert from "node:assert/strict";
import test from "node:test";
import { DEFAULT_PIPELINE_VIEW, parsePipelineView, pipelineViewStorageKey, serializePipelineView } from "../lib/lead-pipeline-view.ts";

test("pipeline view preferences round-trip without storing lead data", () => {
  const view = {
    assigneeFilter: "member:user-b",
    nextActionFilter: "overdue",
    priorityFilter: "high",
    sort: "priority",
  };
  const serialized = serializePipelineView(view);
  assert.deepEqual(parsePipelineView(serialized, { canAssign: true, memberIds: new Set(["user-b"]) }), view);
  assert.equal(serialized.includes("lead"), false);
  assert.equal(pipelineViewStorageKey("user-a"), "leadflow:pipeline-view:v1:user-a");
});

test("pipeline view preferences reject invalid values and inaccessible members", () => {
  const invalid = JSON.stringify({
    assigneeFilter: "member:other-tenant-user",
    nextActionFilter: "tomorrow",
    priorityFilter: "urgent",
    sort: "oldest",
  });
  assert.deepEqual(parsePipelineView(invalid, { canAssign: true, memberIds: new Set(["same-tenant-user"]) }), DEFAULT_PIPELINE_VIEW);
  assert.deepEqual(parsePipelineView("not-json", { canAssign: false, memberIds: new Set() }), DEFAULT_PIPELINE_VIEW);
  assert.deepEqual(parsePipelineView(null, { canAssign: false, memberIds: new Set() }), DEFAULT_PIPELINE_VIEW);
});

test("regular users can restore personal and unassigned filters but not member filters", () => {
  const memberView = serializePipelineView({
    assigneeFilter: "member:user-b",
    nextActionFilter: "today",
    priorityFilter: "medium",
    sort: "newest",
  });
  assert.deepEqual(parsePipelineView(memberView, { canAssign: false, memberIds: new Set(["user-b"]) }), {
    assigneeFilter: "all",
    nextActionFilter: "today",
    priorityFilter: "medium",
    sort: "newest",
  });

  const personalView = serializePipelineView({
    assigneeFilter: "mine",
    nextActionFilter: "missing",
    priorityFilter: "low",
    sort: "due",
  });
  assert.equal(parsePipelineView(personalView, { canAssign: false, memberIds: new Set() }).assigneeFilter, "mine");
});
