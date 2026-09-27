const providerMessageIdPattern = /^[A-Za-z0-9_-]{8,255}$/;

export function normalizeProviderMessageId(value: unknown): string | null {
  if (value === undefined || value === null || value === "") return null;
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  return providerMessageIdPattern.test(normalized) ? normalized : null;
}

export function deliveryReceiptUpdate(status: string, providerMessageId: unknown, now = new Date()) {
  const normalizedId = normalizeProviderMessageId(providerMessageId);
  if (providerMessageId !== undefined && providerMessageId !== null && providerMessageId !== "" && !normalizedId) {
    return { ok: false as const, error: "Érvénytelen szolgáltatói üzenetazonosító." };
  }
  const timestamp = now.toISOString();
  if (status === "sent") return {
    ok: true as const,
    values: {
      ...(normalizedId ? { provider_message_id: normalizedId } : {}),
      delivery_confirmed_at: timestamp,
      delivery_failed_at: null,
    },
  };
  if (status === "failed") return {
    ok: true as const,
    values: {
      delivery_failed_at: timestamp,
      delivery_confirmed_at: null,
    },
  };
  return { ok: true as const, values: {} };
}
