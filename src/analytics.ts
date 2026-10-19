import type { App } from 'obsidian';
import type { HabitItem } from './habits';
import type { TaskRecord } from './tasks';
import type { Subject } from './settings-utils.ts';
import { getEffectiveLanguage } from './i18n/index.ts';
import { matchesSubjectTag, normalizeTag } from './subject-analytics.ts';
export * from './subject-analytics.ts';

export interface FocusSessionRecord {
  id: string;
  timestamp: number;
  date: string; // YYYY-MM-DD
  durationMinutes: number;
  taskText?: string;
  tags: string[];
  interrupted?: boolean;
  notes?: string;
  distractions?: number;
}

export interface DayFocusStat {
  date: string; // YYYY-MM-DD
  dayLabel: string; // e.g. 'Lun 12'
  shortDay: string; // e.g. 'Lun'
  totalMinutes: number;
  sessionCount: number;
  isToday: boolean;
}

export interface TagFocusStat {
  tag: string;
  totalMinutes: number;
  sessionCount: number;
  percentage: number;
}

export interface FocusAllocationItem {
  id: string;
  name: string;
  color: string;
  totalMinutes: number;
  sessionCount: number;
  percentage: number;
}

export interface FocusAllocationSummary {
  totalMinutes: number;
  totalSessions: number;
  items: FocusAllocationItem[];
}

export interface HabitsOverviewStat {
  totalHabits: number;
  completedTodayCount: number;
  todayCompletionRate: number; // 0 - 100
  weeklyCompletionRate: number; // 0 - 100
  topStreakHabit: { name: string; streak: number } | null;
}

export interface TasksOverviewStat {
  totalPending: number;
  totalCompleted: number;
  totalAll: number;
  completionRate: number; // 0 - 100
  totalEstimatedPomodoros: number;
  totalCompletedPomodoros: number;
  byPriority: {
    high: number;
    medium: number;
    low: number;
    none: number;
  };
}

export interface AnalyticsSummary {
  todayFocusMinutes: number;
  todaySessionCount: number;
  weekFocusMinutes: number;
  weekSessionCount: number;
  dailyAverageMinutes: number;
  last7Days: DayFocusStat[];
  tagDistribution: TagFocusStat[];
  habits: HabitsOverviewStat;
  tasks: TasksOverviewStat;
}

import { extractTagsFromText, getLocalDateString, getCleanTaskDisplayTitle } from './markdown-utils.ts';
export { extractTagsFromText, getLocalDateString, getCleanTaskDisplayTitle };

/**
 * Formats a duration in minutes into a human-readable string (e.g. "2h 30m" or "45m").
 */
export function formatMinutesHuman(totalMinutes: number): string {
  const mins = Math.max(0, Math.round(totalMinutes));
  if (mins === 0) return '0m';
  const hours = Math.floor(mins / 60);
  const remaining = mins % 60;
  if (hours > 0 && remaining > 0) {
    return `${hours}h ${remaining}m`;
  }
  if (hours > 0) {
    return `${hours}h`;
  }
  return `${remaining}m`;
}

const DAY_NAMES_ES = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
const DAY_NAMES_EN = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

/**
 * Computes daily focus time over the last N days (default 7).
 */
