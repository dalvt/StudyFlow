import type { CalendarTimeBlock } from './calendar-utils.ts';
import type { TaskRecord } from './tasks.ts';
import type { DeadlineItem } from './calendar.ts';
import { calculateDaysRemaining } from './markdown-utils.ts';

export interface CurrentOrNextBlock {
  type: 'now' | 'next';
  block: CalendarTimeBlock;
}

/**
 * Finds the currently running or the next upcoming time block for today.
 */
export function findCurrentOrNextTimeBlock(
  blocks: CalendarTimeBlock[],
  currentHHMM: string
): CurrentOrNextBlock | null {
  if (!blocks || blocks.length === 0) return null;
  const sorted = [...blocks].sort((a, b) => a.startTime.localeCompare(b.startTime));

  // 1. Check for currently active block: startTime <= currentHHMM < endTime
  for (const b of sorted) {
    if (b.startTime <= currentHHMM && currentHHMM < b.endTime) {
      return { type: 'now', block: b };
    }
  }

  // 2. Check for first upcoming block: startTime > currentHHMM
  for (const b of sorted) {
    if (b.startTime > currentHHMM) {
      return { type: 'next', block: b };
    }
  }

  return null;
}

/**
 * Filters pending tasks due today or overdue, sorted by urgency and priority.
 */
export function filterTodayAndOverdueTasks(
  tasks: TaskRecord[],
  todayDateStr: string,
  limit: number = 5
): TaskRecord[] {
  const priorityWeight: Record<string, number> = { high: 3, medium: 2, low: 1, none: 0 };

  const refDate = todayDateStr
    ? (() => {
        const parts = todayDateStr.split('-').map(Number);
        return parts.length === 3 ? new Date(parts[0], parts[1] - 1, parts[2]) : new Date();
      })()
    : new Date();

  const getDays = (t: TaskRecord): number | undefined => {
    if (t.dueDate) {
      return calculateDaysRemaining(t.dueDate, refDate);
    }
    return t.daysRemaining;
  };

  return tasks
    .filter((t) => {
      if (t.isIdea || t.completed) return false;
      const rem = getDays(t);
      return (
        (rem !== undefined && rem <= 0) ||
        t.dueDate === todayDateStr ||
        (t.dueDate !== undefined && t.dueDate < todayDateStr)
      );
    })
    .sort((a, b) => {
      const aRem = getDays(a) ?? 0;
      const bRem = getDays(b) ?? 0;
      if (aRem !== bRem) {
        return aRem - bRem;
      }
      const aPrio = priorityWeight[a.priority ?? 'none'] ?? 0;
      const bPrio = priorityWeight[b.priority ?? 'none'] ?? 0;
      return bPrio - aPrio;
    })
    .slice(0, limit);
}

/**
 * Filters upcoming uncompleted deadlines sorted by nearest days remaining.
 */
export function filterUpcomingDeadlines(
  deadlines: DeadlineItem[],
  limit: number = 3
): DeadlineItem[] {
  return deadlines
    .filter((d) => !d.completed)
    .sort((a, b) => {
      if (a.daysRemaining !== b.daysRemaining) {
        return a.daysRemaining - b.daysRemaining;
      }
      return a.dueDate.localeCompare(b.dueDate);
    })
    .slice(0, limit);
}
