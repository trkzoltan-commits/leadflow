export const NEXT_ACTION_MAX_LENGTH = 300;

export type NextActionDueState = "overdue" | "today" | "soon" | "later" | "invalid";

const dateOnlyPattern = /^(\d{4})-(\d{2})-(\d{2})$/;

export function isValidDateOnly(value: unknown): value is string {
  if (typeof value !== "string") return false;
  const match = value.match(dateOnlyPattern);
  if (!match) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

export function budapestDateKey(now = new Date()) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Budapest",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

function dayNumber(value: string) {
  const [year, month, day] = value.split("-").map(Number);
  return Math.floor(Date.UTC(year, month - 1, day) / 86_400_000);
}

export function budapestDateOffset(days: number, now = new Date()) {
  const today = budapestDateKey(now);
  const [year, month, day] = today.split("-").map(Number);
  const result = new Date(Date.UTC(year, month - 1, day + days));
  return result.toISOString().slice(0, 10);
}

export function nextActionDueState(dueDate: string | null, now = new Date()): NextActionDueState {
  if (!dueDate || !isValidDateOnly(dueDate)) return "invalid";
  const days = dayNumber(dueDate) - dayNumber(budapestDateKey(now));
  if (days < 0) return "overdue";
  if (days === 0) return "today";
  if (days <= 3) return "soon";
  return "later";
}

export function displayNextActionDueDate(dueDate: string | null, now = new Date()) {
  if (!dueDate || !isValidDateOnly(dueDate)) return "Nincs határidő";
  const state = nextActionDueState(dueDate, now);
  const difference = dayNumber(dueDate) - dayNumber(budapestDateKey(now));
  const formatted = new Intl.DateTimeFormat("hu-HU", {
    timeZone: "Europe/Budapest",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(`${dueDate}T12:00:00Z`));

  if (state === "overdue") return `Lejárt · ${formatted}`;
  if (state === "today") return `Ma · ${formatted}`;
  if (difference === 1) return `Holnap · ${formatted}`;
  if (state === "soon") return `${difference} nap múlva · ${formatted}`;
  return `Határidő: ${formatted}`;
}
