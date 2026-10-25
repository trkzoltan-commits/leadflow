"use client";

import { useEffect, useState } from "react";
import { VoiceDictationButton } from "@/components/voice-dictation-button";
import { supabase } from "@/lib/supabase";
import { STRUCTURED_DICTATION_MAX_LENGTH, type LeadDictationSuggestions } from "@/lib/structured-lead-dictation";

type SuggestionKey = keyof LeadDictationSuggestions;
type AppliedSuggestions = Partial<Record<SuggestionKey, string>>;

const suggestionFields: Array<{ key: SuggestionKey; label: string }> = [
  { key: "service", label: "Szolgáltatás" },
  { key: "location", label: "Helyszín" },
  { key: "description", label: "Igényleírás" },
];

type StructuredVoiceCaptureProps = {
  leadId: string;
  currentValues: Record<SuggestionKey, string>;
  onApply: (suggestions: AppliedSuggestions) => void;
  onDirtyChange?: (dirty: boolean) => void;
};

export function StructuredVoiceCapture({ leadId, currentValues, onApply, onDirtyChange }: StructuredVoiceCaptureProps) {
  const [transcript, setTranscript] = useState("");
  const [suggestions, setSuggestions] = useState<LeadDictationSuggestions | null>(null);
  const [selected, setSelected] = useState<Record<SuggestionKey, boolean>>({ service: false, location: false, description: false });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  useEffect(() => {
    onDirtyChange?.(Boolean(transcript.trim() || suggestions));
  }, [onDirtyChange, suggestions, transcript]);

  async function analyzeTranscript() {
    const normalized = transcript.trim();
    if (normalized.length < 3 || normalized.length > STRUCTURED_DICTATION_MAX_LENGTH) {
      setError(`Adj meg 3–${STRUCTURED_DICTATION_MAX_LENGTH} karakteres szöveget.`);
      return;
    }
    setLoading(true);
    setError("");
    setSuccess("");
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error("A munkamenet lejárt. Jelentkezz be újra.");
      const response = await fetch("/api/structure-lead-dictation", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({ lead_id: leadId, transcript: normalized }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "Az adatfelvétel feldolgozása nem sikerült.");
      const nextSuggestions = data.suggestions as LeadDictationSuggestions;
      setSuggestions(nextSuggestions);
      setSelected({
        service: Boolean(nextSuggestions.service),
        location: Boolean(nextSuggestions.location),
        description: Boolean(nextSuggestions.description),
      });
      if (!nextSuggestions.service && !nextSuggestions.location && !nextSuggestions.description) {
        setError("A szövegből nem találtam egyértelműen kitölthető adatot. Egészítsd ki, majd próbáld újra.");
      }
    } catch (requestError) {
      setSuggestions(null);
      setError(requestError instanceof Error ? requestError.message : "Az adatfelvétel feldolgozása nem sikerült.");
    } finally {
      setLoading(false);
    }
  }

  function applySuggestions() {
    if (!suggestions) return;
    const applied: AppliedSuggestions = {};
    for (const { key } of suggestionFields) {
      const value = suggestions[key];
      if (selected[key] && value) applied[key] = value;
    }
    if (Object.keys(applied).length === 0) {
      setError("Jelölj ki legalább egy alkalmazandó javaslatot.");
      return;
    }
    onApply(applied);
    setTranscript("");
    setSuggestions(null);
    setSelected({ service: false, location: false, description: false });
    setError("");
    setSuccess("A kijelölt javaslatok bekerültek az adatlap mezőibe. A rögzítéshez használd az adatlap mentése gombot.");
  }

  const visibleSuggestions = suggestions
    ? suggestionFields.filter(({ key }) => Boolean(suggestions[key]))
    : [];

  return (
    <details className="mb-6 rounded-2xl border border-blue-200 bg-blue-50/60 p-4">
      <summary className="cursor-pointer font-semibold text-blue-950">🎙 Gyors hangos adatfelvétel</summary>
      <div className="mt-4">
        <p className="text-sm leading-6 text-slate-600">
          Mondd el egyben az igényt. A böngésző szöveggé alakítja a beszédet, és csak ezt a szöveget küldjük AI-feldolgozásra; a LeadFlow hangfájlt nem tárol.
        </p>
        <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
          <label htmlFor="structured-voice-transcript" className="text-sm font-semibold text-slate-700">Diktált vagy begépelt feljegyzés</label>
          <VoiceDictationButton value={transcript} onChange={value => { setTranscript(value); setSuccess(""); }}
            disabled={loading} maxLength={STRUCTURED_DICTATION_MAX_LENGTH} fieldLabel="Gyors adatfelvétel" />
        </div>
        <textarea id="structured-voice-transcript" rows={5} maxLength={STRUCTURED_DICTATION_MAX_LENGTH}
          value={transcript} onChange={event => { setTranscript(event.target.value); setSuccess(""); }} disabled={loading}
          placeholder="Például: Az ügyfél Nagykanizsán egy négy méter széles, falhoz rögzített polikarbonát előtetőt szeretne…"
          className="mt-2 w-full resize-y rounded-xl border border-blue-200 bg-white px-4 py-3 leading-6 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 disabled:bg-slate-50" />
        <div className="mt-2 flex items-center justify-between gap-3 text-xs text-slate-500">
          <span>Az AI csak javaslatot készít, automatikus mentés nem történik.</span>
          <span>{transcript.length}/{STRUCTURED_DICTATION_MAX_LENGTH}</span>
        </div>
        <button type="button" onClick={() => void analyzeTranscript()} disabled={loading || transcript.trim().length < 3}
          className="mt-4 w-full rounded-xl bg-blue-600 px-4 py-3 font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50">
          {loading ? "Adatok felismerése…" : "Adatok felismerése a szövegből"}
        </button>

        {visibleSuggestions.length > 0 && <div className="mt-5 rounded-xl border border-blue-200 bg-white p-4">
          <h3 className="font-semibold text-slate-900">Ellenőrizd a javaslatokat</h3>
          <div className="mt-3 space-y-3">
            {visibleSuggestions.map(({ key, label }) => <label key={key} className="flex items-start gap-3 rounded-xl border border-slate-200 p-3">
              <input type="checkbox" checked={selected[key]} onChange={event => setSelected(current => ({ ...current, [key]: event.target.checked }))} className="mt-1" />
              <span className="min-w-0">
                <span className="block text-sm font-semibold text-slate-800">{label}</span>
                <span className="mt-1 block whitespace-pre-wrap text-sm leading-6 text-slate-700">{suggestions?.[key]}</span>
                {currentValues[key] && currentValues[key] !== suggestions?.[key] && <span className="mt-1 block text-xs text-amber-700">A jelenlegi mező értékét lecseréli.</span>}
              </span>
            </label>)}
          </div>
          <button type="button" onClick={applySuggestions}
            className="mt-4 w-full rounded-xl bg-emerald-600 px-4 py-3 font-semibold text-white hover:bg-emerald-700">
            Kijelölt javaslatok alkalmazása
          </button>
        </div>}

        {error && <p role="alert" className="mt-4 rounded-xl bg-red-50 px-4 py-3 text-sm font-medium text-red-700">{error}</p>}
        {success && <p role="status" className="mt-4 rounded-xl bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-800">✓ {success}</p>}
      </div>
    </details>
  );
}
