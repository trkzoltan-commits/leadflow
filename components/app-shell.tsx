"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { supabase } from "@/lib/supabase";
import { roleLabel } from "@/lib/user-preferences";

type AppShellProps = {
  children: ReactNode;
  width?: "standard" | "wide";
};

type ShellProfile = {
  companyName: string;
  companyLogoUrl: string;
  role: string;
  email: string;
};

const navigation = [
  { href: "/", label: "Áttekintés", icon: "home" },
  { href: "/leads", label: "Érdeklődők", icon: "users" },
  { href: "/pipeline", label: "Pipeline", icon: "columns" },
  { href: "/reports", label: "Riportok", icon: "chart" },
] as const;

function NavIcon({ name }: { name: (typeof navigation)[number]["icon"] | "settings" | "logout" }) {
  const paths = {
    home: <><path d="M3 11.5 12 4l9 7.5" /><path d="M5.5 10.5V20h13v-9.5" /><path d="M9.5 20v-6h5v6" /></>,
    users: <><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" /></>,
    columns: <><rect x="3" y="4" width="7" height="16" rx="2" /><rect x="14" y="4" width="7" height="16" rx="2" /></>,
    chart: <><path d="M4 19V9M10 19V5M16 19v-7M22 19H2" /></>,
    settings: <><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.7 1.7 0 0 0 .34 1.88l.06.06-2.83 2.83-.06-.06a1.7 1.7 0 0 0-1.88-.34 1.7 1.7 0 0 0-1.03 1.56V21h-4v-.08A1.7 1.7 0 0 0 8.97 19.4a1.7 1.7 0 0 0-1.88.34l-.06.06-2.83-2.83.06-.06A1.7 1.7 0 0 0 4.6 15a1.7 1.7 0 0 0-1.52-1.03H3v-4h.08A1.7 1.7 0 0 0 4.6 8.97a1.7 1.7 0 0 0-.34-1.88l-.06-.06L7.03 4.2l.06.06A1.7 1.7 0 0 0 8.97 4.6 1.7 1.7 0 0 0 10 3.08V3h4v.08A1.7 1.7 0 0 0 15.03 4.6a1.7 1.7 0 0 0 1.88-.34l.06-.06 2.83 2.83-.06.06a1.7 1.7 0 0 0-.34 1.88A1.7 1.7 0 0 0 20.92 10H21v4h-.08A1.7 1.7 0 0 0 19.4 15Z" /></>,
    logout: <><path d="M10 17l5-5-5-5M15 12H3" /><path d="M14 3h5a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-5" /></>,
  };
  return <svg aria-hidden="true" viewBox="0 0 24 24" className="h-5 w-5 shrink-0" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">{paths[name]}</svg>;
}

