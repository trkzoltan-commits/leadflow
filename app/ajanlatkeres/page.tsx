"use client";

import { useRouter } from "next/navigation";

export default function AjanlatkeresPage() {
  const router = useRouter();

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-50 px-6 py-12">
      <div className="w-full max-w-xl rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-sm">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-violet-50 text-2xl">
          ✦
        </div>

        <h1 className="mt-6 text-3xl font-bold text-slate-900">
          Ajánlatkérés
        </h1>

        <p className="mt-4 leading-7 text-slate-500">
          Az ajánlatkérő oldal vállalkozásonként külön linken érhető el.
          Kérjük, használd azt a linket, amelyet a szolgáltatótól kaptál.
        </p>

        <div className="mt-6 rounded-xl bg-slate-50 p-4 text-sm leading-6 text-slate-600">
          Ha nem rendelkezel ajánlatkérő linkkel, kérd azt közvetlenül a
          választott szolgáltatótól.
        </div>

        <button
          type="button"
          onClick={() => router.push("/")}
          className="mt-6 rounded-xl border border-slate-200 bg-white px-5 py-3 font-semibold text-slate-700 hover:bg-slate-50"
        >
          Vissza a főoldalra
        </button>
      </div>
    </main>
  );
}