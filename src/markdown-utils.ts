export type TaskPriority = 'high' | 'medium' | 'low' | 'none';

export interface PendingTaskItem {
  id: string;
  originalLine: string;
  text: string;
  sourceFile: string;
  priority?: TaskPriority;
  isIdea?: boolean;
  estimatedPomodoros?: number;
  completedPomodoros?: number;
  dueDate?: string; // YYYY-MM-DD
  dueTime?: string; // HH:mm
  daysRemaining?: number;
}

export interface TaskDeadline {
  dueDate?: string;
  dueTime?: string;
  cleanTitle: string;
}

/**
 * Calculates remaining days from a reference date until a target YYYY-MM-DD string.
 * Negative numbers mean overdue, 0 means today, positive means future.
 */
export function calculateDaysRemaining(dateStr: string, referenceDate: Date = new Date()): number {
  const parts = dateStr.split('-').map(Number);
  if (parts.length !== 3 || parts.some(isNaN)) return 0;
  const target = new Date(parts[0], parts[1] - 1, parts[2], 0, 0, 0, 0);
  const ref = new Date(referenceDate.getFullYear(), referenceDate.getMonth(), referenceDate.getDate(), 0, 0, 0, 0);
  const diffTime = target.getTime() - ref.getTime();
  return Math.round(diffTime / (1000 * 60 * 60 * 24));
}

/**
 * Returns human readable status for days remaining.
 */
export function formatDeadlineHuman(daysRemaining: number, dateStr: string): string {
  if (daysRemaining < -1) return `Venció hace ${Math.abs(daysRemaining)} días (${dateStr})`;
  if (daysRemaining === -1) return `Venció ayer (${dateStr})`;
  if (daysRemaining === 0) return 'Vence hoy';
  if (daysRemaining === 1) return 'Vence mañana';
  if (daysRemaining <= 7) return `Vence en ${daysRemaining} días (${dateStr})`;
  return dateStr;
}

/**
 * Parses deadline from task text (e.g. 📅 2026-10-18 or 📅 2026-10-18 14:30 or #deadline/2026-10-18).
 */
