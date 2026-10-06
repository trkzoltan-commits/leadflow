export type StoredPipelineView = {
  assigneeFilter: "all" | "mine" | "unassigned" | `member:${string}`;
  nextActionFilter: "all" | "overdue" | "today" | "soon" | "missing";
  priorityFilter: "all" | "high" | "medium" | "low";
  sort: "due" | "priority" | "newest";
};

export const DEFAULT_PIPELINE_VIEW: StoredPipelineView = {
  assigneeFilter: "all",
  nextActionFilter: "all",
  priorityFilter: "all",
  sort: "due",
};

export function pipelineViewStorageKey(userId: string) {
  return `leadflow:pipeline-view:v1:${userId}`;
}

export function parsePipelineView(
  storedValue: string | null,
  options: { canAssign: boolean; memberIds: ReadonlySet<string> }
): StoredPipelineView {
  if (!storedValue) return DEFAULT_PIPELINE_VIEW;

  let value: unknown;
  try {
    value = JSON.parse(storedValue);
  } catch {
    return DEFAULT_PIPELINE_VIEW;
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) return DEFAULT_PIPELINE_VIEW;
  const record = value as Record<string, unknown>;

  const priorityFilter = record.priorityFilter === "high" || record.priorityFilter === "medium" || record.priorityFilter === "low"
    ? record.priorityFilter
    : "all";
  const nextActionFilter = record.nextActionFilter === "overdue" || record.nextActionFilter === "today" ||
    record.nextActionFilter === "soon" || record.nextActionFilter === "missing"
    ? record.nextActionFilter
    : "all";
  const sort = record.sort === "priority" || record.sort === "newest" ? record.sort : "due";

  let assigneeFilter: StoredPipelineView["assigneeFilter"] = "all";
  if (record.assigneeFilter === "mine" || record.assigneeFilter === "unassigned") {
    assigneeFilter = record.assigneeFilter;
  } else if (options.canAssign && typeof record.assigneeFilter === "string" && record.assigneeFilter.startsWith("member:")) {
    const memberId = record.assigneeFilter.slice("member:".length);
    if (options.memberIds.has(memberId)) assigneeFilter = `member:${memberId}`;
  }

  return { assigneeFilter, nextActionFilter, priorityFilter, sort };
}

export function serializePipelineView(view: StoredPipelineView) {
  return JSON.stringify(view);
}
