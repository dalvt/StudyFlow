import { App, Notice, TFile } from 'obsidian';
import type StudyFlowPlugin from './main.ts';
import type { CalendarTimeBlock, StudyFlowSettings } from './settings.ts';
import { t } from './i18n/index.ts';
export type { CalendarTimeBlock, StudyFlowSettings };
import {
  appendTaskToMarkdownSection,
  calculateDaysRemaining,
  extractPendingTasksFromContent,
  formatDeadlineHuman,
  formatTaskWithDeadline,
  formatTaskWithPomodoroEstimate,
  formatTaskWithPriority,
  getDailyNotePath,
  getOrCreateFile,
  PendingTaskItem,
  TaskPriority,
  syncBlocksToMarkdown,
} from './utils.ts';

export * from './calendar-utils.ts';

export interface DeadlineItem extends PendingTaskItem {
  cleanTitle: string;
  dueDate: string; // YYYY-MM-DD
  dueTime?: string;
  daysRemaining: number;
  completed: boolean;
}

import { findOverlappingBlocks, parseTimeBlocksFromMarkdown } from './calendar-utils.ts';

/**
 * Retrieves time blocks for a given date directly from its Daily Note (sole source of truth).
 */
export async function getTimeBlocksForDate(
  app: App,
  settings: StudyFlowSettings,
  dateStr: string
): Promise<CalendarTimeBlock[]> {
  const dailyPath = getDailyNotePath(settings, dateStr);
  const file = app.vault.getAbstractFileByPath(dailyPath);
  if (!(file instanceof TFile)) {
    return [];
  }
  try {
    const content = await app.vault.read(file);
    const blocks = parseTimeBlocksFromMarkdown(content, dateStr);
    return blocks.sort((a, b) => a.startTime.localeCompare(b.startTime));
  } catch (err) {
    console.error(`Study Flow: Error leyendo bloques desde ${dailyPath}`, err);
    return [];
  }
}

/**
 * Saves or updates a time block in its Daily Note (sole source of truth).
 * Detects overlaps and displays a warning Notice (warning, not blocking).
 */
export async function saveTimeBlock(
  plugin: StudyFlowPlugin,
  block: CalendarTimeBlock
): Promise<void> {
  const dailyPath = getDailyNotePath(plugin.settings, block.date);
  const targetFile = await getOrCreateFile(plugin.app, dailyPath, `# ${block.date}\n\n`);

  await plugin.app.vault.process(targetFile, (content) => {
    const existing = parseTimeBlocksFromMarkdown(content, block.date);

    // Overlap detection: warning only, not blocking
    const overlaps = findOverlappingBlocks(existing, block);
    if (overlaps.length > 0) {
      const names = overlaps.map((o) => `"${o.title}" (${o.startTime}—${o.endTime})`).join(', ');
      new Notice(t('calendar.overlapWarningNotice', { names }));
    }

    const idx = existing.findIndex((b) => b.id === block.id);
    if (idx >= 0) {
      existing[idx] = block;
    } else {
      existing.push(block);
    }
    existing.sort((a, b) => a.startTime.localeCompare(b.startTime));
    return syncBlocksToMarkdown(content, existing);
  });
}

/**
 * Deletes a time block from its Daily Note.
 */
export async function deleteTimeBlock(
  plugin: StudyFlowPlugin,
  dateStr: string,
  blockId: string
): Promise<void> {
  const dailyPath = getDailyNotePath(plugin.settings, dateStr);
  const file = plugin.app.vault.getAbstractFileByPath(dailyPath);
  if (!(file instanceof TFile)) return;

  await plugin.app.vault.process(file, (content) => {
    const existing = parseTimeBlocksFromMarkdown(content, dateStr);
    const filtered = existing.filter((b) => b.id !== blockId);
    return syncBlocksToMarkdown(content, filtered);
  });
}

/**
 * Toggles completion status of a time block directly in its Daily Note.
 */
export async function toggleTimeBlockCompletion(
  plugin: StudyFlowPlugin,
  dateStr: string,
  blockId: string,
  completed: boolean
): Promise<void> {
  const dailyPath = getDailyNotePath(plugin.settings, dateStr);
  const file = plugin.app.vault.getAbstractFileByPath(dailyPath);
  if (!(file instanceof TFile)) return;

  await plugin.app.vault.process(file, (content) => {
    const existing = parseTimeBlocksFromMarkdown(content, dateStr);
    const target = existing.find((b) => b.id === blockId);
    if (target) {
      target.completed = completed;
    }
    return syncBlocksToMarkdown(content, existing);
  });
}

/**
 * Syncs the day's time blocks directly to its Daily Note in Markdown.
 */
