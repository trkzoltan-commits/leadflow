import { mkdir, open, readFile, unlink } from "node:fs/promises";
import { isAbsolute, join, relative, resolve } from "node:path";
import { pathToFileURL } from "node:url";

const slugPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const keyPattern = /^lfmk_[a-f0-9]{64}$/;

export function validateExternalPath(filePath, projectRoot = process.cwd()) {
  if (!filePath || !isAbsolute(filePath)) throw new Error("Minden fájlútvonalnak abszolútnak kell lennie.");
  const rel = relative(resolve(projectRoot), resolve(filePath));
  if (!rel || (!rel.startsWith("..") && !isAbsolute(rel))) {
    throw new Error("A Make-kulcsot tartalmazó fájlok nem lehetnek a projektmappában.");
  }
}

export function patchBlueprintSecrets(blueprint, token) {
  if (!keyPattern.test(token)) throw new Error("A Make-kulcs formátuma érvénytelen.");
  let replaced = 0;
  function visit(value) {
    if (!value || typeof value !== "object") return;
    if (Array.isArray(value)) {
      value.forEach(visit);
      return;
    }
    if (typeof value.name === "string" && value.name.toLowerCase() === "x-leadflow-secret" && "value" in value) {
      value.value = token;
      replaced += 1;
    }
    for (const [key, child] of Object.entries(value)) {
      if (key !== "value" || value.name?.toLowerCase() !== "x-leadflow-secret") visit(child);
    }
  }
  visit(blueprint);
  if (replaced === 0) throw new Error("A blueprint nem tartalmaz x-leadflow-secret fejlécet.");
  return { blueprint, replaced };
}

export async function prepareCompanyMakeBlueprints(options) {
  const { slug, keyPath, newLeadInput, approvedReplyInput, outputDirectory, projectRoot = process.cwd() } = options;
  if (typeof slug !== "string" || slug.length < 3 || slug.length > 63 || !slugPattern.test(slug)) {
    throw new Error("Érvénytelen céges slug.");
  }
  for (const path of [keyPath, newLeadInput, approvedReplyInput, outputDirectory]) validateExternalPath(path, projectRoot);
  const token = (await readFile(keyPath, "utf8")).trim();
  if (!keyPattern.test(token)) throw new Error("A Make-kulcs formátuma érvénytelen.");

  const inputs = [
    { path: newLeadInput, output: join(outputDirectory, `${slug}-new-lead.blueprint.json`) },
    { path: approvedReplyInput, output: join(outputDirectory, `${slug}-send-approved-reply.blueprint.json`) },
  ];
  await mkdir(outputDirectory, { recursive: true });
  const created = [];
  const results = [];
  try {
    for (const input of inputs) {
      const parsed = JSON.parse(await readFile(input.path, "utf8"));
      const patched = patchBlueprintSecrets(parsed, token);
      const file = await open(input.output, "wx", 0o600);
      try {
        await file.writeFile(JSON.stringify(patched.blueprint), "utf8");
      } finally {
        await file.close();
      }
      created.push(input.output);
      results.push({ output: input.output, replaced: patched.replaced });
    }
    return results;
  } catch (error) {
    await Promise.all(created.map(path => unlink(path).catch(() => {})));
    if (error instanceof SyntaxError) throw new Error("Az egyik blueprint nem érvényes JSON.");
    throw error;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [slug, keyPath, newLeadInput, approvedReplyInput, outputDirectory, extra] = process.argv.slice(2);
  try {
    if (!slug || !keyPath || !newLeadInput || !approvedReplyInput || !outputDirectory || extra) {
      throw new Error("Használat: node scripts/prepare-company-make-blueprints.mjs ceg-slug ABSZOLUT-KULCSFAJL ABSZOLUT-NEW-LEAD-BLUEPRINT ABSZOLUT-REPLY-BLUEPRINT ABSZOLUT-KIMENETI-MAPPA");
    }
    const results = await prepareCompanyMakeBlueprints({ slug, keyPath, newLeadInput, approvedReplyInput, outputDirectory });
    for (const result of results) process.stdout.write(`${result.replaced} hitelesítési fejléc frissítve: ${result.output}\n`);
    process.stdout.write("A két blueprint importálható a cég saját Make-forgatókönyveibe. Importálás után töröld a kulcsfájlt és a két előkészített blueprintet.\n");
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : "A blueprintek előkészítése sikertelen."}\n`);
    process.exitCode = 1;
  }
}