export function computeWeeklyFocusTrend(
  sessions: FocusSessionRecord[],
  referenceDate: Date = new Date(),
  daysCount: number = 7
): DayFocusStat[] {
  const result: DayFocusStat[] = [];
  const todayStr = getLocalDateString(referenceDate);
  const dayNames = getEffectiveLanguage() === 'en' ? DAY_NAMES_EN : DAY_NAMES_ES;

  // Group minutes and counts by YYYY-MM-DD
  const minutesByDate: Record<string, { minutes: number; count: number }> = {};
  for (const s of sessions) {
    if (!minutesByDate[s.date]) {
      minutesByDate[s.date] = { minutes: 0, count: 0 };
    }
    minutesByDate[s.date].minutes += s.durationMinutes || 0;
    minutesByDate[s.date].count += 1;
  }

  // Generate sequence from (daysCount - 1) days ago to referenceDate
  for (let i = daysCount - 1; i >= 0; i--) {
    const d = new Date(referenceDate);
    d.setDate(d.getDate() - i);
    const dateStr = getLocalDateString(d);
    const dayOfWeek = d.getDay();
    const shortDay = dayNames[dayOfWeek] || '';
    const dayLabel = `${shortDay} ${String(d.getDate()).padStart(2, '0')}`;

    const entry = minutesByDate[dateStr] || { minutes: 0, count: 0 };
    result.push({
      date: dateStr,
      dayLabel,
      shortDay,
      totalMinutes: entry.minutes,
      sessionCount: entry.count,
      isToday: dateStr === todayStr,
    });
  }

  return result;
}

/**
 * Computes distribution of focus time by tag or subject.
 */
export function computeTagDistribution(
  sessions: FocusSessionRecord[],
  maxTags: number = 6
): TagFocusStat[] {
  if (sessions.length === 0) return [];

  const totalsByTag: Record<string, { minutes: number; count: number }> = {};
  let overallMinutes = 0;

  for (const s of sessions) {
    const duration = s.durationMinutes || 0;
    overallMinutes += duration;
    const tags = s.tags && s.tags.length > 0 ? s.tags : ['#general'];

    for (const tag of tags) {
      if (!totalsByTag[tag]) {
        totalsByTag[tag] = { minutes: 0, count: 0 };
      }
      totalsByTag[tag].minutes += duration;
      totalsByTag[tag].count += 1;
    }
  }

  if (overallMinutes === 0) return [];

  const stats: TagFocusStat[] = Object.keys(totalsByTag).map((tag) => {
    const item = totalsByTag[tag];
    const percentage = Math.round((item.minutes / overallMinutes) * 100);
    return {
      tag,
      totalMinutes: item.minutes,
      sessionCount: item.count,
      percentage,
    };
  });

  stats.sort((a, b) => b.totalMinutes - a.totalMinutes);
  return stats.slice(0, maxTags);
}

export const FOCUS_ALLOCATION_PALETTE = [
  'var(--sf-accent, #6366f1)',
  '#10b981', // Emerald
  '#f59e0b', // Amber
  '#3b82f6', // Blue
  '#ec4899', // Pink
  '#8b5cf6', // Violet
  '#06b6d4', // Cyan
  '#f97316', // Orange
  '#14b8a6', // Teal
  '#84cc16', // Lime
];

/**
 * Resolves the primary category, title and optional subject color for a focus session.
 * Prioritizes configured subjects -> specific tags -> clean task title -> General.
 */
export function resolveSessionCategory(
  session: FocusSessionRecord,
  subjects: Subject[] = [],
  generalLabel: string = 'General'
): { id: string; name: string; color?: string } {
  // 1. Try matching configured subjects
  if (subjects && subjects.length > 0) {
    for (const s of subjects) {
      if (matchesSubjectTag(s.tag, session.tags, session.taskText)) {
        return { id: `subject-${s.id}`, name: s.name, color: s.color };
      }
      if (session.taskText && s.name) {
        const escaped = s.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        if (new RegExp(`\\b${escaped}\\b`, 'i').test(session.taskText)) {
          return { id: `subject-${s.id}`, name: s.name, color: s.color };
        }
      }
    }
  }

  // 2. Try explicit tags (ignore pure #general)
  if (session.tags && session.tags.length > 0) {
    const specificTags = session.tags.filter((t) => normalizeTag(t) !== '#general');
    if (specificTags.length > 0) {
      const primaryTag = normalizeTag(specificTags[0]);
      return { id: `tag-${primaryTag}`, name: primaryTag };
    }
  }

  // 3. Fallback to clean task text if present
  if (session.taskText && session.taskText.trim()) {
    const cleanTitle = getCleanTaskDisplayTitle(session.taskText).trim();
    if (cleanTitle) {
      const slug = cleanTitle.toLowerCase().replace(/\s+/g, '-').slice(0, 30);
      return { id: `task-${slug}`, name: cleanTitle };
    }
  }

  // 4. Default to General
  return { id: 'general', name: generalLabel };
}

