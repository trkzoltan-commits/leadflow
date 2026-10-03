import { pathToFileURL } from "node:url";

const slugPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export const onboardingMilestones = Object.freeze({
  "owner-login": "ownerLoginVerified",
  "new-lead-flow": "newLeadFlowVerified",
  "approved-reply-flow": "approvedReplyFlowVerified",
  "tenant-isolation": "tenantIsolationVerified",
});

const milestoneColumns = Object.freeze({
  ownerLoginVerified: "owner_login_verified_at",
  newLeadFlowVerified: "new_lead_flow_verified_at",
  approvedReplyFlowVerified: "approved_reply_flow_verified_at",
  tenantIsolationVerified: "tenant_isolation_verified_at",
});

function validWebhook(value) {
  if (typeof value !== "string") return false;
  try {
    const url = new URL(value);
    return url.protocol === "https:" && /^hook\.(eu[12]|us[12])\.make\.com$/.test(url.hostname)
      && !url.port && !url.username && !url.password && !url.search && !url.hash
      && /^\/[a-zA-Z0-9_-]+$/.test(url.pathname);
  } catch { return false; }
}

export function nextOnboardingStep(checks) {
  if (!checks.settings || !checks.companyMakeMode) {
    return { code: "repair_provisioning", message: "Ellenőrizd a cég alapbeállításait és a saját Make-módot." };
  }
  if (!checks.owner) {
    return { code: "invite_owner", message: "Küldd ki a tulajdonosi meghívót, majd ellenőrizd a céghez rendelést." };
  }
  if (!checks.activeMakeKey) {
    return { code: "issue_make_key", message: "Add ki az első céges Make-kulcsot projekten kívüli fájlba." };
  }
  if (!checks.newLeadWebhook || !checks.approvedReplyWebhook) {
    return { code: "configure_webhooks", message: "Készítsd elő a két Make-forgatókönyvet, majd rögzítsd mindkét webhookot letiltott kapcsolat mellett." };
  }
  if (!checks.makeEnabled) {
    return { code: "verify_and_enable", message: "Ellenőrizd a két Make-forgatókönyv beállítását, majd engedélyezd a kapcsolatot az élő próbákhoz." };
  }
  if (!checks.ownerLoginVerified) {
    return { code: "verify_owner_login", message: "Ellenőrizd a tulajdonosi meghívót és belépést, majd igazold: --confirm owner-login" };
  }
  if (!checks.newLeadFlowVerified) {
    return { code: "verify_new_lead_flow", message: "Küldj teszt ajánlatkérést, ellenőrizd a LeadFlow-rekordot és a belső értesítést, majd igazold: --confirm new-lead-flow" };
  }
  if (!checks.approvedReplyFlowVerified) {
    return { code: "verify_approved_reply_flow", message: "Küldj jóváhagyott tesztválaszt, ellenőrizd a kézbesítést és visszaigazolást, majd igazold: --confirm approved-reply-flow" };
  }
  if (!checks.tenantIsolationVerified) {
    return { code: "verify_tenant_isolation", message: "Ellenőrizd két céggel az adat- és Make-izolációt, majd igazold: --confirm tenant-isolation" };
  }
  return { code: "pilot_ready", message: "A cég pilotra kész." };
}

