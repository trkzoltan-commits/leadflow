"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";

type Notice = {
  companyName: string;
  companyAddress: string;
  contactEmail: string;
  retentionMonths: number;
  updatedAt: string | null;
  templateVersion: string;
};

export default function PrivacyNoticePage() {
  const slug = useParams().slug as string;
  const [notice, setNotice] = useState<Notice | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    fetch(`/api/public-privacy/${encodeURIComponent(slug)}`, { cache: "no-store" })
      .then(async response => {
        const body = await response.json();
        if (!response.ok) throw new Error(body.error || "A tájékoztató nem érhető el.");
        setNotice(body);
      })
      .catch(reason => setError(reason instanceof Error ? reason.message : "A tájékoztató nem érhető el."));
  }, [slug]);

  if (error) return <main className="flex min-h-screen items-center justify-center bg-slate-50 p-6"><div className="max-w-xl rounded-2xl bg-white p-8 text-center shadow-sm"><h1 className="text-2xl font-bold">Adatkezelési tájékoztató</h1><p className="mt-4 text-slate-600">{error}</p></div></main>;
  if (!notice) return <main className="flex min-h-screen items-center justify-center bg-slate-50">Betöltés…</main>;

  const updated = notice.updatedAt ? new Intl.DateTimeFormat("hu-HU", { dateStyle: "long", timeZone: "Europe/Budapest" }).format(new Date(notice.updatedAt)) : notice.templateVersion;
  return <main className="min-h-screen bg-slate-50 px-4 py-10 text-slate-800 sm:px-6">
    <article className="mx-auto max-w-3xl rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-10">
      <p className="text-sm font-semibold text-blue-700">{notice.companyName}</p>
      <h1 className="mt-2 text-3xl font-bold text-slate-950">Adatkezelési tájékoztató</h1>
      <p className="mt-3 text-sm text-slate-500">Hatályos: {updated}</p>

      <div className="mt-8 space-y-8 leading-7">
        <section><h2 className="text-xl font-bold text-slate-900">1. Az adatkezelő</h2><p className="mt-2"><strong>{notice.companyName}</strong><br />{notice.companyAddress}<br />E-mail: <a className="text-blue-700 underline" href={`mailto:${notice.contactEmail}`}>{notice.contactEmail}</a></p></section>
        <section><h2 className="text-xl font-bold text-slate-900">2. Az adatkezelés célja és jogalapja</h2><p className="mt-2">Az ajánlatkérésben megadott adatokat az érdeklődés megválaszolására, az igény pontosítására, ajánlat készítésére és az ehhez kapcsolódó kapcsolattartásra használjuk. Az adatkezelés jogalapja az érintett kérésére történő, szerződéskötést megelőző lépések megtétele.</p></section>
        <section><h2 className="text-xl font-bold text-slate-900">3. A kezelt adatok</h2><p className="mt-2">A megadott név, e-mail-cím vagy telefonszám, a keresett szolgáltatás, a helyszín, az érdeklődés leírása, valamint a kapcsolattartás során keletkező üzenetek.</p></section>
        <section><h2 className="text-xl font-bold text-slate-900">4. Automatizált támogatás és címzettek</h2><p className="mt-2">Az érdeklődés feldolgozását a LeadFlow rendszer automatizálással és mesterséges intelligenciával támogatja: összefoglalót, kockázatértékelést és választervezetet készíthet. A működéshez tárhely-, adatbázis-, automatizálási, mesterségesintelligencia- és e-mail-szolgáltatók adatfeldolgozóként vehetnek részt. A vállalkozás a LeadFlow beállításaitól függően emberi ellenőrzést alkalmazhat a válasz elküldése előtt.</p></section>
        <section><h2 className="text-xl font-bold text-slate-900">5. Megőrzési idő</h2><p className="mt-2">Az ajánlatkéréshez és a kapcsolattartáshoz tartozó adatokat legfeljebb <strong>{notice.retentionMonths} hónapig</strong> őrizzük meg, kivéve, ha jogszabály vagy létrejött szerződés alapján hosszabb megőrzés szükséges.</p></section>
        <section><h2 className="text-xl font-bold text-slate-900">6. Az érintett jogai</h2><p className="mt-2">Az érintett tájékoztatást és hozzáférést kérhet, kérheti adatainak helyesbítését, törlését vagy kezelésük korlátozását, továbbá az alkalmazott jogalaptól függően tiltakozhat az adatkezelés ellen. A kérelmeket a fenti kapcsolattartási címen lehet benyújtani. Panasz a Nemzeti Adatvédelmi és Információszabadság Hatóságnál is tehető.</p></section>
      </div>
      <p className="mt-10 border-t border-slate-200 pt-5 text-xs text-slate-500">A tájékoztató a {notice.companyName} által megadott adatok alapján készült a LeadFlow rendszerben.</p>
    </article>
  </main>;
}
