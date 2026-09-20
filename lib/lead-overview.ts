export type OverviewLead = {
  id: string;
  name: string | null;
  email: string | null;
  phone: string | null;
  service: string | null;
  location: string | null;
  priority: string | null;
  status: string | null;
  source: string | null;
  created_at: string;
};
export type OverviewMessage = { id: string; lead_id: string; status: string | null; created_at: string };

export type LeadListFilter = "active" | "closed" | "all" | "draft" | "sending";

export function filterLeads(leads: OverviewLead[], replies: Map<string, OverviewMessage>, filter: LeadListFilter) {
  if (filter === "active") return leads.filter(lead => lead.status !== "processed");
  if (filter === "closed") return leads.filter(lead => lead.status === "processed");
  if (filter === "draft" || filter === "sending") {
    return leads.filter(lead => lead.status !== "processed" && replies.get(lead.id)?.status === filter);
  }
  return leads;
}

export function latestReplies(messages: OverviewMessage[]) {
  const result = new Map<string, OverviewMessage>();
  for (const message of messages) {
    const prior = result.get(message.lead_id);
    if (!prior || message.created_at > prior.created_at ||
        (message.created_at === prior.created_at && message.id > prior.id)) result.set(message.lead_id, message);
  }
  return result;
}
export function replyLabel(status?: string | null) {
  if (status === "draft") return "Ellenőrizendő piszkozat";
  if (status === "sending") return "Küldési visszaigazolásra vár";
  if (status === "sent") return "Válasz elküldve";
  return status ? "Válasz állapota: " + status : "Még nincs válasz";
}
export function leadLabel(status: string | null) {
  return ({new: "Új", contacted: "Kapcsolatfelvétel megtörtént", waiting: "Válaszra vár", processed: "Feldolgozott"} as Record<string,string>)[status ?? ""] ?? status ?? "—";
}
export function displayDate(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "—" : new Intl.DateTimeFormat("hu-HU", {timeZone:"Europe/Budapest",month:"2-digit",day:"2-digit",hour:"2-digit",minute:"2-digit"}).format(date);
}
export function displayReceivedAt(value: string | null) {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "—" : new Intl.DateTimeFormat("hu-HU", {
    timeZone: "Europe/Budapest", year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit",
  }).format(date);
}
export function dailyCounts(leads: OverviewLead[], now = new Date()) {
  const key = (date: Date) => new Intl.DateTimeFormat("en-CA", {timeZone:"Europe/Budapest",year:"numeric",month:"2-digit",day:"2-digit"}).format(date);
  const today = key(now);
  // Anchor at UTC noon to avoid DST changing the represented calendar day.
  const anchor = new Date(today + "T12:00:00Z");
  return Array.from({length:7}, (_, index) => {
    const day = new Date(anchor); day.setUTCDate(day.getUTCDate() - 6 + index);
    const dateKey = key(day);
    return { day: dateKey, label: dateKey.slice(5).replace("-", "."), count: leads.filter(lead => key(new Date(lead.created_at)) === dateKey).length };
  });
}
