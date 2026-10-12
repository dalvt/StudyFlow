import { App, Notice, TFile } from 'obsidian';
import type StudyFlowPlugin from './main';
import type { CalendarTimeBlock, StudyFlowSettings } from './settings';
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
} from './utils';

export * from './calendar-utils';

export interface DeadlineItem extends PendingTaskItem {
  cleanTitle: string;
  dueDate: string; // YYYY-MM-DD
  dueTime?: string;
  daysRemaining: number;
  completed: boolean;
}

/**
 * Retrieves time blocks for a given date from settings.
 */
export function getTimeBlocksForDate(
  settings: StudyFlowSettings,
  dateStr: string
): CalendarTimeBlock[] {
  const blocks = settings.calendarBlocks?.[dateStr] || [];
  return [...blocks].sort((a, b) => a.startTime.localeCompare(b.startTime));
}

/**
 * Saves or updates a time block in settings.
 */
export async function saveTimeBlock(
  plugin: StudyFlowPlugin,
  block: CalendarTimeBlock
): Promise<void> {
  if (!plugin.settings.calendarBlocks) {
    plugin.settings.calendarBlocks = {};
  }
  const dateBlocks = plugin.settings.calendarBlocks[block.date] || [];
  const idx = dateBlocks.findIndex((b) => b.id === block.id);
  if (idx >= 0) {
    dateBlocks[idx] = block;
  } else {
    dateBlocks.push(block);
  }
  plugin.settings.calendarBlocks[block.date] = dateBlocks.sort((a, b) =>
    a.startTime.localeCompare(b.startTime)
  );
  await plugin.saveSettings();
}

/**
 * Deletes a time block from settings.
 */
export async function deleteTimeBlock(
  plugin: StudyFlowPlugin,
  dateStr: string,
  blockId: string
): Promise<void> {
  if (!plugin.settings.calendarBlocks?.[dateStr]) return;
  plugin.settings.calendarBlocks[dateStr] = plugin.settings.calendarBlocks[dateStr].filter(
    (b) => b.id !== blockId
  );
  await plugin.saveSettings();
}

/**
 * Toggles completion status of a time block.
 */
export async function toggleTimeBlockCompletion(
  plugin: StudyFlowPlugin,
  dateStr: string,
  blockId: string,
  completed: boolean
): Promise<void> {
  const blocks = plugin.settings.calendarBlocks?.[dateStr];
  if (!blocks) return;
  const target = blocks.find((b) => b.id === blockId);
  if (target) {
    target.completed = completed;
    await plugin.saveSettings();
  }
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
    const dailyPath = `${settings.dailyNotesFolder}/${dateStr}.md`;
    const targetFile = await getOrCreateFile(app, dailyPath, `# ${dateStr}\n\n`);
    const content = await app.vault.read(targetFile);

    // Build markdown lines for blocks
    const lines = content.split(/\r?\n/);
    const blockLines = blocks.map((b) => {
      const check = b.completed ? 'x' : ' ';
      const notePart = b.linkedNote ? ` | ${b.linkedNote}` : '';
      return `- [${check}] ${b.startTime} — ${b.endTime} ${b.title}${notePart}`;
    });

    const header = '## Bloques de Tiempo';
    const headerIndex = lines.findIndex((l) => l.trim().toLowerCase() === header.toLowerCase());

    let updatedContent = '';
    if (headerIndex === -1) {
      // Append section at end
      updatedContent = `${content.trimEnd()}\n\n${header}\n${blockLines.join('\n')}\n`;
    } else {
      // Find end of section
      let endIdx = lines.length;
      for (let i = headerIndex + 1; i < lines.length; i++) {
        if (/^#{1,6}\s+/.test(lines[i])) {
          endIdx = i;
          break;
        }
      }
      lines.splice(headerIndex + 1, endIdx - (headerIndex + 1), ...blockLines);
      updatedContent = lines.join('\n');
    }

    await app.vault.modify(targetFile, updatedContent);
    return true;
  } catch (err) {
    console.error('Error syncing blocks to daily note:', err);
    return false;
  }
}

/**
 * Loads all deadlines across the vault (Inbox.md and Daily Notes).
 */
export async function loadAllDeadlines(
  app: App,
  settings: StudyFlowSettings
): Promise<DeadlineItem[]> {
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
    const file = await getOrCreateFile(app, inboxPath, '# Inbox\n\n## Tareas\n\n## Ideas\n\n');
    const content = await app.vault.read(file);

    let formatted = priority !== 'none' ? formatTaskWithPriority(taskTitle, priority) : taskTitle;
    if (pomodoros && pomodoros > 0) {
      formatted = formatTaskWithPomodoroEstimate(formatted, pomodoros);
    }
    formatted = formatTaskWithDeadline(formatted, dueDate, dueTime);

    const updated = appendTaskToMarkdownSection(content, formatted, '## Tareas');
    await app.vault.modify(file, updated);
    return true;
  } catch (err) {
    console.error('Error creating deadline task:', err);
    return false;
  }
}
