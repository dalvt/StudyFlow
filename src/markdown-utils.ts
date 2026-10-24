// Domain re-exports maintaining complete backward compatibility

// 1. Date utilities
export {
  getLocalDateString,
  formatDailyNoteFileName,
} from './date-utils.ts';

// 2. Task parsing, recurrence, priorities, and deadlines
export {
  extractTagsFromText,
  type TaskPriority,
  computeLineHash,
  computeTaskLineHash,
  type TaskLocator,
  type PendingTaskItem,
  type TaskDeadline,
  type TaskScheduledDate,
  type TaskStartDate,
  type TaskCompletionDate,
  type TaskRecurrence,
  type ParsedRecurrence,
  calculateDaysRemaining,
  formatDeadlineHuman,
  parseTaskDeadline,
  formatTaskWithDeadline,
  parseTaskScheduledDate,
  formatTaskWithScheduledDate,
  parseTaskStartDate,
  formatTaskWithStartDate,
  parseTaskCompletionDate,
  formatTaskWithCompletionDate,
  parseRecurrenceRule,
  parseTaskRecurrence,
  formatTaskWithRecurrence,
  calculateNextRecurrenceDate,
  type TaskPomodoroEstimate,
  parseTaskPomodoroEstimate,
  formatTaskWithPomodoroEstimate,
  getCleanTaskDisplayTitle,
  parseTaskPriority,
  formatTaskWithPriority,
  isIceboxSection,
  extractPendingTasksFromContent,
  type SubtaskItem,
  type TaskRecord,
  compareTasksByPriority,
  extractAllTasksFromContent,
  type DeadlineItem,
  computeDeadlinesFromTasks,
} from './task-parser.ts';

// 3. Task mutations, section insertions, and deletions
export {
  appendTaskToMarkdownSection,
  appendIceboxItemToMarkdownSection,
  appendTaskToSection,
  type TaskMutationAction,
  type TaskMutationOptions,
  type TaskMutationResult,
  type LocateResult,
  locateTaskLineIndex,
  mutateTaskLineInContent,
  incrementTaskPomodoroInContent,
  decrementTaskPomodoroInContent,
  promoteIdeaToTaskInContent,
  toggleTaskCompletionInContent,
  updateTaskTextInContent,
  toggleSubtaskInContent,
  addSubtaskToContent,
  deleteTaskFromContent,
} from './task-mutation.ts';

// 4. Habits, frequencies, streaks, and progress
export {
  createHabitId,
  type HabitFrequencyType,
  type HabitFrequency,
  type HabitItemData,
  type HabitWeeklyProgress,
  getIsoWeekRange,
  parseHabitLine,
  formatHabitLine,
  calculateHabitStreak,
  computeHabitWeeklyProgress,
  syncHabitsToMarkdown,
  formatHabitsToMarkdown,
} from './habit-utils.ts';

// 5. Calendar time blocks & closing notes
export {
  syncBlocksToMarkdown,
  appendClosingNoteToDailyContent,
  appendClosingNoteToLatestPomodoroInMarkdown,
} from './calendar-utils.ts';

// 6. Analytics calculations
export {
  computeWeeklyFocusTrend,
  computeFocusAllocation,
  computeTasksOverview,
  computeDistractionMetrics,
  type DistractionMetrics,
} from './analytics.ts';

/**
 * Pure Markdown helper:
 * Merges a template into existing note content.
 */
export function mergeTemplateIntoContent(existingContent: string, template: string): string {
  if (existingContent.trim().length === 0) {
    return template;
  }
  return `${existingContent.trimEnd()}\n\n${template}`;
}

/**
 * Checks whether an Escape key press should be ignored by Zen Mode.
 */
export function shouldZenIgnoreEscape(
  activeElement: {
    tagName?: string;
    isContentEditable?: boolean;
    closest?: (selector: string) => unknown;
  } | null,
  isModalOpen: boolean
): boolean {
  if (isModalOpen) return true;
  if (!activeElement) return false;

  const tag = (activeElement.tagName || '').toUpperCase();
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') {
    return true;
  }

  if (activeElement.isContentEditable) {
    return true;
  }

  if (typeof activeElement.closest === 'function') {
    if (activeElement.closest('.cm-editor, .cm-content, input, textarea, select, [contenteditable="true"]')) {
      return true;
    }
  }

  return false;
}

/**
 * Pure function to check if a file path is included in the task index
 * based on folder whitelist/blacklist settings and excluded files.
 */
export function isPathIndexed(
  filePath: string,
  includedFolders: string[] = [],
  excludedFolders: string[] = [],
  excludedFiles: string[] = []
): boolean {
  if (!filePath.endsWith('.md')) return false;

  const normalized = filePath.replace(/\\/g, '/').replace(/^\/+/, '');
  const lowerPath = normalized.toLowerCase();
  const pathParts = lowerPath.split('/');

  // Never index files inside trash or hidden folders (.trash, .obsidian, etc.)
  if (pathParts.some((part) => part.startsWith('.') || part === '.trash' || part === 'trash')) {
    return false;
  }

  // Check excluded files
  for (const exFile of excludedFiles) {
    const cleanExFile = exFile.trim().replace(/\\/g, '/').replace(/^\/+/, '').toLowerCase();
    if (cleanExFile && lowerPath === cleanExFile) {
      return false;
    }
  }

  // Check excluded folders first
  for (const excluded of excludedFolders) {
    const cleanEx = excluded.trim().replace(/\\/g, '/').replace(/^\/+|\/+$/g, '').toLowerCase();
    if (cleanEx.length === 0) continue;
    if (lowerPath === cleanEx || lowerPath.startsWith(cleanEx + '/')) {
      return false;
    }
    // Also match any folder segment in path hierarchy
    if (pathParts.slice(0, -1).includes(cleanEx)) {
      return false;
    }
  }

  // Check included folders if any are specified
  const activeInclusions = includedFolders
    .map((f) => f.trim().replace(/\\/g, '/').replace(/^\/+|\/+$/g, '').toLowerCase())
    .filter((f) => f.length > 0);

  if (activeInclusions.length > 0) {
    const matched = activeInclusions.some(
      (inc) => lowerPath === inc || lowerPath.startsWith(inc + '/')
    );
    if (!matched) return false;
  }

  return true;
}
