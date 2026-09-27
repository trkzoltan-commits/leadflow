import { pathToFileURL } from "node:url";

const allowedStatuses = new Set(["pending", "accepted", "uncertain", "failed", "completed", "unconfigured"]);

export function summarizeDispatches(rows, now = new Date()) {
  const summary = Object.fromEntries([...allowedStatuses].map(status => [status, 0]));
  let oldestUnresolvedMinutes = null;
  for (const row of rows || []) {
    if (allowedStatuses.has(row.status)) summary[row.status]++;
    if (["pending", "accepted", "uncertain", "failed", "unconfigured"].includes(row.status)) {
      const timestamp = new Date(row.last_attempt_at || row.updated_at).getTime();
      if (Number.isFinite(timestamp)) {
        const minutes = Math.max(0, Math.floor((now.getTime() - timestamp) / 60_000));
        oldestUnresolvedMinutes = oldestUnresolvedMinutes === null ? minutes : Math.max(oldestUnresolvedMinutes, minutes);
      }
    }
  }
  return { total: rows?.length || 0, summary, oldestUnresolvedMinutes };
}

export async function checkAutomationDispatches(client, slug) {
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug || "")) throw new Error("Érvénytelen céges slug.");
  const { data: company, error: companyError } = await client.from("companies")
    .select("id").eq("public_slug", slug).maybeSingle();
  if (companyError || !company) throw new Error("A cég nem található, vagy nem ellenőrizhető.");
  const { data, error } = await client.from("automation_dispatches")
    .select("event_type,status,attempt_count,last_attempt_at,updated_at")
    .eq("company_id", company.id)
    .order("updated_at", { ascending: false })
    .limit(500);
  if (error) throw new Error("Az automatizálási napló nem ellenőrizhető.");
  return summarizeDispatches(data);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [slug, extra] = process.argv.slice(2);
  try {
    if (!slug || extra) throw new Error("Használat: node --env-file=.env.local scripts/check-automation-dispatches.mjs ceg-slug");
    if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SECRET_KEY) {
      throw new Error("A Supabase szerveroldali környezeti változói hiányoznak.");
    }
    const { createClient } = await import("@supabase/supabase-js");
    const client = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SECRET_KEY, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    });
    const result = await checkAutomationDispatches(client, slug);
    process.stdout.write(`Naplózott indítások: ${result.total}\n`);
    for (const status of allowedStatuses) process.stdout.write(`${status}: ${result.summary[status]}\n`);
    process.stdout.write(result.oldestUnresolvedMinutes === null
      ? "Nincs nyitott automatizálási esemény.\n"
      : `A legrégebbi nyitott esemény kora: ${result.oldestUnresolvedMinutes} perc.\n`);
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : "Az ellenőrzés sikertelen."}\n`);
    process.exitCode = 1;
  }
}
