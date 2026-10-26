import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  APPROVED_REPLY_SUBJECT_MAX_LENGTH,
  defaultApprovedReplySubject,
  normalizeApprovedReplySubject,
} from "../lib/email-subject.ts";

const migration = readFileSync(new URL("../supabase/migrations/202610260001_message_subject.sql", import.meta.url), "utf8");
const leadDetail = readFileSync(new URL("../app/leads/[id]/page.tsx", import.meta.url), "utf8");
const sendRoute = readFileSync(new URL("../app/api/send-approved-reply/route.ts", import.meta.url), "utf8");

test("reply subjects have a useful tenant-specific default", () => {
  assert.equal(defaultApprovedReplySubject("  Példa Kft.  "), "Válasz az ajánlatkérésére – Példa Kft.");
  assert.equal(defaultApprovedReplySubject(""), "Válasz az ajánlatkérésére");
  assert.ok(defaultApprovedReplySubject("A".repeat(300)).length <= APPROVED_REPLY_SUBJECT_MAX_LENGTH);
});

test("reply subjects are single-line, bounded and fall back when empty", () => {
  assert.equal(normalizeApprovedReplySubject("  Egyedi\r\n  tárgy\tmező  ", "Példa Kft."), "Egyedi tárgy mező");
  assert.equal(normalizeApprovedReplySubject("   ", "Példa Kft."), "Válasz az ajánlatkérésére – Példa Kft.");
  assert.equal(normalizeApprovedReplySubject("X".repeat(250), "Példa Kft.").length, APPROVED_REPLY_SUBJECT_MAX_LENGTH);
});

test("message subject storage and sending stay tenant-scoped with safe legacy fallback", () => {
  assert.match(migration, /add column if not exists subject text/i);
  assert.match(migration, /char_length\(btrim\(subject\)\) between 1 and 200/i);
  assert.match(migration, /subject !~ E'\[\\\\r\\\\n\]'/i);
  assert.match(leadDetail, /subject: normalizedSubject/);
  assert.match(leadDetail, /\.eq\("company_id", data\.company_id\)/);
  assert.match(sendRoute, /normalizeApprovedReplySubject\(message\.subject, company\.name\)/);
  assert.match(sendRoute, /subject,/);
});
