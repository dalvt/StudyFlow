import { computeLineHash } from './task-parser.ts';
import { getLocalDateString } from './date-utils.ts';

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
  if (!slug) {
    const hash = computeLineHash(name).slice(0, 8);
    return `habit-${hash}`;
  }
  return slug;
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
  const histStr = (h.history || []).slice(-370).join(',');
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
    frequency?: HabitFrequency;
    restDays?: string[];
  }>
): string {
  if (!content || content.trim().length === 0) {
    return formatHabitsToMarkdown(habits);
  }

  const lines = content.split(/\r?\n/);
  const habitLineRegex = /^\s*-\s+\[(.)\]\s+(.*?)(?:\s*<!--\s*(.*?)\s*-->)?$/;

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
      const headerIdx = updatedLines.findIndex((l) => /^#+\s+.*(h[aá]bito|habit)/i.test(l));
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
    const histStr = (h.history || []).slice(-370).join(',');
    lines.push(
      `- [${check}] ${h.name} <!-- streak: ${h.streak || 0} | last: ${h.lastCompletedDate || ''} | history: ${histStr} -->`
    );
  }
  lines.push('');
  return lines.join('\n');
}
