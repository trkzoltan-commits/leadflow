import { pathToFileURL } from "node:url";
import { issueCompanyMakeKey, validateOutputPath } from "./issue-company-make-key.mjs";
import { provisionCompany, validateCompanyInput } from "./provision-company.mjs";

export async function prepareCompanyOnboarding(client, name, slug, options = {}) {
  const { companyName, companySlug } = validateCompanyInput(name, slug);
  if (!options.create) {
    const company = await provisionCompany(client, companyName, companySlug, false);
    return { created: false, companyName: company.companyName, companySlug: company.companySlug };
  }

  validateOutputPath(options.keyPath, options.projectRoot);
  const company = await provisionCompany(client, companyName, companySlug, true);
  try {
    await issueCompanyMakeKey(client, companySlug, {
      issue: true,
      outputPath: options.keyPath,
      projectRoot: options.projectRoot,
    });
  } catch (error) {
    throw new Error(
      `A cég elkészült, de a Make-kulcs kiadása sikertelen. Ne hozd létre újra a céget; folytasd a kulcskiadási lépéssel. ${error instanceof Error ? error.message : ""}`.trim(),
    );
  }

  return { created: true, company: company.company, keyPath: options.keyPath };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [name, slug, flag, keyPath, extra] = process.argv.slice(2);
  try {
    if (!name || !slug || extra || (flag !== undefined && flag !== "--create") || (flag === "--create" && !keyPath)) {
      throw new Error('Használat: node --env-file=.env.local scripts/prepare-company-onboarding.mjs "Cégnév" ceg-slug [--create ABSZOLUT-KULCSFAJL]');
    }
    if (flag === "--create") validateOutputPath(keyPath);
    if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SECRET_KEY) {
      throw new Error("A Supabase szerveroldali környezeti változói hiányoznak.");
    }

    const { createClient } = await import("@supabase/supabase-js");
    const client = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SECRET_KEY, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    });
    const result = await prepareCompanyOnboarding(client, name, slug, {
      create: flag === "--create",
      keyPath,
    });

    if (!result.created) {
      process.stdout.write("Az előellenőrzés sikeres. Nem történt módosítás; létrehozáshoz add meg a --create kapcsolót és a projekten kívüli kulcsfájlt.\n");
    } else {
      process.stdout.write([
        "A cég, a kézi alapbeállítások, a letiltott saját Make-kapcsolat és a Make-kulcs elkészült.",
        `Publikus ajánlatkérő: https://leadflow-three-psi.vercel.app/ajanlatkeres/${result.company.public_slug}`,
        "A kulcs kizárólag a megadott helyi fájlban van. Make-be másolás után töröld.",
        `Következő lépés: node --env-file=.env.local scripts/invite-company-owner.mjs ${result.company.public_slug} owner@example.com`,
        "",
      ].join("\n"));
    }
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : "Az onboarding előkészítése sikertelen."}\n`);
    process.exitCode = 1;
  }
}
