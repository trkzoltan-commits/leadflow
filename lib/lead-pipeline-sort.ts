export type PipelineSort = "due" | "priority" | "newest";

type SortablePipelineLead = {
  id: string;
  priority: string | null;
  created_at: string;
  next_action: string | null;
  next_action_due_date: string | null;
};

const dateOnlyPattern = /^(\d{4})-(\d{2})-(\d{2})$/;

function hasValidDueDate(lead: SortablePipelineLead) {
  if (!lead.next_action || !lead.next_action_due_date) return false;
  const match = lead.next_action_due_date.match(dateOnlyPattern);
  if (!match) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

function priorityRank(priority: string | null) {
  if (priority === "high") return 0;
  if (priority === "low") return 2;
  return 1;
}

export function sortPipelineLeads<T extends SortablePipelineLead>(leads: T[], sort: PipelineSort) {
  return [...leads].sort((left, right) => {
    if (sort === "due") {
      const leftHasDueDate = hasValidDueDate(left);
      const rightHasDueDate = hasValidDueDate(right);
      if (leftHasDueDate !== rightHasDueDate) return leftHasDueDate ? -1 : 1;
      if (leftHasDueDate && rightHasDueDate) {
        const dueComparison = (left.next_action_due_date ?? "").localeCompare(right.next_action_due_date ?? "");
        if (dueComparison !== 0) return dueComparison;
      }
    }
    if (sort === "priority") {
      const priorityComparison = priorityRank(left.priority) - priorityRank(right.priority);
      if (priorityComparison !== 0) return priorityComparison;
    }
    const createdComparison = right.created_at.localeCompare(left.created_at);
    return createdComparison || left.id.localeCompare(right.id);
  });
}
