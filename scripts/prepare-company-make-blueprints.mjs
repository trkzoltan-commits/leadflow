import { mkdir, open, readFile, unlink } from "node:fs/promises";
import { isAbsolute, join, relative, resolve } from "node:path";
import { pathToFileURL } from "node:url";

const slugPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const keyPattern = /^lfmk_[a-f0-9]{64}$/;
const embeddedKeyPattern = /lfmk_[a-f0-9]{64}/g;
const literalEmailPattern = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i;
const internalEmailPlaceholder = "BEALLITANDO_BELSO_ERTESITESI_EMAIL";

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

function deleteRestoreParameter(module, name) {
  const parameters = module?.metadata?.restore?.parameters;
  if (parameters && typeof parameters === "object") delete parameters[name];
}

export function clearBlueprintProviderBindings(blueprint) {
  const result = {
    gmailConnectionsCleared: 0,
    webhooksCleared: 0,
    literalRecipientsCleared: 0,
    orphansCleared: 0,
  };

  const orphans = blueprint?.metadata?.designer?.orphans;
  if (Array.isArray(orphans) && orphans.length > 0) {
    delete blueprint.metadata.designer.orphans;
    result.orphansCleared = orphans.flat(Infinity).length;
  }

  function visit(value) {
    if (!value || typeof value !== "object") return;
    if (Array.isArray(value)) {
      value.forEach(visit);
      return;
    }

    if (value.module === "gateway:CustomWebHook") {
      if (value.parameters && Object.hasOwn(value.parameters, "hook")) {
        delete value.parameters.hook;
        result.webhooksCleared += 1;
      }
      deleteRestoreParameter(value, "hook");
    }

    if (typeof value.module === "string" && value.module.startsWith("google-email:")) {
      if (value.parameters && Object.hasOwn(value.parameters, "__IMTCONN__")) {
        delete value.parameters.__IMTCONN__;
        result.gmailConnectionsCleared += 1;
      }
      deleteRestoreParameter(value, "__IMTCONN__");
      if (Array.isArray(value.mapper?.to)) {
        value.mapper.to = value.mapper.to.map(recipient => {
          if (typeof recipient === "string" && literalEmailPattern.test(recipient)) {
            result.literalRecipientsCleared += 1;
            return internalEmailPlaceholder;
          }
          return recipient;
        });
      }
    }

    Object.values(value).forEach(visit);
  }

  visit(blueprint);
  return result;
}

function assertBlueprintContains(blueprint, markers, label) {
  const serialized = JSON.stringify(blueprint);
  for (const marker of markers) {
    if (!serialized.includes(marker)) throw new Error(`${label} nem tartalmazza a szükséges ${marker} jelölést.`);
  }
}

export function validatePreparedBlueprint(blueprint, token) {
  const serialized = JSON.stringify(blueprint);
  const keys = serialized.match(embeddedKeyPattern) ?? [];
  if (keys.length === 0 || keys.some(value => value !== token)) {
    throw new Error("A blueprint LeadFlow-kulcsainak ellenőrzése sikertelen.");
  }
  if (literalEmailPattern.test(serialized)) {
    throw new Error("A blueprint továbbra is személyhez kötött e-mail-címet tartalmaz.");
  }
  function containsConnectionBinding(value) {
    if (!value || typeof value !== "object") return false;
    if (Array.isArray(value)) return value.some(containsConnectionBinding);
    if (Object.hasOwn(value, "__IMTCONN__")) return true;
    return Object.values(value).some(containsConnectionBinding);
  }
  if (containsConnectionBinding(blueprint)) {
    throw new Error("A blueprint továbbra is Make Gmail-kapcsolatot tartalmaz.");
  }
  return true;
}

