"use client";

import Link from "next/link";
import { type FormEvent, useState } from "react";
import { supabase } from "@/lib/supabase";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (sending) return;
    setSending(true);
    setError("");
    const redirectTo = `${window.location.origin}/uj-jelszo?recovery=1`;
    const { error: resetError } = await supabase.auth.resetPasswordForEmail(email, { redirectTo });
    setSending(false);
    if (resetError) {
      setError("A helyreállító e-mailt most nem sikerült elküldeni. Próbáld újra később.");
      return;
    }
    setSent(true);
  }

  return <main className="flex min-h-screen items-center justify-center bg-slate-50 p-6">
    <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
      <p className="font-semibold text-violet-600">LeadFlow</p>
      <h1 className="mt-2 text-2xl font-bold text-slate-900">Elfelejtett jelszó</h1>
      {sent ? <>
        <p className="mt-5 rounded-xl bg-emerald-50 p-4 text-sm leading-6 text-emerald-800">
          Ha a címhez tartozik LeadFlow-fiók, elküldtük a jelszó-helyreállító levelet.
        </p>
        <Link href="/login" className="mt-5 inline-block text-sm font-semibold text-violet-700 underline">Vissza a belépéshez</Link>
      </> : <form onSubmit={handleSubmit} className="mt-6 space-y-4">
        <div>
          <label htmlFor="email" className="block text-sm font-medium text-slate-700">E-mail-cím</label>
          <input id="email" type="email" autoComplete="email" required value={email} onChange={event => setEmail(event.target.value)} className="mt-2 w-full rounded-xl border border-slate-200 px-4 py-3 outline-none focus:border-violet-400" />
        </div>
        {error && <p role="alert" className="rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</p>}
        <button type="submit" disabled={sending} className="w-full rounded-xl bg-violet-600 px-4 py-3 font-semibold text-white disabled:opacity-50">
          {sending ? "Küldés..." : "Helyreállító e-mail küldése"}
        </button>
        <div className="text-center"><Link href="/login" className="text-sm font-semibold text-violet-700 underline">Vissza a belépéshez</Link></div>
      </form>}
    </div>
  </main>;
}