/**
 * Computes focus time allocation grouped by subject, tag or task, with relative percentages.
 */
export function computeFocusAllocation(
  sessions: FocusSessionRecord[],
  subjects: Subject[] = [],
  maxItems: number = 6,
  generalLabel: string = 'General',
  othersLabel: string = 'Otras actividades'
): FocusAllocationSummary {
  if (!sessions || sessions.length === 0) {
    return { totalMinutes: 0, totalSessions: 0, items: [] };
  }

  const categoryMap = new Map<string, { id: string; name: string; color?: string; totalMinutes: number; sessionCount: number }>();
  let grandTotalMinutes = 0;
  let validSessionsCount = 0;

  for (const session of sessions) {
    const mins = session.durationMinutes || 0;
    if (mins <= 0) continue;
    grandTotalMinutes += mins;
    validSessionsCount += 1;

    const cat = resolveSessionCategory(session, subjects, generalLabel);
    const existing = categoryMap.get(cat.id);
    if (existing) {
      existing.totalMinutes += mins;
      existing.sessionCount += 1;
      if (!existing.color && cat.color) existing.color = cat.color;
    } else {
      categoryMap.set(cat.id, {
        id: cat.id,
        name: cat.name,
        color: cat.color,
        totalMinutes: mins,
        sessionCount: 1,
      });
    }
  }

  if (grandTotalMinutes === 0) {
    return { totalMinutes: 0, totalSessions: validSessionsCount, items: [] };
  }

  const sorted = Array.from(categoryMap.values()).sort((a, b) => b.totalMinutes - a.totalMinutes);

  let paletteIndex = 0;
  const items: FocusAllocationItem[] = [];

  const mainItemsCount = sorted.length > maxItems ? maxItems - 1 : sorted.length;
  for (let i = 0; i < mainItemsCount; i++) {
    const item = sorted[i];
    let finalColor = item.color;
    if (!finalColor) {
      finalColor = FOCUS_ALLOCATION_PALETTE[paletteIndex % FOCUS_ALLOCATION_PALETTE.length];
      paletteIndex++;
    }
    const pct = Math.max(1, Math.round((item.totalMinutes / grandTotalMinutes) * 100));
    items.push({
      id: item.id,
      name: item.name,
      color: finalColor,
      totalMinutes: item.totalMinutes,
      sessionCount: item.sessionCount,
      percentage: pct,
    });
  }

  if (sorted.length > maxItems) {
    let othersMins = 0;
    let othersSessions = 0;
    for (let i = mainItemsCount; i < sorted.length; i++) {
      othersMins += sorted[i].totalMinutes;
      othersSessions += sorted[i].sessionCount;
    }
    const othersPct = Math.max(1, Math.round((othersMins / grandTotalMinutes) * 100));
    items.push({
      id: 'others',
      name: othersLabel,
      color: 'var(--text-muted, #94a3b8)',
      totalMinutes: othersMins,
      sessionCount: othersSessions,
      percentage: othersPct,
    });
  }

  return {
    totalMinutes: grandTotalMinutes,
    totalSessions: validSessionsCount,
    items,
  };
}

/**
 * Computes habit completion rate today and over the last 7 days.
 */
