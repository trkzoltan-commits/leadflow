import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const dashboard = readFileSync(new URL("../app/page.tsx", import.meta.url), "utf8");
const detail = readFileSync(new URL("../app/leads/[id]/page.tsx", import.meta.url), "utf8");
const route = readFileSync(new URL("../app/api/messages/[id]/delivery-status/route.ts", import.meta.url), "utf8");

test("dashboard promotes definitively failed sends into the attention queue", () => {
  assert.match(dashboard, /\["draft", "sending", "failed"\]/);
  assert.match(dashboard, /Sikertelen küldés/);
  assert.match(dashboard, /igazoltan sikertelen küldés újrapróbálható/);
});

test("delivery audit API is tenant scoped and returns no message content", () => {
  assert.match(route, /eq\("company_id", profile\.company_id\)/);
  assert.match(route, /eq\("event_type", "approved_reply"\)/);
  assert.match(route, /attemptCount/);
  assert.doesNotMatch(route, /select\("[^"]*content/);
});

test("lead detail shows attempt count and last attempt time", () => {
  assert.match(detail, /Küldési próbálkozások:/);
  assert.match(detail, /deliveryAudit\.attemptCount/);
  assert.match(detail, /displayReceivedAt\(deliveryAudit\.lastAttemptAt\)/);
});
