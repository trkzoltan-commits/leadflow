import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { buildApprovedReplyHtml } from "../lib/email-html.ts";

const leadDetail = readFileSync(new URL("../app/leads/[id]/page.tsx", import.meta.url), "utf8");

test("approved reply HTML preserves paragraphs and escapes untrusted text", () => {
  const html = buildApprovedReplyHtml("Kedves Teszt!\n\n<script>alert('x')</script>\n\nKöszönöm.", {
    companyName: "Példa & Társa",
    signoff: "Üdvözlettel,",
    email: "info@example.com",
    website: "https://example.com",
    brandColor: "#149a02",
  });

  assert.match(html, /Kedves Teszt!<br><br>/);
  assert.match(html, /&lt;script&gt;alert\(&#39;x&#39;\)&lt;\/script&gt;/);
  assert.doesNotMatch(html, /<script>/);
  assert.match(html, /Példa &amp; Társa/);
  assert.match(html, /mailto:info@example\.com/);
  assert.match(html, /color:#149a02/);
});

test("lead detail renders the same formatted content that sending uses", () => {
  assert.match(leadDetail, /buildApprovedReplyHtml\(replyDraft, emailSignature\)/);
  assert.match(leadDetail, /Elküldés előtti előnézet/);
  assert.match(leadDetail, /Válasz és céges aláírás/);
  assert.match(leadDetail, /Küldéskor az elmentett piszkozat kerül továbbításra/);
  assert.match(leadDetail, /email_signature_enabled,email_signature_show_logo,email_signoff/);
  assert.match(leadDetail, /href="\/settings#messages"/);
});
