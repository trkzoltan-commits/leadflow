export const privacyNoticeTemplateVersion = "2026-10-17";

export type PrivacyNoticeSettings = {
  enabled: boolean;
  contactEmail: string | null;
  companyAddress: string | null;
  retentionMonths: number;
  updatedAt: string | null;
};

export function validPrivacyEmail(value: unknown) {
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  return normalized.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized) ? normalized : null;
}

export function validPrivacyAddress(value: unknown) {
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  return normalized.length >= 3 && normalized.length <= 300 ? normalized : null;
}

export function validRetentionMonths(value: unknown) {
  return Number.isInteger(value) && Number(value) >= 1 && Number(value) <= 120 ? Number(value) : null;
}

export function privacyNoticeReady(settings: PrivacyNoticeSettings) {
  return settings.enabled && validPrivacyEmail(settings.contactEmail) !== null &&
    validPrivacyAddress(settings.companyAddress) !== null && validRetentionMonths(settings.retentionMonths) !== null;
}

export function privacyNoticeVersion(updatedAt: string | null) {
  return `${privacyNoticeTemplateVersion}:${updatedAt || "unconfigured"}`;
}
