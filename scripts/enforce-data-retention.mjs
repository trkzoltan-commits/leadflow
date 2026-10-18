import { pathToFileURL } from "node:url";

const slugPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

function parseStatus(value) {
  const row = Array.isArray(value) ? value[0] : value;
  if (!row || typeof row !== "object") throw new Error("Az adatmegőrzési eredmény érvénytelen.");
  for (const key of ["retention_months", "eligible_closed_count", "active_review_count", "anonymized_count"]) {
    if (!Number.isInteger(row[key]) || row[key] < 0) throw new Error("Az adatmegőrzési eredmény érvénytelen.");
  }
  if (typeof row.cutoff_at !== "string" || !Number.isFinite(new Date(row.cutoff_at).getTime())) {
    throw new Error("Az adatmegőrzési határidő érvénytelen.");
  }
  return row;
}

export async function runDataRetention(client, slug, apply = false) {
  if (typeof slug !== "string" || slug.length < 3 || slug.length > 63 || !slugPattern.test(slug)) {
    throw new Error("Érvénytelen céges slug.");
  }
  const { data: company, error: companyError } = await client.from("companies")
    .select("id").eq("public_slug", slug).maybeSingle();
  if (companyError || !company?.id) throw new Error("A cég nem található, vagy nem ellenőrizhető.");
  const rpcName = apply ? "apply_company_data_retention" : "preview_company_data_retention";
  const { data, error } = await client.rpc(rpcName, { p_company_id: company.id });
  if (error) throw new Error(apply ? "Az anonimizálás nem hajtható végre." : "Az adatmegőrzés nem ellenőrizhető.");
  return parseStatus(data);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [slug, flag, extra] = process.argv.slice(2);
  try {
    if (!slug || extra || (flag && flag !== "--apply")) {
      throw new Error("Használat: node --env-file=.env.local scripts/enforce-data-retention.mjs ceg-slug [--apply]");
    }
    if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SECRET_KEY) {
      throw new Error("A Supabase szerveroldali környezeti változói hiányoznak.");
    }
    const { createClient } = await import("@supabase/supabase-js");
    const client = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SECRET_KEY, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    });
    const result = await runDataRetention(client, slug, flag === "--apply");
    process.stdout.write(`Megőrzési idő: ${result.retention_months} hónap\n`);
    process.stdout.write(`Határidő: ${result.cutoff_at}\n`);
    process.stdout.write(`Lejárt lezárt ügyek: ${result.eligible_closed_count}\n`);
    process.stdout.write(`Ellenőrzendő aktív ügyek: ${result.active_review_count}\n`);
    if (flag === "--apply") {
      process.stdout.write(`Anonimizált lezárt ügyek: ${result.anonymized_count}\n`);
    } else {
      process.stdout.write("Nem történt módosítás. Az anonimizáláshoz futtasd újra a parancsot --apply kapcsolóval.\n");
    }
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : "Az adatmegőrzési művelet sikertelen."}\n`);
    process.exitCode = 1;
  }
}
