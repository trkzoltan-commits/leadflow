import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { appendVoiceTranscript, voiceDictationErrorMessage } from "../lib/voice-dictation.ts";

const component = readFileSync(new URL("../components/voice-dictation-button.tsx", import.meta.url), "utf8");
const leadDetail = readFileSync(new URL("../app/leads/[id]/page.tsx", import.meta.url), "utf8");
const leadNotes = readFileSync(new URL("../components/lead-notes.tsx", import.meta.url), "utf8");
const pipeline = readFileSync(new URL("../app/pipeline/page.tsx", import.meta.url), "utf8");

test("recognized speech is appended without overwriting existing work", () => {
  assert.equal(appendVoiceTranscript("Korábbi szöveg.", " Új diktálás "), "Korábbi szöveg. Új diktálás");
  assert.equal(appendVoiceTranscript("Korábbi szöveg.\n", "Új sor"), "Korábbi szöveg.\nÚj sor");
  assert.equal(appendVoiceTranscript("", "  Első mondat.  "), "Első mondat.");
  assert.equal(appendVoiceTranscript("Meglévő", "szöveg", 10), "Meglévő sz");
});

test("microphone failures have actionable Hungarian messages", () => {
  assert.match(voiceDictationErrorMessage("not-allowed"), /engedélyezd a mikrofon/);
  assert.match(voiceDictationErrorMessage("no-speech"), /Nem hallottam beszédet/);
  assert.match(voiceDictationErrorMessage("network"), /nem érhető el/);
});

test("dictation is progressive, Hungarian and hidden on unsupported browsers", () => {
  assert.match(component, /speechWindow\.SpeechRecognition \?\? speechWindow\.webkitSpeechRecognition/);
  assert.match(component, /recognition\.lang = "hu-HU"/);
  assert.match(component, /recognition\.interimResults = true/);
  assert.match(component, /if \(!supported\) return null/);
  assert.match(component, /aria-pressed=\{listening\}/);
});

test("dictation is wired to the long partner text fields", () => {
  assert.match(leadDetail, /fieldLabel="Érdeklődés leírása"/);
  assert.match(leadDetail, /fieldLabel="Következő teendő"/);
  assert.match(leadDetail, /fieldLabel="Válaszpiszkozat"/);
  assert.match(leadNotes, /fieldLabel="Belső megjegyzés"/);
  assert.match(pipeline, /fieldLabel="Következő teendő"/);
});
