import test from "node:test";
import assert from "node:assert/strict";
import { summarizeDispatches } from "../scripts/check-automation-dispatches.mjs";

test("dispatch summary counts statuses and reports the oldest unresolved event", () => {
  const rows = [
    { status: "completed", updated_at: "2026-09-27T10:00:00Z" },
    { status: "accepted", last_attempt_at: "2026-09-27T11:40:00Z" },
    { status: "uncertain", last_attempt_at: "2026-09-27T11:00:00Z" },
  ];
  const result = summarizeDispatches(rows, new Date("2026-09-27T12:00:00Z"));
  assert.equal(result.total, 3);
  assert.equal(result.summary.completed, 1);
  assert.equal(result.summary.accepted, 1);
  assert.equal(result.summary.uncertain, 1);
  assert.equal(result.oldestUnresolvedMinutes, 60);
});

test("completed-only history has no unresolved age", () => {
  const result = summarizeDispatches([{ status: "completed", updated_at: "2026-09-27T10:00:00Z" }]);
  assert.equal(result.oldestUnresolvedMinutes, null);
});
