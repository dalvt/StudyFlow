import { t } from './i18n/index.ts';
import {
  isPomodoroLogLine,
} from './conventions.ts';

/**
 * Extracts hashtags (#materia) and wikilinks ([[Nota]]) from text.
 */
export function extractTagsFromText(text: string): string[] {
  if (!text) return [];
  const tags: string[] = [];

  const hashMatches = text.match(/#[\w\u00C0-\u017F-]+/g);
  if (hashMatches) {
    hashMatches.forEach((t) => {
      const clean = t.toLowerCase();
      if (!tags.includes(clean)) tags.push(clean);
    });
  }

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
export const computeTaskLineHash = computeLineHash;

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

export function calculateDaysRemaining(dateStr: string, referenceDate: Date = new Date()): number {
  const parts = dateStr.split('-').map(Number);
  if (parts.length !== 3 || parts.some(isNaN)) return 0;
  const target = new Date(parts[0], parts[1] - 1, parts[2], 0, 0, 0, 0);
  const ref = new Date(referenceDate.getFullYear(), referenceDate.getMonth(), referenceDate.getDate(), 0, 0, 0, 0);
  const diffTime = target.getTime() - ref.getTime();
  return Math.round(diffTime / (1000 * 60 * 60 * 24));
}

export function formatDeadlineHuman(daysRemaining: number, dateStr: string): string {
  if (daysRemaining < -1) return t('deadline.overdueDays', { days: Math.abs(daysRemaining), date: dateStr });
  if (daysRemaining === -1) return t('deadline.overdueYesterday', { date: dateStr });
  if (daysRemaining === 0) return t('deadline.dueToday');
  if (daysRemaining === 1) return t('deadline.dueTomorrow');
  if (daysRemaining <= 7) return t('deadline.dueInDays', { days: daysRemaining, date: dateStr });
  return dateStr;
}

export function parseTaskDeadline(text: string): TaskDeadline {
  const match = text.match(/(?:📅|:calendar:|#deadline\/|due:)\s*(\d{4}-\d{2}-\d{2})(?:\s+(\d{1,2}:\d{2}))?/i);
  if (!match) {
    return { cleanTitle: text };
  }
  const cleanTitle = text.replace(match[0], '').replace(/\s{2,}/g, ' ').trim();
  return {
    dueDate: match[1],
    dueTime: match[2] || undefined,
    cleanTitle: cleanTitle || text,
  };
}

export function formatTaskWithDeadline(text: string, date: string, time?: string): string {
  const { cleanTitle } = parseTaskDeadline(text);
  const deadlineStr = time ? `📅 ${date} ${time}` : `📅 ${date}`;
  return `${cleanTitle} ${deadlineStr}`.trim();
}

export function parseTaskScheduledDate(text: string): TaskScheduledDate {
  const match = text.match(/(?:⏳|#scheduled\/)\s*(\d{4}-\d{2}-\d{2})/i);
  if (!match) {
    return { cleanTitle: text };
  }
  const scheduledDate = match[1];
  const cleanTitle = text.replace(match[0], '').replace(/\s{2,}/g, ' ').trim();
  return { scheduledDate, cleanTitle: cleanTitle || text };
}

export function formatTaskWithScheduledDate(text: string, date: string): string {
  const { cleanTitle } = parseTaskScheduledDate(text);
  return `${cleanTitle} ⏳ ${date}`.trim();
}

export function parseTaskStartDate(text: string): TaskStartDate {
  const match = text.match(/(?:🛫|#start\/)\s*(\d{4}-\d{2}-\d{2})/i);
  if (!match) {
    return { cleanTitle: text };
  }
  const startDate = match[1];
  const cleanTitle = text.replace(match[0], '').replace(/\s{2,}/g, ' ').trim();
  return { startDate, cleanTitle: cleanTitle || text };
}

export function formatTaskWithStartDate(text: string, date: string): string {
  const { cleanTitle } = parseTaskStartDate(text);
  return `${cleanTitle} 🛫 ${date}`.trim();
}

export function parseTaskCompletionDate(text: string): TaskCompletionDate {
  const match = text.match(/(?:✅|#completed\/)\s*(\d{4}-\d{2}-\d{2})/i);
  if (!match) {
    return { cleanTitle: text };
  }
  const completedDate = match[1];
  const cleanTitle = text.replace(match[0], '').replace(/\s{2,}/g, ' ').trim();
  return { completedDate, cleanTitle: cleanTitle || text };
}

export function formatTaskWithCompletionDate(text: string, date: string): string {
  const { cleanTitle } = parseTaskCompletionDate(text);
  return `${cleanTitle} ✅ ${date}`.trim();
}

export function parseRecurrenceRule(ruleStr: string): ParsedRecurrence | null {
  const trimmed = ruleStr.trim().toLowerCase();
  if (!trimmed) return null;

  if (trimmed.includes('weekday') || trimmed.includes('dia de semana') || trimmed.includes('días de semana')) {
    return { raw: ruleStr.trim(), frequency: 'weekday', interval: 1 };
  }

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

export function parseTaskRecurrence(text: string): TaskRecurrence {
  const match = text.match(/🔁\s*([a-zA-Z0-9_\-\u00C0-\u017F ]+?)(?=\s*(?:[📅⏳🛫✅🍅⏫🔼🔽#]|$))/iu);
  if (!match) {
    return { cleanTitle: text };
  }
  const cleanTitle = text.replace(match[0], '').replace(/\s{2,}/g, ' ').trim();
  return {
    recurrence: match[1].trim(),
    cleanTitle: cleanTitle || text,
  };
}

export function formatTaskWithRecurrence(text: string, recurrenceRule: string): string {
  const { cleanTitle } = parseTaskRecurrence(text);
  return `${cleanTitle} 🔁 ${recurrenceRule}`.trim();
}

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
  completed: number;
  cleanTitle: string;
}

export function parseTaskPomodoroEstimate(text: string): TaskPomodoroEstimate {
  const match = text.match(/(?:\[🍅::\s*(\d+)(?:\/(\d+))?\]|🍅\s*(\d+)(?:\/(\d+))?)/);
  if (!match) {
    return { cleanTitle: text, completed: 0 };
  }

  let completed = 0;
  let estimated = 0;
  const num1 = match[1] !== undefined ? match[1] : match[3];
  const num2 = match[2] !== undefined ? match[2] : match[4];

  if (num2 !== undefined) {
    completed = parseInt(num1, 10);
    estimated = parseInt(num2, 10);
  } else {
    estimated = parseInt(num1, 10);
  }

  const cleanTitle = text.replace(match[0], '').replace(/\s{2,}/g, ' ').trim();
  return {
    estimated: isNaN(estimated) || estimated <= 0 ? undefined : estimated,
    completed: isNaN(completed) || completed < 0 ? 0 : completed,
    cleanTitle: cleanTitle || text,
  };
}

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

export function getCleanTaskDisplayTitle(text: string): string {
  let clean = text;
  clean = clean.replace(/<!--[\s\S]*?-->/g, '');
  clean = clean.replace(/(?:⏫|🔼|🔽|#p[1-3]\b|#alta\b|#media\b|#baja\b)/gi, '');
  clean = clean.replace(/(?:🍅|:tomato:)\s*\d+(?:\s*\/\s*\d+)?/gi, '');
  clean = clean.replace(/📅\s*\d{4}-\d{2}-\d{2}(?:\s+\d{1,2}:\d{2})?/gi, '');
  clean = clean.replace(/(?:⏳|#scheduled\/)\s*\d{4}-\d{2}-\d{2}/gi, '');
  clean = clean.replace(/(?:🛫|#start\/)\s*\d{4}-\d{2}-\d{2}/gi, '');
  clean = clean.replace(/(?:✅|#completed\/)\s*\d{4}-\d{2}-\d{2}/gi, '');
  clean = clean.replace(/🔁\s*[a-zA-Z0-9_\-\u00C0-\u017F ]+?(?=\s*(?:[📅⏳🛫✅🍅⏫🔼🔽#]|$))/giu, '');
  clean = clean.replace(/#[\w\u00C0-\u017F-]+/g, '');
  clean = clean.replace(/^(?:💡|🧊|#ideas?\b|#icebox\b)\s*/i, '');
  clean = clean.replace(/\s{2,}/g, ' ').trim();
  return clean || text.replace(/<!--[\s\S]*?-->/g, '').trim() || text;
}

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

export function formatTaskWithPriority(text: string, priority: TaskPriority): string {
  const { cleanTitle } = parseTaskPriority(text);
  if (priority === 'high') return `⏫ ${cleanTitle}`;
  if (priority === 'medium') return `🔼 ${cleanTitle}`;
  if (priority === 'low') return `🔽 ${cleanTitle}`;
  return cleanTitle;
}

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

export function extractPendingTasksFromContent(
  content: string,
  sourceFile: string = '',
  iceboxHeader?: string
): PendingTaskItem[] {
  const tasks: PendingTaskItem[] = [];
  const lines = content.split('\n');
  let currentSection = '';

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const headerMatch = line.match(/^#{1,6}\s+(.*)$/);
    if (headerMatch) {
      currentSection = headerMatch[1].trim().toLowerCase();
    }

    const match = line.match(/^(\s*)-\s+\[ \]\s+(.*)$/);
    if (match) {
      if (/<!--\s*streak:\s*\d+/i.test(line) || isPomodoroLogLine(line)) {
        continue;
      }
      const taskText = match[2].trim();
      const inIcebox = isIceboxSection(currentSection, iceboxHeader);
      const isIdea = inIcebox || /#(?:ideas?|icebox)\b/i.test(taskText) || taskText.startsWith('💡') || taskText.startsWith('🧊');

      const { priority } = parseTaskPriority(taskText);
      const { estimated, completed } = parseTaskPomodoroEstimate(taskText);
      const { dueDate, dueTime } = parseTaskDeadline(taskText);
      const { scheduledDate } = parseTaskScheduledDate(taskText);
      const { startDate } = parseTaskStartDate(taskText);
      const { completedDate } = parseTaskCompletionDate(taskText);
      const { recurrence } = parseTaskRecurrence(taskText);
      const daysRemaining = dueDate ? calculateDaysRemaining(dueDate) : undefined;
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

export interface SubtaskItem {
  text: string;
  completed: boolean;
  originalLine: string;
  lineNumber: number;
  lineHash: string;
  sourceFile: string;
}

export interface TaskRecord extends PendingTaskItem {
  statusChar?: string;
  completed?: boolean;
  subtasks?: SubtaskItem[];
  tags?: string[];
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

  const aPri: TaskPriority = a.priority ?? 'none';
  const bPri: TaskPriority = b.priority ?? 'none';
  const diff = priorityWeight[bPri] - priorityWeight[aPri];
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
      if (/<!--\s*streak:\s*\d+/i.test(line) || isPomodoroLogLine(line)) {
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

    const bulletMatch = line.match(/^\s*-\s+(?!\[[ xX]\])(.*)$/);
    if (bulletMatch && isIceboxSection(currentSection, options?.iceboxSectionHeader)) {
      if (/<!--\s*streak:\s*\d+/i.test(line) || isPomodoroLogLine(line)) {
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

export function computeDeadlinesFromTasks(tasks: TaskRecord[]): DeadlineItem[] {
  const deadlines: DeadlineItem[] = [];
  for (const t of tasks) {
    if (t.dueDate) {
      const daysRemaining = t.dueDate ? calculateDaysRemaining(t.dueDate) : (t.daysRemaining ?? 0);
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
        completed: Boolean(t.completed),
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
