"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { appendVoiceTranscript, voiceDictationErrorMessage } from "@/lib/voice-dictation";

type SpeechRecognitionResultLike = {
  isFinal: boolean;
  0: { transcript: string };
};

type SpeechRecognitionResultListLike = {
  length: number;
  [index: number]: SpeechRecognitionResultLike;
};

type SpeechRecognitionEventLike = {
  resultIndex: number;
  results: SpeechRecognitionResultListLike;
};

type SpeechRecognitionLike = {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onstart: (() => void) | null;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  onerror: ((event: { error: string }) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
  abort: () => void;
};

type SpeechRecognitionConstructor = new () => SpeechRecognitionLike;

type SpeechRecognitionWindow = Window & {
  SpeechRecognition?: SpeechRecognitionConstructor;
  webkitSpeechRecognition?: SpeechRecognitionConstructor;
};

type VoiceDictationButtonProps = {
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  maxLength?: number;
  fieldLabel: string;
};

function recognitionConstructor() {
  if (typeof window === "undefined") return null;
  const speechWindow = window as SpeechRecognitionWindow;
  return speechWindow.SpeechRecognition ?? speechWindow.webkitSpeechRecognition ?? null;
}

function subscribeToSpeechRecognitionSupport() {
  return () => undefined;
}

export function VoiceDictationButton({ value, onChange, disabled = false, maxLength, fieldLabel }: VoiceDictationButtonProps) {
  const supported = useSyncExternalStore(
    subscribeToSpeechRecognitionSupport,
    () => Boolean(recognitionConstructor()),
    () => false,
  );
  const [listening, setListening] = useState(false);
  const [message, setMessage] = useState("");
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);

  useEffect(() => {
    return () => recognitionRef.current?.abort();
  }, []);

  function toggleDictation() {
    if (listening) {
      recognitionRef.current?.stop();
      return;
    }

    const Recognition = recognitionConstructor();
    if (!Recognition) return;

    const recognition = new Recognition();
    const initialValue = value;
    let committedTranscript = "";
    recognitionRef.current = recognition;
    recognition.lang = "hu-HU";
    recognition.continuous = true;
    recognition.interimResults = true;

    recognition.onstart = () => {
      setListening(true);
      setMessage("Beszélhetsz…");
    };
    recognition.onresult = event => {
      let interimTranscript = "";
      for (let index = event.resultIndex; index < event.results.length; index += 1) {
        const transcript = event.results[index][0]?.transcript ?? "";
        if (event.results[index].isFinal) committedTranscript = appendVoiceTranscript(committedTranscript, transcript);
        else interimTranscript = appendVoiceTranscript(interimTranscript, transcript);
      }
      const dictatedText = appendVoiceTranscript(committedTranscript, interimTranscript);
      const nextValue = appendVoiceTranscript(initialValue, dictatedText, maxLength);
      onChange(nextValue);
      if (typeof maxLength === "number" && nextValue.length >= maxLength) {
        setMessage("Elérted a mező karakterkorlátját.");
        recognition.stop();
      }
    };
    recognition.onerror = event => {
      setMessage(voiceDictationErrorMessage(event.error));
    };
    recognition.onend = () => {
      setListening(false);
      recognitionRef.current = null;
      setMessage(current => current === "Beszélhetsz…" ? "A diktálás befejeződött." : current);
    };

    try {
      recognition.start();
    } catch {
      setListening(false);
      setMessage("A diktálás nem indítható el. Próbáld újra.");
      recognitionRef.current = null;
    }
  }

  if (!supported) return null;

  return (
    <div className="flex flex-wrap items-center justify-end gap-2">
      <button
        type="button"
        aria-pressed={listening}
        aria-label={`${fieldLabel} ${listening ? "diktálásának leállítása" : "diktálása"}`}
        title="A LeadFlow csak a felismert szöveget teszi a mezőbe."
        onClick={toggleDictation}
        disabled={disabled}
        className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-semibold transition disabled:cursor-not-allowed disabled:opacity-50 ${listening ? "border-red-300 bg-red-50 text-red-700" : "border-blue-200 bg-blue-50 text-blue-700 hover:bg-blue-100"}`}
      >
        <svg aria-hidden="true" viewBox="0 0 24 24" className="h-4 w-4 fill-none stroke-current" strokeWidth="1.8">
          <rect x="9" y="3" width="6" height="11" rx="3" />
          <path d="M6.5 11.5a5.5 5.5 0 0 0 11 0M12 17v4M9 21h6" />
        </svg>
        {listening ? "Leállítás" : "Diktálás"}
      </button>
      {message && <span role="status" className="max-w-56 text-right text-xs font-normal text-slate-500">{message}</span>}
    </div>
  );
}
