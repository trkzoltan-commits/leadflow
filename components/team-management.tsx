"use client";

import { type FormEvent, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { roleLabel } from "@/lib/user-preferences";

type Member = { id: string; email: string; role: string; current: boolean };

export function TeamManagement({ isOwner }: { isOwner: boolean }) {
  const [members, setMembers] = useState<Member[]>([]);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState("user");
  const [loading, setLoading] = useState(isOwner);
  const [busy, setBusy] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  async function authorizedFetch(input: string, init?: RequestInit) {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) throw new Error("A munkamenet lejárt. Jelentkezz be újra.");
    const response = await fetch(input, {
      ...init,
      headers: { ...init?.headers, Authorization: `Bearer ${session.access_token}` },
      cache: "no-store",
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || "A művelet nem sikerült.");
    return result;
  }

  useEffect(() => {
    if (!isOwner) return;
    let cancelled = false;
    authorizedFetch("/api/team-members")
      .then((result) => { if (!cancelled) setMembers(result.members || []); })
      .catch((reason) => { if (!cancelled) setError(reason.message); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [isOwner]);

  async function invite(event: FormEvent) {
    event.preventDefault();
    setBusy("invite"); setError(""); setMessage("");
    try {
      const result = await authorizedFetch("/api/team-members", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, role }),
      });
      setMembers((current) => [...current, result.member]);
      setEmail(""); setRole("user");
      setMessage("A meghívó e-mailt elküldtük.");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "A meghívás nem sikerült.");
    } finally { setBusy(""); }
  }

  async function changeRole(memberId: string, nextRole: string) {
    setBusy(memberId); setError(""); setMessage("");
    try {
      await authorizedFetch("/api/team-members", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ memberId, role: nextRole }),
      });
      setMembers((current) => current.map((member) => member.id === memberId ? { ...member, role: nextRole } : member));
      setMessage("A jogosultság frissült.");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "A módosítás nem sikerült.");
    } finally { setBusy(""); }
  }

  if (!isOwner) return null;
  return <section className="mb-6 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
    <h2 className="text-xl font-bold text-slate-900">Munkatársak és jogosultságok</h2>
    <p className="mt-2 text-sm leading-6 text-slate-500">Tulajdonosként meghívhatod a munkatársakat, és beállíthatod, ki kezelheti a céges beállításokat.</p>

    <form onSubmit={invite} className="mt-5 grid gap-3 sm:grid-cols-[1fr_170px_auto]">
      <label className="text-sm font-medium text-slate-700">E-mail-cím
        <input type="email" required maxLength={254} value={email} onChange={(event) => setEmail(event.target.value)} placeholder="munkatars@pelda.hu" className="mt-2 w-full rounded-xl border border-slate-200 px-3 py-2" />
      </label>
      <label className="text-sm font-medium text-slate-700">Szerepkör
        <select value={role} onChange={(event) => setRole(event.target.value)} className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-3 py-2">
          <option value="user">Felhasználó</option><option value="admin">Adminisztrátor</option>
        </select>
      </label>
      <button type="submit" disabled={busy === "invite"} className="accent-bg self-end rounded-xl px-4 py-2 font-semibold text-white disabled:opacity-50">{busy === "invite" ? "Küldés..." : "Meghívás"}</button>
    </form>

    <div className="mt-6 space-y-3">
      {loading && <p className="text-sm text-slate-500">Munkatársak betöltése...</p>}
      {!loading && members.map((member) => <div key={member.id} className="flex flex-col gap-3 rounded-xl bg-slate-50 p-4 sm:flex-row sm:items-center sm:justify-between">
        <div><p className="break-all font-semibold text-slate-900">{member.email}{member.current ? " (te)" : ""}</p><p className="mt-1 text-sm text-slate-500">{roleLabel(member.role)}</p></div>
        {member.role !== "owner" && <select aria-label={`${member.email} szerepköre`} value={member.role} disabled={busy === member.id} onChange={(event) => void changeRole(member.id, event.target.value)} className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 disabled:opacity-50">
          <option value="user">Felhasználó</option><option value="admin">Adminisztrátor</option>
        </select>}
      </div>)}
    </div>
    {message && <p role="status" className="mt-4 rounded-xl bg-green-50 p-3 text-sm font-medium text-green-700">✓ {message}</p>}
    {error && <p role="alert" className="mt-4 rounded-xl bg-red-50 p-3 text-sm font-medium text-red-700">{error}</p>}
  </section>;
}
