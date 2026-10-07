"use client";

import { useEffect, useState } from "react";
import { LEAD_NOTE_MAX_LENGTH } from "@/lib/lead-notes";
import { supabase } from "@/lib/supabase";

type LeadNote = {
  id: string;
  leadId: string;
  authorUserId: string;
  authorEmail: string;
  content: string;
  createdAt: string;
};

async function authorizedFetch(input: string, init?: RequestInit) {
  const requestWithToken = async (accessToken: string) => fetch(input, {
    ...init,
    headers: { ...init?.headers, Authorization: `Bearer ${accessToken}` },
  });

  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error("A munkamenet lejárt. Jelentkezz be újra.");

  const response = await requestWithToken(session.access_token);
  if (response.status !== 401) return response;

  const { data: refreshed, error } = await supabase.auth.refreshSession();
  if (error || !refreshed.session) return response;
  return requestWithToken(refreshed.session.access_token);
}

function displayNoteDate(value: string) {
  return new Intl.DateTimeFormat("hu-HU", {
    timeZone: "Europe/Budapest",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

export function LeadNotes({ leadId }: { leadId: string }) {
  const [notes, setNotes] = useState<LeadNote[]>([]);
  const [content, setContent] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  useEffect(() => {
    let cancelled = false;

    async function fetchNotes() {
      const response = await authorizedFetch(`/api/lead-notes?leadId=${encodeURIComponent(leadId)}`, {
        cache: "no-store",
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error || "A belső megjegyzések nem tölthetők be.");
      return Array.isArray(result.notes) ? result.notes : [];
    }

    fetchNotes()
      .then((loadedNotes) => {
        if (cancelled) return;
        setNotes(loadedNotes);
        setError("");
      })
      .catch((reason) => {
        if (!cancelled) setError(reason instanceof Error ? reason.message : "A belső megjegyzések nem tölthetők be.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => { cancelled = true; };
  }, [leadId]);

  async function addNote() {
    const trimmedContent = content.trim();
    if (!trimmedContent || trimmedContent.length > LEAD_NOTE_MAX_LENGTH) return;

    setSaving(true);
    setError("");
    setSuccess("");
    let response: Response;
    try {
      response = await authorizedFetch("/api/lead-notes", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ leadId, content: trimmedContent }),
      });
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "A megjegyzés mentéséhez jelentkezz be újra.");
      setSaving(false);
      return;
    }
    const result = await response.json().catch(() => ({}));
    if (!response.ok) {
      setError(result.error || "A belső megjegyzés mentése nem sikerült.");
      setSaving(false);
      return;
    }

    setNotes((current) => [result.note, ...current.filter((note) => note.id !== result.note.id)]);
    setContent("");
    setSuccess("A belső megjegyzés elmentve.");
    setSaving(false);
  }

  const remaining = LEAD_NOTE_MAX_LENGTH - content.length;

  return (
    <section id="internal-notes" className="rounded-2xl border border-amber-200 bg-white p-6 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold text-slate-900">Belső megjegyzések</h2>
          <p className="mt-1 text-sm leading-6 text-slate-600">
            Csak a belső csapat látja. Nem kerül AI-feldolgozásba, e-mailbe vagy Make-be.
          </p>
        </div>
        <span className="rounded-full bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-800">
          {notes.length} megjegyzés
        </span>
      </div>

      <div className="mt-5">
        <label htmlFor="lead-note-content" className="mb-2 block text-sm font-semibold text-slate-700">
          Új belső megjegyzés
        </label>
        <textarea
          id="lead-note-content"
          value={content}
          onChange={(event) => {
            setContent(event.target.value);
            setSuccess("");
          }}
          maxLength={LEAD_NOTE_MAX_LENGTH}
          rows={4}
          placeholder="Például: Telefonon egyeztettünk, péntekig visszajelez."
          className="w-full resize-y rounded-xl border border-slate-200 px-4 py-3 leading-6 outline-none focus:border-amber-400"
        />
        <div className="mt-2 flex flex-wrap items-center justify-between gap-3">
          <span className="text-xs text-slate-500">{remaining} karakter maradt</span>
          <button
            type="button"
            onClick={addNote}
            disabled={saving || !content.trim()}
            className="rounded-xl bg-amber-500 px-4 py-2.5 text-sm font-semibold text-white hover:bg-amber-600 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {saving ? "Mentés..." : "Megjegyzés hozzáadása"}
          </button>
        </div>
      </div>

      {error && <p role="alert" className="mt-4 rounded-xl bg-red-50 px-4 py-3 text-sm font-medium text-red-700">{error}</p>}
      {success && <p role="status" className="mt-4 rounded-xl bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-700">✓ {success}</p>}

      {loading ? (
        <p className="mt-6 text-sm text-slate-500">Megjegyzések betöltése...</p>
      ) : notes.length === 0 ? (
        <p className="mt-6 rounded-xl bg-slate-50 p-4 text-sm text-slate-500">Még nincs belső megjegyzés ehhez az érdeklődőhöz.</p>
      ) : (
        <div className="mt-6 space-y-3">
          {notes.map((note) => (
            <article key={note.id} className="rounded-xl border border-slate-200 bg-slate-50 p-4">
              <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500">
                <span className="font-semibold text-slate-700">{note.authorEmail}</span>
                <time dateTime={note.createdAt}>{displayNoteDate(note.createdAt)}</time>
              </div>
              <p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-slate-700">{note.content}</p>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
