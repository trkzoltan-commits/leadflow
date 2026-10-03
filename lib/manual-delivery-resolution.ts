const delayedAfterMs = 60 * 60 * 1000;

export type ManualDeliveryAction = "sent" | "failed";

export function manualDeliveryResolution(
  message: { status: string | null; direction: string | null; sending_started_at: string | null },
  action: unknown,
  userId: string,
  now = new Date(),
) {
  if (action !== "sent" && action !== "failed") {
    return { ok: false as const, status: 400, error: "Érvénytelen rendezési eredmény." };
  }
  if (message.direction !== "outgoing" || message.status !== "sending" || !message.sending_started_at) {
    return { ok: false as const, status: 409, error: "Ez a küldés már nem rendezhető kézzel." };
  }
  const startedAt = new Date(message.sending_started_at).getTime();
  const nowMs = now.getTime();
  if (!Number.isFinite(startedAt) || !Number.isFinite(nowMs) || nowMs - startedAt < delayedAfterMs) {
    return { ok: false as const, status: 409, error: "A kézi rendezés 60 perc várakozás után érhető el." };
  }
  const timestamp = now.toISOString();
  return {
    ok: true as const,
    status: action,
    values: {
      status: action,
      delivery_confirmed_at: action === "sent" ? timestamp : null,
      delivery_failed_at: action === "failed" ? timestamp : null,
      delivery_resolution_source: "manual",
      delivery_resolved_by: userId,
    },
  };
}

