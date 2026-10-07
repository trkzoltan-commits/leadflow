export const LEAD_NOTE_MAX_LENGTH = 2000;

export function countLeadNotes(rows: Array<{ lead_id?: unknown }>) {
  const counts = new Map<string, number>();
  for (const row of rows) {
    if (typeof row.lead_id !== "string" || !row.lead_id) continue;
    counts.set(row.lead_id, (counts.get(row.lead_id) || 0) + 1);
  }
  return counts;
}

export function normalizeLeadNoteContent(value: unknown) {
  if (typeof value !== "string") return null;

  const content = value.trim();
  if (!content || content.length > LEAD_NOTE_MAX_LENGTH) return null;

  return content;
}
