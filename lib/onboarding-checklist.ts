export type OnboardingChecklistItems = {
  companyProfile: boolean;
  emailSignature: boolean;
  privacyNotice: boolean;
  replyMode: boolean;
  teamAccess: boolean;
  makeConnection: boolean;
  newLeadTest: boolean;
  approvedReplyTest: boolean;
  securityReview: boolean;
};

export type OnboardingChecklistStatus = {
  items: OnboardingChecklistItems;
  completed: number;
  total: number;
  ready: boolean;
  details: {
    logoConfigured: boolean;
    activeMemberCount: number;
    replyMode: "manual" | "safe" | "automatic" | "unknown";
  };
};

type ChecklistInput = {
  companyName: unknown;
  companySlug: unknown;
  logoUrl: unknown;
  signatureEnabled: unknown;
  signerName: unknown;
  signatureEmail: unknown;
  privacyEnabled: unknown;
  privacyEmail: unknown;
  privacyAddress: unknown;
  privacyRetentionMonths: unknown;
  replyMode: unknown;
  activeMemberCount: unknown;
  makeConnectionReady: unknown;
  newLeadVerifiedAt: unknown;
  approvedReplyVerifiedAt: unknown;
  ownerLoginVerifiedAt: unknown;
  tenantIsolationVerifiedAt: unknown;
};

function hasText(value: unknown) {
  return typeof value === "string" && value.trim().length > 0;
}

export function buildOnboardingChecklist(input: ChecklistInput): OnboardingChecklistStatus {
  const replyMode = input.replyMode === "manual" || input.replyMode === "safe" || input.replyMode === "automatic"
    ? input.replyMode : "unknown";
  const activeMemberCount = typeof input.activeMemberCount === "number" && Number.isInteger(input.activeMemberCount) && input.activeMemberCount >= 0
    ? input.activeMemberCount : 0;
  const items: OnboardingChecklistItems = {
    companyProfile: hasText(input.companyName) && hasText(input.companySlug),
    emailSignature: input.signatureEnabled === true && hasText(input.signatureEmail)
      && (hasText(input.signerName) || hasText(input.companyName)),
    privacyNotice: input.privacyEnabled === true && hasText(input.privacyEmail)
      && hasText(input.privacyAddress) && typeof input.privacyRetentionMonths === "number"
      && input.privacyRetentionMonths >= 1 && input.privacyRetentionMonths <= 120,
    replyMode: replyMode !== "unknown",
    teamAccess: activeMemberCount > 0,
    makeConnection: input.makeConnectionReady === true,
    newLeadTest: hasText(input.newLeadVerifiedAt),
    approvedReplyTest: hasText(input.approvedReplyVerifiedAt),
    securityReview: hasText(input.ownerLoginVerifiedAt) && hasText(input.tenantIsolationVerifiedAt),
  };
  const total = Object.keys(items).length;
  const completed = Object.values(items).filter(Boolean).length;
  return {
    items,
    completed,
    total,
    ready: completed === total,
    details: {
      logoConfigured: hasText(input.logoUrl),
      activeMemberCount,
      replyMode,
    },
  };
}
