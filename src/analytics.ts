import type { App } from 'obsidian';
import type { HabitItem } from './habits';
import type { TaskRecord } from './tasks';
import type { StudyFlowSettings } from './settings';

export interface FocusSessionRecord {
  id: string;
  timestamp: number;
  date: string; // YYYY-MM-DD
  durationMinutes: number;
  taskText?: string;
  tags: string[];
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

/**
 * Helper to get local date ISO string YYYY-MM-DD.
 */
export function getLocalDateString(date: Date = new Date()): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

const DAY_NAMES_ES = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];

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
    const shortDay = DAY_NAMES_ES[dayOfWeek] || '';
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

  const byPriority = {
    high: 0,
    medium: 0,
    low: 0,
    none: 0,
  };

  for (const t of tasks) {
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

/**
 * Scans daily notes for past pomodoro logs and imports them into settings.focusHistory.
 */
export async function syncHistoricalSessionsFromVault(
  app: App,
  settings: StudyFlowSettings
): Promise<number> {
  const files = app.vault.getMarkdownFiles();
  if (!settings.focusHistory) {
    settings.focusHistory = [];
  }

  const existingKeys = new Set(
    settings.focusHistory.map((s) => `${s.date}_${(s.taskText || '').trim()}_${s.durationMinutes}`)
  );
  let addedCount = 0;

  for (const file of files) {
    const dateMatch = file.basename.match(/^(\d{4}-\d{2}-\d{2})$/);
    if (!dateMatch) continue;
    const fileDate = dateMatch[1];

    try {
      const content = await app.vault.read(file);
      // Matches: - [x] Pomodoro completado a las HH:mm (— *task text*)?
      const pomodoroRegex = /^[-*]\s+\[x\]\s+Pomodoro completado(?:\s+a las\s+(\d{2}:\d{2}))?(?:\s*—\s*\*?(.*?)\*?)?$/gim;
      let match: RegExpExecArray | null;

      while ((match = pomodoroRegex.exec(content)) !== null) {
        const timeStr = match[1] || '12:00';
        const taskText = (match[2] || '').trim();
        const duration = settings.pomodoroWorkDuration || 25;
        const key = `${fileDate}_${taskText}_${duration}`;

        if (!existingKeys.has(key)) {
          existingKeys.add(key);
          const [hh, mm] = timeStr.split(':').map(Number);
          const dateObj = new Date(`${fileDate}T${String(hh || 12).padStart(2, '0')}:${String(mm || 0).padStart(2, '0')}:00`);
          const timestamp = isNaN(dateObj.getTime()) ? new Date(fileDate).getTime() : dateObj.getTime();

          settings.focusHistory.push({
            id: `imported-${timestamp}-${Math.random().toString(36).slice(2, 6)}`,
            timestamp,
            date: fileDate,
            durationMinutes: duration,
            taskText,
            tags: extractTagsFromText(taskText),
          });
          addedCount++;
        }
      }
    } catch (err) {
      console.error(`Error leyendo nota diaria para sincronizar métricas: ${file.path}`, err);
    }
  }

  if (addedCount > 0) {
    settings.focusHistory.sort((a, b) => a.timestamp - b.timestamp);
  }

  return addedCount;
}
