"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import { applyPreferences, readLocalPreferences } from "@/components/theme-preferences";
import { normalizePreferences, roleLabel, type AccentTheme, type ColorMode } from "@/lib/user-preferences";
import { DashboardBrandLink } from "@/components/dashboard-brand-link";
import { TeamManagement } from "@/components/team-management";
import { useAutomationHealth } from "@/lib/use-automation-health";
import type { DataRetentionStatus } from "@/lib/data-retention";

type AutoReplyMode = "manual" | "safe" | "automatic";
type MakeConnectionStatus = "company_active" | "legacy" | "setup_required";

function displayRetentionDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("hu-HU", {
    timeZone: "Europe/Budapest",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

export default function SettingsPage() {
  const router = useRouter();
  const { health: automationHealth, loading: automationHealthLoading, error: automationHealthError } = useAutomationHealth();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [error, setError] = useState("");

  const [companyId, setCompanyId] = useState<string | null>(null);
  const [companyName, setCompanyName] = useState("");
  const [savedCompanyName, setSavedCompanyName] = useState("");
  const [companySlug, setCompanySlug] = useState("");
  const [userId, setUserId] = useState("");
  const [userEmail, setUserEmail] = useState("");
  const [userRole, setUserRole] = useState("user");
  const [accentTheme, setAccentTheme] = useState<AccentTheme>("blue");
  const [colorMode, setColorMode] = useState<ColorMode>("system");
  const [linkCopied, setLinkCopied] = useState(false);
  const [autoReplyMode, setAutoReplyMode] =
    useState<AutoReplyMode>("manual");
  const [companyLogoUrl, setCompanyLogoUrl] = useState("");
  const [signatureEnabled, setSignatureEnabled] = useState(true);
  const [signatureShowLogo, setSignatureShowLogo] = useState(true);
  const [emailSignoff, setEmailSignoff] = useState("Üdvözlettel,");
  const [signerName, setSignerName] = useState("");
  const [signerRole, setSignerRole] = useState("");
  const [signaturePhone, setSignaturePhone] = useState("");
  const [signatureEmail, setSignatureEmail] = useState("");
  const [signatureWebsite, setSignatureWebsite] = useState("");
  const [signatureLegalText, setSignatureLegalText] = useState("");
  const [privacyNoticeEnabled, setPrivacyNoticeEnabled] = useState(false);
  const [privacyContactEmail, setPrivacyContactEmail] = useState("");
  const [privacyCompanyAddress, setPrivacyCompanyAddress] = useState("");
  const [privacyRetentionMonths, setPrivacyRetentionMonths] = useState(24);
  const [retentionStatus, setRetentionStatus] = useState<DataRetentionStatus | null>(null);
  const [retentionStatusLoading, setRetentionStatusLoading] = useState(false);
  const [retentionStatusError, setRetentionStatusError] = useState(false);
  const canManageCompany = userRole === "owner" || userRole === "admin";
  const makeStatus: MakeConnectionStatus | null = automationHealth?.connectionStatus === "legacy_fallback"
    ? "legacy" : automationHealth?.connectionStatus ?? null;
  const makeStatusError = Boolean(automationHealthError);
  const latestAutomationSuccess = [
    automationHealth?.flows.newLead.lastCompletedAt,
    automationHealth?.flows.approvedReply.lastCompletedAt,
  ].filter((value): value is string => Boolean(value)).sort().at(-1) ?? null;
  const automationRuntimeLabel = makeStatusError
    ? "Nem ellenőrizhető"
    : automationHealth?.status === "attention_required" ? "Figyelmet igényel"
    : automationHealthLoading ? "Ellenőrzés…"
      : automationHealth?.status === "processing" ? "Folyamatban"
        : automationHealth?.status === "healthy" ? "Rendben" : "Még nincs futás";
  const automationRuntimeText = makeStatusError
    ? "Az állapot most nem ellenőrizhető."
    : automationHealthLoading ? "A tényleges működési állapot betöltése folyamatban van."
      : automationHealth?.connectionStatus === "setup_required"
        ? "A Make-kapcsolat beállítása szükséges."
        : automationHealth?.status === "attention_required"
          ? `${automationHealth.totals.attentionRequired} folyamat ellenőrzést kér.`
          : automationHealth?.status === "processing"
            ? `${automationHealth.totals.processing} feldolgozás vagy levélküldés visszaigazolásra vár.`
            : automationHealth?.status === "healthy"
              ? `Nincs észlelt elakadás. Az elmúlt 24 órában ${automationHealth.totals.completed24h} sikeres folyamat fejeződött be.`
              : "Még nincs naplózott automatizálási futás.";

  const refreshRetentionStatus = useCallback(async (accessToken: string) => {
    setRetentionStatusLoading(true);
    setRetentionStatusError(false);
    try {
      const response = await fetch("/api/privacy-retention", {
        headers: { Authorization: `Bearer ${accessToken}` },
        cache: "no-store",
      });
      if (!response.ok) throw new Error("retention status unavailable");
      setRetentionStatus(await response.json() as DataRetentionStatus);
    } catch {
      setRetentionStatus(null);
      setRetentionStatusError(true);
    } finally {
      setRetentionStatusLoading(false);
    }
  }, []);

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
      const profileResponse = await fetch("/api/account-profile", {
        headers: { Authorization: `Bearer ${session.access_token}` },
        cache: "no-store",
      });
      if (!profileResponse.ok) {
        setError("Nem sikerült betölteni a profil- és vállalkozási adatokat.");
        setLoading(false);
        return;
      }
      const profile: {
        companyId: string;
        companyName: string;
        companySlug: string;
        role: string;
        autoReplyMode: AutoReplyMode;
        privacyNoticeEnabled: boolean;
        privacyContactEmail: string;
        privacyCompanyAddress: string;
        privacyRetentionMonths: number;
      } = await profileResponse.json();
      setCompanyId(profile.companyId);
      setCompanyName(profile.companyName);
      setSavedCompanyName(profile.companyName);
      setCompanySlug(profile.companySlug);
      setUserRole(profile.role);
      setAutoReplyMode(profile.autoReplyMode || "manual");
      setPrivacyNoticeEnabled(profile.privacyNoticeEnabled ?? false);
      setPrivacyContactEmail(profile.privacyContactEmail || "");
      setPrivacyCompanyAddress(profile.privacyCompanyAddress || "");
      setPrivacyRetentionMonths(profile.privacyRetentionMonths || 24);
      if (profile.role === "owner" || profile.role === "admin") {
        void refreshRetentionStatus(session.access_token);
      }

      const [{ data: signatureSettings }, { data: companyRow }] = await Promise.all([
        supabase.from("company_settings").select(
          "email_signature_enabled,email_signature_show_logo,email_signoff,email_signer_name,email_signer_role,email_phone,email_address,email_website,email_legal_text"
        ).eq("company_id", profile.companyId).single(),
        supabase.from("companies").select("logo_url").eq("id", profile.companyId).single(),
      ]);
      if (signatureSettings) {
        setSignatureEnabled(signatureSettings.email_signature_enabled ?? true);
        setSignatureShowLogo(signatureSettings.email_signature_show_logo ?? true);
        setEmailSignoff(signatureSettings.email_signoff || "Üdvözlettel,");
        setSignerName(signatureSettings.email_signer_name || "");
        setSignerRole(signatureSettings.email_signer_role || "");
        setSignaturePhone(signatureSettings.email_phone || "");
        setSignatureEmail(signatureSettings.email_address || "");
        setSignatureWebsite(signatureSettings.email_website || "");
        setSignatureLegalText(signatureSettings.email_legal_text || "");
      }
      setCompanyLogoUrl(companyRow?.logo_url || "");

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
    }

    loadSettings();
  }, [refreshRetentionStatus, router]);

  async function handleSave() {
    if (!companyId || !userId) return;

    setSaving(true);
    setSaveSuccess(false);
    setError("");

    if (userRole === "owner" && companyName.trim() !== savedCompanyName) {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session) {
        setError("A munkamenet lejárt. Jelentkezz be újra.");
        setSaving(false);
        return;
      }
      const companyResponse = await fetch("/api/account-profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({ companyName }),
      });
      const companyResult = await companyResponse.json();
      if (!companyResponse.ok) {
        setError(companyResult.error || "A cégnév módosítása nem sikerült.");
        setSaving(false);
        return;
      }
      setCompanyName(companyResult.companyName);
      setSavedCompanyName(companyResult.companyName);
    }

    if (canManageCompany) {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        setError("A munkamenet lejárt. Jelentkezz be újra.");
        setSaving(false);
        return;
      }
      const settingsResponse = await fetch("/api/company-settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({
          autoReplyMode, signatureEnabled, signatureShowLogo, emailSignoff, signerName, signerRole,
          signaturePhone, signatureEmail, signatureWebsite, signatureLegalText,
          privacyNoticeEnabled, privacyContactEmail, privacyCompanyAddress, privacyRetentionMonths,
        }),
      });
      const settingsResult = await settingsResponse.json();
      if (!settingsResponse.ok) {
        setError(settingsResult.error || "Nem sikerült elmenteni a céges beállítást.");
        setSaving(false);
        return;
      }
      void refreshRetentionStatus(session.access_token);
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
          <DashboardBrandLink />

          <h1 className="mt-1 text-3xl font-bold text-slate-900">
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

        <TeamManagement isOwner={userRole === "owner"} />

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
              makeStatusError
                ? "bg-amber-100 text-amber-700"
                : automationHealthLoading
                  ? "bg-slate-100 text-slate-600"
                  : makeStatus === "company_active" || makeStatus === "legacy"
                    ? "bg-green-100 text-green-700"
                    : "bg-amber-100 text-amber-700"
            }`}>
              {makeStatusError ? "Nem ellenőrizhető" : automationHealthLoading ? "Ellenőrzés…" :
                makeStatus === "company_active" || makeStatus === "legacy" ? "Használatra kész" : "Beállítás alatt"}
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
              automationHealthLoading ? "bg-slate-50" : makeStatusError ? "bg-amber-50" :
                makeStatus === "company_active" || makeStatus === "legacy" ? "bg-green-50" : "bg-amber-50"
            }`}>
              <span className={`font-bold ${
                automationHealthLoading ? "text-slate-500" : makeStatusError ? "text-amber-700" :
                  makeStatus === "company_active" || makeStatus === "legacy" ? "text-green-700" : "text-amber-700"
              }`}>
                {automationHealthLoading ? "…" : makeStatusError ? "!" : makeStatus === "company_active" || makeStatus === "legacy" ? "✓" : "!"}
              </span>
              <div>
                <p className="font-semibold text-slate-900">Automatikus feldolgozás</p>
                <p className="mt-1 text-sm text-slate-600">
                  {automationHealthLoading
                    ? "A Make-kapcsolat állapotának ellenőrzése folyamatban van."
                    : makeStatusError
                    ? "Az állapot most nem ellenőrizhető."
                    : makeStatus === "company_active"
                    ? "A saját Make-kapcsolat aktív."
                    : makeStatus === "legacy"
                      ? "Az átmeneti LeadFlow-kapcsolat aktív."
                      : "A Make-kapcsolat beállítása még folyamatban van."}
                </p>
              </div>
            </div>
          </div>
        </div>

        <section className="mb-6 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
          <h2 className="text-xl font-bold text-slate-900">Ajánlatkérő adatkezelése</h2>
          <p className="mt-2 text-sm leading-6 text-slate-500">A LeadFlow céges tájékoztató oldalt készít. Aktiválás után az érdeklődő csak a tájékoztató elolvasását megerősítő kötelező jelölőnégyzettel küldheti el az űrlapot.</p>
          {!canManageCompany && <p className="mt-4 rounded-xl bg-slate-100 p-4 text-sm text-slate-600">Ezt a céges beállítást tulajdonos vagy adminisztrátor módosíthatja.</p>}
          <fieldset disabled={!canManageCompany} className={`mt-5 space-y-4 ${!canManageCompany ? "opacity-60" : ""}`}>
            <label className="flex items-start gap-3 rounded-xl bg-slate-50 p-4">
              <input type="checkbox" checked={privacyNoticeEnabled} onChange={event => setPrivacyNoticeEnabled(event.target.checked)} className="mt-1" />
              <span><span className="block font-semibold text-slate-900">Adatkezelési tájékoztató aktiválása</span><span className="mt-1 block text-sm text-slate-500">Csak a szükséges céges adatok kitöltése után kapcsolható be.</span></span>
            </label>
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="text-sm font-medium text-slate-700">Adatkezelési kapcsolattartó e-mail-címe<input type="email" value={privacyContactEmail} maxLength={254} onChange={event => setPrivacyContactEmail(event.target.value)} placeholder="info@pelda.hu" className="mt-2 w-full rounded-xl border border-slate-200 px-3 py-2" /></label>
              <label className="text-sm font-medium text-slate-700">Megőrzési idő (hónap)<input type="number" min={1} max={120} value={privacyRetentionMonths} onChange={event => setPrivacyRetentionMonths(Number(event.target.value))} className="mt-2 w-full rounded-xl border border-slate-200 px-3 py-2" /></label>
              <label className="text-sm font-medium text-slate-700 sm:col-span-2">A vállalkozás címe<input value={privacyCompanyAddress} maxLength={300} onChange={event => setPrivacyCompanyAddress(event.target.value)} placeholder="Például: 1111 Budapest, Példa utca 1." className="mt-2 w-full rounded-xl border border-slate-200 px-3 py-2" /></label>
            </div>
            {privacyNoticeEnabled && companySlug && <a href={`/adatkezeles/${companySlug}`} target="_blank" rel="noreferrer" className="inline-block text-sm font-semibold text-blue-700 underline">Adatkezelési tájékoztató megnyitása</a>}
            <p className="text-xs leading-5 text-slate-500">A 24 hónapos alapérték az éves riportok használatát támogatja. A vállalkozás felel azért, hogy a választott időtartam és a tájékoztató tartalma megfeleljen a saját működésének.</p>
          </fieldset>
          {canManageCompany && (
            <div className={`mt-5 rounded-xl border p-4 ${
              retentionStatusError ? "border-amber-200 bg-amber-50"
                : retentionStatus?.activeReviewCount ? "border-amber-300 bg-amber-50"
                  : retentionStatus?.eligibleClosedCount ? "border-blue-200 bg-blue-50"
                    : "border-emerald-200 bg-emerald-50"
            }`}>
              <h3 className="font-semibold text-slate-900">Adatmegőrzési állapot</h3>
              {retentionStatusLoading ? (
                <p className="mt-2 text-sm text-slate-600">Ellenőrzés folyamatban…</p>
              ) : retentionStatusError || !retentionStatus ? (
                <p className="mt-2 text-sm leading-6 text-amber-900">Az állapot most nem ellenőrizhető. A beállítás ettől még elmenthető.</p>
              ) : (
                <div className="mt-2 space-y-2 text-sm leading-6 text-slate-700">
                  {retentionStatus.eligibleClosedCount > 0 ? (
                    <p><strong>{retentionStatus.eligibleClosedCount} lezárt ügy</strong> személyes adatai elérték a {retentionStatus.retentionMonths} hónapos megőrzési időt, és anonimizálásra várnak.</p>
                  ) : (
                    <p>Nincs anonimizálásra váró lezárt ügy.</p>
                  )}
                  {retentionStatus.activeReviewCount > 0 && (
                    <p><strong>{retentionStatus.activeReviewCount} aktív ügy</strong> régebbi a megőrzési időnél. Ezeket a rendszer nem anonimizálja automatikusan; kézi felülvizsgálat szükséges. <Link href="/leads?filter=retention" className="font-semibold underline">Ügyek megnyitása</Link></p>
                  )}
                  <p className="text-xs text-slate-500">
                    Határnap: {displayRetentionDate(retentionStatus.cutoffAt)}
                    {retentionStatus.lastRunAt ? ` · Utolsó anonimizálási futás: ${displayRetentionDate(retentionStatus.lastRunAt)}` : " · Még nem történt anonimizálási futás"}
                  </p>
                </div>
              )}
            </div>
          )}
        </section>

        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="text-xl font-bold text-slate-900">Üzenetek beállításai</h2>

          <p className="mt-2 text-sm leading-6 text-slate-500">
            Meghatározza, hogy az AI által készített választervezet mikor
            kerülhet automatikusan kiküldésre.
          </p>

          {!canManageCompany && <p className="mt-4 rounded-xl bg-slate-100 p-4 text-sm leading-6 text-slate-600">A céges üzenetbeállításokat tulajdonos vagy adminisztrátor módosíthatja. A saját megjelenési beállításaidat továbbra is elmentheted.</p>}

          <fieldset disabled={!canManageCompany} className={!canManageCompany ? "opacity-60" : ""}>

          <div className="mt-6 rounded-xl border border-slate-200 p-4 sm:p-5">
            <div className="flex items-start gap-3">
              <input className="mt-1" type="checkbox" checked={signatureEnabled} onChange={(event) => setSignatureEnabled(event.target.checked)} />
              <div><h3 className="font-semibold text-slate-900">Céges e-mail-aláírás</h3><p className="mt-1 text-sm text-slate-500">Minden jóváhagyott válasz végére automatikusan hozzáadjuk.</p></div>
            </div>
            {signatureEnabled && <div className="mt-5 grid gap-4 sm:grid-cols-2">
              <label className="text-sm font-medium text-slate-700">Elköszönés<input value={emailSignoff} maxLength={100} onChange={(e) => setEmailSignoff(e.target.value)} className="mt-2 w-full rounded-xl border border-slate-200 px-3 py-2" /></label>
              <label className="text-sm font-medium text-slate-700">Cégnév<input value={companyName} maxLength={200} disabled={userRole !== "owner"} onChange={(e) => setCompanyName(e.target.value)} className={`mt-2 w-full rounded-xl border border-slate-200 px-3 py-2 ${userRole !== "owner" ? "bg-slate-50" : "bg-white"}`} /><span className="mt-1 block text-xs text-slate-500">{userRole === "owner" ? "Tulajdonosként módosíthatod; minden céges felületen ez a név jelenik meg." : "A cégnevet csak a tulajdonos módosíthatja."}</span></label>
              <label className="text-sm font-medium text-slate-700">Aláíró neve<input value={signerName} maxLength={120} onChange={(e) => setSignerName(e.target.value)} placeholder="Például: Kovács Péter" className="mt-2 w-full rounded-xl border border-slate-200 px-3 py-2" /></label>
              <label className="text-sm font-medium text-slate-700">Beosztás<input value={signerRole} maxLength={120} onChange={(e) => setSignerRole(e.target.value)} placeholder="Például: ügyvezető" className="mt-2 w-full rounded-xl border border-slate-200 px-3 py-2" /></label>
              <label className="text-sm font-medium text-slate-700">Telefonszám<input value={signaturePhone} maxLength={80} onChange={(e) => setSignaturePhone(e.target.value)} className="mt-2 w-full rounded-xl border border-slate-200 px-3 py-2" /></label>
              <label className="text-sm font-medium text-slate-700">E-mail-cím<input type="email" value={signatureEmail} maxLength={254} onChange={(e) => setSignatureEmail(e.target.value)} placeholder="info@pelda.hu" className="mt-2 w-full rounded-xl border border-slate-200 px-3 py-2" /></label>
              <label className="text-sm font-medium text-slate-700">Weboldal<input value={signatureWebsite} maxLength={300} onChange={(e) => setSignatureWebsite(e.target.value)} placeholder="https://pelda.hu" className="mt-2 w-full rounded-xl border border-slate-200 px-3 py-2" /></label>
              <label className="sm:col-span-2 text-sm font-medium text-slate-700">Opcionális jogi vagy adatvédelmi szöveg<textarea value={signatureLegalText} maxLength={1000} onChange={(e) => setSignatureLegalText(e.target.value)} className="mt-2 min-h-24 w-full rounded-xl border border-slate-200 px-3 py-2" /></label>
              <label className="sm:col-span-2 flex items-start gap-3 rounded-xl bg-slate-50 p-4"><input className="mt-1" type="checkbox" checked={signatureShowLogo} onChange={(e) => setSignatureShowLogo(e.target.checked)} disabled={!companyLogoUrl} /><span><span className="block font-semibold text-slate-900">Céges logó megjelenítése</span><span className="mt-1 block text-sm text-slate-500">{companyLogoUrl ? "A publikus ajánlatkérőhöz feltöltött logót használjuk." : "Ehhez a vállalkozáshoz még nincs logó beállítva."}</span></span></label>
            </div>}
          </div>

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
          </fieldset>

          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            className="accent-bg mt-6 w-full rounded-xl px-4 py-3 font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
          >
            {saving ? "Mentés..." : canManageCompany ? "Beállítások mentése" : "Saját megjelenés mentése"}
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
        <div id="automation" className="mt-6 scroll-mt-6 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
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
                ? "A saját Make webhookok és a céges kulcs be vannak állítva."
                : makeStatus === "legacy"
                  ? "A pilot jelenleg a LeadFlow átmeneti Make-kapcsolatát használja."
                  : makeStatus === "setup_required"
                    ? "A Make-kapcsolat, a két webhook vagy a céges kulcs hiányzik; az automatikus feldolgozás és küldés nem biztosított."
                    : makeStatusError ? "Próbáld meg később újratölteni az oldalt." : ""}
            </p>
          </div>
          <div className={`mt-3 rounded-xl border p-4 ${
            makeStatusError || automationHealth?.status === "attention_required"
              ? "border-amber-200 bg-amber-50"
              : automationHealth?.status === "healthy"
                ? "border-green-200 bg-green-50"
                : "border-slate-200 bg-slate-50"
          }`}>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="font-semibold text-slate-900">Legutóbbi működés</p>
              <span className={`rounded-full px-3 py-1 text-xs font-semibold ${
                makeStatusError || automationHealth?.status === "attention_required"
                  ? "bg-amber-100 text-amber-800"
                  : automationHealth?.status === "healthy"
                    ? "bg-green-100 text-green-700"
                    : "bg-slate-100 text-slate-700"
              }`}>{automationRuntimeLabel}</span>
            </div>
            <p className="mt-2 text-sm leading-6 text-slate-600">{automationRuntimeText}</p>
            {latestAutomationSuccess && <p className="mt-1 text-xs text-slate-500">
              Utolsó sikeres folyamat: {new Intl.DateTimeFormat("hu-HU", {
                dateStyle: "medium", timeStyle: "short", timeZone: "Europe/Budapest",
              }).format(new Date(latestAutomationSuccess))}
            </p>}
          </div>
        </div>
      </div>
    </main>
  );
}
