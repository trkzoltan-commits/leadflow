import type { OverviewLead } from "./lead-overview";

export const PIPELINE_STATUSES = ["new", "contacted", "waiting", "offer_sent", "decision", "processed"] as const;
export type PipelineStatus = typeof PIPELINE_STATUSES[number];
export type PipelineAssigneeFilter = "all" | "mine" | "unassigned";
export type PipelinePriorityFilter = "all" | "high" | "medium" | "low";

export type LeadAssignee = {
  id: string;
  email: string;
  role: string;
};

export const PIPELINE_COLUMNS: ReadonlyArray<{ status: PipelineStatus; label: string; description: string }> = [
  { status: "new", label: "Új", description: "Az érdeklődés beérkezett, de még nem történt kapcsolatfelvétel." },
  { status: "contacted", label: "Kapcsolatfelvétel", description: "Megtörtént az első válasz vagy egyeztetés az érdeklődővel." },
  { status: "waiting", label: "Válaszra vár", description: "Az ajánlat elkészítéséhez további információt várunk az érdeklődőtől." },
  { status: "offer_sent", label: "Ajánlat elküldve", description: "Az érdeklődő megkapta a konkrét ajánlatot." },
  { status: "decision", label: "Döntésre vár", description: "Az érdeklődő mérlegeli az ajánlatot; az elfogadására vagy elutasítására várunk." },
  { status: "processed", label: "Lezárt", description: "A folyamat véget ért, és az eredménye megvalósult vagy nem valósult meg." },
];

export function isPipelineStatus(value: unknown): value is PipelineStatus {
  return typeof value === "string" && PIPELINE_STATUSES.includes(value as PipelineStatus);
}

export function pipelineGroups(leads: OverviewLead[]) {
  return new Map(PIPELINE_STATUSES.map(status => [status, leads.filter(lead => lead.status === status)]));
}

export function filterPipelineLeads(
  leads: OverviewLead[],
  filter: PipelineAssigneeFilter,
  currentUserId: string | null
) {
  if (filter === "mine") {
    if (!currentUserId) return [];
    return leads.filter(lead => lead.assigned_user_id === currentUserId);
  }
  if (filter === "unassigned") return leads.filter(lead => !lead.assigned_user_id);
  return leads;
}

export function filterPipelineLeadsByPriority<T extends Pick<OverviewLead, "priority">>(
  leads: T[],
  filter: PipelinePriorityFilter
) {
  if (filter === "all") return leads;
  if (filter === "medium") return leads.filter(lead => !lead.priority || lead.priority === "medium");
  return leads.filter(lead => lead.priority === filter);
}

