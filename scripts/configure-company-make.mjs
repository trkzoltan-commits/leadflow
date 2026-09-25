import { readFile } from "node:fs/promises";
import { isAbsolute, relative, resolve } from "node:path";
import { pathToFileURL } from "node:url";

const slugPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export function validMakeWebhook(value) {
  if (typeof value !== "string") return false;
  try {
    const url = new URL(value);
    return url.protocol === "https:" && /^hook\.(eu[12]|us[12])\.make\.com$/.test(url.hostname)
      && !url.port && !url.username && !url.password && !url.search && !url.hash
      && /^\/[a-zA-Z0-9_-]+$/.test(url.pathname);
  } catch { return false; }
}

export function validateConfigPath(configPath, projectRoot = process.cwd()) {
  if (!configPath || !isAbsolute(configPath)) throw new Error("Adj meg abszolút konfigurációs fájlútvonalat.");
  const rel = relative(resolve(projectRoot), resolve(configPath));
  if (!rel || (!rel.startsWith("..") && !isAbsolute(rel))) {
    throw new Error("A webhook-konfiguráció nem lehet a projektmappában.");
  }
}

export async function configureCompanyMake(client, slug, config, action = "check") {
  if (typeof slug !== "string" || slug.length < 3 || slug.length > 63 || !slugPattern.test(slug)) {
    throw new Error("Érvénytelen céges slug.");
  }
  if (!config || !validMakeWebhook(config.newLeadWebhookUrl)
    || !validMakeWebhook(config.approvedReplyWebhookUrl)) {
    throw new Error("A két Make-webhook címe hiányzik vagy érvénytelen.");
  }
  const { data: company, error: companyError } = await client.from("companies")
    .select("id").eq("public_slug", slug).maybeSingle();
  if (companyError || !company) throw new Error("A cég nem található, vagy nem ellenőrizhető.");
  const { data: connection, error: connectionError } = await client.from("company_make_connections")
    .select("mode,enabled").eq("company_id", company.id).maybeSingle();
  if (connectionError || !connection || connection.mode !== "company") {
    throw new Error("A cég saját Make-kapcsolata hiányzik vagy nem ellenőrizhető.");
  }
  if (connection.enabled) throw new Error("A Make-kapcsolat már engedélyezett; módosításhoz külön rotációs eljárás kell.");
  const { data: credential, error: credentialError } = await client.from("make_credentials")
    .select("id").eq("company_id", company.id).is("revoked_at", null).limit(1).maybeSingle();
  if (credentialError || !credential) throw new Error("A cég aktív Make-kulcsa hiányzik vagy nem ellenőrizhető.");
  if (!new Set(["check", "stage", "enable"]).has(action)) throw new Error("Érvénytelen művelet.");
  if (action === "check") return { action: "checked" };

  const { data: updated, error: updateError } = await client.from("company_make_connections")
    .update({ new_lead_webhook_url: config.newLeadWebhookUrl,
      approved_reply_webhook_url: config.approvedReplyWebhookUrl, enabled: action === "enable" })
    .eq("company_id", company.id).eq("mode", "company").eq("enabled", false)
    .select("company_id").maybeSingle();
  if (updateError || !updated) throw new Error("A Make-kapcsolat nem állítható be biztonságosan.");
  return { action: action === "enable" ? "enabled" : "staged" };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [slug, configPath, flag, extra] = process.argv.slice(2);
  try {
    if (!slug || !configPath || extra || ![undefined, "--stage", "--enable"].includes(flag)) {
      throw new Error("Használat: node --env-file=.env.local scripts/configure-company-make.mjs ceg-slug ABSZOLUT-KONFIG-FAJL [--stage|--enable]");
    }
    validateConfigPath(configPath);
    const config = JSON.parse(await readFile(configPath, "utf8"));
    if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SECRET_KEY) {
      throw new Error("A Supabase szerveroldali környezeti változói hiányoznak.");
    }
    const { createClient } = await import("@supabase/supabase-js");
    const client = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SECRET_KEY, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    });
    const action = flag === "--stage" ? "stage" : flag === "--enable" ? "enable" : "check";
    const result = await configureCompanyMake(client, slug, config, action);
    process.stdout.write(result.action === "enabled"
      ? "A saját Make-kapcsolat beállítva és engedélyezve. A helyi konfigurációs fájlt töröld.\n"
      : result.action === "staged"
        ? "A két webhook elmentve; a Make-kapcsolat letiltva maradt az élő próba előtt.\n"
        : "Az ellenőrzés sikeres. Nem történt módosítás; előkészítéshez add meg a --stage kapcsolót.\n");
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : "A művelet sikertelen."}\n`);
    process.exitCode = 1;
  }
}
