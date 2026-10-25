import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const leadDetail = readFileSync(new URL("../app/leads/[id]/page.tsx", import.meta.url), "utf8");
const leadNotes = readFileSync(new URL("../components/lead-notes.tsx", import.meta.url), "utf8");

test("lead detail protects every editable work area from accidental navigation", () => {
  assert.match(leadDetail, /const hasUnsavedLeadChanges = Boolean\(lead/);
  assert.match(leadDetail, /const hasUnsavedNextAction = nextActionEditorOpen/);
  assert.match(leadDetail, /hasUnsavedLeadChanges \|\| hasUnsavedNextAction \|\| replyDirty \|\| noteDirty/);
  assert.match(leadDetail, /<AppShell hasUnsavedChanges=\{hasUnsavedChanges\}>/);
  assert.match(leadDetail, /window\.addEventListener\("beforeunload", warnBeforeLeaving\)/);
  assert.match(leadDetail, /event\.returnValue = ""/);
  assert.match(leadDetail, /onClick=\{returnToLeadList\}/);
});

test("internal note drafts participate in the page-level unsaved changes guard", () => {
  assert.match(leadDetail, /<LeadNotes leadId=\{lead\.id\} onDirtyChange=\{setNoteDirty\} \/>/);
  assert.match(leadNotes, /onDirtyChange\?: \(dirty: boolean\) => void/);
  assert.match(leadNotes, /onDirtyChange\?\.\(content\.length > 0\)/);
});

test("cancelling a changed next action requires an explicit discard decision", () => {
  assert.match(leadDetail, /const hasDraftChanges = nextActionDraft !== \(nextActionExpected\.nextAction \?\? ""\)/);
  assert.match(leadDetail, /A teendő módosításai nincsenek elmentve\. Biztosan elveted őket\?/);
});
