import type { OverviewLead } from "./lead-overview";

export const PIPELINE_STATUSES = ["new", "contacted", "waiting", "offer_sent", "decision", "processed"] as const;
export type PipelineStatus = typeof PIPELINE_STATUSES[number];

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

