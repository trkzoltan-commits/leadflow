"use client";

import { type FormEvent, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";

export default function InvitationPage() {
  const router = useRouter();
  const [checking, setChecking] = useState(true);
  const [ready, setReady] = useState(false);
  const [saving, setSaving] = useState(false);
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    async function checkInvitation() {
      try {
        // The browser client processes the Supabase invite redirect before getUser resolves.
        const { data: { user }, error: authError } = await supabase.auth.getUser();
        if (authError || !user) throw new Error("missing-session");

        const { data: profile, error: profileError } = await supabase
          .from("users")
          .select("company_id")
          .eq("id", user.id)
          .single();
        if (profileError || !profile?.company_id) throw new Error("missing-company");
        if (!cancelled) setReady(true);
      } catch {
        if (!cancelled) setError("A meghívó nem érvényes, lejárt, vagy a fiók még nincs vállalkozáshoz rendelve. Kérj új meghívót az üzemeltetőtől.");
      } finally {
        if (!cancelled) setChecking(false);
      }
    }
    void checkInvitation();
    return () => { cancelled = true; };
  }, []);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving) return;
    setError("");
    if (password.length < 12) {
      setError("A jelszó legalább 12 karakter legyen.");
      return;
    }
    if (password !== confirmation) {
      setError("A két jelszó nem egyezik.");
      return;
    }

    setSaving(true);
    try {
      const { error: updateError } = await supabase.auth.updateUser({ password });
      if (updateError) throw updateError;
    } catch {
      setError("A jelszót nem sikerült beállítani. Próbáld újra, vagy kérj új meghívót.");
      setSaving(false);
      return;
    }
    setSaving(false);
    setPassword("");
    setConfirmation("");
    router.replace("/");
  }

  return <main className="flex min-h-screen items-center justify-center bg-slate-50 p-6">
    <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
      <p className="font-semibold text-violet-600">LeadFlow</p>
      <h1 className="mt-2 text-2xl font-bold text-slate-900">Meghívás elfogadása</h1>
      {checking ? <p className="mt-6 text-slate-600">Meghívás ellenőrzése...</p> : ready ? <>
        <p className="mt-3 text-sm leading-6 text-slate-600">Állíts be saját jelszót a céges fiókodhoz. A jelszót csak te adod meg.</p>
        <form onSubmit={handleSubmit} className="mt-6 space-y-4">
          <div><label htmlFor="password" className="block text-sm font-medium text-slate-700">Új jelszó</label>
            <input id="password" type="password" autoComplete="new-password" minLength={12} required value={password} onChange={event => setPassword(event.target.value)} className="mt-2 w-full rounded-xl border border-slate-200 px-4 py-3 outline-none focus:border-violet-400" /></div>
          <div><label htmlFor="confirmation" className="block text-sm font-medium text-slate-700">Jelszó megerősítése</label>
            <input id="confirmation" type="password" autoComplete="new-password" minLength={12} required value={confirmation} onChange={event => setConfirmation(event.target.value)} className="mt-2 w-full rounded-xl border border-slate-200 px-4 py-3 outline-none focus:border-violet-400" /></div>
          {error && <p role="alert" className="rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</p>}
          <button type="submit" disabled={saving} className="w-full rounded-xl bg-violet-600 px-4 py-3 font-semibold text-white disabled:opacity-50">{saving ? "Mentés..." : "Jelszó beállítása"}</button>
        </form>
      </> : <>
        <p role="alert" className="mt-6 rounded-xl bg-amber-50 p-4 text-sm leading-6 text-amber-900">{error}</p>
        <Link href="/login" className="mt-4 inline-block text-sm font-semibold text-violet-700 underline">Vissza a belépéshez</Link>
      </>}
    </div>
  </main>;
}
