"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";

type Lead = {
  id: string;
  name: string | null;
  email: string | null;
  phone: string | null;
  service: string | null;
  description: string | null;
  location: string | null;
  priority: string | null;
  status: string | null;
  source: string | null;
};

export default function LeadsPage() {
  const router = useRouter();

  const [leads, setLeads] = useState<Lead[]>([]);
  const [loading, setLoading] = useState(true);

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [service, setService] = useState("");
  const [location, setLocation] = useState("");
  const [description, setDescription] = useState("");
  const [priority, setPriority] = useState("medium");

  useEffect(() => {
    async function initializePage() {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session) {
        router.replace("/login");
        return;
      }

      await loadLeads();
      setLoading(false);
    }

    initializePage();
  }, [router]);

  async function loadLeads() {
    const { data, error } = await supabase
      .from("leads")
      .select(
        "id, name, email, phone, service, description, location, priority, status, source"
      )
      .order("created_at", { ascending: false });

    if (error) {
      console.error("Lead betöltési hiba:", error);
      return;
    }

    setLeads(data ?? []);
  }

  async function handleAddLead(e: React.FormEvent) {
    e.preventDefault();

    const {
      data: { session },
    } = await supabase.auth.getSession();

    if (!session) {
      router.replace("/login");
      return;
    }

    const { data: userProfile, error: profileError } = await supabase
      .from("users")
      .select("company_id")
      .eq("id", session.user.id)
      .single();

    if (profileError || !userProfile?.company_id) {
      console.error("Cégazonosító hiba:", profileError);
      return;
    }

    const { error } = await supabase.from("leads").insert({
      company_id: userProfile.company_id,
      name,
      email,
      phone,
      service,
      description,
      location,
      priority,
      status: "new",
      source: "manual",
    });

    if (error) {
      console.error("Lead mentési hiba:", error);
      return;
    }

    setName("");
    setEmail("");
    setPhone("");
    setService("");
    setLocation("");
    setDescription("");
    setPriority("medium");

    await loadLeads();
  }

  function openLead(leadId: string) {
    router.push(`/leads/${leadId}`);
  }

  function getPriorityLabel(priority: string | null) {
    if (priority === "high") return "Magas";
    if (priority === "medium") return "Közepes";
    if (priority === "low") return "Alacsony";

    return "—";
  }

  function getStatusLabel(status: string | null) {
    if (status === "new") return "Új";
    if (status === "waiting") return "Válaszra vár";
    if (status === "processed") return "Feldolgozott";

  return "—";
  }

    function getSourceLabel(source: string | null) {
    if (source === "manual") return "Kézi felvétel";
    if (source === "email") return "E-mail";
    if (source === "web") return "Weboldal";
    if (source === "messenger") return "Messenger";

  return source || "—";
  }
  
  if (loading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-50">
        <div className="text-lg font-semibold text-slate-600">
          Betöltés...
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-slate-50 p-6 md:p-10">
      <div className="mx-auto max-w-7xl">

        <div className="mb-8 flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-slate-900">
              Érdeklődők
            </h1>

            <p className="mt-2 text-slate-500">
              Új érdeklődők felvétele és kezelése
            </p>
          </div>

          <button
            onClick={() => router.push("/")}
            className="rounded-xl border border-slate-200 bg-white px-4 py-2 font-medium shadow-sm hover:bg-slate-50"
          >
            ← Dashboard
          </button>
        </div>

        <div className="grid gap-6 xl:grid-cols-[380px_1fr]">

          {/* ÚJ LEAD */}
          <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <h2 className="mb-6 text-xl font-bold">
              Új érdeklődő
            </h2>

            <form
              onSubmit={handleAddLead}
              className="space-y-4"
            >
              <input
                type="text"
                placeholder="Név"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full rounded-xl border border-slate-200 px-4 py-3 outline-none focus:border-violet-400"
                required
              />

              <input
                type="email"
                placeholder="E-mail"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full rounded-xl border border-slate-200 px-4 py-3 outline-none focus:border-violet-400"
              />

              <input
                type="text"
                placeholder="Telefonszám"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                className="w-full rounded-xl border border-slate-200 px-4 py-3 outline-none focus:border-violet-400"
              />

              <input
                type="text"
                placeholder="Szolgáltatás"
                value={service}
                onChange={(e) => setService(e.target.value)}
                className="w-full rounded-xl border border-slate-200 px-4 py-3 outline-none focus:border-violet-400"
              />

              <input
                type="text"
                placeholder="Helyszín"
                value={location}
                onChange={(e) => setLocation(e.target.value)}
                className="w-full rounded-xl border border-slate-200 px-4 py-3 outline-none focus:border-violet-400"
              />

              <textarea
                placeholder="Leírás"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                className="min-h-28 w-full rounded-xl border border-slate-200 px-4 py-3 outline-none focus:border-violet-400"
              />

              <select
                value={priority}
                onChange={(e) => setPriority(e.target.value)}
                className="w-full rounded-xl border border-slate-200 px-4 py-3 outline-none focus:border-violet-400"
              >
                <option value="low">
                  Alacsony prioritás
                </option>

                <option value="medium">
                  Közepes prioritás
                </option>

                <option value="high">
                  Magas prioritás
                </option>
              </select>

              <button
                type="submit"
                className="w-full rounded-xl bg-violet-600 px-4 py-3 font-semibold text-white hover:bg-violet-700"
              >
                Érdeklődő mentése
              </button>
            </form>
          </div>

          {/* LEAD LISTA */}
          <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">

            <div className="border-b border-slate-100 p-6">
              <h2 className="text-xl font-bold">
                Összes érdeklődő
              </h2>

              <p className="mt-1 text-sm text-slate-500">
                {leads.length} érdeklődő az adatbázisban
              </p>

              <p className="mt-2 text-xs text-slate-400">
                Kattints egy érdeklődőre az adatlap megnyitásához.
              </p>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">

                <thead className="bg-slate-50 text-xs uppercase text-slate-500">
                  <tr>
                    <th className="px-6 py-3">
                      Név
                    </th>

                    <th className="px-6 py-3">
                      Szolgáltatás
                    </th>

                    <th className="px-6 py-3">
                      Helyszín
                    </th>

                    <th className="px-6 py-3">
                      Prioritás
                    </th>

                    <th className="px-6 py-3">
                      Állapot
                    </th>

                    <th className="px-6 py-3">
                      Forrás
                    </th>
                  </tr>
                </thead>

                <tbody>
                  {leads.map((lead) => (
                    <tr
                      key={lead.id}
                      onClick={() => openLead(lead.id)}
                      className="cursor-pointer border-t border-slate-100 transition hover:bg-violet-50"
                    >
                      <td className="px-6 py-4">
                        <div className="font-semibold text-slate-900">
                          {lead.name || "Névtelen érdeklődő"}
                        </div>

                        <div className="text-xs text-slate-400">
                          {lead.phone || lead.email || "—"}
                        </div>
                      </td>

                      <td className="px-6 py-4">
                        {lead.service || "—"}
                      </td>

                      <td className="px-6 py-4">
                        {lead.location || "—"}
                      </td>

                      <td className="px-6 py-4">
                        <span className="rounded-lg bg-slate-100 px-3 py-1 text-xs font-semibold">
                          {getPriorityLabel(lead.priority)}
                        </span>
                      </td>

                      <td className="px-6 py-4">
                        <span className="rounded-lg bg-slate-100 px-3 py-1 text-xs font-semibold">
                          {getStatusLabel(lead.status)}
                        </span>
                      </td>

                      <td className="px-6 py-4">
                        {getSourceLabel(lead.source)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}