"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";

type AutoReplyMode = "manual" | "safe" | "automatic";

export default function SettingsPage() {
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [error, setError] = useState("");

  const [companyId, setCompanyId] = useState<string | null>(null);
  const [autoReplyMode, setAutoReplyMode] =
    useState<AutoReplyMode>("manual");

  useEffect(() => {
    async function loadSettings() {
      setLoading(true);
      setError("");

      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session) {
        router.replace("/login");
        return;
      }

      const { data: userRow, error: userError } = await supabase
        .from("users")
        .select("company_id")
        .eq("id", session.user.id)
        .single();

      if (userError || !userRow?.company_id) {
        console.error("Felhasználói cég lekérési hiba:", userError);
        setError("Nem sikerült meghatározni a vállalkozást.");
        setLoading(false);
        return;
      }

      setCompanyId(userRow.company_id);

      const { data: settingsRow, error: settingsError } = await supabase
        .from("company_settings")
        .select("auto_reply_mode")
        .eq("company_id", userRow.company_id)
        .single();

      if (settingsError) {
        console.error("Beállítások betöltési hiba:", settingsError);
        setError("Nem sikerült betölteni a beállításokat.");
        setLoading(false);
        return;
      }

      setAutoReplyMode(
        (settingsRow?.auto_reply_mode as AutoReplyMode) || "manual"
      );

      setLoading(false);
    }

    loadSettings();
  }, [router]);

  async function handleSave() {
    if (!companyId) return;

    setSaving(true);
    setSaveSuccess(false);
    setError("");

    const { error: updateError } = await supabase
      .from("company_settings")
      .update({
        auto_reply_mode: autoReplyMode,
        updated_at: new Date().toISOString(),
      })
      .eq("company_id", companyId);

    if (updateError) {
      console.error("Beállítás mentési hiba:", updateError);
      setError("Nem sikerült elmenteni a beállítást.");
      setSaving(false);
      return;
    }

    setSaving(false);
    setSaveSuccess(true);

    setTimeout(() => {
      setSaveSuccess(false);
    }, 2500);
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
      <div className="mx-auto max-w-3xl">
        <div className="mb-8">
          <button
            onClick={() => router.push("/")}
            className="mb-4 text-sm font-medium text-violet-600 hover:text-violet-700"
          >
            ← Vissza a dashboardra
          </button>

          <h1 className="text-3xl font-bold text-slate-900">
            Beállítások
          </h1>

          <p className="mt-2 text-slate-500">
            Automatizálási és AI működési beállítások.
          </p>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="text-xl font-bold text-slate-900">
            AI válaszmód
          </h2>

          <p className="mt-2 text-sm leading-6 text-slate-500">
            Meghatározza, hogy az AI által készített választervezet mikor
            kerülhet automatikusan kiküldésre.
          </p>

          <div className="mt-6 space-y-3">
            <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-slate-200 p-4">
              <input
                type="radio"
                name="autoReplyMode"
                value="manual"
                checked={autoReplyMode === "manual"}
                onChange={() => setAutoReplyMode("manual")}
                className="mt-1"
              />

              <div>
                <div className="font-semibold text-slate-900">
                  Kézi jóváhagyás
                </div>
                <div className="mt-1 text-sm text-slate-500">
                  Az AI elkészíti a választ, de az ügyfél ellenőrzi és
                  jóváhagyja küldés előtt.
                </div>
              </div>
            </label>

            <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-slate-200 p-4">
              <input
                type="radio"
                name="autoReplyMode"
                value="safe"
                checked={autoReplyMode === "safe"}
                onChange={() => setAutoReplyMode("safe")}
                className="mt-1"
              />

              <div>
                <div className="font-semibold text-slate-900">
                  Biztonságos automata
                </div>
                <div className="mt-1 text-sm text-slate-500">
                  Az egyszerű, alacsony kockázatú válaszokat automatikusan
                  elküldjük. A bizonytalan esetek jóváhagyásra várnak.
                </div>
              </div>
            </label>

            <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-slate-200 p-4">
              <input
                type="radio"
                name="autoReplyMode"
                value="automatic"
                checked={autoReplyMode === "automatic"}
                onChange={() => setAutoReplyMode("automatic")}
                className="mt-1"
              />

              <div>
                <div className="font-semibold text-slate-900">
                  Teljes automata
                </div>
                <div className="mt-1 text-sm text-slate-500">
                  Az AI által készített válasz emberi jóváhagyás nélkül
                  automatikusan kiküldésre kerül.
                </div>
              </div>
            </label>
          </div>

          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            className="mt-6 w-full rounded-xl bg-violet-600 px-4 py-3 font-semibold text-white hover:bg-violet-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {saving ? "Mentés..." : "Beállítás mentése"}
          </button>

          {saveSuccess && (
            <div className="mt-4 rounded-xl bg-green-50 px-4 py-3 text-sm font-medium text-green-700">
              ✓ A beállítás elmentve.
            </div>
          )}

          {error && (
            <div className="mt-4 rounded-xl bg-red-50 px-4 py-3 text-sm font-medium text-red-700">
              {error}
            </div>
          )}
        </div>
      </div>
    </main>
  );
}