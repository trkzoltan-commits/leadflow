import { pathToFileURL } from "node:url";

const inviteRedirect = "https://leadflow-three-psi.vercel.app/meghivas";
const slugPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export function validateInviteInput(slug, email) {
  if (typeof slug !== "string" || slug.length < 3 || slug.length > 63 || !slugPattern.test(slug)) {
    throw new Error("Érvénytelen céges slug.");
  }
  if (typeof email !== "string" || email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new Error("Érvénytelen e-mail cím.");
  }
}

export async function inviteCompanyOwner(client, slug, email, send = false) {
  validateInviteInput(slug, email);
  const { data: company, error: companyError } = await client.from("companies")
    .select("id").eq("public_slug", slug).maybeSingle();
  if (companyError || !company) throw new Error("A cég nem található, vagy nem ellenőrizhető.");

  const { data: owner, error: ownerError } = await client.from("users")
    .select("id").eq("company_id", company.id).eq("role", "owner").limit(1).maybeSingle();
  if (ownerError) throw new Error("A céges tulajdonos nem ellenőrizhető.");
  if (owner) throw new Error("A céghez már tartozik tulajdonos; újabb meghívás előtt ellenőrzés szükséges.");
  if (!send) return { sent: false };

  const { data: invited, error: inviteError } = await client.auth.admin.inviteUserByEmail(email, {
    redirectTo: inviteRedirect,
  });
  if (inviteError || !invited?.user?.id) {
    throw new Error("A meghívó küldése nem sikerült. Ellenőrizd az Auth beállításait.");
  }

  const { error: linkError } = await client.from("users").insert({
    id: invited.user.id, company_id: company.id, role: "owner",
  });
  if (linkError) {
    throw new Error("A meghívó kiment, de a fiók céghez rendelése sikertelen. A meghívott még nem állíthat be jelszót; az Auth-azonosítót az üzemeltetőnek kell egyeztetnie.");
  }
  return { sent: true };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [slug, email, flag] = process.argv.slice(2);
  try {
    if (!slug || !email || (flag !== undefined && flag !== "--send")) {
      throw new Error("Használat: node --env-file=.env.local scripts/invite-company-owner.mjs ceg-slug email@pelda.hu [--send]");
    }
    validateInviteInput(slug, email);
    if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SECRET_KEY) {
      throw new Error("A Supabase szerveroldali környezeti változói hiányoznak.");
    }
    const { createClient } = await import("@supabase/supabase-js");
    const client = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SECRET_KEY, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    });
    const result = await inviteCompanyOwner(client, slug, email, flag === "--send");
    process.stdout.write(result.sent
      ? "A meghívó kiment, és a tulajdonos a céghez lett rendelve.\n"
      : "Az ellenőrzés sikeres. Nem ment ki meghívó; a küldéshez add meg a --send kapcsolót.\n");
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : "A meghívás sikertelen."}\n`);
    process.exitCode = 1;
  }
}
