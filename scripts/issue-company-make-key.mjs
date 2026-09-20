import { createHash, randomBytes } from "node:crypto";
import { open, unlink } from "node:fs/promises";
import { isAbsolute, relative, resolve } from "node:path";
import { pathToFileURL } from "node:url";

const slugPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export function validateOutputPath(outputPath, projectRoot = process.cwd()) {
  if (!outputPath || !isAbsolute(outputPath)) throw new Error("Adj meg abszolút kimeneti fájlútvonalat.");
  const rel = relative(resolve(projectRoot), resolve(outputPath));
  if (!rel || (!rel.startsWith("..") && !isAbsolute(rel))) {
    throw new Error("A kulcs fájlja nem lehet a projektmappában.");
  }
}

export async function issueCompanyMakeKey(client, slug, options = {}) {
  if (typeof slug !== "string" || slug.length < 3 || slug.length > 63 || !slugPattern.test(slug)) {
    throw new Error("Érvénytelen céges slug.");
  }
  const { data: company, error: companyError } = await client.from("companies")
    .select("id").eq("public_slug", slug).maybeSingle();
  if (companyError || !company) throw new Error("A cég nem található, vagy nem ellenőrizhető.");

  const { data: connection, error: connectionError } = await client.from("company_make_connections")
    .select("mode,enabled").eq("company_id", company.id).maybeSingle();
  if (connectionError || !connection || connection.mode !== "company" || connection.enabled !== false) {
    throw new Error("A céges Make-kapcsolat hiányzik, nem saját módú, vagy már engedélyezett.");
  }

  const { data: existing, error: credentialError } = await client.from("make_credentials")
    .select("id").eq("company_id", company.id).is("revoked_at", null).limit(1).maybeSingle();
  if (credentialError) throw new Error("A meglévő Make-kulcs nem ellenőrizhető.");
  if (existing) throw new Error("A cégnek már van aktív Make-kulcsa. Kulcsrotációhoz külön eljárás kell.");
  if (!options.issue) return { issued: false };

  validateOutputPath(options.outputPath, options.projectRoot);
  const token = `lfmk_${randomBytes(32).toString("hex")}`;
  const tokenHash = createHash("sha256").update(token).digest("hex");
  let file;
  let created = false;
  try {
    file = await open(options.outputPath, "wx", 0o600);
    created = true;
    await file.writeFile(`${token}\n`, "utf8");
    await file.close();
    file = undefined;
    const { error } = await client.from("make_credentials").insert({ company_id: company.id, token_hash: tokenHash });
    if (error) throw new Error("A kulcs lenyomata nem menthető.");
  } catch {
    if (file) await file.close().catch(() => {});
    if (created) await unlink(options.outputPath).catch(() => {});
    throw new Error("A kulcs kiadása sikertelen. Ellenőrizd a fájlhelyet és az adatbázist.");
  }
  return { issued: true };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [slug, flag, outputPath, extra] = process.argv.slice(2);
  try {
    if (!slug || extra || (flag !== undefined && flag !== "--issue") || (flag === "--issue" && !outputPath)) {
      throw new Error("Használat: node --env-file=.env.local scripts/issue-company-make-key.mjs ceg-slug [--issue ABSZOLUT-KIMENETI-FAJL]");
    }
    if (flag === "--issue") validateOutputPath(outputPath);
    if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SECRET_KEY) {
      throw new Error("A Supabase szerveroldali környezeti változói hiányoznak.");
    }
    const { createClient } = await import("@supabase/supabase-js");
    const client = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SECRET_KEY, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    });
    const result = await issueCompanyMakeKey(client, slug, { issue: flag === "--issue", outputPath });
    process.stdout.write(result.issued
      ? "A kulcs kiadva. A titok kizárólag a megadott helyi fájlban van; Make-be másolás után töröld a fájlt.\n"
      : "Az ellenőrzés sikeres. Nem készült kulcs; kiadáshoz add meg a --issue kapcsolót és a fájlútvonalat.\n");
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : "A művelet sikertelen."}\n`);
    process.exitCode = 1;
  }
}