function isActive(pathname: string, href: string) {
  return href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`);
}

export function AppShell({ children, width = "standard" }: AppShellProps) {
  const pathname = usePathname();
  const router = useRouter();
  const [menuOpen, setMenuOpen] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const [profile, setProfile] = useState<ShellProfile>({ companyName: "Vállalkozás", companyLogoUrl: "", role: "user", email: "" });

  useEffect(() => {
    setMenuOpen(false);
  }, [pathname]);

  useEffect(() => {
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape") setMenuOpen(false);
    }
    document.addEventListener("keydown", closeOnEscape);
    return () => document.removeEventListener("keydown", closeOnEscape);
  }, []);

  useEffect(() => {
    let cancelled = false;
    async function loadProfile() {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session || cancelled) return;
      try {
        const response = await fetch("/api/account-profile", {
          headers: { Authorization: `Bearer ${session.access_token}` },
          cache: "no-store",
        });
        if (!response.ok || cancelled) return;
        const data = await response.json();
        setProfile({
          companyName: data.companyName || "Vállalkozás",
          companyLogoUrl: data.companyLogoUrl || "",
          role: data.role || "user",
          email: session.user.email || "",
        });
      } catch {
        if (!cancelled) setProfile(current => ({ ...current, email: session.user.email || "" }));
      }
    }
    void loadProfile();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    function updateCompanyProfile(event: Event) {
      const companyName = (event as CustomEvent<{ companyName?: unknown }>).detail?.companyName;
      if (typeof companyName === "string" && companyName.trim()) {
        setProfile(current => ({ ...current, companyName: companyName.trim() }));
      }
    }
    window.addEventListener("leadflow:company-profile-updated", updateCompanyProfile);
    return () => window.removeEventListener("leadflow:company-profile-updated", updateCompanyProfile);
  }, []);

  async function signOut() {
    if (!window.confirm("Biztosan kijelentkezel a LeadFlow-ból?")) return;
    setSigningOut(true);
    await supabase.auth.signOut();
    router.replace("/login");
  }

  const initial = profile.companyName.trim().charAt(0).toLocaleUpperCase("hu-HU") || "V";
  const navClass = (active: boolean) => active
    ? "accent-soft accent-text flex items-center gap-3 rounded-xl px-3 py-2.5 font-semibold"
    : "flex items-center gap-3 rounded-xl px-3 py-2.5 font-medium text-slate-600 transition hover:bg-slate-100 hover:text-slate-900";

  const sidebar = <div className="flex h-full flex-col">
    <div className="border-b border-slate-200 px-5 py-5">
      <Link href="/" aria-label="LeadFlow Dashboard – Áttekintés" className="accent-text text-xl font-bold tracking-tight">LeadFlow</Link>
      <div className="mt-4 flex min-w-0 items-center gap-3 rounded-xl border border-slate-200 bg-slate-50 p-3">
        {profile.companyLogoUrl
          // eslint-disable-next-line @next/next/no-img-element
          ? <img src={profile.companyLogoUrl} alt="" className="h-10 w-10 shrink-0 rounded-lg bg-white object-contain p-1" />
          : <span aria-hidden="true" className="accent-bg flex h-10 w-10 shrink-0 items-center justify-center rounded-lg font-bold text-white">{initial}</span>}
        <div className="min-w-0">
          <p className="truncate text-sm font-bold text-slate-900">{profile.companyName}</p>
          <p className="text-xs text-slate-500">Partnerfelület</p>
        </div>
      </div>
    </div>

    <nav aria-label="Fő navigáció" className="flex-1 space-y-1 overflow-y-auto px-3 py-4">
      {navigation.map(item => <Link key={item.href} href={item.href} aria-current={isActive(pathname, item.href) ? "page" : undefined} className={navClass(isActive(pathname, item.href))}>
        <NavIcon name={item.icon} /><span>{item.label}</span>
      </Link>)}
    </nav>

    <div className="border-t border-slate-200 p-3">
      <Link href="/settings" aria-current={isActive(pathname, "/settings") ? "page" : undefined} className={navClass(isActive(pathname, "/settings"))}>
        <NavIcon name="settings" /><span>Beállítások</span>
      </Link>
      <div className="mt-3 border-t border-slate-200 px-3 pt-3">
        <p className="truncate text-sm font-semibold text-slate-900">{profile.email || "Bejelentkezett felhasználó"}</p>
        <p className="mt-0.5 text-xs text-slate-500">{roleLabel(profile.role)}</p>
      </div>
      <button type="button" onClick={() => void signOut()} disabled={signingOut}
        className="mt-3 flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left font-semibold text-red-700 transition hover:bg-red-50 disabled:opacity-60">
        <NavIcon name="logout" /><span>{signingOut ? "Kijelentkezés…" : "Kijelentkezés"}</span>
      </button>
    </div>
  </div>;

  return (
    <div className="partner-surface min-h-screen bg-slate-50 text-slate-900">
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 border-r border-slate-200 bg-white lg:block">{sidebar}</aside>

      <header className="sticky top-0 z-20 flex h-16 items-center justify-between border-b border-slate-200 bg-white px-4 shadow-sm lg:hidden">
        <Link href="/" aria-label="LeadFlow Dashboard – Áttekintés" className="accent-text text-lg font-bold">LeadFlow</Link>
        <button type="button" onClick={() => setMenuOpen(true)} aria-expanded={menuOpen} aria-controls="mobile-navigation"
          className="rounded-lg border border-slate-200 p-2 text-slate-700" aria-label="Menü megnyitása">
          <svg aria-hidden="true" viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M4 6h16M4 12h16M4 18h16" /></svg>
        </button>
      </header>

      {menuOpen && <div className="fixed inset-0 z-40 lg:hidden">
        <button type="button" className="absolute inset-0 bg-slate-950/45" aria-label="Menü bezárása" onClick={() => setMenuOpen(false)} />
        <aside id="mobile-navigation" className="absolute inset-y-0 left-0 w-[min(19rem,86vw)] border-r border-slate-200 bg-white shadow-2xl">
          <button type="button" onClick={() => setMenuOpen(false)} className="absolute right-3 top-3 z-10 rounded-lg p-2 text-slate-600 hover:bg-slate-100" aria-label="Menü bezárása">
            <svg aria-hidden="true" viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="m6 6 12 12M18 6 6 18" /></svg>
          </button>
          {sidebar}
        </aside>
      </div>}

      <main className="lg:pl-64">
        <div className={`mx-auto w-full p-4 sm:p-6 lg:p-8 ${width === "wide" ? "max-w-[1800px]" : "max-w-7xl"}`}>
          {children}
        </div>
      </main>
    </div>
  );
}
