export const LEAD_NOTE_MAX_LENGTH = 2000;

export function normalizeLeadNoteContent(value: unknown) {
  if (typeof value !== "string") return null;

  const content = value.trim();
  if (!content || content.length > LEAD_NOTE_MAX_LENGTH) return null;

  return content;
}
