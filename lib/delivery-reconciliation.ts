export const DELIVERY_REFERENCE_HEADER = "X-LeadFlow-Message-ID";
export const DELIVERY_RECONCILIATION_DELAY_MINUTES = 5;

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function deliveryReference(messageId: unknown) {
  if (typeof messageId !== "string") return null;
  const value = messageId.trim();
  if (!uuidPattern.test(value)) return null;

  return {
    headerName: DELIVERY_REFERENCE_HEADER,
    headerValue: value,
    gmailSearchQuery: `in:sent header:${DELIVERY_REFERENCE_HEADER}:${value}`,
  };
}

export function deliveryReconciliationCutoff(now = new Date()) {
  return new Date(
    now.getTime() - DELIVERY_RECONCILIATION_DELAY_MINUTES * 60_000
  ).toISOString();
}
