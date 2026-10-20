export const DEFAULT_COMPANY_BRANDING = {
  logoUrl: "",
  brandPrimary: "#5fa8d3",
  brandSecondary: "#dceff8",
  brandingMode: "logo_and_name" as const,
  showCompanyName: true,
};

export type CompanyBrandingMode = "logo_and_name" | "combined_image";

export type CompanyBranding = {
  logoUrl: string;
  brandPrimary: string;
  brandSecondary: string;
  brandingMode: CompanyBrandingMode;
  showCompanyName: boolean;
};

export class CompanyBrandingValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CompanyBrandingValidationError";
  }
}

export function validBrandColor(value: unknown): value is string {
  return typeof value === "string" && /^#[0-9a-f]{6}$/i.test(value);
}

function normalizeLogoUrl(value: unknown) {
  if (value === null || value === undefined || value === "") return "";
  if (typeof value !== "string") {
    throw new CompanyBrandingValidationError("A logó hivatkozása érvénytelen.");
  }

  const normalized = value.trim();
  if (!normalized) return "";
  if (normalized.length > 1000) {
    throw new CompanyBrandingValidationError("A logó hivatkozása legfeljebb 1000 karakter lehet.");
  }

  try {
    const url = new URL(normalized);
    if ((url.protocol !== "https:" && url.protocol !== "http:") || url.username || url.password) {
      throw new Error("invalid");
    }
    return url.toString();
  } catch {
    throw new CompanyBrandingValidationError("A logóhoz érvényes HTTP vagy HTTPS hivatkozást adj meg.");
  }
}

export function parseCompanyBranding(value: unknown): CompanyBranding {
  if (!value || typeof value !== "object") {
    throw new CompanyBrandingValidationError("Hiányzó arculati beállítások.");
  }

  const input = value as Record<string, unknown>;
  if (!validBrandColor(input.brandPrimary) || !validBrandColor(input.brandSecondary)) {
    throw new CompanyBrandingValidationError("A színeket hatjegyű HEX formátumban add meg, például: #002bff.");
  }
  if (input.brandingMode !== "logo_and_name" && input.brandingMode !== "combined_image") {
    throw new CompanyBrandingValidationError("Ismeretlen arculati megjelenítés.");
  }
  if (typeof input.showCompanyName !== "boolean") {
    throw new CompanyBrandingValidationError("A cégnév megjelenítése érvénytelen.");
  }

  return {
    logoUrl: normalizeLogoUrl(input.logoUrl),
    brandPrimary: input.brandPrimary.toLowerCase(),
    brandSecondary: input.brandSecondary.toLowerCase(),
    brandingMode: input.brandingMode,
    showCompanyName: input.showCompanyName,
  };
}

export function normalizeCompanyBranding(value: {
  logo_url?: unknown;
  brand_primary?: unknown;
  brand_secondary?: unknown;
  branding_mode?: unknown;
  show_company_name?: unknown;
} | null | undefined): CompanyBranding {
  let logoUrl = "";
  try {
    logoUrl = normalizeLogoUrl(value?.logo_url);
  } catch {
    logoUrl = "";
  }

  return {
    logoUrl,
    brandPrimary: validBrandColor(value?.brand_primary)
      ? value.brand_primary.toLowerCase()
      : DEFAULT_COMPANY_BRANDING.brandPrimary,
    brandSecondary: validBrandColor(value?.brand_secondary)
      ? value.brand_secondary.toLowerCase()
      : DEFAULT_COMPANY_BRANDING.brandSecondary,
    brandingMode: value?.branding_mode === "combined_image" ? "combined_image" : "logo_and_name",
    showCompanyName: typeof value?.show_company_name === "boolean" ? value.show_company_name : true,
  };
}
