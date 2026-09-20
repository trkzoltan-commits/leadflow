import { pathToFileURL } from "node:url";

const slugPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

function validWebhook(value) {
  if (typeof value !== "string") return false;
  try {
    const url = new URL(value);
    return url.protocol === "https:" && /^hook\.(eu[12]|us[12])\.make\.com$/.test(url.hostname)
      && !url.port && !url.username && !url.password && !url.search && !url.hash
      && /^\/[a-zA-Z0-9_-]+$/.test(url.pathname);
  } catch { return false; }
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
    .select("id").eq("company_id", company.id).eq("role", "owner").limit(1).maybeSingle();
  const { data: connection, error: connectionError } = await client.from("company_make_connections")
    .select("mode,enabled,new_lead_webhook_url,approved_reply_webhook_url")
    .eq("company_id", company.id).maybeSingle();
  const { data: credential, error: credentialError } = await client.from("make_credentials")
    .select("id").eq("company_id", company.id).is("revoked_at", null).limit(1).maybeSingle();
  if (settingsError || ownerError || connectionError || credentialError) {
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
  };
  return { checks, ready: Object.values(checks).every(Boolean) };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [slug, extra] = process.argv.slice(2);
  try {
    if (!slug || extra) throw new Error("Használat: node --env-file=.env.local scripts/check-company-onboarding.mjs ceg-slug");
    if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SECRET_KEY) {
      throw new Error("A Supabase szerveroldali környezeti változói hiányoznak.");
    }
    const { createClient } = await import("@supabase/supabase-js");
    const client = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SECRET_KEY, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    });
    const { checks, ready } = await checkCompanyOnboarding(client, slug);
    const labels = {
      settings: "Céges beállítások", owner: "Tulajdonos", companyMakeMode: "Saját Make-mód",
      activeMakeKey: "Aktív Make-kulcs", newLeadWebhook: "Új érdeklődő webhook",
      approvedReplyWebhook: "Jóváhagyott válasz webhook", makeEnabled: "Make engedélyezve",
    };
    for (const [key, label] of Object.entries(labels)) {
      process.stdout.write(`${checks[key] ? "OK" : "HIÁNYZIK"} – ${label}\n`);
    }
    process.stdout.write(ready ? "Az alapbeállítások teljesek; élő izolációs próba még szükséges.\n"
      : "A bekötés még nem teljes.\n");
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : "Az ellenőrzés sikertelen."}\n`);
    process.exitCode = 1;
  }
}
