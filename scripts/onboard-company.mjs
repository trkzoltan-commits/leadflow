import { readFile, stat } from "node:fs/promises";
import { isAbsolute, relative, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { checkCompanyOnboarding, confirmOnboardingMilestone, onboardingMilestones } from "./check-company-onboarding.mjs";
import { configureCompanyMake, validateConfigPath } from "./configure-company-make.mjs";
import { inviteCompanyOwner, validateInviteInput } from "./invite-company-owner.mjs";
import { issueCompanyMakeKey, validateOutputPath } from "./issue-company-make-key.mjs";
import { prepareCompanyOnboarding } from "./prepare-company-onboarding.mjs";
import { validateCompanyInput } from "./provision-company.mjs";

const allowedManifestKeys = new Set([
  "companyName", "companySlug", "ownerEmail", "makeKeyPath", "webhookConfigPath",
]);

export function validateManifestPath(manifestPath, projectRoot = process.cwd()) {
  if (!manifestPath || !isAbsolute(manifestPath)) {
    throw new Error("Adj meg egy projekten kívüli, abszolút onboarding-manifesztum útvonalat.");
  }
  const rel = relative(resolve(projectRoot), resolve(manifestPath));
  if (!rel || (!rel.startsWith("..") && !isAbsolute(rel))) {
    throw new Error("Az onboarding-manifesztum nem lehet a projektmappában.");
  }
}

export function validateOnboardingManifest(input, projectRoot = process.cwd()) {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new Error("Az onboarding-manifesztum érvénytelen.");
  }
  const unknownKeys = Object.keys(input).filter(key => !allowedManifestKeys.has(key));
  if (unknownKeys.length > 0) {
    throw new Error("A manifesztum ismeretlen mezőt tartalmaz. Titkot vagy webhookcímet ne tegyél ebbe a fájlba.");
  }
  const { companyName, companySlug } = validateCompanyInput(input.companyName, input.companySlug);
  validateInviteInput(companySlug, input.ownerEmail);
  validateOutputPath(input.makeKeyPath, projectRoot);
  if (input.webhookConfigPath !== undefined) validateConfigPath(input.webhookConfigPath, projectRoot);
  return {
    companyName,
    companySlug,
    ownerEmail: input.ownerEmail,
    makeKeyPath: input.makeKeyPath,
    webhookConfigPath: input.webhookConfigPath,
  };
}

export function nextGuidedOnboardingStep({ companyExists, checks, hasWebhookConfig }) {
  if (!companyExists) return { code: "create_company", message: "Hozd létre a céget és add ki az első Make-kulcsot." };
  if (!checks?.settings || !checks?.companyMakeMode) {
    return { code: "repair_provisioning", message: "Az alapbeállítások vagy a saját Make-mód javítása szükséges." };
  }
  if (!checks.owner) return { code: "invite_owner", message: "Küldd ki a tulajdonosi meghívót." };
  if (!checks.activeMakeKey) return { code: "issue_make_key", message: "Add ki az első céges Make-kulcsot." };
  if (!checks.newLeadWebhook || !checks.approvedReplyWebhook) {
    return hasWebhookConfig
      ? { code: "stage_webhooks", message: "Rögzítsd a két webhookot letiltott kapcsolat mellett." }
      : { code: "provide_webhook_config", message: "Add meg a projekten kívüli webhook-konfigurációs fájlt a manifesztumban." };
  }
  if (!checks.makeEnabled) {
    return { code: "enable_make", message: "A Make-forgatókönyvek kézi ellenőrzése után aktiváld a kapcsolatot." };
  }
  if (!checks.ownerLoginVerified) return { code: "confirm_owner_login", milestone: "owner-login", message: "Ellenőrizd a tulajdonosi belépést." };
  if (!checks.newLeadFlowVerified) return { code: "confirm_new_lead_flow", milestone: "new-lead-flow", message: "Ellenőrizd a bejövő érdeklődő teljes folyamatát és a belső értesítést." };
  if (!checks.approvedReplyFlowVerified) return { code: "confirm_approved_reply_flow", milestone: "approved-reply-flow", message: "Ellenőrizd a jóváhagyott válasz kézbesítését és visszaigazolását." };
  if (!checks.tenantIsolationVerified) return { code: "confirm_tenant_isolation", milestone: "tenant-isolation", message: "Ellenőrizd két céggel az adat- és Make-izolációt." };
  return { code: "pilot_ready", message: "A cég pilotra kész." };
}