export function parseTaskDeadline(text: string): TaskDeadline {
  const match = text.match(/(?:📅|:calendar:|#deadline\/|due:)\s*(\d{4}-\d{2}-\d{2})(?:\s+(\d{1,2}:\d{2}))?/i);
  if (!match) {
    return { cleanTitle: text };
  }
  const dueDate = match[1];
  const dueTime = match[2];
  const cleanTitle = text.replace(match[0], '').replace(/\s{2,}/g, ' ').trim();
  return {
    dueDate,
    dueTime,
    cleanTitle: cleanTitle || text,
  };
}

/**
 * Formats task text with an explicit deadline date and optional time.
 */
export function formatTaskWithDeadline(text: string, date: string, time?: string): string {
  const { cleanTitle } = parseTaskDeadline(text);
  const timeSuffix = time ? ` ${time}` : '';
  return `${cleanTitle} 📅 ${date}${timeSuffix}`.trim();
}

export interface TaskPomodoroEstimate {
  estimated?: number;
  completed?: number;
  cleanTitle: string;
}

/**
 * Parses pomodoro estimate and completion count from task text (e.g. 🍅 2 or 🍅 1/3).
 */
export function parseTaskPomodoroEstimate(text: string): TaskPomodoroEstimate {
  const match = text.match(/(?:🍅|:tomato:)\s*(\d+)(?:\s*\/\s*(\d+))?/i);
  if (!match) {
    return { cleanTitle: text, completed: 0 };
  }

  let completed = 0;
  let estimated = 0;
  if (match[2] !== undefined) {
    completed = parseInt(match[1], 10);
    estimated = parseInt(match[2], 10);
  } else {
    estimated = parseInt(match[1], 10);
  }

  const cleanTitle = text.replace(match[0], '').replace(/\s{2,}/g, ' ').trim();
  return {
    estimated: isNaN(estimated) || estimated <= 0 ? undefined : estimated,
    completed: isNaN(completed) || completed < 0 ? 0 : completed,
    cleanTitle: cleanTitle || text,
  };
}

/**
 * Formats task text with an explicit pomodoro estimate and optional completed count.
 */
export function formatTaskWithPomodoroEstimate(
  text: string,
  estimated?: number,
  completed?: number
): string {
  const { cleanTitle } = parseTaskPomodoroEstimate(text);
  if (!estimated && !completed) {
    return cleanTitle;
  }
  if (completed !== undefined && completed > 0 && estimated !== undefined && estimated > 0) {
    return `${cleanTitle} 🍅 ${completed}/${estimated}`;
  }
  if (estimated !== undefined && estimated > 0) {
    return `${cleanTitle} 🍅 ${estimated}`;
  }
  if (completed !== undefined && completed > 0) {
    return `${cleanTitle} 🍅 ${completed}`;
  }
  return cleanTitle;
}

/**
 * Parses priority tag or emoji from task text.
 * Compatible with Obsidian Tasks standard (⏫, 🔼, 🔽) and common tags (#p1, #alta, etc.)
 */
export function parseTaskPriority(text: string): { priority: TaskPriority; cleanTitle: string } {
  if (/(?:⏫|#p1\b|#alta\b|#prioridad\/alta\b)/i.test(text)) {
    const clean = text.replace(/(?:⏫|#p1\b|#alta\b|#prioridad\/alta\b)/gi, '').trim();
    return { priority: 'high', cleanTitle: clean || text };
  }
  if (/(?:🔼|#p2\b|#media\b|#prioridad\/media\b)/i.test(text)) {
    const clean = text.replace(/(?:🔼|#p2\b|#media\b|#prioridad\/media\b)/gi, '').trim();
    return { priority: 'medium', cleanTitle: clean || text };
  }
  if (/(?:🔽|#p3\b|#baja\b|#prioridad\/baja\b)/i.test(text)) {
    const clean = text.replace(/(?:🔽|#p3\b|#baja\b|#prioridad\/baja\b)/gi, '').trim();
    return { priority: 'low', cleanTitle: clean || text };
  }
  return { priority: 'none', cleanTitle: text };
}

/**
 * Formats a task with an explicit priority prefix.
 */
export function formatTaskWithPriority(text: string, priority: TaskPriority): string {
  const { cleanTitle } = parseTaskPriority(text);
  if (priority === 'high') return `⏫ ${cleanTitle}`;
  if (priority === 'medium') return `🔼 ${cleanTitle}`;
  if (priority === 'low') return `🔽 ${cleanTitle}`;
  return cleanTitle;
}

/**
 * Pure Markdown helper:
 * Appends a task to a given markdown section (default '## Tareas').
 * If the section does not exist, it appends the section at the bottom.
 */
export function appendTaskToMarkdownSection(
  fileContent: string,
  taskText: string,
  sectionHeader: string = '## Tareas'
): string {
  const taskLine = `- [ ] ${taskText.trim()}`;
  const lines = fileContent.split(/\r?\n/);

  // Find target section header (case-insensitive search for header title)
  const headerClean = sectionHeader.replace(/^#+\s*/, '').trim().toLowerCase();
  let headerIndex = -1;
  let headerLevel = 2;

  for (let i = 0; i < lines.length; i++) {
    const match = lines[i].match(/^(#{1,6})\s+(.*)$/);
    if (match) {
      const level = match[1].length;
      const title = match[2].trim().toLowerCase();
      if (title === headerClean) {
        headerIndex = i;
        headerLevel = level;
        break;
      }
    }
  }

  if (headerIndex === -1) {
    // Header does not exist: append at the end
    const trimmed = fileContent.trimEnd();
    if (trimmed.length === 0) {
      return `${sectionHeader}\n${taskLine}\n`;
    }
    return `${trimmed}\n\n${sectionHeader}\n${taskLine}\n`;
  }

  // Header found: locate end of section (next header with level <= headerLevel, or EOF)
  let insertIndex = lines.length;
  for (let i = headerIndex + 1; i < lines.length; i++) {
    const match = lines[i].match(/^(#{1,6})\s+/);
    if (match && match[1].length <= headerLevel) {
      insertIndex = i;
      break;
    }
  }

  // Insert before insertIndex
  let targetIndex = insertIndex;
  while (targetIndex > headerIndex + 1 && lines[targetIndex - 1].trim() === '') {
    targetIndex--;
  }

  lines.splice(targetIndex, 0, taskLine);
  return lines.join('\n');
}

/**
 * Pure Markdown helper:
 * Extracts uncompleted tasks (- [ ]) from markdown content.
 */
export function extractPendingTasksFromContent(
  content: string,
  sourceFile: string
): PendingTaskItem[] {
  const tasks: PendingTaskItem[] = [];
  const lines = content.split(/\r?\n/);
  let currentSection = '';

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const headerMatch = line.match(/^#{1,6}\s+(.*)$/);
    if (headerMatch) {
      currentSection = headerMatch[1].trim().toLowerCase();
    }

    const match = line.match(/^\s*-\s+\[\s\]\s+(.*)$/);
    if (match) {
      const taskText = match[1].trim();
      const { priority } = parseTaskPriority(taskText);
      const { estimated, completed } = parseTaskPomodoroEstimate(taskText);
      const { dueDate, dueTime } = parseTaskDeadline(taskText);
      const daysRemaining = dueDate ? calculateDaysRemaining(dueDate) : undefined;
      const isIdea = currentSection.includes('idea') || /#ideas?\b/i.test(taskText) || taskText.startsWith('💡');
      tasks.push({
        id: `${sourceFile}#L${i + 1}:${taskText}`,
        originalLine: line,
        text: taskText,
        sourceFile,
        priority,
        isIdea,
        estimatedPomodoros: estimated,
        completedPomodoros: completed,
        dueDate,
        dueTime,
        daysRemaining,
      });
    }
  }

  return tasks;
}

/**
 * Formats daily note file name using given offset.
 */
export function formatDailyNoteFileName(
  dateFormat: string,
  offsetDays: number = 0,
  referenceDate: Date = new Date()
): string {
  const targetDate = new Date(referenceDate);
  targetDate.setDate(targetDate.getDate() + offsetDays);

  const yyyy = String(targetDate.getFullYear());
  const mm = String(targetDate.getMonth() + 1).padStart(2, '0');
  const dd = String(targetDate.getDate()).padStart(2, '0');

  // Simple replacement for standard formats
  let formatted = dateFormat
    .replace('YYYY', yyyy)
    .replace('MM', mm)
    .replace('DD', dd);

  return formatted.endsWith('.md') ? formatted : `${formatted}.md`;
}
