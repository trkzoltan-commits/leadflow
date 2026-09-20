import type { OverviewLead } from "./lead-overview";

export type ReportCounts = { total: number; won: number; lost: number; active: number; unknown: number };
export type ReportSegment = keyof ReportCounts;
export type ReportSelection = { year: number; month: number | null; segment: ReportSegment };

export function parseReportSelection(params: URLSearchParams): ReportSelection | null {
  const year = params.get("year");
  const month = params.get("month");
  const segment = params.get("segment");
  if (!year || !/^\d{4}$/.test(year) || (month !== null && !/^(?:[1-9]|1[0-2])$/.test(month)) ||
      !segment || !["total", "won", "lost", "active", "unknown"].includes(segment)) return null;
  return { year: Number(year), month: month === null ? null : Number(month), segment: segment as ReportSegment };
}

export function filterReportLeads(leads: OverviewLead[], selection: ReportSelection) {
  return leads.filter(lead => {
    const period = periodInBudapest(lead.created_at);
    if (!period || period.year !== selection.year ||
        (selection.month !== null && period.month !== selection.month)) return false;
    if (selection.segment === "total") return true;
    if (selection.segment === "active") return lead.status !== "processed";
    if (lead.status !== "processed") return false;
    if (selection.segment === "unknown") return lead.outcome !== "won" && lead.outcome !== "lost";
    return lead.outcome === selection.segment;
  });
}

function periodInBudapest(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Europe/Budapest", year: "numeric", month: "numeric",
  }).formatToParts(date);
  return {
    year: Number(parts.find(part => part.type === "year")?.value),
    month: Number(parts.find(part => part.type === "month")?.value),
  };
}

function emptyCounts(): ReportCounts {
  return { total: 0, won: 0, lost: 0, active: 0, unknown: 0 };
}

export function reportYears(leads: OverviewLead[], currentDate = new Date()) {
  const currentYear = periodInBudapest(currentDate.toISOString())!.year;
  return Array.from(new Set([currentYear, ...leads.map(lead => periodInBudapest(lead.created_at)?.year).filter((year): year is number => year !== undefined)]))
    .sort((a, b) => b - a);
}

export function annualReport(leads: OverviewLead[], year: number) {
  const months = Array.from({ length: 12 }, emptyCounts);
  for (const lead of leads) {
    const period = periodInBudapest(lead.created_at);
    if (!period || period.year !== year) continue;
    const counts = months[period.month - 1];
    counts.total++;
    if (lead.status !== "processed") counts.active++;
    else if (lead.outcome === "won") counts.won++;
    else if (lead.outcome === "lost") counts.lost++;
    else counts.unknown++;
  }
  const total = months.reduce((sum, month) => ({
    total: sum.total + month.total,
    won: sum.won + month.won,
    lost: sum.lost + month.lost,
    active: sum.active + month.active,
    unknown: sum.unknown + month.unknown,
  }), emptyCounts());
  return { months, total };
}