async function readSmallJson(path, label) {
  const info = await stat(path).catch(() => null);
  if (!info?.isFile() || info.size > 32_768) throw new Error(`${label} hiányzik vagy túl nagy.`);
  try {
    return JSON.parse((await readFile(path, "utf8")).replace(/^\uFEFF/, ""));
  } catch {
    throw new Error(`${label} nem érvényes JSON-fájl.`);
  }
}

async function companyExists(client, slug) {
  const { data, error } = await client.from("companies").select("id").eq("public_slug", slug).maybeSingle();
  if (error) throw new Error("A cég állapota nem ellenőrizhető.");
  return Boolean(data);
}

function printChecks(checks) {
  const labels = {
    settings: "Céges beállítások", owner: "Tulajdonos", companyMakeMode: "Saját Make-mód",
    activeMakeKey: "Aktív Make-kulcs", newLeadWebhook: "Új érdeklődő webhook",
    approvedReplyWebhook: "Jóváhagyott válasz webhook", makeEnabled: "Make engedélyezve",
    ownerLoginVerified: "Tulajdonosi belépés élő próbája",
    newLeadFlowVerified: "Bejövő érdeklődő élő próbája",
    approvedReplyFlowVerified: "Jóváhagyott válasz élő próbája",
    tenantIsolationVerified: "Kétcéges izolációs próba",
  };
  for (const [key, label] of Object.entries(labels)) {
    process.stdout.write(`${checks[key] ? "OK" : "HIÁNYZIK"} – ${label}\n`);
  }
}

function printNextStep(step, slug) {
  process.stdout.write(`Következő lépés: ${step.message}\n`);
  if (["create_company", "invite_owner", "issue_make_key", "stage_webhooks"].includes(step.code)) {
    process.stdout.write("A biztonságos következő művelethez futtasd újra ugyanazt a parancsot a --apply kapcsolóval.\n");
  } else if (step.code === "enable_make") {
    process.stdout.write("A két Make-forgatókönyv és a Gmail-kapcsolat kézi ellenőrzése után futtasd újra a --activate kapcsolóval.\n");
  } else if (step.milestone) {
    process.stdout.write(`A próba tényleges ellenőrzése után futtasd: npm run onboard -- <MANIFESZTUM> --confirm ${step.milestone}\n`);
  }
  process.stdout.write(`Publikus ajánlatkérő: https://leadflow-three-psi.vercel.app/ajanlatkeres/${slug}\n`);
}

async function applyNextStep(client, manifest, step) {
  if (step.code === "create_company") {
    await prepareCompanyOnboarding(client, manifest.companyName, manifest.companySlug, {
      create: true, keyPath: manifest.makeKeyPath,
    });
    process.stdout.write("A cég és az első Make-kulcs elkészült. A kulcsot csak a megadott helyi fájl tartalmazza.\n");
    return;
  }
  if (step.code === "invite_owner") {
    await inviteCompanyOwner(client, manifest.companySlug, manifest.ownerEmail, true);
    process.stdout.write("A tulajdonosi meghívó kiment, és a felhasználó a céghez lett rendelve.\n");
    return;
  }
  if (step.code === "issue_make_key") {
    await issueCompanyMakeKey(client, manifest.companySlug, { issue: true, outputPath: manifest.makeKeyPath });
    process.stdout.write("Az első Make-kulcs elkészült a megadott helyi fájlban.\n");
    return;
  }
  if (step.code === "stage_webhooks") {
    const config = await readSmallJson(manifest.webhookConfigPath, "A webhook-konfiguráció");
    await configureCompanyMake(client, manifest.companySlug, config, "stage");
    process.stdout.write("A két webhook rögzítve; a kapcsolat az ellenőrzésig letiltva maradt.\n");
    return;
  }
  throw new Error("A következő lépés kézi ellenőrzést igényel; a rendszer nem igazolja automatikusan.");
}

