"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { applyPreferences, readLocalPreferences } from "@/components/theme-preferences";
import { normalizePreferences, roleLabel, type AccentTheme, type ColorMode } from "@/lib/user-preferences";

type AutoReplyMode = "manual" | "safe" | "automatic";
type MakeConnectionStatus = "company_active" | "legacy" | "setup_required";

export default function SettingsPage() {
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [error, setError] = useState("");

  const [companyId, setCompanyId] = useState<string | null>(null);
  const [companyName, setCompanyName] = useState("");
  const [companySlug, setCompanySlug] = useState("");
  const [userId, setUserId] = useState("");
  const [userEmail, setUserEmail] = useState("");
  const [userRole, setUserRole] = useState("user");
  const [accentTheme, setAccentTheme] = useState<AccentTheme>("blue");
  const [colorMode, setColorMode] = useState<ColorMode>("system");
  const [linkCopied, setLinkCopied] = useState(false);
  const [makeStatus, setMakeStatus] = useState<MakeConnectionStatus | null>(null);
  const [makeStatusError, setMakeStatusError] = useState(false);
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

      setUserId(session.user.id);
      setUserEmail(session.user.email || "");
      const { data: userRow, error: userError } = await supabase
        .from("users")
        .select("company_id,role")
        .eq("id", session.user.id)
        .single();

      if (userError || !userRow?.company_id) {
        console.error("Felhasználói cég lekérési hiba:", userError);
        setError("Nem sikerült meghatározni a vállalkozást.");
        setLoading(false);
        return;
      }

      setCompanyId(userRow.company_id);
      setUserRole(userRow.role || "user");

      const { data: companyRow, error: companyError } = await supabase
        .from("companies")
        .select("name, public_slug")
        .eq("id", userRow.company_id)
        .single();

      if (companyError || !companyRow?.public_slug) {
        console.error("Céges adatok betöltési hiba:", companyError);
        setError("Nem sikerült betölteni a vállalkozás adatait.");
        setLoading(false);
        return;
      }

      setCompanyName(companyRow.name || "");
      setCompanySlug(companyRow.public_slug);

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

      const localPreferences = readLocalPreferences();
      const { data: preferenceRow } = await supabase
        .from("user_preferences")
        .select("accent_theme,color_mode")
        .eq("user_id", session.user.id)
        .maybeSingle();
      const preferences = preferenceRow ? normalizePreferences(preferenceRow) : localPreferences;
      setAccentTheme(preferences.accentTheme);
      setColorMode(preferences.colorMode);
      applyPreferences(preferences.accentTheme, preferences.colorMode);

      setLoading(false);
      try {
        const response = await fetch("/api/make-connection-status", {
          headers: { Authorization: `Bearer ${session.access_token}` },
          cache: "no-store",
        });
        if (!response.ok) throw new Error("Make status unavailable");
        const result: { status?: MakeConnectionStatus } = await response.json();
        if (!["company_active", "legacy", "setup_required"].includes(result.status || "")) {
          throw new Error("Unknown Make status");
        }
        setMakeStatus(result.status!);
      } catch {
        setMakeStatusError(true);
      }
    }

    loadSettings();
  }, [router]);

  async function handleSave() {
    if (!companyId || !userId) return;

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

    const { error: preferenceError } = await supabase
      .from("user_preferences")
      .upsert({
        user_id: userId,
        accent_theme: accentTheme,
        color_mode: colorMode,
        updated_at: new Date().toISOString(),
      }, { onConflict: "user_id" });

    if (preferenceError) {
      console.error("Megjelenési beállítás mentési hiba:", preferenceError);
      setError("Az üzenetbeállítás elmentve, de a megjelenést nem sikerült a fiókhoz menteni.");
      setSaving(false);
      return;
    }
    applyPreferences(accentTheme, colorMode);

    setSaving(false);
    setSaveSuccess(true);

    setTimeout(() => {
      setSaveSuccess(false);
    }, 2500);
  }

  async function handleCopyPublicForm() {
    if (!companySlug) return;
    const url = `${window.location.origin}/ajanlatkeres/${companySlug}`;
    try {
      await navigator.clipboard.writeText(url);
      setLinkCopied(true);
      setTimeout(() => setLinkCopied(false), 2500);
    } catch {
      setError("A linket nem sikerült a vágólapra másolni.");
    }
  }

  if (loading) {
    return (
      <main className="partner-surface flex min-h-screen items-center justify-center bg-slate-50">
        <div className="text-lg font-semibold text-slate-600">
          Betöltés...
        </div>
      </main>
    );
  }

  return (
    <main className="partner-surface min-h-screen bg-slate-50 p-4 sm:p-6 md:p-10">
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
            Saját adatok, megjelenés és üzenetek működése.
          </p>
        </div>

        <section className="mb-6 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
          <h2 className="text-xl font-bold text-slate-900">Saját adatok</h2>
          <dl className="mt-5 grid gap-4 sm:grid-cols-2">
            <div className="rounded-xl bg-slate-50 p-4"><dt className="text-sm text-slate-500">E-mail-cím</dt><dd className="mt-1 break-all font-semibold text-slate-900">{userEmail || "—"}</dd></div>
            <div className="rounded-xl bg-slate-50 p-4"><dt className="text-sm text-slate-500">Szerepkör</dt><dd className="mt-1 font-semibold text-slate-900">{roleLabel(userRole)}</dd></div>
            <div className="rounded-xl bg-slate-50 p-4 sm:col-span-2"><dt className="text-sm text-slate-500">Vállalkozás</dt><dd className="mt-1 font-semibold text-slate-900">{companyName || "—"}</dd></div>
          </dl>
        </section>

        <section className="mb-6 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
          <h2 className="text-xl font-bold text-slate-900">Megjelenés</h2>
          <p className="mt-2 text-sm text-slate-500">A választás ehhez a felhasználói fiókhoz tartozik, és mobilon is automatikusan alkalmazkodik.</p>
          <fieldset className="mt-5"><legend className="font-semibold text-slate-900">Színtéma</legend>
            <div className="mt-3 grid gap-3 sm:grid-cols-3">
              {([
                ["blue", "Kék", "#002bff"], ["green", "Zöld", "#149a02"], ["orange", "Narancssárga", "#e99800"],
              ] as const).map(([value, label, color]) => <label key={value} className={`flex cursor-pointer items-center gap-3 rounded-xl border p-4 ${accentTheme === value ? "border-current" : "border-slate-200"}`} style={{ color }}>
                <input type="radio" name="accentTheme" value={value} checked={accentTheme === value} onChange={() => { setAccentTheme(value); applyPreferences(value, colorMode); }} />
                <span className="h-5 w-5 rounded-full" style={{ backgroundColor: color }} /><span className="font-semibold text-slate-900">{label}</span>
              </label>)}
            </div>
          </fieldset>
          <fieldset className="mt-6"><legend className="font-semibold text-slate-900">Világos vagy sötét mód</legend>
            <div className="mt-3 grid gap-3 sm:grid-cols-3">
              {([[
                "system", "Rendszer szerint"], ["light", "Világos"], ["dark", "Sötét"],
              ] as const).map(([value, label]) => <label key={value} className={`cursor-pointer rounded-xl border p-4 font-semibold text-slate-900 ${colorMode === value ? "accent-border accent-soft" : "border-slate-200"}`}>
                <input className="mr-3" type="radio" name="colorMode" value={value} checked={colorMode === value} onChange={() => { setColorMode(value); applyPreferences(accentTheme, value); }} />{label}
              </label>)}
            </div>
          </fieldset>
        </section>

        <div className="mb-6 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <p className="text-sm font-semibold uppercase tracking-wide text-violet-600">
                Első lépések
              </p>
              <h2 className="mt-1 text-xl font-bold text-slate-900">
                {companyName || "Vállalkozás beállítása"}
              </h2>
              <p className="mt-2 text-sm leading-6 text-slate-500">
                Itt látod, hogy a LeadFlow készen áll-e az érdeklődők fogadására és feldolgozására.
              </p>
            </div>
            <span className={`w-fit rounded-full px-3 py-1 text-xs font-semibold ${
              makeStatus === "company_active" || makeStatus === "legacy"
                ? "bg-green-100 text-green-700"
                : "bg-amber-100 text-amber-700"
            }`}>
              {makeStatus === "company_active" || makeStatus === "legacy" ? "Használatra kész" : "Beállítás alatt"}
            </span>
          </div>

          <div className="mt-5 space-y-3">
            <div className="flex items-start gap-3 rounded-xl bg-green-50 p-4">
              <span className="font-bold text-green-700">✓</span>
              <div>
                <p className="font-semibold text-slate-900">Partnerfiók összekapcsolva</p>
                <p className="mt-1 text-sm text-slate-600">A belépett felhasználó ehhez a vállalkozáshoz tartozik.</p>
              </div>
            </div>

            <div className="rounded-xl border border-slate-200 p-4">
              <div className="flex items-start gap-3">
                <span className="font-bold text-green-700">✓</span>
                <div>
                  <p className="font-semibold text-slate-900">Publikus ajánlatkérő elérhető</p>
                  <p className="mt-1 break-all text-sm text-slate-600">
                    /ajanlatkeres/{companySlug}
                  </p>
                </div>
              </div>
              <div className="mt-3 flex flex-col gap-2 sm:flex-row">
                <button
                  type="button"
                  onClick={handleCopyPublicForm}
                  className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800"
                >
                  {linkCopied ? "✓ Link másolva" : "Ajánlatkérő link másolása"}
                </button>
                <a
                  href={`/ajanlatkeres/${companySlug}`}
                  target="_blank"
                  rel="noreferrer"
                  className="rounded-lg border border-slate-200 px-4 py-2 text-center text-sm font-semibold text-slate-700 hover:bg-slate-50"
                >
                  Megnyitás
                </a>
              </div>
            </div>

            <div className={`flex items-start gap-3 rounded-xl p-4 ${
              makeStatus === "company_active" || makeStatus === "legacy" ? "bg-green-50" : "bg-amber-50"
            }`}>
              <span className={`font-bold ${
                makeStatus === "company_active" || makeStatus === "legacy" ? "text-green-700" : "text-amber-700"
              }`}>
                {makeStatus === "company_active" || makeStatus === "legacy" ? "✓" : "!"}
              </span>
              <div>
                <p className="font-semibold text-slate-900">Automatikus feldolgozás</p>
                <p className="mt-1 text-sm text-slate-600">
                  {makeStatus === "company_active"
                    ? "A saját Make-kapcsolat aktív."
                    : makeStatus === "legacy"
                      ? "Az átmeneti LeadFlow-kapcsolat aktív."
                      : makeStatusError
                        ? "Az állapot most nem ellenőrizhető."
                        : "A Make-kapcsolat beállítása még folyamatban van."}
                </p>
              </div>
            </div>
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="text-xl font-bold text-slate-900">Üzenetek beállításai</h2>

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
            className="accent-bg mt-6 w-full rounded-xl px-4 py-3 font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
          >
            {saving ? "Mentés..." : "Beállítások mentése"}
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
        <div className="mt-6 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="text-xl font-bold text-slate-900">Make-kapcsolat</h2>
          <p className="mt-2 text-sm text-slate-500">A vállalkozás automatizálási kapcsolatának állapota.</p>
          <div className="mt-4 rounded-xl bg-slate-50 p-4">
            <p className="font-semibold text-slate-900">
              {makeStatusError ? "Az állapot most nem érhető el" :
                makeStatus === "company_active" ? "Saját Make-kapcsolat beállítva" :
                makeStatus === "legacy" ? "Átmeneti LeadFlow-kapcsolat" :
                makeStatus === "setup_required" ? "Beállítás szükséges" : "Állapot betöltése..."}
            </p>
            <p className="mt-1 text-sm leading-6 text-slate-600">
              {makeStatus === "company_active"
                ? "A saját Make webhookok és a céges kulcs be vannak állítva. Ez nem ellenőrzi a Make-forgatókönyv vagy a Gmail-küldés működését."
                : makeStatus === "legacy"
                  ? "A pilot jelenleg a LeadFlow átmeneti Make-kapcsolatát használja."
                  : makeStatus === "setup_required"
                    ? "A Make-kapcsolat, a két webhook vagy a céges kulcs hiányzik; az automatikus feldolgozás és küldés nem biztosított."
                    : makeStatusError ? "Próbáld meg később újratölteni az oldalt." : ""}
            </p>
          </div>
        </div>
      </div>
    </main>
  );
}
