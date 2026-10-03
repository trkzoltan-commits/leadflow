import assert from "node:assert/strict";
import test from "node:test";
import { manualDeliveryResolution } from "../lib/manual-delivery-resolution.ts";

const delayed = { status: "sending", direction: "outgoing", sending_started_at: "2026-10-03T10:00:00.000Z" };
const now = new Date("2026-10-03T11:00:00.000Z");

test("a delayed uncertain send can be manually confirmed as sent", () => {
  const result = manualDeliveryResolution(delayed, "sent", "user-a", now);
  assert.equal(result.ok, true);
  assert.deepEqual(result.values, {
    status: "sent",
    delivery_confirmed_at: "2026-10-03T11:00:00.000Z",
    delivery_failed_at: null,
    delivery_resolution_source: "manual",
    delivery_resolved_by: "user-a",
  });
});

test("a delayed uncertain send can be manually confirmed as failed", () => {
  const result = manualDeliveryResolution(delayed, "failed", "user-a", now);
  assert.equal(result.ok, true);
  assert.equal(result.values.status, "failed");
  assert.equal(result.values.delivery_failed_at, "2026-10-03T11:00:00.000Z");
});

test("manual resolution rejects early, completed, incoming and invalid results", () => {
  assert.equal(manualDeliveryResolution(delayed, "failed", "user-a", new Date("2026-10-03T10:59:59.999Z")).ok, false);
  assert.equal(manualDeliveryResolution({ ...delayed, status: "sent" }, "sent", "user-a", now).ok, false);
  assert.equal(manualDeliveryResolution({ ...delayed, direction: "incoming" }, "sent", "user-a", now).ok, false);
  assert.equal(manualDeliveryResolution(delayed, "retry", "user-a", now).ok, false);
});

