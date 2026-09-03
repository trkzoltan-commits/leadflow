"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";

const activities = [
  ["🟢", "Új érdeklődő érkezett", "Szabó Éva – Kerti előtető", "10:42"],
  ["💬", "AI válasz elkészült", "Kovács Péter részére", "10:15"],
  ["🕒", "Válasz érkezett az ügyféltől", "Nagy János – Kerítés", "09:58"],
  ["📄", "Ajánlat megnyitva", "Tóth Gábor – Tolókapu", "09:21"],
];

type Lead = {
  id: string;
  name: string | null;
  phone: string | null;
  service: string | null;
  source: string | null;
  priority: string | null;
  status: string | null;
};

export default function Home() {
  const router = useRouter();

  const [dbLeads, setDbLeads] = useState<Lead[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function initializeDashboard() {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session) {
        router.replace("/login");
        return;
      }

      const { data, error } = await supabase
        .from("leads")
        .select("id, name, phone, service, source, priority, status")
        .order("created_at", { ascending: false });

      if (error) {
        console.error("Supabase hiba:", error);
      } else {
        setDbLeads(data ?? []);
      }

      setLoading(false);
    }

    initializeDashboard();
  }, [router]);

  async function handleLogout() {
    await supabase.auth.signOut();
    router.replace("/login");
  }

  const totalLeads = dbLeads.length;

  const newLeads = dbLeads.filter(
    (lead) => lead.status === "new"
  ).length;

  const waitingLeads = dbLeads.filter(
    (lead) => lead.status === "waiting"
  ).length;

  const processedLeads = dbLeads.filter(
    (lead) => lead.status === "processed"
  ).length;

  const kpis = [
    {
      icon: "👥",
      number: totalLeads,
      title: "Összes érdeklődő",
      sub: "Adatbázisban",
    },
    {
      icon: "✨",
      number: newLeads,
      title: "Új érdeklődő",
      sub: "Feldolgozásra vár",
    },
    {
      icon: "🕒",
      number: waitingLeads,
      title: "Válaszra vár",
      sub: "Folyamatban",
    },
    {
      icon: "✅",
      number: processedLeads,
      title: "Feldolgozott",
      sub: "Lezárt feldolgozás",
    },
  ];

  if (loading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#f7f8fc]">
        <div className="text-lg font-semibold text-slate-600">
          Betöltés...
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[#f7f8fc] text-slate-900">
      <div className="flex min-h-screen">

        {/* SIDEBAR */}
        <aside className="hidden w-64 flex-col border-r border-slate-200 bg-white p-5 lg:flex">
          <div className="mb-10 flex items-center gap-3 text-2xl font-bold">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-violet-600 text-white">
              ✦
            </div>

            LeadFlow
          </div>

          <nav className="space-y-2 text-sm font-medium">
            <div className="rounded-xl bg-violet-50 px-4 py-3 text-violet-700">
              🏠 &nbsp; Dashboard
            </div>

            <button
              onClick={() => router.push("/leads")}
              className="w-full rounded-xl px-4 py-3 text-left hover:bg-slate-50"
            >
              👥 &nbsp; Érdeklődők
            </button>

            <div className="flex justify-between px-4 py-3">
              <span>💬 &nbsp; Üzenetek</span>

              <span className="rounded-full bg-violet-600 px-2 text-xs text-white">
                5
              </span>
            </div>

            <div className="px-4 py-3">
              📄 &nbsp; Ajánlatok
            </div>

            <div className="px-4 py-3">
              📊 &nbsp; Statisztikák
            </div>

            <div className="px-4 py-3">
              📅 &nbsp; Naptár
            </div>

            <div className="my-4 border-t border-slate-200" />

            <div className="px-4 py-3">
              ⚙️ &nbsp; Beállítások
            </div>

            <div className="px-4 py-3">
              🔌 &nbsp; Integrációk
            </div>

            <div className="px-4 py-3">
              ❔ &nbsp; Súgó
            </div>
          </nav>

          <div className="mt-auto rounded-xl bg-slate-50 p-4">
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-full bg-violet-600 text-white">
                P
              </div>

              <div>
                <div className="text-sm font-semibold">
                  Péter Kovács
                </div>

                <div className="text-xs text-slate-500">
                  Kovács Kaputechnika Kft.
                </div>
              </div>
            </div>

            <button
              onClick={handleLogout}
              className="mt-4 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium hover:bg-slate-100"
            >
              Kijelentkezés
            </button>
          </div>
        </aside>

        {/* CONTENT */}
        <section className="flex-1 p-5 md:p-8 xl:p-10">

          {/* HEADER */}
          <header className="mb-8 flex items-start justify-between">
            <div>
              <h1 className="text-3xl font-bold">
                Jó reggelt, Péter! 👋
              </h1>

              <p className="mt-2 text-slate-500">
                Áttekintés az érdeklődőkről és feladatokról
              </p>
            </div>

            <div className="hidden gap-3 sm:flex">
              <button className="rounded-xl border border-slate-200 bg-white px-4 py-2 shadow-sm">
                🔔
              </button>

              <button className="rounded-xl border border-slate-200 bg-white px-4 py-2 shadow-sm">
                ⚙️
              </button>
            </div>
          </header>

          {/* KPI */}
          <div className="mb-7 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {kpis.map((kpi) => (
              <div
                key={kpi.title}
                className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"
              >
                <div className="flex items-start gap-4">
                  <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-violet-50 text-xl">
                    {kpi.icon}
                  </div>

                  <div>
                    <div className="text-3xl font-bold">
                      {kpi.number}
                    </div>

                    <div className="font-semibold">
                      {kpi.title}
                    </div>

                    <div className="text-sm text-slate-500">
                      {kpi.sub}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>

          <div className="grid gap-6 xl:grid-cols-[2fr_1fr]">

            {/* LEFT */}
            <div className="space-y-6">

              {/* CHART */}
              <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
                <div className="mb-6 flex justify-between">
                  <h2 className="font-bold">
                    Érdeklődők áttekintése
                  </h2>

                  <button className="rounded-lg border border-slate-200 px-3 py-2 text-sm">
                    Utolsó 7 nap
                  </button>
                </div>

                <div className="flex h-52 items-end gap-3">
                  {[48, 62, 42, 78, 51, 66, 82].map((height, i) => (
                    <div
                      key={i}
                      className="flex flex-1 flex-col items-center gap-2"
                    >
                      <div className="text-xs font-semibold">
                        {[6, 7, 5, 8, 6, 7, 8][i]}
                      </div>

                      <div
                        className="w-full rounded-t-lg bg-gradient-to-t from-violet-100 to-violet-500"
                        style={{ height: `${height}%` }}
                      />

                      <div className="text-xs text-slate-400">
                        {["14", "15", "16", "17", "18", "19", "20"][i]}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* LEADS */}
              <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
                <div className="flex items-center justify-between p-6">
                  <h2 className="font-bold">
                    Legújabb érdeklődők
                  </h2>

                  <button
                    onClick={() => router.push("/leads")}
                    className="text-sm font-medium text-violet-600"
                  >
                    Összes megtekintése →
                  </button>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-left text-sm">
                    <thead className="border-y border-slate-100 bg-slate-50 text-xs uppercase text-slate-500">
                      <tr>
                        <th className="px-6 py-3">
                          Név
                        </th>

                        <th className="px-6 py-3">
                          Szolgáltatás
                        </th>

                        <th className="px-6 py-3">
                          Érték
                        </th>

                        <th className="px-6 py-3">
                          Forrás
                        </th>

                        <th className="px-6 py-3">
                          Érkezett
                        </th>

                        <th className="px-6 py-3">
                          Állapot
                        </th>
                      </tr>
                    </thead>

                    <tbody>
                      {dbLeads.map((lead) => (
                        <tr
                          key={lead.id}
                          className="cursor-pointer border-b border-slate-100 hover:bg-slate-50"
                        >
                          <td className="px-6 py-4">
                            <div className="font-semibold">
                              {lead.name}
                            </div>

                            <div className="text-xs text-slate-400">
                              {lead.phone}
                            </div>
                          </td>

                          <td className="px-6 py-4">
                            <div className="font-medium">
                              {lead.service}
                            </div>

                            <div className="text-xs text-slate-400">
                              {lead.source}
                            </div>
                          </td>

                          <td className="px-6 py-4">
                            <span className="rounded-lg bg-slate-100 px-3 py-1 text-xs font-semibold">
                              {lead.priority}
                            </span>
                          </td>

                          <td className="px-6 py-4">
                            {lead.source}
                          </td>

                          <td className="px-6 py-4">
                            —
                          </td>

                          <td className="px-6 py-4">
                            <span className="rounded-lg bg-slate-100 px-3 py-1 text-xs font-semibold">
                              {lead.status}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>

            {/* RIGHT */}
            <div className="space-y-6">

              <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
                <h2 className="mb-5 font-bold">
                  Legutóbbi tevékenységek
                </h2>

                <div className="space-y-5">
                  {activities.map(
                    ([icon, title, description, time]) => (
                      <div
                        key={title}
                        className="flex gap-3"
                      >
                        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-slate-50">
                          {icon}
                        </div>

                        <div className="min-w-0 flex-1">
                          <div className="font-semibold">
                            {title}
                          </div>

                          <div className="text-sm text-slate-500">
                            {description}
                          </div>
                        </div>

                        <div className="text-xs text-slate-400">
                          {time}
                        </div>
                      </div>
                    )
                  )}
                </div>
              </div>

              <div className="rounded-2xl bg-gradient-to-br from-violet-600 to-purple-500 p-6 text-white shadow-lg">
                <div className="mb-4 text-lg font-bold">
                  ✨ AI tipp a mai napra
                </div>

                <p className="leading-7 text-violet-50">
                  3 érdeklődőnél hiányosak az adatok. Küldj automatikus
                  kérdéseket, hogy gyorsabban tudj ajánlatot adni.
                </p>

                <button
                  onClick={() => router.push("/leads")}
                  className="mt-6 rounded-xl bg-white px-4 py-3 font-semibold text-violet-700"
                >
                  Érdeklődők megtekintése
                </button>
              </div>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}