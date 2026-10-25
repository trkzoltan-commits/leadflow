"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import type { OnboardingChecklistItems, OnboardingChecklistStatus } from "@/lib/onboarding-checklist";

type DestinationSection = "company" | "team" | "messages" | "privacy" | "automation";

type OnboardingChecklistProps = {
  companySlug: string;
  onSelectSection: (section: DestinationSection) => void;
};

const modeLabels = { manual: "Kézi jóváhagyás", safe: "Biztonságos automata", automatic: "Automatikus", unknown: "Nincs beállítva" } as const;

async function fetchOnboardingStatus() {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error("A munkamenet lejárt. Jelentkezz be újra.");
  const response = await fetch("/api/onboarding-checklist", {
    headers: { Authorization: `Bearer ${session.access_token}` },
    cache: "no-store",
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(result.error || "Az indulási állapot nem tölthető be.");
  return result as OnboardingChecklistStatus;
}

export function OnboardingChecklist({ companySlug, onSelectSection }: OnboardingChecklistProps) {
  const [status, setStatus] = useState<OnboardingChecklistStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  async function refreshStatus() {
    setLoading(true);
    setError("");
    try {
      setStatus(await fetchOnboardingStatus());
    } catch (statusError) {
      setStatus(null);
      setError(statusError instanceof Error ? statusError.message : "Az indulási állapot nem tölthető be.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    let cancelled = false;
    async function loadInitialStatus() {
      try {
        const result = await fetchOnboardingStatus();
        if (!cancelled) setStatus(result);
      } catch (statusError) {
        if (!cancelled) setError(statusError instanceof Error ? statusError.message : "Az indulási állapot nem tölthető be.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void loadInitialStatus();
    return () => { cancelled = true; };
  }, []);

  if (loading) {
    return <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm"><p className="font-semibold text-slate-600">Indulási állapot betöltése…</p></section>;
  }
  if (error || !status) {
    return <section className="rounded-2xl border border-red-200 bg-white p-6 shadow-sm">
      <h2 className="text-xl font-bold text-slate-900">Indulási ellenőrzőlista</h2>
      <p role="alert" className="mt-3 rounded-xl bg-red-50 p-4 text-sm font-medium text-red-700">{error || "Az állapot nem érhető el."}</p>
      <button type="button" onClick={() => void refreshStatus()} className="mt-4 rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-700">Újrapróbálás</button>
    </section>;
  }

  const checklist: Array<{
    key: keyof OnboardingChecklistItems;
    title: string;
    description: string;
    action?: { label: string; section?: DestinationSection; href?: string };
  }> = [
    {
      key: "companyProfile", title: "Vállalkozás és arculat",
      description: status.details.logoConfigured ? "A cégnév, ajánlatkérő és logó be van állítva." : "A cégnév és ajánlatkérő rendben van. A logó opcionálisan még hozzáadható.",
      action: { label: "Vállalkozás megnyitása", section: "company" },
    },
    {
      key: "emailSignature", title: "Céges e-mail-aláírás",
      description: "A kimenő levelekhez engedélyezett aláírás, név vagy cégnév és kapcsolati e-mail szükséges.",
      action: { label: "Üzenetek megnyitása", section: "messages" },
    },
    {
      key: "privacyNotice", title: "Adatkezelési tájékoztató",
      description: "Az ajánlatkérőn aktív tájékoztatóhoz kapcsolattartó, cím és megőrzési idő tartozik.",
      action: { label: "Adatvédelem megnyitása", section: "privacy" },
    },
    {
      key: "replyMode", title: "Válaszkezelési mód",
      description: `Jelenlegi működés: ${modeLabels[status.details.replyMode]}.`,
      action: { label: "Üzenetek megnyitása", section: "messages" },
    },
    {
      key: "teamAccess", title: "Csapat és hozzáférések",
      description: `${status.details.activeMemberCount} aktív felhasználó fér hozzá ehhez a vállalkozáshoz.`,
      action: { label: "Csapat megnyitása", section: "team" },
    },
    {
      key: "makeConnection", title: "Saját Make-kapcsolat",
      description: "A kapcsolat csak aktív céges kulccsal és mindkét esemény biztonságos útvonalával kész.",
      action: { label: "Automatizálás megnyitása", section: "automation" },
    },
    {
      key: "newLeadTest", title: "Bejövő érdeklődés próbája",
      description: "A publikus ajánlatkérés, a LeadFlow-rekord és a belső értesítés élő próbája.",
      action: { label: "Teszt ajánlatkérő", href: `/ajanlatkeres/${companySlug}` },
    },
    {
      key: "approvedReplyTest", title: "Jóváhagyott válasz próbája",
      description: "A válasz elküldése, kézbesítése és LeadFlow-visszaigazolása ellenőrizve van.",
      action: { label: "Érdeklődők megnyitása", href: "/leads" },
    },
    {
      key: "securityReview", title: "LeadFlow biztonsági ellenőrzése",
      description: "A tulajdonosi belépést és a cégek közötti adat- és Make-izolációt a LeadFlow üzemeltetője ellenőrzi.",
    },
  ];
  const progress = Math.round((status.completed / status.total) * 100);

  return <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
    <div className="flex flex-wrap items-start justify-between gap-4">
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-blue-600">Tulajdonosi nézet</p>
        <h2 className="mt-1 text-2xl font-bold text-slate-900">Indulási ellenőrzőlista</h2>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">Egy helyen láthatod, mi szükséges a vállalkozás biztonságos pilotindításához.</p>
      </div>
      <button type="button" onClick={() => void refreshStatus()} className="rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50">Állapot frissítése</button>
    </div>

    <div className={`mt-6 rounded-2xl border p-5 ${status.ready ? "border-emerald-200 bg-emerald-50" : "border-blue-200 bg-blue-50"}`}>
      <div className="flex items-end justify-between gap-4">
        <div>
          <p className="text-sm font-semibold text-slate-700">{status.ready ? "A vállalkozás pilotra kész" : "Beállítás folyamatban"}</p>
          <p className="mt-1 text-3xl font-bold text-slate-950">{status.completed}/{status.total}</p>
        </div>
        <span className="text-sm font-bold text-slate-700">{progress}%</span>
      </div>
      <div role="progressbar" aria-label="Onboarding készültség" aria-valuemin={0} aria-valuemax={100} aria-valuenow={progress}
        className="mt-4 h-2 overflow-hidden rounded-full bg-white/80">
        <div className="h-full rounded-full bg-emerald-500 transition-[width]" style={{ width: `${progress}%` }} />
      </div>
    </div>

    <div className="mt-6 grid gap-3 lg:grid-cols-2">
      {checklist.map(item => {
        const complete = status.items[item.key];
        return <article key={item.key} className={`rounded-2xl border p-4 ${complete ? "border-emerald-200 bg-emerald-50/50" : "border-amber-200 bg-amber-50/60"}`}>
          <div className="flex items-start gap-3">
            <span aria-hidden="true" className={`mt-0.5 flex h-7 w-7 flex-none items-center justify-center rounded-full text-sm font-bold ${complete ? "bg-emerald-600 text-white" : "bg-amber-200 text-amber-900"}`}>{complete ? "✓" : "!"}</span>
            <div className="min-w-0">
              <h3 className="font-bold text-slate-900">{item.title}</h3>
              <p className="mt-1 text-sm leading-6 text-slate-600">{item.description}</p>
              {item.action?.section && <button type="button" onClick={() => onSelectSection(item.action!.section!)} className="mt-3 text-sm font-semibold text-blue-700 hover:text-blue-900">{item.action.label} →</button>}
              {item.action?.href && <Link href={item.action.href} className="mt-3 inline-block text-sm font-semibold text-blue-700 hover:text-blue-900">{item.action.label} →</Link>}
            </div>
          </div>
        </article>;
      })}
    </div>
  </section>;
}
