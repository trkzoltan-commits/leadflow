import { pathToFileURL } from "node:url";

const slugPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export function validateCompanyInput(name, slug) {
  const companyName = typeof name === "string" ? name.trim() : "";
  const companySlug = typeof slug === "string" ? slug.trim() : "";

  if (!companyName || companyName.length > 200) {
    throw new Error("A cégnév 1–200 karakter lehet.");
  }
  if (companySlug.length < 3 || companySlug.length > 63 || !slugPattern.test(companySlug)) {
    throw new Error("A slug 3–63 karakteres, kisbetűs, számokat és belső kötőjeleket tartalmazó azonosító legyen.");
  }

  return { companyName, companySlug };
}

export async function provisionCompany(client, name, slug, create = false) {
  const { companyName, companySlug } = validateCompanyInput(name, slug);
  const { data: existing, error: lookupError } = await client.from("companies")
    .select("id").eq("public_slug", companySlug).maybeSingle();

  if (lookupError) throw new Error("A céges slug nem ellenőrizhető.");
  if (existing) throw new Error("Ez a céges slug már foglalt.");
  if (!create) return { created: false, companyName, companySlug };

  const { data, error } = await client.rpc("provision_company", {
    company_name: companyName,
    company_slug: companySlug,
  });
  const company = Array.isArray(data) ? data[0] : data;

  if (error || !company?.id || company.public_slug !== companySlug) {
    throw new Error("A cég biztonságos létrehozása sikertelen.");
  }

  return { created: true, company };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [name, slug, flag, extra] = process.argv.slice(2);
  try {
    if (!name || !slug || extra || (flag !== undefined && flag !== "--create")) {
      throw new Error('Használat: node --env-file=.env.local scripts/provision-company.mjs "Cégnév" ceg-slug [--create]');
    }
    if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SECRET_KEY) {
      throw new Error("A Supabase szerveroldali környezeti változói hiányoznak.");
    }

    const { createClient } = await import("@supabase/supabase-js");
    const client = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SECRET_KEY, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    });
    const result = await provisionCompany(client, name, slug, flag === "--create");

    if (!result.created) {
      process.stdout.write("Az ellenőrzés sikeres. Nem történt módosítás; létrehozáshoz add meg a --create kapcsolót.\n");
    } else {
      process.stdout.write(`A cég alapbeállításai elkészültek.\nPublikus ajánlatkérő: https://leadflow-three-psi.vercel.app/ajanlatkeres/${result.company.public_slug}\nKövetkező lépés: tulajdonosi meghívó előellenőrzése.\n`);
    }
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : "A cég létrehozása sikertelen."}\n`);
    process.exitCode = 1;
  }
}