function prepareBlueprint(source, token, { kind, slug }) {
  if (kind === "events") {
    assertBlueprintContains(source, ["lead.created", "approved_reply.send"], "Az egységes esemény-blueprint");
    source.name = `${slug} - LeadFlow Events`;
  } else {
    assertBlueprintContains(source, ["/api/messages/reconciliation", "google-email:executeEmailSearchQuery"], "A státuszegyeztető blueprint");
    source.name = `${slug} - LeadFlow Delivery Reconciliation`;
  }
  const patched = patchBlueprintSecrets(source, token);
  const cleared = clearBlueprintProviderBindings(patched.blueprint);
  validatePreparedBlueprint(patched.blueprint, token);
  return { blueprint: patched.blueprint, replaced: patched.replaced, ...cleared };
}

export async function prepareCompanyMakeBlueprints(options) {
  const {
    slug,
    keyPath,
    unifiedInput,
    reconciliationInput,
    outputDirectory,
    projectRoot = process.cwd(),
  } = options;
  if (typeof slug !== "string" || slug.length < 3 || slug.length > 63 || !slugPattern.test(slug)) {
    throw new Error("Érvénytelen céges slug.");
  }
  for (const path of [keyPath, unifiedInput, reconciliationInput, outputDirectory]) validateExternalPath(path, projectRoot);
  const token = (await readFile(keyPath, "utf8")).trim();
  if (!keyPattern.test(token)) throw new Error("A Make-kulcs formátuma érvénytelen.");

  const inputs = [
    { kind: "events", path: unifiedInput, output: join(outputDirectory, `${slug}-leadflow-events.blueprint.json`) },
    { kind: "reconciliation", path: reconciliationInput, output: join(outputDirectory, `${slug}-delivery-reconciliation.blueprint.json`) },
  ];
  await mkdir(outputDirectory, { recursive: true });
  const created = [];
  const results = [];
  try {
    for (const input of inputs) {
      const parsed = JSON.parse((await readFile(input.path, "utf8")).replace(/^\uFEFF/, ""));
      const prepared = prepareBlueprint(parsed, token, { kind: input.kind, slug });
      const file = await open(input.output, "wx", 0o600);
      try {
        await file.writeFile(JSON.stringify(prepared.blueprint), "utf8");
      } finally {
        await file.close();
      }
      created.push(input.output);
      results.push({
        output: input.output,
        replaced: prepared.replaced,
        gmailConnectionsCleared: prepared.gmailConnectionsCleared,
        webhooksCleared: prepared.webhooksCleared,
        literalRecipientsCleared: prepared.literalRecipientsCleared,
        orphansCleared: prepared.orphansCleared,
      });
    }
    return results;
  } catch (error) {
    await Promise.all(created.map(path => unlink(path).catch(() => {})));
    if (error instanceof SyntaxError) throw new Error("Az egyik blueprint nem érvényes JSON.");
    throw error;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [slug, keyPath, unifiedInput, reconciliationInput, outputDirectory, extra] = process.argv.slice(2);
  try {
    if (!slug || !keyPath || !unifiedInput || !reconciliationInput || !outputDirectory || extra) {
      throw new Error("Használat: node scripts/prepare-company-make-blueprints.mjs ceg-slug ABSZOLUT-KULCSFAJL ABSZOLUT-ESEMENY-BLUEPRINT ABSZOLUT-STATUSZEGYEZTETO-BLUEPRINT ABSZOLUT-KIMENETI-MAPPA");
    }
    const results = await prepareCompanyMakeBlueprints({ slug, keyPath, unifiedInput, reconciliationInput, outputDirectory });
    for (const result of results) {
      process.stdout.write(`${result.replaced} hitelesítési fejléc frissítve, ${result.gmailConnectionsCleared} Gmail-kapcsolat és ${result.webhooksCleared} webhook-hozzárendelés eltávolítva: ${result.output}\n`);
    }
    process.stdout.write("A két blueprint importálható a cég saját Make-fiókjába. Importálás után állítsd be az új webhookot, a cég Gmail-kapcsolatát és a belső értesítési címet, majd töröld a kulcsfájlt és az előkészített blueprinteket.\n");
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : "A blueprintek előkészítése sikertelen."}\n`);
    process.exitCode = 1;
  }
}