export async function syncTimeBlocksToDailyNote(
  app: App,
  settings: StudyFlowSettings,
  dateStr: string,
  blocks: CalendarTimeBlock[]
): Promise<boolean> {
  try {
    const dailyPath = getDailyNotePath(settings, dateStr);
    const targetFile = await getOrCreateFile(app, dailyPath, `# ${dateStr}\n\n`);

    await app.vault.process(targetFile, (content) => {
      return syncBlocksToMarkdown(content, blocks);
    });
    return true;
  } catch (err) {
    console.error('Error syncing blocks to daily note:', err);
    return false;
  }
}

/**
 * Loads all deadlines across the vault (Inbox.md and Daily Notes) or directly from TaskIndex.
 */
export async function loadAllDeadlines(
  app: App,
  settings: StudyFlowSettings,
  taskIndex?: { getAllDeadlines(): DeadlineItem[] }
): Promise<DeadlineItem[]> {
  if (taskIndex) {
    return taskIndex.getAllDeadlines();
  }

  const deadlines: DeadlineItem[] = [];
  const filesToScan: TFile[] = [];

  // 1. Inbox file
  const inboxPath = settings.inboxFilePath || 'StudyFlow/Inbox.md';
  const inboxFile = app.vault.getAbstractFileByPath(inboxPath);
  if (inboxFile instanceof TFile) {
    filesToScan.push(inboxFile);
  }

  // 2. Daily notes folder files (recent/today)
  const dailyFolder = app.vault.getAbstractFileByPath(settings.dailyNotesFolder || 'Daily');
  if (dailyFolder && 'children' in dailyFolder && Array.isArray((dailyFolder as any).children)) {
    const children = (dailyFolder as any).children as any[];
    children.forEach((child) => {
      if (child instanceof TFile && child.extension === 'md') {
        filesToScan.push(child);
      }
    });
  }

  for (const file of filesToScan) {
    try {
      const content = await app.vault.read(file);
      const lines = content.split(/\r?\n/);
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        const match = line.match(/^\s*-\s+\[(.)\]\s+(.*)$/);
        if (match) {
          const statusChar = match[1];
          const taskText = match[2].trim();
          const completed = statusChar.toLowerCase() === 'x';

          // Check for deadline
          const deadlineMatch = taskText.match(
            /(?:📅|:calendar:|#deadline\/|due:)\s*(\d{4}-\d{2}-\d{2})(?:\s+(\d{1,2}:\d{2}))?/i
          );
          if (deadlineMatch) {
            const dueDate = deadlineMatch[1];
            const dueTime = deadlineMatch[2];
            const cleanTitle = taskText.replace(deadlineMatch[0], '').replace(/\s{2,}/g, ' ').trim();
            const daysRemaining = calculateDaysRemaining(dueDate);

            deadlines.push({
              id: `${file.path}#L${i + 1}:${taskText}`,
              originalLine: line,
              text: taskText,
              cleanTitle: cleanTitle || taskText,
              sourceFile: file.path,
              dueDate,
              dueTime,
              daysRemaining,
              completed,
            });
          }
        }
      }
    } catch (e) {
      // Ignore read errors for inaccessible files
    }
  }

  // Sort deadlines: uncompleted first, then by urgency (daysRemaining ascending), then completed
  return deadlines.sort((a, b) => {
    if (a.completed !== b.completed) {
      return a.completed ? 1 : -1;
    }
    if (a.daysRemaining !== b.daysRemaining) {
      return a.daysRemaining - b.daysRemaining;
    }
    return a.dueDate.localeCompare(b.dueDate);
  });
}

/**
 * Creates a new deadline task and writes it to Inbox.md or specified destination.
 */
export async function createDeadlineTask(
  app: App,
  settings: StudyFlowSettings,
  taskTitle: string,
  dueDate: string,
  dueTime?: string,
  priority: TaskPriority = 'none',
  pomodoros?: number
): Promise<boolean> {
  try {
    const inboxPath = settings.inboxFilePath || 'StudyFlow/Inbox.md';
    const tasksH = settings.tasksSectionHeader || '## Tareas';
    const iceboxH = settings.iceboxSectionHeader || '## Icebox';
    const file = await getOrCreateFile(app, inboxPath, `# Inbox\n\n${tasksH}\n\n${iceboxH}\n\n`);
    let formatted = priority !== 'none' ? formatTaskWithPriority(taskTitle, priority) : taskTitle;
    if (pomodoros && pomodoros > 0) {
      formatted = formatTaskWithPomodoroEstimate(formatted, pomodoros);
    }
    formatted = formatTaskWithDeadline(formatted, dueDate, dueTime);

    await app.vault.process(file, (content) => {
      return appendTaskToMarkdownSection(content, formatted, tasksH);
    });
    return true;
  } catch (err) {
    console.error('Error creating deadline task:', err);
    return false;
  }
}