export async function checkCompanyOnboarding(client, slug) {
  if (typeof slug !== "string" || slug.length < 3 || slug.length > 63 || !slugPattern.test(slug)) {
    throw new Error("Érvénytelen céges slug.");
  }
  const { data: company, error: companyError } = await client.from("companies")
    .select("id").eq("public_slug", slug).maybeSingle();
  if (companyError || !company) throw new Error("A cég nem található, vagy nem ellenőrizhető.");

  const { data: settings, error: settingsError } = await client.from("company_settings")
    .select("auto_reply_mode").eq("company_id", company.id).maybeSingle();
  const { data: owner, error: ownerError } = await client.from("users")
    .select("id").eq("company_id", company.id).eq("role", "owner").eq("is_active", true).limit(1).maybeSingle();
  const { data: connection, error: connectionError } = await client.from("company_make_connections")
    .select("mode,enabled,new_lead_webhook_url,approved_reply_webhook_url")
    .eq("company_id", company.id).maybeSingle();
  const { data: credential, error: credentialError } = await client.from("make_credentials")
    .select("id").eq("company_id", company.id).is("revoked_at", null).limit(1).maybeSingle();
  const { data: progress, error: progressError } = await client.from("company_onboarding_progress")
    .select(Object.values(milestoneColumns).join(",")).eq("company_id", company.id).maybeSingle();
  if (settingsError || ownerError || connectionError || credentialError || progressError) {
    throw new Error("Az onboarding állapota nem ellenőrizhető.");
  }
  const checks = {
    settings: Boolean(settings),
    owner: Boolean(owner),
    companyMakeMode: connection?.mode === "company",
    activeMakeKey: Boolean(credential),
    newLeadWebhook: validWebhook(connection?.new_lead_webhook_url),
    approvedReplyWebhook: validWebhook(connection?.approved_reply_webhook_url),
    makeEnabled: connection?.enabled === true,
    ownerLoginVerified: Boolean(progress?.owner_login_verified_at),
    newLeadFlowVerified: Boolean(progress?.new_lead_flow_verified_at),
    approvedReplyFlowVerified: Boolean(progress?.approved_reply_flow_verified_at),
    tenantIsolationVerified: Boolean(progress?.tenant_isolation_verified_at),
  };
  const ready = Object.values(checks).every(Boolean);
  return { checks, ready, nextStep: nextOnboardingStep(checks) };
}

export async function confirmOnboardingMilestone(client, slug, milestone, now = new Date()) {
  const checkKey = onboardingMilestones[milestone];
  if (!checkKey) throw new Error("Ismeretlen ellenőrzési pont.");
  if (Number.isNaN(now.getTime())) throw new Error("Érvénytelen időpont.");
  if (typeof slug !== "string" || slug.length < 3 || slug.length > 63 || !slugPattern.test(slug)) {
    throw new Error("Érvénytelen céges slug.");
  }
  const { data: company, error: companyError } = await client.from("companies")
    .select("id").eq("public_slug", slug).maybeSingle();
  if (companyError || !company) throw new Error("A cég nem található, vagy nem ellenőrizhető.");

  const column = milestoneColumns[checkKey];
  const timestamp = now.toISOString();
  const { error } = await client.from("company_onboarding_progress").upsert({
    company_id: company.id,
    [column]: timestamp,
    updated_at: timestamp,
  }, { onConflict: "company_id" });
  if (error) throw new Error("Az ellenőrzési pont nem menthető.");
  return { milestone, checkKey };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [slug, flag, milestone, extra] = process.argv.slice(2);
  try {
    if (!slug || extra || (flag && flag !== "--confirm") || (flag === "--confirm" && !milestone) || (!flag && milestone)) {
      throw new Error("Használat: node --env-file=.env.local scripts/check-company-onboarding.mjs ceg-slug [--confirm ellenorzesi-pont]");
    }
    if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SECRET_KEY) {
      throw new Error("A Supabase szerveroldali környezeti változói hiányoznak.");
    }
    const { createClient } = await import("@supabase/supabase-js");
    const client = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SECRET_KEY, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    });
    if (flag === "--confirm") {
      await confirmOnboardingMilestone(client, slug, milestone);
      process.stdout.write("Az ellenőrzési pont mentve.\n");
    }
    const { checks, ready, nextStep } = await checkCompanyOnboarding(client, slug);
    const labels = {
      settings: "Céges beállítások", owner: "Tulajdonos", companyMakeMode: "Saját Make-mód",
      activeMakeKey: "Aktív Make-kulcs", newLeadWebhook: "Új érdeklődő webhook",
      approvedReplyWebhook: "Jóváhagyott válasz webhook", makeEnabled: "Make engedélyezve",
      ownerLoginVerified: "Tulajdonosi belépés élő próbája",
      newLeadFlowVerified: "Bejövő érdeklődő élő próbája",
      approvedReplyFlowVerified: "Jóváhagyott válasz élő próbája",
      tenantIsolationVerified: "Kétcéges izolációs próba",
    };
    for (const [key, label] of Object.entries(labels)) {
      process.stdout.write(`${checks[key] ? "OK" : "HIÁNYZIK"} – ${label}\n`);
    }
    process.stdout.write(ready ? "A cég pilotra kész.\n"
      : "A bekötés még nem teljes.\n");
    process.stdout.write(`Következő lépés: ${nextStep.message}\n`);
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : "Az ellenőrzés sikertelen."}\n`);
    process.exitCode = 1;
  }
}
