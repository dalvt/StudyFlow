import type { Subject } from './settings-utils.ts';
import type { FocusSessionRecord } from './analytics.ts';
import type { TaskRecord } from './tasks.ts';
import { extractTagsFromText, getLocalDateString } from './markdown-utils.ts';

export interface SubjectWeeklyProgress {
  subject: Subject;
  goalMinutes: number;
  actualMinutes: number;
  percentage: number;
  estimatedPomodoros: number;
  completedPomodoros: number;
  actualSessionsCount: number;
  goalStreakWeeks: number;
}

export interface SubjectsAnalyticsSummary {
  weekStartDate: string;
  weekEndDate: string;
  subjects: SubjectWeeklyProgress[];
}

/**
 * Normalizes a hashtag to lowercase with leading '#' (e.g. 'algebra' -> '#algebra').
 */
export function normalizeTag(tag: string): string {
  if (!tag) return '';
  const trimmed = tag.trim().toLowerCase();
  if (!trimmed) return '';
  return trimmed.startsWith('#') ? trimmed : `#${trimmed}`;
}

/**
 * Checks whether an array of tags or text content matches a subject's tag.
 */
export function matchesSubjectTag(subjectTag: string, tags?: string[], text?: string): boolean {
  const normSubject = normalizeTag(subjectTag);
  if (!normSubject) return false;

  if (tags && tags.length > 0) {
    for (const t of tags) {
      if (normalizeTag(t) === normSubject) {
        return true;
      }
    }
  }

  if (text) {
    const extracted = extractTagsFromText(text);
    for (const t of extracted) {
      if (normalizeTag(t) === normSubject) {
        return true;
      }
    }
  }

  return false;
}

/**
 * Computes the Monday-to-Sunday date range for a given local reference date.
 */
export function getLocalWeekRange(refDate: Date = new Date()): {
  startMonday: Date;
  endSunday: Date;
  startDateStr: string;
  endDateStr: string;
} {
  const dayOfWeek = (refDate.getDay() + 6) % 7; // 0 for Monday, 6 for Sunday
  const monday = new Date(
    refDate.getFullYear(),
    refDate.getMonth(),
    refDate.getDate() - dayOfWeek,
    0,
    0,
    0,
    0
  );
  const sunday = new Date(
    refDate.getFullYear(),
    refDate.getMonth(),
    refDate.getDate() - dayOfWeek + 6,
    23,
    59,
    59,
    999
  );

  return {
    startMonday: monday,
    endSunday: sunday,
    startDateStr: getLocalDateString(monday),
    endDateStr: getLocalDateString(sunday),
  };
}

/**
 * Aggregates actual focus minutes and session counts for a subject within a date range (inclusive).
 */
export function calculateSubjectWeeklyFocusMinutes(
  sessions: FocusSessionRecord[],
  subject: Subject,
  startDateStr: string,
  endDateStr: string
): { actualMinutes: number; sessionCount: number } {
  let actualMinutes = 0;
  let sessionCount = 0;

  for (const session of sessions) {
    if (session.date >= startDateStr && session.date <= endDateStr) {
      if (matchesSubjectTag(subject.tag, session.tags, session.taskText)) {
        actualMinutes += session.durationMinutes || 0;
        sessionCount++;
      }
    }
  }

  return { actualMinutes, sessionCount };
}

/**
 * Aggregates task pomodoro estimates vs completed pomodoros for a subject.
 */
export function calculateSubjectTaskPomodoros(
  tasks: TaskRecord[],
  subject: Subject
): {
  estimatedPomodoros: number;
  completedPomodoros: number;
  totalTasks: number;
  completedTasks: number;
} {
  let estimatedPomodoros = 0;
  let completedPomodoros = 0;
  let totalTasks = 0;
  let completedTasks = 0;

  for (const task of tasks) {
    if (matchesSubjectTag(subject.tag, task.tags, task.text)) {
      totalTasks++;
      if (task.completed) {
        completedTasks++;
      }
      if (task.estimatedPomodoros) {
        estimatedPomodoros += task.estimatedPomodoros;
      }
      if (task.completedPomodoros) {
        completedPomodoros += task.completedPomodoros;
      }
    }
  }

  return { estimatedPomodoros, completedPomodoros, totalTasks, completedTasks };
}

/**
 * Computes consecutive weeks meeting weeklyGoalHours for a subject.
 * - If current week is already met, current week counts toward streak.
 * - If current week is in progress (< goal), prior consecutive met weeks count toward streak.
 * - Returns 0 if weeklyGoalHours <= 0 or if last completed week did not meet goal.
 */
export function calculateSubjectGoalStreak(
  sessions: FocusSessionRecord[],
  subject: Subject,
  refDate: Date = new Date()
): number {
  const goalMinutes = Math.round((subject.weeklyGoalHours || 0) * 60);
  if (goalMinutes <= 0) return 0;

  const currentRange = getLocalWeekRange(refDate);
  const currentWeek = calculateSubjectWeeklyFocusMinutes(
    sessions,
    subject,
    currentRange.startDateStr,
    currentRange.endDateStr
  );

  const currentWeekMet = currentWeek.actualMinutes >= goalMinutes;

  let priorWeeksMet = 0;
  // Look back up to 104 weeks (2 years)
  for (let i = 1; i <= 104; i++) {
    const priorRef = new Date(
      currentRange.startMonday.getFullYear(),
      currentRange.startMonday.getMonth(),
      currentRange.startMonday.getDate() - 7 * i,
      12,
      0,
      0
    );
    const priorRange = getLocalWeekRange(priorRef);
    const priorWeek = calculateSubjectWeeklyFocusMinutes(
      sessions,
      subject,
      priorRange.startDateStr,
      priorRange.endDateStr
    );

    if (priorWeek.actualMinutes >= goalMinutes) {
      priorWeeksMet++;
    } else {
      break;
    }
  }

  return currentWeekMet ? 1 + priorWeeksMet : priorWeeksMet;
}

/**
 * Aggregates complete analytics summary across all configured subjects.
 */
export function computeSubjectsAnalyticsSummary(
  sessions: FocusSessionRecord[],
  tasks: TaskRecord[],
  subjects: Subject[],
  refDate: Date = new Date()
): SubjectsAnalyticsSummary {
  const weekRange = getLocalWeekRange(refDate);

  const subjectProgressList: SubjectWeeklyProgress[] = subjects.map((subject) => {
    const weekly = calculateSubjectWeeklyFocusMinutes(
      sessions,
      subject,
      weekRange.startDateStr,
      weekRange.endDateStr
    );
    const taskPomos = calculateSubjectTaskPomodoros(tasks, subject);
    const goalMinutes = Math.round((subject.weeklyGoalHours || 0) * 60);
    const percentage = goalMinutes > 0 ? Math.round((weekly.actualMinutes / goalMinutes) * 100) : 0;
    const goalStreakWeeks = calculateSubjectGoalStreak(sessions, subject, refDate);

    return {
      subject,
      goalMinutes,
      actualMinutes: weekly.actualMinutes,
      percentage,
      estimatedPomodoros: taskPomos.estimatedPomodoros,
      completedPomodoros: taskPomos.completedPomodoros,
      actualSessionsCount: weekly.sessionCount,
      goalStreakWeeks,
    };
  });

  return {
    weekStartDate: weekRange.startDateStr,
    weekEndDate: weekRange.endDateStr,
    subjects: subjectProgressList,
  };
}