export function computeHabitsOverview(
  habits: HabitItem[],
  referenceDate: Date = new Date()
): HabitsOverviewStat {
  const totalHabits = habits.length;
  if (totalHabits === 0) {
    return {
      totalHabits: 0,
      completedTodayCount: 0,
      todayCompletionRate: 0,
      weeklyCompletionRate: 0,
      topStreakHabit: null,
    };
  }

  const todayStr = getLocalDateString(referenceDate);
  const completedTodayCount = habits.filter(
    (h) => h.completedToday || (h.lastCompletedDate === todayStr)
  ).length;

  const todayCompletionRate = Math.round((completedTodayCount / totalHabits) * 100);

  // Compute 7-day completion rate across all habits
  const last7Days: string[] = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(referenceDate);
    d.setDate(d.getDate() - i);
    last7Days.push(getLocalDateString(d));
  }

  let totalPossibleCompletions = totalHabits * 7;
  let actualCompletions = 0;

  for (const h of habits) {
    const historySet = new Set(h.history || []);
    for (const date of last7Days) {
      if (historySet.has(date)) {
        actualCompletions++;
      }
    }
  }

  const weeklyCompletionRate = totalPossibleCompletions > 0
    ? Math.round((actualCompletions / totalPossibleCompletions) * 100)
    : 0;

  let topStreakHabit: { name: string; streak: number } | null = null;
  for (const h of habits) {
    if (!topStreakHabit || (h.streak || 0) > topStreakHabit.streak) {
      topStreakHabit = { name: h.name, streak: h.streak || 0 };
    }
  }

  return {
    totalHabits,
    completedTodayCount,
    todayCompletionRate,
    weeklyCompletionRate,
    topStreakHabit,
  };
}

/**
 * Computes task completion counts and priority breakdown.
 */
export function computeTasksOverview(tasks: TaskRecord[]): TasksOverviewStat {
  const totalAll = tasks.length;
  let totalCompleted = 0;
  let totalPending = 0;
  let totalEstimatedPomodoros = 0;
  let totalCompletedPomodoros = 0;

  const byPriority = {
    high: 0,
    medium: 0,
    low: 0,
    none: 0,
  };

  for (const t of tasks) {
    if (t.estimatedPomodoros) {
      totalEstimatedPomodoros += t.estimatedPomodoros;
    }
    if (t.completedPomodoros) {
      totalCompletedPomodoros += t.completedPomodoros;
    }

    if (t.completed) {
      totalCompleted++;
    } else {
      totalPending++;
      const p = t.priority || 'none';
      if (p in byPriority) {
        byPriority[p]++;
      } else {
        byPriority.none++;
      }
    }
  }

  const completionRate = totalAll > 0
    ? Math.round((totalCompleted / totalAll) * 100)
    : 0;

  return {
    totalPending,
    totalCompleted,
    totalAll,
    completionRate,
    totalEstimatedPomodoros,
    totalCompletedPomodoros,
    byPriority,
  };
}

/**
 * Aggregates all study flow metrics into a single summary.
 */
export function buildAnalyticsSummary(
  sessions: FocusSessionRecord[],
  habits: HabitItem[],
  tasks: TaskRecord[],
  referenceDate: Date = new Date()
): AnalyticsSummary {
  const last7Days = computeWeeklyFocusTrend(sessions, referenceDate, 7);
  const tagDistribution = computeTagDistribution(sessions);
  const habitsStat = computeHabitsOverview(habits, referenceDate);
  const tasksStat = computeTasksOverview(tasks);

  const todayStr = getLocalDateString(referenceDate);
  let todayFocusMinutes = 0;
  let todaySessionCount = 0;
  let weekFocusMinutes = 0;
  let weekSessionCount = 0;

  for (const day of last7Days) {
    weekFocusMinutes += day.totalMinutes;
    weekSessionCount += day.sessionCount;
    if (day.date === todayStr) {
      todayFocusMinutes = day.totalMinutes;
      todaySessionCount = day.sessionCount;
    }
  }

  const dailyAverageMinutes = Math.round(weekFocusMinutes / 7);

  return {
    todayFocusMinutes,
    todaySessionCount,
    weekFocusMinutes,
    weekSessionCount,
    dailyAverageMinutes,
    last7Days,
    tagDistribution,
    habits: habitsStat,
    tasks: tasksStat,
  };
}
