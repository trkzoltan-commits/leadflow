import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = path => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

test("every authenticated partner page uses the shared application shell", () => {
  for (const path of [
    "app/page.tsx",
    "app/leads/page.tsx",
    "app/leads/[id]/page.tsx",
    "app/pipeline/page.tsx",
    "app/reports/page.tsx",
    "app/settings/page.tsx",
  ]) {
    assert.match(read(path), /<AppShell(?:\s+[^>]*)?>/, path);
  }

  const component = read("components/app-shell.tsx");
  assert.match(component, /aria-label="LeadFlow Dashboard – Áttekintés"/);
  assert.match(component, /href: "\/", label: "Áttekintés"/);
  assert.match(component, /href: "\/leads", label: "Érdeklődők"/);
  assert.match(component, /href: "\/pipeline", label: "Pipeline"/);
  assert.match(component, /href: "\/reports", label: "Riportok"/);
  assert.match(component, /href="\/settings"/);
  assert.match(component, /companyLogoUrl/);
  assert.match(component, /companyName/);
  assert.match(component, /hasUnsavedChanges\?: boolean/);
  assert.match(component, /Mentetlen módosításaid vannak\. Biztosan elhagyod ezt az oldalt\?/);
  assert.match(component, /event\.preventDefault\(\)/);
  assert.match(component, /const confirmation = hasUnsavedChanges/);
  assert.match(component, /: "Biztosan kijelentkezel a LeadFlow-ból\?"/);
  assert.match(component, /window\.confirm\(confirmation\)/);
  assert.equal((component.match(/onNavigate=/g) || []).length, 4);
  assert.match(component, /supabase\.auth\.signOut\(\)/);
  assert.match(component, /text-red-700/);
  assert.match(component, /lg:hidden/);
  assert.match(component, /hidden w-64[^\n]+lg:block/);

  const dashboard = read("app/page.tsx");
  assert.doesNotMatch(dashboard, /aria-label="Fő navigáció"/);
  assert.doesNotMatch(dashboard, /Kijelentkezés/);
});

test("dashboard keeps the daily workflow actions", () => {
  const dashboard = read("app/page.tsx");
  assert.match(dashboard, /href="\/pipeline"/);
  assert.match(dashboard, /Saját mai és lejárt teendők/);
  assert.match(dashboard, /Kiosztatlan mai és lejárt teendők/);
  assert.match(dashboard, /A csapat mai és lejárt teendői/);
  assert.match(dashboard, /useLeadAssignees/);
  assert.match(dashboard, /assigned_user_id === currentUserId/);
  assert.match(dashboard, /!canAssign \? "mine"/);
  assert.match(dashboard, /canAssign && <div[^>]+aria-label="Teendők hatóköre"/);
  assert.match(dashboard, /Teendők hatóköre/);
  assert.match(dashboard, /urgentNextActionLeads/);
  assert.match(dashboard, /href=\{`\/leads\/\$\{lead\.id\}`\}/);
  assert.match(dashboard, /Elvégezve/);
  assert.match(dashboard, /Átütemezés/);
  assert.match(dashboard, /fetch\("\/api\/lead-next-action"/);
  assert.match(dashboard, /expectedNextAction: lead\.next_action/);
  assert.match(dashboard, /az érdeklődő és a riportadatai megmaradnak/i);
  assert.match(dashboard, /recentActivities\(leads, messages\)/);
  assert.match(dashboard, /monthlyPerformance\(leads, now\)/);
  assert.match(dashboard, /Havi eredmények/);
  assert.match(dashboard, /Megvalósulási arány/);
  assert.match(dashboard, /a rögzített eredményű lezárt ügyek alapján/i);
  assert.match(dashboard, /segment=won/);
  assert.match(dashboard, /segment=lost/);
  assert.doesNotMatch(dashboard, /title: "Kimenő üzenet létrehozva"/);
});

test("company profile exposes the logo needed by the shared shell", () => {
  const route = read("app/api/account-profile/route.ts");
  assert.match(route, /select\("name,public_slug,logo_url,brand_primary,brand_secondary,branding_mode,show_company_name"\)/);
  assert.match(route, /companyLogoUrl: branding\.logoUrl/);
  assert.match(route, /brandPrimary: branding\.brandPrimary/);
});

test("settings are separated into focused categories", () => {
  const settings = read("app/settings/page.tsx");
  for (const [id, label] of [
    ["account", "Saját fiók"],
    ["company", "Vállalkozás"],
    ["team", "Csapat"],
    ["messages", "Üzenetek"],
    ["privacy", "Adatvédelem"],
    ["automation", "Automatizálás"],
  ]) {
    assert.match(settings, new RegExp(`id: "${id}", label: "${label}"`));
    assert.match(settings, new RegExp(`activeSection === "${id}"`));
  }
  assert.match(settings, /window\.location\.hash\.slice\(1\)/);
  assert.match(settings, /window\.history\.replaceState/);
  assert.match(settings, /<AppShell hasUnsavedChanges=\{hasUnsavedChanges\}>/);
  assert.match(settings, /window\.addEventListener\("beforeunload"/);
  assert.match(settings, /aria-live="polite" aria-atomic="true" aria-busy=\{saving\}/);
  assert.match(settings, /Mentés folyamatban…/);
  assert.match(settings, /activeSection === "automation" && <div id="automation"/);
});
