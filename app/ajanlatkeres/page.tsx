"use client";

import { useState } from "react";

export default function AjanlatkeresPage() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [service, setService] = useState("");
  const [description, setDescription] = useState("");
  const [location, setLocation] = useState("");

  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    setLoading(true);
    setSuccess(false);
    setError("");

    try {
      const response = await fetch("/api/public-lead", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          name,
          email,
          phone,
          service,
          description,
          location,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(
          data.error || "Nem sikerült elküldeni az érdeklődést."
        );
      }

      setSuccess(true);

      setName("");
      setEmail("");
      setPhone("");
      setService("");
      setDescription("");
      setLocation("");
    } catch (error) {
      setError(
        error instanceof Error
          ? error.message
          : "Ismeretlen hiba történt."
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="min-h-screen bg-slate-50 px-6 py-12">
      <div className="mx-auto max-w-2xl">
        <div className="mb-8 text-center">
          <h1 className="text-3xl font-bold text-slate-900">
            Ajánlatkérés
          </h1>

          <p className="mt-3 text-slate-500">
            Írd meg röviden, miben tudunk segíteni.
          </p>
        </div>

        <form
          onSubmit={handleSubmit}
          className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm md:p-8"
        >
          <div className="space-y-5">
            <div>
              <label className="mb-2 block text-sm font-medium text-slate-700">
                Név *
              </label>

              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                className="w-full rounded-xl border border-slate-200 px-4 py-3 outline-none focus:border-violet-400"
              />
            </div>

            <div className="grid gap-5 md:grid-cols-2">
              <div>
                <label className="mb-2 block text-sm font-medium text-slate-700">
                  E-mail
                </label>

                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full rounded-xl border border-slate-200 px-4 py-3 outline-none focus:border-violet-400"
                />
              </div>

              <div>
                <label className="mb-2 block text-sm font-medium text-slate-700">
                  Telefonszám
                </label>

                <input
                  type="text"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  className="w-full rounded-xl border border-slate-200 px-4 py-3 outline-none focus:border-violet-400"
                />
              </div>
            </div>

            <p className="text-xs text-slate-500">
              Legalább e-mail-címet vagy telefonszámot adj meg.
            </p>

            <div>
              <label className="mb-2 block text-sm font-medium text-slate-700">
                Szolgáltatás
              </label>

              <input
                type="text"
                value={service}
                onChange={(e) => setService(e.target.value)}
                placeholder="Pl. tolókapu, kerítés, előtető"
                className="w-full rounded-xl border border-slate-200 px-4 py-3 outline-none focus:border-violet-400"
              />
            </div>

            <div>
              <label className="mb-2 block text-sm font-medium text-slate-700">
                Helyszín
              </label>

              <input
                type="text"
                value={location}
                onChange={(e) => setLocation(e.target.value)}
                placeholder="Pl. Székesfehérvár"
                className="w-full rounded-xl border border-slate-200 px-4 py-3 outline-none focus:border-violet-400"
              />
            </div>

            <div>
              <label className="mb-2 block text-sm font-medium text-slate-700">
                Rövid leírás
              </label>

              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Írd le röviden az igényt..."
                className="min-h-40 w-full rounded-xl border border-slate-200 px-4 py-3 outline-none focus:border-violet-400"
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full rounded-xl bg-violet-600 px-4 py-3 font-semibold text-white hover:bg-violet-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {loading ? "Küldés..." : "Ajánlatkérés elküldése"}
            </button>

            {success && (
              <div className="rounded-xl bg-green-50 px-4 py-3 text-sm font-medium text-green-700">
                ✓ Köszönjük! Az érdeklődésedet rögzítettük.
              </div>
            )}

            {error && (
              <div className="rounded-xl bg-red-50 px-4 py-3 text-sm font-medium text-red-700">
                {error}
              </div>
            )}
          </div>
        </form>
      </div>
    </main>
  );
}