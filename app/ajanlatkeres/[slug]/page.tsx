"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";

type PublicCompany = {
  name: string;
  slug: string;
  logo_url: string | null;
  brand_primary: string | null;
  brand_secondary: string | null;
};

const DEFAULT_PRIMARY = "#5FA8D3";
const DEFAULT_SECONDARY = "#DCEFF8";

function validColor(color: string | null, fallback: string) {
  if (color && /^#[0-9A-Fa-f]{6}$/.test(color)) {
    return color;
  }

  return fallback;
}

export default function AjanlatkeresPage() {
  const params = useParams();
  const companySlug = params.slug as string;

  const [company, setCompany] = useState<PublicCompany | null>(null);
  const [companyLoading, setCompanyLoading] = useState(true);
  const [companyError, setCompanyError] = useState("");

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [service, setService] = useState("");
  const [description, setDescription] = useState("");
  const [location, setLocation] = useState("");

  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    async function loadCompany() {
      try {
        setCompanyLoading(true);
        setCompanyError("");

        const response = await fetch(
          `/api/public-company/${encodeURIComponent(companySlug)}`
        );

        const data = await response.json();

        if (!response.ok) {
          throw new Error(
            data.error || "Nem sikerült betölteni a vállalkozás adatait."
          );
        }

        setCompany(data.company);
      } catch (error) {
        setCompanyError(
          error instanceof Error
            ? error.message
            : "Ismeretlen hiba történt."
        );
      } finally {
        setCompanyLoading(false);
      }
    }

    if (companySlug) {
      loadCompany();
    }
  }, [companySlug]);

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
          company_slug: companySlug,
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

  if (companyLoading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-50 px-6">
        <div className="text-lg font-semibold text-slate-600">
          Betöltés...
        </div>
      </main>
    );
  }

  if (companyError || !company) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-50 px-6">
        <div className="w-full max-w-xl rounded-2xl border border-red-100 bg-white p-8 text-center shadow-sm">
          <h1 className="text-2xl font-bold text-slate-900">
            Az ajánlatkérő oldal nem érhető el
          </h1>

          <p className="mt-4 text-slate-500">
            {companyError || "A vállalkozás nem található."}
          </p>
        </div>
      </main>
    );
  }

  const primaryColor = validColor(
    company.brand_primary,
    DEFAULT_PRIMARY
  );

  const secondaryColor = validColor(
    company.brand_secondary,
    DEFAULT_SECONDARY
  );

  return (
    <main
      className="min-h-screen px-6 py-12"
      style={{
        backgroundColor: `${secondaryColor}55`,
      }}
    >
      <div className="mx-auto max-w-2xl">

        {/* CÉGES FEJLÉC */}
        <div className="mb-8 text-center">

          {company.logo_url && (
            <div className="mb-5 flex justify-center">
              <img
                src={company.logo_url}
                alt={`${company.name} logó`}
                className="max-h-24 max-w-[260px] object-contain"
              />
            </div>
          )}

          <div
            className="inline-block rounded-2xl px-6 py-3 text-2xl font-bold tracking-wide md:text-3xl"
            style={{
              color: primaryColor,
              backgroundColor: secondaryColor,
            }}
          >
            {company.name}
          </div>

          <h1 className="mt-5 text-3xl font-bold text-slate-900">
            Ajánlatkérés
          </h1>

          <p className="mt-3 text-slate-500">
            Írd meg röviden, miben tudunk segíteni.
          </p>
        </div>

        {/* ŰRLAP */}
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
                className="w-full rounded-xl border border-slate-200 px-4 py-3 outline-none transition"
                onFocus={(e) => {
                  e.currentTarget.style.borderColor = primaryColor;
                }}
                onBlur={(e) => {
                  e.currentTarget.style.borderColor = "";
                }}
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
                  className="w-full rounded-xl border border-slate-200 px-4 py-3 outline-none transition"
                  onFocus={(e) => {
                    e.currentTarget.style.borderColor = primaryColor;
                  }}
                  onBlur={(e) => {
                    e.currentTarget.style.borderColor = "";
                  }}
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
                  className="w-full rounded-xl border border-slate-200 px-4 py-3 outline-none transition"
                  onFocus={(e) => {
                    e.currentTarget.style.borderColor = primaryColor;
                  }}
                  onBlur={(e) => {
                    e.currentTarget.style.borderColor = "";
                  }}
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
                className="w-full rounded-xl border border-slate-200 px-4 py-3 outline-none transition"
                onFocus={(e) => {
                  e.currentTarget.style.borderColor = primaryColor;
                }}
                onBlur={(e) => {
                  e.currentTarget.style.borderColor = "";
                }}
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
                className="w-full rounded-xl border border-slate-200 px-4 py-3 outline-none transition"
                onFocus={(e) => {
                  e.currentTarget.style.borderColor = primaryColor;
                }}
                onBlur={(e) => {
                  e.currentTarget.style.borderColor = "";
                }}
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
                className="min-h-40 w-full rounded-xl border border-slate-200 px-4 py-3 outline-none transition"
                onFocus={(e) => {
                  e.currentTarget.style.borderColor = primaryColor;
                }}
                onBlur={(e) => {
                  e.currentTarget.style.borderColor = "";
                }}
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full rounded-xl px-4 py-3 font-semibold text-white transition hover:brightness-95 disabled:cursor-not-allowed disabled:opacity-50"
              style={{
                backgroundColor: primaryColor,
              }}
            >
              {loading
                ? "Küldés..."
                : "Ajánlatkérés elküldése"}
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

        <div className="mt-6 text-center text-xs text-slate-400">
          Powered by LeadFlow
        </div>
      </div>
    </main>
  );
}