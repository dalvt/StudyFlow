import { t } from './i18n/index.ts';

/**
 * Extracts hashtags (#materia) and wikilinks ([[Nota]]) from text.
 */
export function extractTagsFromText(text: string): string[] {
  if (!text) return [];
  const tags: string[] = [];

  // Match hashtags (including accented characters)
  const hashMatches = text.match(/#[\w\u00C0-\u017F-]+/g);
  if (hashMatches) {
    hashMatches.forEach((t) => {
      const clean = t.toLowerCase();
      if (!tags.includes(clean)) tags.push(clean);
    });
  }

  // Match wikilinks [[Page Name]]
  const linkMatches = text.match(/\[\[([^\]|]+)(?:\|[^\]]+)?\]\]/g);
  if (linkMatches) {
    linkMatches.forEach((linkStr) => {
      const match = linkStr.match(/\[\[([^\]|]+)/);
      if (match && match[1]) {
        const link = `[[${match[1].trim()}]]`;
        if (!tags.includes(link)) tags.push(link);
      }
    });
  }

  return tags;
}

export type TaskPriority = 'high' | 'medium' | 'low' | 'none';

/**
 * Fast deterministic 32-bit hash of a line string.
 */
export function computeLineHash(line: string): string {
  const normalized = line.replace(/\r$/, '');
  let h1 = 0xdeadbeef ^ 0;
  let h2 = 0x41c6ce57 ^ 0;
  for (let i = 0; i < normalized.length; i++) {
    const ch = normalized.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(16).padStart(8, '0');
}

export interface TaskLocator {
  sourceFile: string;
  lineNumber?: number;
  lineHash?: string;
  originalLine?: string;
  text?: string;
}

export interface PendingTaskItem {
  id: string;
  originalLine: string;
  text: string;
  sourceFile: string;
  lineNumber?: number;
  lineHash?: string;
  priority?: TaskPriority;
  isIdea?: boolean;
  estimatedPomodoros?: number;
  completedPomodoros?: number;
  dueDate?: string; // YYYY-MM-DD
  dueTime?: string; // HH:mm
  daysRemaining?: number;
  scheduledDate?: string; // ⏳ YYYY-MM-DD
  startDate?: string; // 🛫 YYYY-MM-DD
  completedDate?: string; // ✅ YYYY-MM-DD
  recurrence?: string; // 🔁 rule
}

export interface TaskDeadline {
  dueDate?: string;
  dueTime?: string;
  cleanTitle: string;
}

export interface TaskScheduledDate {
  scheduledDate?: string;
  cleanTitle: string;
}

export interface TaskStartDate {
  startDate?: string;
  cleanTitle: string;
}

export interface TaskCompletionDate {
  completedDate?: string;
  cleanTitle: string;
}

export interface TaskRecurrence {
  recurrence?: string;
  cleanTitle: string;
}

export interface ParsedRecurrence {
  raw: string;
  frequency: 'daily' | 'weekly' | 'monthly' | 'yearly' | 'weekday';
  interval: number;
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
  if (daysRemaining < -1) return t('deadline.overdueDays', { days: Math.abs(daysRemaining), date: dateStr });
  if (daysRemaining === -1) return t('deadline.overdueYesterday', { date: dateStr });
  if (daysRemaining === 0) return t('deadline.dueToday');
  if (daysRemaining === 1) return t('deadline.dueTomorrow');
  if (daysRemaining <= 7) return t('deadline.dueInDays', { days: daysRemaining, date: dateStr });
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

/**
 * Parses scheduled date (⏳ 2026-10-18).
 */
export function parseTaskScheduledDate(text: string): TaskScheduledDate {
  const match = text.match(/(?:⏳|#scheduled\/)\s*(\d{4}-\d{2}-\d{2})/i);
  if (!match) {
    return { cleanTitle: text };
  }
  const scheduledDate = match[1];
  const cleanTitle = text.replace(match[0], '').replace(/\s{2,}/g, ' ').trim();
  return { scheduledDate, cleanTitle: cleanTitle || text };
}

/**
 * Formats task text with an explicit scheduled date (⏳ YYYY-MM-DD).
 */
export function formatTaskWithScheduledDate(text: string, date: string): string {
  const { cleanTitle } = parseTaskScheduledDate(text);
  return `${cleanTitle} ⏳ ${date}`.trim();
}

/**
 * Parses start date (🛫 2026-10-18).
 */
export function parseTaskStartDate(text: string): TaskStartDate {
  const match = text.match(/(?:🛫|#start\/)\s*(\d{4}-\d{2}-\d{2})/i);
  if (!match) {
    return { cleanTitle: text };
  }
  const startDate = match[1];
  const cleanTitle = text.replace(match[0], '').replace(/\s{2,}/g, ' ').trim();
  return { startDate, cleanTitle: cleanTitle || text };
}

/**
 * Formats task text with an explicit start date (🛫 YYYY-MM-DD).
 */
export function formatTaskWithStartDate(text: string, date: string): string {
  const { cleanTitle } = parseTaskStartDate(text);
  return `${cleanTitle} 🛫 ${date}`.trim();
}

/**
 * Parses completion date (✅ 2026-10-18).
 */
export function parseTaskCompletionDate(text: string): TaskCompletionDate {
  const match = text.match(/(?:✅|#completed\/)\s*(\d{4}-\d{2}-\d{2})/i);
  if (!match) {
    return { cleanTitle: text };
  }
  const completedDate = match[1];
  const cleanTitle = text.replace(match[0], '').replace(/\s{2,}/g, ' ').trim();
  return { completedDate, cleanTitle: cleanTitle || text };
}

/**
 * Formats task text with an explicit completion date (✅ YYYY-MM-DD).
 */
export function formatTaskWithCompletionDate(text: string, date: string): string {
  const { cleanTitle } = parseTaskCompletionDate(text);
  return `${cleanTitle} ✅ ${date}`.trim();
}

/**
 * Parses recurrence rule string into structured definition.
 */
export function parseRecurrenceRule(ruleStr: string): ParsedRecurrence | null {
  const trimmed = ruleStr.trim().toLowerCase();
  if (!trimmed) return null;

  // Weekday
  if (trimmed.includes('weekday') || trimmed.includes('dia de semana') || trimmed.includes('días de semana')) {
    return { raw: ruleStr.trim(), frequency: 'weekday', interval: 1 };
  }

  // Daily
  if (
    trimmed === 'daily' ||
    trimmed === 'diario' ||
    trimmed === 'diaria' ||
    trimmed === 'every day' ||
    trimmed === 'cada dia' ||
    trimmed === 'cada día'
  ) {
    return { raw: ruleStr.trim(), frequency: 'daily', interval: 1 };
  }
  const dayMatch = trimmed.match(/(?:every|cada)\s+(\d+)\s+(?:days?|d[ií]as?)/);
  if (dayMatch) {
    return { raw: ruleStr.trim(), frequency: 'daily', interval: parseInt(dayMatch[1], 10) || 1 };
  }

  // Weekly
  if (
    trimmed === 'weekly' ||
    trimmed === 'semanal' ||
    trimmed === 'every week' ||
    trimmed === 'cada semana'
  ) {
    return { raw: ruleStr.trim(), frequency: 'weekly', interval: 1 };
  }
  const weekMatch = trimmed.match(/(?:every|cada)\s+(\d+)\s+(?:weeks?|semanas?)/);
  if (weekMatch) {
    return { raw: ruleStr.trim(), frequency: 'weekly', interval: parseInt(weekMatch[1], 10) || 1 };
  }

  // Monthly
  if (
    trimmed === 'monthly' ||
    trimmed === 'mensual' ||
    trimmed === 'every month' ||
    trimmed === 'cada mes'
  ) {
    return { raw: ruleStr.trim(), frequency: 'monthly', interval: 1 };
  }
  const monthMatch = trimmed.match(/(?:every|cada)\s+(\d+)\s+(?:months?|meses)/);
  if (monthMatch) {
    return { raw: ruleStr.trim(), frequency: 'monthly', interval: parseInt(monthMatch[1], 10) || 1 };
  }

  // Yearly
  if (
    trimmed === 'yearly' ||
    trimmed === 'anual' ||
    trimmed === 'every year' ||
    trimmed === 'cada año'
  ) {
    return { raw: ruleStr.trim(), frequency: 'yearly', interval: 1 };
  }
  const yearMatch = trimmed.match(/(?:every|cada)\s+(\d+)\s+(?:years?|a[ñn]os?)/);
  if (yearMatch) {
    return { raw: ruleStr.trim(), frequency: 'yearly', interval: parseInt(yearMatch[1], 10) || 1 };
  }

  if (/days?|d[ií]as?/i.test(trimmed)) {
    return { raw: ruleStr.trim(), frequency: 'daily', interval: 1 };
  }
  if (/weeks?|semanas?/i.test(trimmed)) {
    return { raw: ruleStr.trim(), frequency: 'weekly', interval: 1 };
  }
  if (/months?|mes(?:es)?/i.test(trimmed)) {
    return { raw: ruleStr.trim(), frequency: 'monthly', interval: 1 };
  }

  return { raw: ruleStr.trim(), frequency: 'daily', interval: 1 };
}

/**
 * Parses recurrence rule from task text (🔁 every week or 🔁 daily).
 */
export function parseTaskRecurrence(text: string): TaskRecurrence {
  const match = text.match(/🔁\s*([a-zA-Z0-9_\-\u00C0-\u017F ]+?)(?=\s*(?:[📅⏳🛫✅🍅⏫🔼🔽#]|$))/i);
  if (!match) {
    return { cleanTitle: text };
  }
  const recurrence = match[1].trim();
  const cleanTitle = text.replace(match[0], '').replace(/\s{2,}/g, ' ').trim();
  return { recurrence, cleanTitle: cleanTitle || text };
}

/**
 * Formats task text with a recurrence rule (🔁 rule).
 */
export function formatTaskWithRecurrence(text: string, recurrenceRule: string): string {
  const { cleanTitle } = parseTaskRecurrence(text);
  return `${cleanTitle} 🔁 ${recurrenceRule.trim()}`.trim();
}

/**
 * Calculates the next recurrence date given an existing YYYY-MM-DD and recurrence rule.
 */
export function calculateNextRecurrenceDate(
  currentDateStr: string,
  recurrenceRule: string,
  referenceDate?: Date
): string {
  const parsed = parseRecurrenceRule(recurrenceRule);
  const parts = currentDateStr.split('-').map(Number);
  let base: Date;
  if (parts.length === 3 && !parts.some(isNaN)) {
    base = new Date(parts[0], parts[1] - 1, parts[2], 12, 0, 0);
  } else if (referenceDate) {
    base = new Date(referenceDate.getFullYear(), referenceDate.getMonth(), referenceDate.getDate(), 12, 0, 0);
  } else {
    const now = new Date();
    base = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 12, 0, 0);
  }

  const year = base.getFullYear();
  const month = base.getMonth();
  const day = base.getDate();

  let next: Date;
  if (!parsed) {
    next = new Date(year, month, day + 1, 12, 0, 0);
  } else {
    switch (parsed.frequency) {
      case 'daily':
        next = new Date(year, month, day + parsed.interval, 12, 0, 0);
        break;
      case 'weekday': {
        next = new Date(year, month, day, 12, 0, 0);
        for (let i = 0; i < parsed.interval; i++) {
          next.setDate(next.getDate() + 1);
          while (next.getDay() === 0 || next.getDay() === 6) {
            next.setDate(next.getDate() + 1);
          }
        }
        break;
      }
      case 'weekly':
        next = new Date(year, month, day + (parsed.interval * 7), 12, 0, 0);
        break;
      case 'monthly': {
        next = new Date(year, month + parsed.interval, day, 12, 0, 0);
        if (next.getDate() !== day) {
          next.setDate(0); // Set to last day of target month if day overflowed
        }
        break;
      }
      case 'yearly':
        next = new Date(year + parsed.interval, month, day, 12, 0, 0);
        break;
      default:
        next = new Date(year, month, day + 1, 12, 0, 0);
        break;
    }
  }

  const ny = next.getFullYear();
  const nm = String(next.getMonth() + 1).padStart(2, '0');
  const nd = String(next.getDate()).padStart(2, '0');
  return `${ny}-${nm}-${nd}`;
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
 * Strips metadata badges (deadlines, pomodoros, priorities, tags, idea markers)
 * from task text for clean visual rendering in the UI.
 */
export function getCleanTaskDisplayTitle(text: string): string {
  let clean = text;
  clean = clean.replace(/<!--[\s\S]*?-->/g, '');
  clean = clean.replace(/(?:⏫|🔼|🔽|#p[1-3]\b|#alta\b|#media\b|#baja\b)/gi, '');
  clean = clean.replace(/(?:🍅|:tomato:)\s*\d+(?:\s*\/\s*\d+)?/gi, '');
  clean = clean.replace(/📅\s*\d{4}-\d{2}-\d{2}(?:\s+\d{1,2}:\d{2})?/gi, '');
  clean = clean.replace(/(?:⏳|#scheduled\/)\s*\d{4}-\d{2}-\d{2}/gi, '');
  clean = clean.replace(/(?:🛫|#start\/)\s*\d{4}-\d{2}-\d{2}/gi, '');
  clean = clean.replace(/(?:✅|#completed\/)\s*\d{4}-\d{2}-\d{2}/gi, '');
  clean = clean.replace(/🔁\s*[a-zA-Z0-9_\-\u00C0-\u017F ]+?(?=\s*(?:[📅⏳🛫✅🍅⏫🔼🔽#]|$))/gi, '');
  clean = clean.replace(/#[\w\u00C0-\u017F-]+/g, '');
  clean = clean.replace(/^(?:💡|🧊|#ideas?\b|#icebox\b)\s*/i, '');
  clean = clean.replace(/\s{2,}/g, ' ').trim();
  return clean || text.replace(/<!--[\s\S]*?-->/g, '').trim() || text;
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
 * Appends a passive bullet item to ## Icebox (default) without adding task checkbox syntax.
 */
export function appendIceboxItemToMarkdownSection(
  fileContent: string,
  itemText: string,
  sectionHeader: string = '## Icebox'
): string {
  const cleanItem = itemText.trim().replace(/^[-*]\s+/, '');
  const bulletLine = `- ${cleanItem}`;
  const lines = fileContent.split(/\r?\n/);

  const headerClean = sectionHeader.replace(/^#+\s*/, '').trim().toLowerCase();
  let headerIndex = -1;
  let headerLevel = 2;

  for (let i = 0; i < lines.length; i++) {
    const match = lines[i].match(/^(#{1,6})\s+(.*)$/);
    if (match) {
      const level = match[1].length;
      const title = match[2].trim().toLowerCase();
      if (title === headerClean || (headerClean === 'icebox' && title === 'ideas')) {
        headerIndex = i;
        headerLevel = level;
        break;
      }
    }
  }

  if (headerIndex === -1) {
    const trimmed = fileContent.trimEnd();
    if (trimmed.length === 0) {
      return `${sectionHeader}\n${bulletLine}\n`;
    }
    return `${trimmed}\n\n${sectionHeader}\n${bulletLine}\n`;
  }

  let insertIndex = lines.length;
  for (let i = headerIndex + 1; i < lines.length; i++) {
    const match = lines[i].match(/^(#{1,6})\s+/);
    if (match && match[1].length <= headerLevel) {
      insertIndex = i;
      break;
    }
  }

  let targetIndex = insertIndex;
  while (targetIndex > headerIndex + 1 && lines[targetIndex - 1].trim() === '') {
    targetIndex--;
  }

  lines.splice(targetIndex, 0, bulletLine);
  return lines.join('\n');
}

/**
 * Checks whether a markdown section heading corresponds to an Icebox / Ideas section.
 * Avoids false positives from generic headings containing "idea" like "Main ideas" or "Ideas preconcebidas".
 */
export function isIceboxSection(sectionHeader: string, customIceboxHeader?: string): boolean {
  if (!sectionHeader) return false;
  const raw = sectionHeader.trim().toLowerCase();
  const clean = raw.replace(/^#+\s*/, '').replace(/[\u{1F300}-\u{1F9FF}]/gu, '').trim();
  const customClean = customIceboxHeader
    ? customIceboxHeader.trim().toLowerCase().replace(/^#+\s*/, '').replace(/[\u{1F300}-\u{1F9FF}]/gu, '').trim()
    : 'icebox';

  if (customClean && clean === customClean) return true;
  if (clean === 'icebox' || clean === 'ideas' || clean === 'idea') return true;
  if (/^icebox\s*[-/:|(\]]/i.test(clean)) return true;
  if (/^ideas?\s*[-/:|(\]]/i.test(clean)) return true;
  return false;
}

/**
 * Pure Markdown helper:
 * Extracts uncompleted tasks (- [ ]) from markdown content.
 */
export function extractPendingTasksFromContent(
  content: string,
  sourceFile: string,
  options?: { tasksSectionHeader?: string; iceboxSectionHeader?: string }
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
      // Habit tracker lines (- [ ] Habit <!-- streak: ... -->) are not todo tasks
      if (/<!--\s*streak:\s*\d+/i.test(line)) {
        continue;
      }
      const taskText = match[1].trim();
      const { priority } = parseTaskPriority(taskText);
      const { estimated, completed } = parseTaskPomodoroEstimate(taskText);
      const { dueDate, dueTime } = parseTaskDeadline(taskText);
      const { scheduledDate } = parseTaskScheduledDate(taskText);
      const { startDate } = parseTaskStartDate(taskText);
      const { completedDate } = parseTaskCompletionDate(taskText);
      const { recurrence } = parseTaskRecurrence(taskText);
      const daysRemaining = dueDate ? calculateDaysRemaining(dueDate) : undefined;
      const inIcebox = isIceboxSection(currentSection, options?.iceboxSectionHeader);
      const isIdea =
        inIcebox ||
        /#(?:ideas?|icebox)\b/i.test(taskText) ||
        taskText.startsWith('💡') ||
        taskText.startsWith('🧊');
      const lineHash = computeLineHash(line);
      tasks.push({
        id: `${sourceFile}#L${i + 1}:${taskText}`,
        originalLine: line,
        text: taskText,
        sourceFile,
        lineNumber: i + 1,
        lineHash,
        priority,
        isIdea,
        estimatedPomodoros: estimated,
        completedPomodoros: completed,
        dueDate,
        dueTime,
        daysRemaining,
        scheduledDate,
        startDate,
        completedDate,
        recurrence,
      });
    }
  }

  return tasks;
}

/**
 * Formats a Date into a local YYYY-MM-DD string without UTC timezone skew.
 */
export function getLocalDateString(date: Date = new Date()): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Formats daily note file name using given offset, date string, or Date object.
 */
export function formatDailyNoteFileName(
  dateFormat: string,
  targetDateOrOffset: number | string | Date = 0,
  referenceDate: Date = new Date()
): string {
  let targetDate: Date;

  if (typeof targetDateOrOffset === 'number') {
    targetDate = new Date(referenceDate);
    targetDate.setDate(targetDate.getDate() + targetDateOrOffset);
  } else if (targetDateOrOffset instanceof Date) {
    targetDate = targetDateOrOffset;
  } else if (typeof targetDateOrOffset === 'string') {
    const cleanStr = targetDateOrOffset.replace(/\.md$/, '').trim();
    const parts = cleanStr.split('-').map(Number);
    if (parts.length === 3 && !parts.some(isNaN)) {
      targetDate = new Date(parts[0], parts[1] - 1, parts[2]);
    } else {
      targetDate = new Date(cleanStr);
    }
  } else {
    targetDate = new Date(referenceDate);
  }

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

export interface SubtaskItem {
  text: string;
  completed: boolean;
  originalLine: string;
  lineNumber?: number;
  lineHash?: string;
  sourceFile?: string;
}

export interface TaskRecord extends PendingTaskItem {
  completed: boolean;
  statusChar: string;
  priority: TaskPriority;
  estimatedPomodoros?: number;
  completedPomodoros?: number;
  dueDate?: string;
  dueTime?: string;
  daysRemaining?: number;
  tags?: string[];
  subtasks?: SubtaskItem[];
}

export function compareTasksByPriority(a: TaskRecord, b: TaskRecord): number {
  const priorityWeight: Record<TaskPriority, number> = {
    high: 3,
    medium: 2,
    none: 1,
    low: 0,
  };
  if (a.completed !== b.completed) {
    return a.completed ? 1 : -1;
  }
  // Prioritize imminent/overdue deadlines
  if (a.dueDate && b.dueDate && a.dueDate !== b.dueDate) {
    return a.dueDate.localeCompare(b.dueDate);
  }
  if (a.dueDate && !b.dueDate && (a.daysRemaining !== undefined && a.daysRemaining <= 1)) {
    return -1;
  }
  if (!a.dueDate && b.dueDate && (b.daysRemaining !== undefined && b.daysRemaining <= 1)) {
    return 1;
  }

  const diff = priorityWeight[b.priority] - priorityWeight[a.priority];
  if (diff !== 0) return diff;
  return a.text.localeCompare(b.text);
}

export function extractAllTasksFromContent(
  content: string,
  sourceFile: string,
  options?: { tasksSectionHeader?: string; iceboxSectionHeader?: string }
): TaskRecord[] {
  const tasks: TaskRecord[] = [];
  const lines = content.split(/\r?\n/);
  let currentSection = '';

  const iceboxHeaderClean = options?.iceboxSectionHeader
    ? options.iceboxSectionHeader.replace(/^#+\s*/, '').trim().toLowerCase()
    : 'icebox';

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const headerMatch = line.match(/^#{1,6}\s+(.*)$/);
    if (headerMatch) {
      currentSection = headerMatch[1].trim().toLowerCase();
    }

    const subtaskMatch = line.match(/^(\s{2,}|\t+)-\s+\[(.)\]\s+(.*)$/);
    if (subtaskMatch && tasks.length > 0) {
      const parent = tasks[tasks.length - 1];
      if (!parent.subtasks) parent.subtasks = [];
      const lineHash = computeLineHash(line);
      parent.subtasks.push({
        text: subtaskMatch[3].trim(),
        completed: subtaskMatch[2].toLowerCase() === 'x',
        originalLine: line,
        lineNumber: i + 1,
        lineHash,
        sourceFile,
      });
      continue;
    }

    const match = line.match(/^\s*-\s+\[(.)\]\s+(.*)$/);
    if (match) {
      // Habit tracker lines (- [ ] Habit <!-- streak: ... -->) are not todo tasks
      if (/<!--\s*streak:\s*\d+/i.test(line)) {
        continue;
      }
      const statusChar = match[1];
      const taskText = match[2].trim();
      const completed = statusChar.toLowerCase() === 'x';
      const { priority } = parseTaskPriority(taskText);
      const { estimated, completed: pomodoroCompleted } = parseTaskPomodoroEstimate(taskText);
      const { dueDate, dueTime } = parseTaskDeadline(taskText);
      const { scheduledDate } = parseTaskScheduledDate(taskText);
      const { startDate } = parseTaskStartDate(taskText);
      const { completedDate } = parseTaskCompletionDate(taskText);
      const { recurrence } = parseTaskRecurrence(taskText);
      const daysRemaining = dueDate ? calculateDaysRemaining(dueDate) : undefined;
      const inIcebox = isIceboxSection(currentSection, options?.iceboxSectionHeader);
      const isIdea =
        inIcebox ||
        /#(?:ideas?|icebox)\b/i.test(taskText) ||
        taskText.startsWith('💡') ||
        taskText.startsWith('🧊');
      const tags = extractTagsFromText(taskText);
      const lineHash = computeLineHash(line);
      tasks.push({
        id: `${sourceFile}#L${i + 1}:${taskText}`,
        originalLine: line,
        text: taskText,
        sourceFile,
        lineNumber: i + 1,
        lineHash,
        completed,
        statusChar,
        priority,
        isIdea,
        estimatedPomodoros: estimated,
        completedPomodoros: pomodoroCompleted,
        dueDate,
        dueTime,
        daysRemaining,
        scheduledDate,
        startDate,
        completedDate,
        recurrence,
        tags,
      });
      continue;
    }

    // Passive bullet under Icebox / Ideas section (- bullet)
    const bulletMatch = line.match(/^\s*-\s+(?!\[[ xX]\])(.*)$/);
    if (bulletMatch && isIceboxSection(currentSection, options?.iceboxSectionHeader)) {
      if (/<!--\s*streak:\s*\d+/i.test(line)) {
        continue;
      }
      const itemText = bulletMatch[1].trim();
      if (itemText) {
        const tags = extractTagsFromText(itemText);
        const lineHash = computeLineHash(line);
        tasks.push({
          id: `${sourceFile}#L${i + 1}:${itemText}`,
          originalLine: line,
          text: itemText,
          sourceFile,
          lineNumber: i + 1,
          lineHash,
          completed: false,
          statusChar: ' ',
          priority: 'none',
          isIdea: true,
          tags,
        });
      }
    }
  }

  return tasks.sort(compareTasksByPriority);
}

/**
 * Pure functions for manipulating task content inside markdown strings
 */
export type TaskMutationAction =
  | 'toggle'
  | 'update'
  | 'delete'
  | 'increment'
  | 'decrement'
  | 'subtask'
  | 'promote';

export interface TaskMutationOptions {
  action: TaskMutationAction;
  completed?: boolean;
  newText?: string;
  subtaskText?: string;
  subtaskAction?: 'add' | 'toggle';
  priority?: TaskPriority;
  tasksSectionHeader?: string;
  iceboxSectionHeader?: string;
}

export interface TaskMutationResult {
  updatedContent: string;
  success: boolean;
  error?: 'ambiguous' | 'not_found' | 'no_op' | 'invalid_action';
  errorMessage?: string;
  updatedText?: string;
}

export interface LocateResult {
  index: number;
  status: 'exact_position' | 'unique_match' | 'ambiguous' | 'not_found';
  matchingIndices: number[];
}

/**
 * Robust locator for task lines within file content:
 * 1. Checks if the line at locator.lineNumber matches locator.lineHash / originalLine.
 * 2. If it does not match, scans content for unique exact matches.
 * 3. If multiple exact matches are found, returns ambiguous.
 * 4. If no matches, returns not_found.
 */
export function locateTaskLineIndex(lines: string[], locator: TaskLocator): LocateResult {
  // 1. Verify exact position if lineNumber is provided (1-indexed)
  if (
    typeof locator.lineNumber === 'number' &&
    locator.lineNumber >= 1 &&
    locator.lineNumber <= lines.length
  ) {
    const candidateIdx = locator.lineNumber - 1;
    const candidateLine = lines[candidateIdx];

    let matchesPosition = false;
    if (locator.lineHash) {
      matchesPosition = computeLineHash(candidateLine) === locator.lineHash;
    } else if (locator.originalLine !== undefined) {
      matchesPosition = candidateLine === locator.originalLine;
    } else if (locator.text) {
      const match = candidateLine.match(/^(\s*-\s+(?:\[.\]\s+)?)(.*)$/);
      if (match) {
        const lineTitle = match[2].trim();
        const cleanLineTitle = lineTitle.replace(/^[💡🧊]\s*/u, '').trim();
        const cleanLocatorText = locator.text.trim().replace(/^[💡🧊]\s*/u, '').trim();
        matchesPosition =
          lineTitle === locator.text.trim() ||
          cleanLineTitle === cleanLocatorText ||
          getCleanTaskDisplayTitle(cleanLineTitle) === getCleanTaskDisplayTitle(cleanLocatorText);
      }
    }

    if (matchesPosition) {
      return { index: candidateIdx, status: 'exact_position', matchingIndices: [candidateIdx] };
    }
  }

  // 2. Exact position did not match. Search entire file for exact match.
  const matchingIndices: number[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    let isMatch = false;

    if (locator.lineHash) {
      if (computeLineHash(line) === locator.lineHash) {
        if (locator.originalLine !== undefined) {
          isMatch = (line === locator.originalLine);
        } else {
          isMatch = true;
        }
      }
    } else if (locator.originalLine !== undefined) {
      isMatch = (line === locator.originalLine);
    } else if (locator.text) {
      const match = line.match(/^(\s*-\s+(?:\[.\]\s+)?)(.*)$/);
      if (match) {
        const lineTitle = match[2].trim();
        const cleanLineTitle = lineTitle.replace(/^[💡🧊]\s*/u, '').trim();
        const cleanLocatorText = locator.text.trim().replace(/^[💡🧊]\s*/u, '').trim();
        isMatch =
          lineTitle === locator.text.trim() ||
          cleanLineTitle === cleanLocatorText ||
          getCleanTaskDisplayTitle(cleanLineTitle) === getCleanTaskDisplayTitle(cleanLocatorText);
      }
    }

    if (isMatch) {
      matchingIndices.push(i);
    }
  }

  if (matchingIndices.length === 1) {
    return { index: matchingIndices[0], status: 'unique_match', matchingIndices };
  }
  if (matchingIndices.length > 1) {
    return { index: -1, status: 'ambiguous', matchingIndices };
  }
  return { index: -1, status: 'not_found', matchingIndices: [] };
}

/**
 * Unified pure function to mutate a task line inside markdown content.
 */
export function mutateTaskLineInContent(
  content: string,
  locator: TaskLocator,
  options: TaskMutationOptions
): TaskMutationResult {
  const lines = content.split(/\r?\n/);
  const locateRes = locateTaskLineIndex(lines, locator);

  if (locateRes.status === 'ambiguous') {
    return {
      updatedContent: content,
      success: false,
      error: 'ambiguous',
      errorMessage: `Ambigüedad: se encontraron ${locateRes.matchingIndices.length} tareas idénticas y la línea cambió.`,
    };
  }

  if (locateRes.status === 'not_found' || locateRes.index === -1) {
    return {
      updatedContent: content,
      success: false,
      error: 'not_found',
      errorMessage: 'No se encontró la tarea especificada en el archivo.',
    };
  }

  const targetIndex = locateRes.index;
  const targetLine = lines[targetIndex];

  switch (options.action) {
    case 'toggle': {
      const match = targetLine.match(/^(\s*-\s+\[)(.)(\]\s+)(.*)$/);
      if (match) {
        const indentAndDash = match[1];
        const currentStatus = match[2];
        const bracketAndSpace = match[3];
        const lineBody = match[4];

        const isCurrentlyCompleted = currentStatus.toLowerCase() === 'x';
        const willBeCompleted = options.completed !== undefined
          ? options.completed
          : !isCurrentlyCompleted;

        const newChar = willBeCompleted ? 'x' : ' ';
        let newLineBody = lineBody;
        const todayStr = getLocalDateString(new Date());

        if (willBeCompleted) {
          const { completedDate } = parseTaskCompletionDate(newLineBody);
          if (!completedDate) {
            newLineBody = formatTaskWithCompletionDate(newLineBody, todayStr);
          }
        } else {
          const { cleanTitle } = parseTaskCompletionDate(newLineBody);
          newLineBody = cleanTitle;
        }

        lines[targetIndex] = `${indentAndDash}${newChar}${bracketAndSpace}${newLineBody}`;

        // If completing a recurring task, clone next occurrence uncompleted
        if (willBeCompleted) {
          const { recurrence } = parseTaskRecurrence(lineBody);
          if (recurrence) {
            let nextLineBody = parseTaskCompletionDate(lineBody).cleanTitle;
            const { dueDate, dueTime } = parseTaskDeadline(nextLineBody);
            const { scheduledDate } = parseTaskScheduledDate(nextLineBody);
            const { startDate } = parseTaskStartDate(nextLineBody);

            if (dueDate) {
              const nextDue = calculateNextRecurrenceDate(dueDate, recurrence);
              nextLineBody = formatTaskWithDeadline(nextLineBody, nextDue, dueTime);
            }
            if (scheduledDate) {
              const nextSched = calculateNextRecurrenceDate(scheduledDate, recurrence);
              nextLineBody = formatTaskWithScheduledDate(nextLineBody, nextSched);
            }
            if (startDate) {
              const nextStart = calculateNextRecurrenceDate(startDate, recurrence);
              nextLineBody = formatTaskWithStartDate(nextLineBody, nextStart);
            }
            if (!dueDate && !scheduledDate && !startDate) {
              const nextDue = calculateNextRecurrenceDate(todayStr, recurrence);
              nextLineBody = formatTaskWithDeadline(nextLineBody, nextDue);
            }

            const nextTaskLine = `${indentAndDash} ${bracketAndSpace}${nextLineBody}`;
            lines.splice(targetIndex + 1, 0, nextTaskLine);
          }
        }

        return { updatedContent: lines.join('\n'), success: true };
      }
      const bulletMatch = targetLine.match(/^(\s*-\s+)(.*)$/);
      if (bulletMatch) {
        const willBeCompleted = options.completed !== undefined ? options.completed : true;
        const newChar = willBeCompleted ? 'x' : ' ';
        let itemBody = bulletMatch[2];
        if (willBeCompleted) {
          const todayStr = getLocalDateString(new Date());
          const { completedDate } = parseTaskCompletionDate(itemBody);
          if (!completedDate) {
            itemBody = formatTaskWithCompletionDate(itemBody, todayStr);
          }
        }
        lines[targetIndex] = `${bulletMatch[1]}[${newChar}] ${itemBody}`;
        return { updatedContent: lines.join('\n'), success: true };
      }
      return { updatedContent: content, success: false, error: 'no_op', errorMessage: 'La línea no es un elemento de lista.' };
    }

    case 'update': {
      const newText = (options.newText !== undefined ? options.newText : '').trim();
      const match = targetLine.match(/^(\s*-\s+(?:\[.\]\s+)?)(.*)$/);
      if (match) {
        lines[targetIndex] = `${match[1]}${newText}`;
        return { updatedContent: lines.join('\n'), success: true, updatedText: newText };
      }
      return { updatedContent: content, success: false, error: 'no_op', errorMessage: 'No se pudo actualizar el texto de la línea.' };
    }

    case 'delete': {
      let count = 1;
      while (targetIndex + count < lines.length && /^(\s{2,}|\t+)-\s+\[.\]/.test(lines[targetIndex + count])) {
        count++;
      }
      lines.splice(targetIndex, count);
      return { updatedContent: lines.join('\n'), success: true };
    }

    case 'increment': {
      const match = targetLine.match(/^(\s*-\s+\[.\]\s+)(.*)$/);
      if (!match) return { updatedContent: content, success: false, error: 'no_op' };
      const prefix = match[1];
      const oldText = match[2].trim();
      const { estimated, completed } = parseTaskPomodoroEstimate(oldText);
      const newCompleted = (completed || 0) + 1;
      const newText = formatTaskWithPomodoroEstimate(oldText, estimated, newCompleted);
      lines[targetIndex] = `${prefix}${newText}`;
      return { updatedContent: lines.join('\n'), success: true, updatedText: newText };
    }

    case 'decrement': {
      const match = targetLine.match(/^(\s*-\s+\[.\]\s+)(.*)$/);
      if (!match) return { updatedContent: content, success: false, error: 'no_op' };
      const prefix = match[1];
      const oldText = match[2].trim();
      const { estimated, completed } = parseTaskPomodoroEstimate(oldText);
      if (!completed || completed <= 0) {
        return { updatedContent: content, success: false, error: 'no_op', errorMessage: 'No hay pomodoros para decrementar.' };
      }
      const newCompleted = Math.max(0, completed - 1);
      const newText = formatTaskWithPomodoroEstimate(oldText, estimated, newCompleted);
      lines[targetIndex] = `${prefix}${newText}`;
      return { updatedContent: lines.join('\n'), success: true, updatedText: newText };
    }

    case 'subtask': {
      if (options.subtaskAction === 'toggle') {
        if (options.subtaskText) {
          let subIdx = targetIndex + 1;
          let foundSub = -1;
          while (subIdx < lines.length && /^(\s{2,}|\t+)-\s+\[.\]/.test(lines[subIdx])) {
            const subMatch = lines[subIdx].match(/^(\s+-\s+\[)(.)(\]\s+)(.*)$/);
            if (subMatch && subMatch[4].trim() === options.subtaskText.trim()) {
              foundSub = subIdx;
              break;
            }
            subIdx++;
          }
          if (foundSub !== -1) {
            const m = lines[foundSub].match(/^(\s+-\s+\[)(.)(\]\s+)(.*)$/)!;
            const targetChar = options.completed !== undefined
              ? (options.completed ? 'x' : ' ')
              : (m[2].toLowerCase() === 'x' ? ' ' : 'x');
            lines[foundSub] = `${m[1]}${targetChar}${m[3]}${m[4]}`;
            return { updatedContent: lines.join('\n'), success: true };
          }
          return { updatedContent: content, success: false, error: 'not_found', errorMessage: 'Subtarea no encontrada.' };
        } else {
          // Target line itself is subtask
          const m = targetLine.match(/^(\s+-\s+\[)(.)(\]\s+)(.*)$/);
          if (m) {
            const targetChar = options.completed !== undefined
              ? (options.completed ? 'x' : ' ')
              : (m[2].toLowerCase() === 'x' ? ' ' : 'x');
            lines[targetIndex] = `${m[1]}${targetChar}${m[3]}${m[4]}`;
            return { updatedContent: lines.join('\n'), success: true };
          }
        }
      }

      // Default subtask action is add
      const subText = (options.subtaskText || '').trim();
      if (!subText) {
        return { updatedContent: content, success: false, error: 'no_op', errorMessage: 'Subtarea vacía.' };
      }
      let insertAt = targetIndex + 1;
      while (insertAt < lines.length && /^(\s{2,}|\t+)-\s+\[.\]/.test(lines[insertAt])) {
        insertAt++;
      }
      lines.splice(insertAt, 0, `  - [ ] ${subText}`);
      return { updatedContent: lines.join('\n'), success: true };
    }

    case 'promote': {
      const match = targetLine.match(/^(\s*-\s+(?:\[.\]\s+)?)(.*)$/);
      const itemText = match ? match[2].trim() : (locator.text || targetLine);
      lines.splice(targetIndex, 1);
      const withoutIdea = lines.join('\n');

      let cleanTitle = itemText.replace(/#(?:ideas?|icebox)\b/gi, '').replace(/^[💡🧊]\s*/u, '').trim();
      cleanTitle = formatTaskWithPriority(cleanTitle, options.priority !== 'none' && options.priority ? options.priority : 'none');
      const targetSection = options.tasksSectionHeader || '## Tareas';
      const updatedContent = appendTaskToMarkdownSection(withoutIdea, cleanTitle, targetSection);
      return { updatedContent, success: true, updatedText: cleanTitle };
    }

    default:
      return { updatedContent: content, success: false, error: 'invalid_action' };
  }
}

export function incrementTaskPomodoroInContent(
  content: string,
  taskLocatorOrText: TaskLocator | string
): { updatedContent: string; updatedText: string } | null {
  const locator: TaskLocator = typeof taskLocatorOrText === 'string'
    ? { sourceFile: '', text: taskLocatorOrText }
    : taskLocatorOrText;
  const res = mutateTaskLineInContent(content, locator, { action: 'increment' });
  if (res.success && res.updatedText) {
    return { updatedContent: res.updatedContent, updatedText: res.updatedText };
  }
  return null;
}

export function decrementTaskPomodoroInContent(
  content: string,
  taskLocatorOrText: TaskLocator | string
): { updatedContent: string; updatedText: string } | null {
  const locator: TaskLocator = typeof taskLocatorOrText === 'string'
    ? { sourceFile: '', text: taskLocatorOrText }
    : taskLocatorOrText;
  const res = mutateTaskLineInContent(content, locator, { action: 'decrement' });
  if (res.success && res.updatedText) {
    return { updatedContent: res.updatedContent, updatedText: res.updatedText };
  }
  return null;
}

export function promoteIdeaToTaskInContent(
  content: string,
  taskLocatorOrText: TaskLocator | string,
  priority: TaskPriority = 'none'
): { updatedContent: string; promoted: boolean } {
  const locator: TaskLocator = typeof taskLocatorOrText === 'string'
    ? { sourceFile: '', text: taskLocatorOrText }
    : taskLocatorOrText;
  const res = mutateTaskLineInContent(content, locator, { action: 'promote', priority });
  return { updatedContent: res.updatedContent, promoted: res.success };
}

export function toggleTaskCompletionInContent(
  content: string,
  taskLocatorOrText: TaskLocator | string,
  newCompleted?: boolean
): { updatedContent: string; found: boolean } {
  const locator: TaskLocator = typeof taskLocatorOrText === 'string'
    ? { sourceFile: '', text: taskLocatorOrText }
    : taskLocatorOrText;
  const res = mutateTaskLineInContent(content, locator, { action: 'toggle', completed: newCompleted });
  return { updatedContent: res.updatedContent, found: res.success };
}

export function updateTaskTextInContent(
  content: string,
  taskLocatorOrText: TaskLocator | string,
  newText: string
): { updatedContent: string; found: boolean } {
  const locator: TaskLocator = typeof taskLocatorOrText === 'string'
    ? { sourceFile: '', text: taskLocatorOrText }
    : taskLocatorOrText;
  const res = mutateTaskLineInContent(content, locator, { action: 'update', newText });
  return { updatedContent: res.updatedContent, found: res.success };
}

export function toggleSubtaskInContent(
  content: string,
  subtaskLocatorOrText: TaskLocator | string,
  newCompleted?: boolean
): { updatedContent: string; found: boolean } {
  const locator: TaskLocator = typeof subtaskLocatorOrText === 'string'
    ? { sourceFile: '', text: subtaskLocatorOrText }
    : subtaskLocatorOrText;
  const res = mutateTaskLineInContent(content, locator, {
    action: 'subtask',
    subtaskAction: 'toggle',
    completed: newCompleted,
  });
  return { updatedContent: res.updatedContent, found: res.success };
}

export function addSubtaskToContent(
  content: string,
  taskLocatorOrText: TaskLocator | string,
  subtaskText: string
): { updatedContent: string; added: boolean } {
  const locator: TaskLocator = typeof taskLocatorOrText === 'string'
    ? { sourceFile: '', text: taskLocatorOrText }
    : taskLocatorOrText;
  const res = mutateTaskLineInContent(content, locator, {
    action: 'subtask',
    subtaskAction: 'add',
    subtaskText,
  });
  return { updatedContent: res.updatedContent, added: res.success };
}

export function deleteTaskFromContent(
  content: string,
  taskLocatorOrText: TaskLocator | string
): { updatedContent: string; deleted: boolean } {
  const locator: TaskLocator = typeof taskLocatorOrText === 'string'
    ? { sourceFile: '', text: taskLocatorOrText }
    : taskLocatorOrText;
  const res = mutateTaskLineInContent(content, locator, { action: 'delete' });
  return { updatedContent: res.updatedContent, deleted: res.success };
}

/**
 * Creates a stable slug ID from a habit name.
 * e.g. "📚 Lectura 20 min" -> "lectura-20-min"
 */
export function createHabitId(name: string): string {
  const slug = name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // remove diacritics
    .replace(/[^\w\s-]/g, '') // remove emojis and special characters
    .trim()
    .replace(/[\s_-]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return slug || 'habit';
}

export type HabitFrequencyType = 'daily' | 'weekly' | 'specific_days';

export interface HabitFrequency {
  type: HabitFrequencyType;
  weeklyTarget?: number; // for 'weekly' (e.g. 3 times per week)
  daysOfWeek?: number[]; // for 'specific_days' (0 = Sun, 1 = Mon, ..., 6 = Sat)
}

export interface HabitItemData {
  id?: string;
  name: string;
  completedToday?: boolean;
  streak?: number;
  lastCompletedDate?: string;
  history?: string[];
  frequency?: HabitFrequency;
  restDays?: string[];
  isRestDayToday?: boolean;
}

export interface HabitWeeklyProgress {
  completedCount: number;
  target: number;
  percentage: number;
  isMet: boolean;
  restDaysCount: number;
}

/**
 * Returns Monday-Sunday ISO week range and all 7 date strings (YYYY-MM-DD).
 */
export function getIsoWeekRange(referenceDate: Date = new Date()): { start: Date; end: Date; dates: string[] } {
  const d = new Date(referenceDate.getFullYear(), referenceDate.getMonth(), referenceDate.getDate());
  const day = d.getDay(); // 0 = Sun, 1 = Mon, ..., 6 = Sat
  const diffToMonday = day === 0 ? 6 : day - 1;

  const monday = new Date(d);
  monday.setDate(d.getDate() - diffToMonday);

  const dates: string[] = [];
  for (let i = 0; i < 7; i++) {
    const cur = new Date(monday);
    cur.setDate(monday.getDate() + i);
    dates.push(getLocalDateString(cur));
  }

  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);

  return { start: monday, end: sunday, dates };
}

/**
 * Parses a single habit line from markdown.
 * Supports legacy format and extended frequency & rest day comments.
 */
export function parseHabitLine(line: string, today: string = getLocalDateString()): HabitItemData | null {
  const match = line.match(/^\s*-\s+\[(.)\]\s+(.*?)(?:\s*<!--\s*(.*?)\s*-->)?$/);
  if (!match) return null;

  const statusChar = match[1];
  const name = match[2].trim();
  const metaComment = match[3] || '';

  let streak = 0;
  let lastCompletedDate = '';
  let history: string[] = [];
  let frequency: HabitFrequency = { type: 'daily' };
  let restDays: string[] = [];

  if (metaComment) {
    const parts = metaComment.split('|').map((p) => p.trim());
    for (const part of parts) {
      const colonIdx = part.indexOf(':');
      if (colonIdx === -1) continue;
      const key = part.slice(0, colonIdx).trim().toLowerCase();
      const val = part.slice(colonIdx + 1).trim();

      if (key === 'streak') {
        streak = parseInt(val, 10) || 0;
      } else if (key === 'last') {
        lastCompletedDate = val;
      } else if (key === 'history') {
        history = val ? val.split(',').map((s) => s.trim()).filter(Boolean) : [];
      } else if (key === 'freq') {
        if (val === 'weekly' || val === 'specific_days' || val === 'daily') {
          frequency.type = val;
        }
      } else if (key === 'target') {
        frequency.weeklyTarget = parseInt(val, 10) || undefined;
      } else if (key === 'days') {
        frequency.daysOfWeek = val
          .split(',')
          .map((s) => parseInt(s.trim(), 10))
          .filter((n) => !isNaN(n));
      } else if (key === 'rest') {
        restDays = val ? val.split(',').map((s) => s.trim()).filter(Boolean) : [];
      }
    }
  }

  if (history.length === 0 && lastCompletedDate) {
    history = [lastCompletedDate];
  }

  const completedToday = statusChar.toLowerCase() === 'x' && lastCompletedDate === today;
  const isRestDayToday = restDays.includes(today);

  return {
    id: createHabitId(name),
    name,
    completedToday,
    streak,
    lastCompletedDate,
    history,
    frequency,
    restDays,
    isRestDayToday,
  };
}

/**
 * Formats a single habit item into a markdown checkbox line with HTML comment metadata.
 */
export function formatHabitLine(h: HabitItemData): string {
  const check = h.completedToday ? 'x' : ' ';
  const histStr = (h.history || []).slice(-60).join(',');
  const parts: string[] = [
    `streak: ${h.streak || 0}`,
    `last: ${h.lastCompletedDate || ''}`,
  ];

  if (h.frequency && h.frequency.type && h.frequency.type !== 'daily') {
    parts.push(`freq: ${h.frequency.type}`);
    if (h.frequency.type === 'weekly' && h.frequency.weeklyTarget) {
      parts.push(`target: ${h.frequency.weeklyTarget}`);
    } else if (h.frequency.type === 'specific_days' && h.frequency.daysOfWeek && h.frequency.daysOfWeek.length > 0) {
      parts.push(`days: ${h.frequency.daysOfWeek.join(',')}`);
    }
  }

  if (h.restDays && h.restDays.length > 0) {
    parts.push(`rest: ${h.restDays.slice(-60).join(',')}`);
  }

  parts.push(`history: ${histStr}`);

  return `- [${check}] ${h.name} <!-- ${parts.join(' | ')} -->`;
}

/**
 * Recalculates streak based on habit frequency (daily, weekly, specific days)
 * and excused rest days without breaking the streak.
 */
export function calculateHabitStreak(
  habit: {
    history?: string[];
    frequency?: HabitFrequency;
    restDays?: string[];
  },
  referenceDate: Date = new Date()
): number {
  const historySet = new Set(habit.history || []);
  const restSet = new Set(habit.restDays || []);
  const freq = habit.frequency || { type: 'daily' };

  if (freq.type === 'weekly') {
    const target = Math.max(1, Math.min(7, freq.weeklyTarget || 3));
    let streak = 0;
    const curDate = new Date(referenceDate.getFullYear(), referenceDate.getMonth(), referenceDate.getDate());

    // Check current week
    const currentWeek = getIsoWeekRange(curDate);
    const curCompleted = currentWeek.dates.filter((d) => historySet.has(d)).length;
    const curRest = currentWeek.dates.filter((d) => restSet.has(d)).length;

    let weekOffset = 0;
    if (curCompleted + curRest >= target) {
      streak += 1;
      weekOffset = 1;
    } else {
      weekOffset = 1;
    }

    for (let w = weekOffset; w < 104; w++) {
      const pastDate = new Date(curDate);
      pastDate.setDate(curDate.getDate() - w * 7);
      const weekRange = getIsoWeekRange(pastDate);
      const completed = weekRange.dates.filter((d) => historySet.has(d)).length;
      const rest = weekRange.dates.filter((d) => restSet.has(d)).length;
      if (completed + rest >= target) {
        streak += 1;
      } else {
        break;
      }
    }

    return streak;
  }

  if (freq.type === 'specific_days') {
    const targetDays = freq.daysOfWeek && freq.daysOfWeek.length > 0
      ? freq.daysOfWeek
      : [1, 2, 3, 4, 5];
    const targetDaysSet = new Set(targetDays);

    let streak = 0;
    const todayStr = getLocalDateString(referenceDate);
    const todayDayOfWeek = referenceDate.getDay();
    const isTodayTarget = targetDaysSet.has(todayDayOfWeek);

    let startDayOffset = 0;
    if (isTodayTarget) {
      if (historySet.has(todayStr)) {
        streak += 1;
        startDayOffset = 1;
      } else if (restSet.has(todayStr)) {
        startDayOffset = 1;
      } else {
        startDayOffset = 1;
      }
    } else {
      startDayOffset = 1;
    }

    for (let i = startDayOffset; i < 365; i++) {
      const d = new Date(referenceDate.getFullYear(), referenceDate.getMonth(), referenceDate.getDate() - i);
      const dayOfWeek = d.getDay();
      if (!targetDaysSet.has(dayOfWeek)) {
        continue;
      }

      const dateStr = getLocalDateString(d);
      if (historySet.has(dateStr)) {
        streak += 1;
      } else if (restSet.has(dateStr)) {
        continue;
      } else {
        break;
      }
    }

    return streak;
  }

  // Daily frequency
  let streak = 0;
  const todayStr = getLocalDateString(referenceDate);

  let startOffset = 0;
  if (historySet.has(todayStr)) {
    streak += 1;
    startOffset = 1;
  } else if (restSet.has(todayStr)) {
    startOffset = 1;
  } else {
    startOffset = 1;
  }

  for (let i = startOffset; i < 365; i++) {
    const d = new Date(referenceDate.getFullYear(), referenceDate.getMonth(), referenceDate.getDate() - i);
    const dateStr = getLocalDateString(d);
    if (historySet.has(dateStr)) {
      streak += 1;
    } else if (restSet.has(dateStr)) {
      continue;
    } else {
      break;
    }
  }

  return streak;
}

/**
 * Computes weekly progress for a habit (completed count, target, percentage, rest days).
 */
export function computeHabitWeeklyProgress(
  habit: {
    history?: string[];
    frequency?: HabitFrequency;
    restDays?: string[];
  },
  referenceDate: Date = new Date()
): HabitWeeklyProgress {
  const { dates } = getIsoWeekRange(referenceDate);
  const historySet = new Set(habit.history || []);
  const restSet = new Set(habit.restDays || []);

  const completedCount = dates.filter((d) => historySet.has(d)).length;
  const restDaysCount = dates.filter((d) => restSet.has(d)).length;

  let target = 7;
  const freq = habit.frequency || { type: 'daily' };

  if (freq.type === 'weekly') {
    target = Math.max(1, Math.min(7, freq.weeklyTarget || 3));
  } else if (freq.type === 'specific_days') {
    const days = freq.daysOfWeek && freq.daysOfWeek.length > 0 ? freq.daysOfWeek : [1, 2, 3, 4, 5];
    target = Math.max(1, days.length);
  } else {
    target = 7;
  }

  const effective = completedCount + restDaysCount;
  const percentage = Math.min(100, Math.round((completedCount / target) * 100));
  const isMet = effective >= target;

  return {
    completedCount,
    target,
    percentage,
    isMet,
    restDaysCount,
  };
}

/**
 * Modifies ONLY habit lines in markdown content and preserves all other content
 * (headers, quotes, callouts, notes, comments, extra sections).
 */
export function syncHabitsToMarkdown(
  content: string,
  habits: Array<{
    id?: string;
    name: string;
    completedToday?: boolean;
    streak?: number;
    lastCompletedDate?: string;
    history?: string[];
  }>
): string {
  if (!content || content.trim().length === 0) {
    return formatHabitsToMarkdown(habits);
  }

  const lines = content.split(/\r?\n/);
  const habitLineRegex = /^\s*-\s+\[(.)\]\s+(.*?)(?:\s*<!--\s*streak:\s*(\d+)\s*\|\s*last:\s*([^>|]*?)(?:\s*\|\s*history:\s*([^>]*?))?\s*-->)?$/;

  const habitMapById = new Map<string, (typeof habits)[0]>();
  const habitMapByName = new Map<string, (typeof habits)[0]>();
  for (const h of habits) {
    const id = h.id || createHabitId(h.name);
    habitMapById.set(id, h);
    habitMapByName.set(h.name.trim().toLowerCase(), h);
  }

  const placedHabitIds = new Set<string>();
  const updatedLines: string[] = [];
  let lastHabitLineIndex = -1;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const match = line.match(habitLineRegex);

    if (match) {
      const lineHabitName = match[2].trim();
      const lineHabitId = createHabitId(lineHabitName);

      const targetHabit = habitMapById.get(lineHabitId) || habitMapByName.get(lineHabitName.toLowerCase());

      if (targetHabit) {
        const updatedLine = formatHabitLine(targetHabit);
        updatedLines.push(updatedLine);
        placedHabitIds.add(targetHabit.id || lineHabitId);
        lastHabitLineIndex = updatedLines.length - 1;
      } else {
        // Deleted habit: omitted from output, preserving surrounding text
      }
    } else {
      // Non-habit line: preserved exactly as-is
      updatedLines.push(line);
    }
  }

  // Newly added habits that weren't in the original content
  const remainingHabits = habits.filter((h) => {
    const id = h.id || createHabitId(h.name);
    return !placedHabitIds.has(id);
  });

  if (remainingHabits.length > 0) {
    const newLines = remainingHabits.map(formatHabitLine);

    if (lastHabitLineIndex !== -1) {
      // Insert after the last existing habit line
      updatedLines.splice(lastHabitLineIndex + 1, 0, ...newLines);
    } else {
      // No prior habit lines found; find header matching habits
      const headerIdx = updatedLines.findIndex((l) => /^#+\s+.*h[aá]bito/i.test(l));
      if (headerIdx !== -1) {
        updatedLines.splice(headerIdx + 1, 0, '', ...newLines);
      } else {
        if (updatedLines.length > 0 && updatedLines[updatedLines.length - 1].trim() !== '') {
          updatedLines.push('');
        }
        updatedLines.push(...newLines);
      }
    }
  }

  return updatedLines.join('\n');
}

export function formatHabitsToMarkdown(
  habits: Array<{
    name: string;
    completedToday?: boolean;
    streak?: number;
    lastCompletedDate?: string;
    history?: string[];
  }>
): string {
  const lines: string[] = ['# Registro de Hábitos', ''];
  for (const h of habits) {
    const check = h.completedToday ? 'x' : ' ';
    const histStr = (h.history || []).slice(-60).join(',');
    lines.push(
      `- [${check}] ${h.name} <!-- streak: ${h.streak || 0} | last: ${h.lastCompletedDate || ''} | history: ${histStr} -->`
    );
  }
  lines.push('');
  return lines.join('\n');
}

import { formatTimeBlockLine } from './calendar-utils.ts';

export function syncBlocksToMarkdown(
  content: string,
  blocks: Array<{
    startTime: string;
    endTime: string;
    title: string;
    completed?: boolean;
    linkedNote?: string;
  }>
): string {
  const lines = content.split(/\r?\n/);
  const blockLines = blocks.map((b) => formatTimeBlockLine(b));

  const header = '## Bloques de Tiempo';
  const headerIndex = lines.findIndex((l) => l.trim().toLowerCase() === header.toLowerCase());

  if (headerIndex === -1) {
    return `${content.trimEnd()}\n\n${header}\n${blockLines.join('\n')}\n`;
  }

  let endIdx = lines.length;
  for (let i = headerIndex + 1; i < lines.length; i++) {
    if (/^#{1,6}\s+/.test(lines[i])) {
      endIdx = i;
      break;
    }
  }
  lines.splice(headerIndex + 1, endIdx - (headerIndex + 1), ...blockLines);
  return lines.join('\n');
}

export function mergeTemplateIntoContent(existingContent: string, template: string): string {
  if (existingContent.trim().length === 0) {
    return template;
  }
  return `${existingContent.trimEnd()}\n\n${template}`;
}

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
 * Appends a closing note associated with a completed pomodoro task to the daily note content.
 * If the daily note has a pomodoro log entry for this task, indents the note right below it.
 * Otherwise, appends as a bullet at the end of the note.
 */
export function appendClosingNoteToDailyContent(
  content: string,
  taskText: string,
  closingNote: string
): string {
  const noteTrimmed = closingNote.trim();
  if (!noteTrimmed) return content;

  const lines = content.split('\n');
  const cleanTask = taskText.trim();
  const noteBullet = `  - 📝 Nota: ${noteTrimmed}`;

  // Find the last pomodoro log line that references this task
  let lastMatchingIndex = -1;
  for (let i = lines.length - 1; i >= 0; i--) {
    const line = lines[i];
    if (line.includes('Pomodoro completado') && (cleanTask.length === 0 || line.includes(cleanTask))) {
      lastMatchingIndex = i;
      break;
    }
  }

  if (lastMatchingIndex !== -1) {
    // Insert immediately after the matching pomodoro entry
    lines.splice(lastMatchingIndex + 1, 0, noteBullet);
    return lines.join('\n');
  }

  // If no matching pomodoro log line found, append at end of file
  const fallbackBullet = cleanTask
    ? `- 📝 Nota Pomodoro (*${cleanTask}*): ${noteTrimmed}`
    : `- 📝 Nota Pomodoro: ${noteTrimmed}`;

  const trimmedEnd = content.trimEnd();
  return trimmedEnd.length === 0 ? `${fallbackBullet}\n` : `${trimmedEnd}\n${fallbackBullet}\n`;
}

export interface DeadlineItem {
  id: string;
  originalLine: string;
  text: string;
  cleanTitle: string;
  sourceFile: string;
  lineNumber?: number;
  lineHash?: string;
  dueDate: string;
  dueTime?: string;
  daysRemaining: number;
  completed: boolean;
  priority?: TaskPriority;
}

/**
 * Pure function to extract and sort all deadline items from in-memory tasks.
 */
export function computeDeadlinesFromTasks(tasks: TaskRecord[]): DeadlineItem[] {
  const deadlines: DeadlineItem[] = [];
  for (const t of tasks) {
    if (t.dueDate) {
      const daysRemaining = t.daysRemaining !== undefined ? t.daysRemaining : calculateDaysRemaining(t.dueDate);
      const { cleanTitle } = parseTaskDeadline(t.text);
      deadlines.push({
        id: t.id,
        originalLine: t.originalLine,
        text: t.text,
        cleanTitle: getCleanTaskDisplayTitle(cleanTitle),
        sourceFile: t.sourceFile,
        lineNumber: t.lineNumber,
        lineHash: t.lineHash,
        dueDate: t.dueDate,
        dueTime: t.dueTime,
        daysRemaining,
        completed: t.completed,
        priority: t.priority,
      });
    }
  }

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


