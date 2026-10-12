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