export async function runGuidedOnboarding(client, manifest, operation = "status", milestone = null) {
  const exists = await companyExists(client, manifest.companySlug);
  if (!exists) {
    await prepareCompanyOnboarding(client, manifest.companyName, manifest.companySlug, { create: false });
    const step = nextGuidedOnboardingStep({ companyExists: false, checks: null, hasWebhookConfig: Boolean(manifest.webhookConfigPath) });
    if (operation === "apply") {
      await applyNextStep(client, manifest, step);
      const result = await checkCompanyOnboarding(client, manifest.companySlug);
      return {
        checks: result.checks,
        step: nextGuidedOnboardingStep({
          companyExists: true,
          checks: result.checks,
          hasWebhookConfig: Boolean(manifest.webhookConfigPath),
        }),
      };
    } else if (operation !== "status") {
      throw new Error("A cég létrehozása előtt csak az előellenőrzés vagy a --apply használható.");
    }
    return { checks: null, step };
  }

  let result = await checkCompanyOnboarding(client, manifest.companySlug);
  let step = nextGuidedOnboardingStep({
    companyExists: true,
    checks: result.checks,
    hasWebhookConfig: Boolean(manifest.webhookConfigPath),
  });

  if (operation === "confirm") {
    if (!onboardingMilestones[milestone]) throw new Error("Ismeretlen élő ellenőrzési pont.");
    if (step.milestone !== milestone) {
      throw new Error("Ez az élő ellenőrzési pont még nem következik; kövesd a kijelzett következő lépést.");
    }
    await confirmOnboardingMilestone(client, manifest.companySlug, milestone);
    process.stdout.write("Az élő ellenőrzési pont mentve.\n");
    result = await checkCompanyOnboarding(client, manifest.companySlug);
    step = nextGuidedOnboardingStep({
      companyExists: true,
      checks: result.checks,
      hasWebhookConfig: Boolean(manifest.webhookConfigPath),
    });
  }

  if (operation === "apply") {
    await applyNextStep(client, manifest, step);
    result = await checkCompanyOnboarding(client, manifest.companySlug);
    step = nextGuidedOnboardingStep({ companyExists: true, checks: result.checks, hasWebhookConfig: Boolean(manifest.webhookConfigPath) });
  } else if (operation === "activate") {
    if (step.code !== "enable_make") throw new Error("A Make-kapcsolat most nem aktiválható; kövesd a kijelzett következő lépést.");
    if (!manifest.webhookConfigPath) throw new Error("Az aktiváláshoz add meg a webhook-konfigurációs fájlt a manifesztumban.");
    const config = await readSmallJson(manifest.webhookConfigPath, "A webhook-konfiguráció");
    await configureCompanyMake(client, manifest.companySlug, config, "enable");
    result = await checkCompanyOnboarding(client, manifest.companySlug);
    step = nextGuidedOnboardingStep({ companyExists: true, checks: result.checks, hasWebhookConfig: true });
    process.stdout.write("A saját Make-kapcsolat aktiválva. A kulcs- és webhookfájlt a Make beállítása után töröld.\n");
  } else if (!new Set(["status", "confirm"]).has(operation)) {
    throw new Error("Ismeretlen onboarding-művelet.");
  }
  return { checks: result.checks, step };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [manifestPath, flag, milestone, extra] = process.argv.slice(2);
  try {
    if (!manifestPath || extra || ![undefined, "--apply", "--activate", "--confirm"].includes(flag)
      || (flag === "--confirm" && !milestone) || (flag !== "--confirm" && milestone)) {
      throw new Error("Használat: npm run onboard -- ABSZOLUT-MANIFESZTUM [--apply|--activate|--confirm ellenorzesi-pont]");
    }
    validateManifestPath(manifestPath);
    const manifest = validateOnboardingManifest(await readSmallJson(manifestPath, "Az onboarding-manifesztum"));
    if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SECRET_KEY) {
      throw new Error("A Supabase szerveroldali környezeti változói hiányoznak.");
    }
    const { createClient } = await import("@supabase/supabase-js");
    const client = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SECRET_KEY, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    });
    const operation = flag === "--apply" ? "apply" : flag === "--activate" ? "activate" : flag === "--confirm" ? "confirm" : "status";
    const { checks, step } = await runGuidedOnboarding(client, manifest, operation, milestone);
    if (checks) printChecks(checks);
    else process.stdout.write("Az előellenőrzés sikeres. Nem történt módosítás.\n");
    printNextStep(step, manifest.companySlug);
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : "A vezetett onboarding sikertelen."}\n`);
    process.exitCode = 1;
  }
}
