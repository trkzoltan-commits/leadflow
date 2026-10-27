import type { OverviewLead } from "./lead-overview";

export type ReportCounts = { total: number; won: number; lost: number; active: number; unknown: number };
export type ReportSegment = keyof ReportCounts;
export type ReportSelection = { year: number; month: number | null; segment: ReportSegment };
export type ReportPeriod = { year: number; month: number };
export type MonthlyPerformance = {
  currentPeriod: ReportPeriod;
  previousPeriod: ReportPeriod;
  current: ReportCounts;
  previous: ReportCounts;
  conversionRate: number | null;
  previousConversionRate: number | null;
  totalDifference: number;
  conversionPointDifference: number | null;
};

const reportMonthNames = [
  "Január", "Február", "Március", "Április", "Május", "Június",
  "Július", "Augusztus", "Szeptember", "Október", "November", "December",
];

function csvRow(values: Array<string | number>) {
  return values.map(value => {
    const text = String(value);
    return /[;"\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
  }).join(";");
}

export function annualReportCsv(report: ReturnType<typeof annualReport>, year: number) {
  const header = ["Hónap", "Összes", "Megvalósult", "Nem valósult meg", "Aktív", "Eredmény nélkül lezárt"];
  const rows = report.months.map((month, index) => csvRow([
    reportMonthNames[index], month.total, month.won, month.lost, month.active, month.unknown,
  ]));
  rows.push(csvRow(["Éves összesen", report.total.total, report.total.won, report.total.lost, report.total.active, report.total.unknown]));
  return `\uFEFFsep=;\r\n${csvRow([`${year}. évi LeadFlow riport`])}\r\n${csvRow(header)}\r\n${rows.join("\r\n")}\r\n`;
}

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

function monthlyCounts(leads: OverviewLead[], period: ReportPeriod) {
  const counts = emptyCounts();
  for (const lead of leads) {
    const leadPeriod = periodInBudapest(lead.created_at);
    if (!leadPeriod || leadPeriod.year !== period.year || leadPeriod.month !== period.month) continue;
    counts.total++;
    if (lead.status !== "processed") counts.active++;
    else if (lead.outcome === "won") counts.won++;
    else if (lead.outcome === "lost") counts.lost++;
    else counts.unknown++;
  }
  return counts;
}

function conversionRate(counts: ReportCounts) {
  const decided = counts.won + counts.lost;
  return decided === 0 ? null : Math.round((counts.won / decided) * 1000) / 10;
}

export function monthlyPerformance(leads: OverviewLead[], currentDate = new Date()): MonthlyPerformance {
  const currentPeriod = periodInBudapest(currentDate.toISOString())!;
  const previousPeriod = currentPeriod.month === 1
    ? { year: currentPeriod.year - 1, month: 12 }
    : { year: currentPeriod.year, month: currentPeriod.month - 1 };
  const current = monthlyCounts(leads, currentPeriod);
  const previous = monthlyCounts(leads, previousPeriod);
  const currentRate = conversionRate(current);
  const previousRate = conversionRate(previous);
  return {
    currentPeriod,
    previousPeriod,
    current,
    previous,
    conversionRate: currentRate,
    previousConversionRate: previousRate,
    totalDifference: current.total - previous.total,
    conversionPointDifference: currentRate === null || previousRate === null
      ? null
      : Math.round((currentRate - previousRate) * 10) / 10,
  };
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
