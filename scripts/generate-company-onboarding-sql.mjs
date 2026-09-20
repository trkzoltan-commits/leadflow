import { pathToFileURL } from "node:url";

const slugPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

function sqlText(value) {
  return `'${value.replaceAll("'", "''")}'`;
}

export function generateCompanyOnboardingSql(name, slug) {
  const companyName = name.trim();
  const companySlug = slug.trim();
  if (!companyName || companyName.length > 200) {
    throw new Error("A cégnév 1–200 karakter lehet.");
  }
  if (companySlug.length < 3 || companySlug.length > 63 || !slugPattern.test(companySlug)) {
    throw new Error("A slug 3–63 karakteres, kisbetűs, számokat és belső kötőjeleket tartalmazó azonosító legyen.");
  }

  return `-- LeadFlow: új cég alaprekordjai. Csak a megfelelő Supabase projekt SQL Editorában futtasd.
-- A Make-kapcsolat letiltva marad, amíg az ügyfél saját webhookjai és kulcsa nincsenek beállítva.
begin;
with new_company as (
  insert into public.companies (name, public_slug)
  values (${sqlText(companyName)}, ${sqlText(companySlug)})
  returning id, name, public_slug
), new_settings as (
  insert into public.company_settings (company_id, auto_reply_mode)
  select id, 'manual' from new_company
  returning company_id
), new_connection as (
  insert into public.company_make_connections (company_id, mode, enabled)
  select id, 'company', false from new_company
  returning company_id
)
select c.id, c.name, c.public_slug
from new_company c
join new_settings s on s.company_id = c.id
join new_connection m on m.company_id = c.id;
commit;
`;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [name, slug] = process.argv.slice(2);
  try {
    if (!name || !slug || process.argv.length !== 4) {
      throw new Error('Használat: node scripts/generate-company-onboarding-sql.mjs "Cégnév" ceg-slug');
    }
    process.stdout.write(generateCompanyOnboardingSql(name, slug));
  } catch (error) {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  }
}
