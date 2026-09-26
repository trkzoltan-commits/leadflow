"use client";

import Link from "next/link";
import { type FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { readRecoveryCredentials } from "@/lib/invitation-session";
import { supabase } from "@/lib/supabase";

export default function NewPasswordPage() {
  const router = useRouter();
  const [checking, setChecking] = useState(true);
  const [userId, setUserId] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    async function checkRecovery() {
      try {
        const credentials = readRecoveryCredentials(window.location.href);
        if (!credentials) throw new Error("missing-recovery");
        if (credentials.kind === "tokens") {
          const { error: sessionError } = await supabase.auth.setSession({ access_token: credentials.accessToken, refresh_token: credentials.refreshToken });
          if (sessionError) throw sessionError;
        } else {
          const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(credentials.code);
          if (exchangeError) throw exchangeError;
        }
        const { data: { user }, error: authError } = await supabase.auth.getUser();
        if (authError || !user?.email) throw new Error("missing-user");
        if (!cancelled) {
          setUserId(user.id);
          setEmail(user.email);
          window.history.replaceState({}, "", "/uj-jelszo");
        }
      } catch {
        if (!cancelled) setError("A helyreállító link nem érvényes vagy lejárt. Kérj új e-mailt.");
      } finally {
        if (!cancelled) setChecking(false);
      }
    }
    void checkRecovery();
    return () => { cancelled = true; };
  }, []);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving) return;
    setError("");
    if (password.length < 12) return setError("A jelszó legalább 12 karakter legyen.");
    if (password !== confirmation) return setError("A két jelszó nem egyezik.");
    setSaving(true);
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user || user.id !== userId || user.email !== email) {
      setError("A helyreállító munkamenet megváltozott. Kérj új e-mailt.");
      setSaving(false);
      return;
    }
    const { error: updateError } = await supabase.auth.updateUser({ password });
    setSaving(false);
    if (updateError) return setError("Az új jelszót nem sikerült menteni. Kérj új helyreállító e-mailt.");
    router.replace("/");
  }

  const ready = Boolean(userId && email && !error);
  return <main className="flex min-h-screen items-center justify-center bg-slate-50 p-6">
    <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
      <p className="font-semibold text-violet-600">LeadFlow</p>
      <h1 className="mt-2 text-2xl font-bold text-slate-900">Új jelszó beállítása</h1>
      {checking ? <p className="mt-6 text-slate-600">Helyreállító link ellenőrzése...</p> : ready ? <>
        <div className="mt-4 rounded-xl bg-violet-50 p-4"><p className="text-xs font-semibold uppercase tracking-wide text-violet-600">Fiók e-mail-címe</p><p className="mt-1 break-all font-semibold text-slate-900">{email}</p></div>
        <form onSubmit={handleSubmit} className="mt-6 space-y-4">
          <input type="password" aria-label="Új jelszó" placeholder="Új jelszó" autoComplete="new-password" minLength={12} required value={password} onChange={event => setPassword(event.target.value)} className="w-full rounded-xl border border-slate-200 px-4 py-3 outline-none focus:border-violet-400" />
          <input type="password" aria-label="Jelszó megerősítése" placeholder="Jelszó megerősítése" autoComplete="new-password" minLength={12} required value={confirmation} onChange={event => setConfirmation(event.target.value)} className="w-full rounded-xl border border-slate-200 px-4 py-3 outline-none focus:border-violet-400" />
          {error && <p role="alert" className="rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</p>}
          <button type="submit" disabled={saving} className="w-full rounded-xl bg-violet-600 px-4 py-3 font-semibold text-white disabled:opacity-50">{saving ? "Mentés..." : "Új jelszó mentése"}</button>
        </form>
      </> : <><p role="alert" className="mt-6 rounded-xl bg-amber-50 p-4 text-sm leading-6 text-amber-900">{error}</p><Link href="/elfelejtett-jelszo" className="mt-4 inline-block text-sm font-semibold text-violet-700 underline">Új helyreállító e-mail kérése</Link></>}
    </div>
  </main>;
}
