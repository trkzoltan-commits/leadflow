export const APPROVED_REPLY_SUBJECT_MAX_LENGTH = 200;

const DEFAULT_APPROVED_REPLY_SUBJECT = "Válasz az ajánlatkérésére";

function singleLineSubject(value: string) {
  return value.replace(/[\r\n\t]+/g, " ").replace(/\s+/g, " ").trim();
}

export function defaultApprovedReplySubject(companyName: string) {
  const normalizedCompanyName = singleLineSubject(companyName);
  const value = normalizedCompanyName
    ? `${DEFAULT_APPROVED_REPLY_SUBJECT} – ${normalizedCompanyName}`
    : DEFAULT_APPROVED_REPLY_SUBJECT;
  return value.slice(0, APPROVED_REPLY_SUBJECT_MAX_LENGTH).trim();
}

export function normalizeApprovedReplySubject(value: unknown, companyName: string) {
  const normalized = typeof value === "string" ? singleLineSubject(value) : "";
  return (normalized || defaultApprovedReplySubject(companyName))
    .slice(0, APPROVED_REPLY_SUBJECT_MAX_LENGTH)
    .trim();
}
