export const LEAD_NOTE_MAX_LENGTH = 2000;

export function parseLeadNoteCounts(rows: Array<{ lead_id?: unknown; note_count?: unknown }>) {
  const counts = new Map<string, number>();
  for (const row of rows) {
    if (typeof row.lead_id !== "string" || !row.lead_id) continue;
    const noteCount = typeof row.note_count === "number"
      ? row.note_count
      : typeof row.note_count === "string" && /^\d+$/.test(row.note_count)
        ? Number(row.note_count)
        : Number.NaN;
    if (!Number.isSafeInteger(noteCount) || noteCount <= 0) continue;
    counts.set(row.lead_id, noteCount);
  }
  return counts;
}

export function normalizeLeadNoteContent(value: unknown) {
  if (typeof value !== "string") return null;

  const content = value.trim();
  if (!content || content.length > LEAD_NOTE_MAX_LENGTH) return null;

  return content;
}
