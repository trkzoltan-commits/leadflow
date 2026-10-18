export type DataRetentionStatus = {
  cutoffAt: string;
  retentionMonths: number;
  eligibleClosedCount: number;
  activeReviewCount: number;
  anonymizedCount: number;
  lastRunAt: string | null;
};

function safeCount(value: unknown) {
  return Number.isInteger(value) && Number(value) >= 0 ? Number(value) : null;
}

export function parseDataRetentionStatus(value: unknown): DataRetentionStatus | null {
  if (!value || typeof value !== "object") return null;
  const row = value as Record<string, unknown>;
  const cutoffAt = typeof row.cutoff_at === "string" && Number.isFinite(new Date(row.cutoff_at).getTime()) ? row.cutoff_at : null;
  const retentionMonths = Number.isInteger(row.retention_months) && Number(row.retention_months) >= 1 && Number(row.retention_months) <= 120
    ? Number(row.retention_months) : null;
  const eligibleClosedCount = safeCount(row.eligible_closed_count);
  const activeReviewCount = safeCount(row.active_review_count);
  const anonymizedCount = safeCount(row.anonymized_count);
  const lastRunAt = row.last_run_at === null || row.last_run_at === undefined
    ? null
    : typeof row.last_run_at === "string" && Number.isFinite(new Date(row.last_run_at).getTime()) ? row.last_run_at : undefined;
  if (!cutoffAt || retentionMonths === null || eligibleClosedCount === null || activeReviewCount === null ||
      anonymizedCount === null || lastRunAt === undefined) return null;
  return { cutoffAt, retentionMonths, eligibleClosedCount, activeReviewCount, anonymizedCount, lastRunAt };
}
