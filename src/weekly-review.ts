import type { App, TFile } from 'obsidian';
import type { Subject, StudyFlowSettings } from './settings-utils.ts';
import type { FocusSessionRecord } from './analytics.ts';
import type { HabitItem } from './habits.ts';
import type { TaskRecord } from './tasks.ts';
import { formatMinutesHuman } from './analytics.ts';
import {
  calculateSubjectWeeklyFocusMinutes,
  getLocalWeekRange,
} from './subject-analytics.ts';
import { t, getEffectiveLanguage } from './i18n/index.ts';
import {
  DEFAULT_WEEKLY_REVIEW_TEMPLATE_ES,
  DEFAULT_WEEKLY_REVIEW_TEMPLATE_EN,
  getDefaultWeeklyReviewTemplate,
} from './conventions.ts';

export const DEFAULT_WEEKLY_REVIEW_TEMPLATE = DEFAULT_WEEKLY_REVIEW_TEMPLATE_ES;
export { DEFAULT_WEEKLY_REVIEW_TEMPLATE_ES, DEFAULT_WEEKLY_REVIEW_TEMPLATE_EN, getDefaultWeeklyReviewTemplate };

export interface IsoWeekInfo {
  year: number;
  week: number;
  formatted: string; // e.g. "2026-W42"
}

/**
 * Calculates ISO-8601 week number and format (YYYY-[W]WW) for a reference date.
 */
export function getIsoWeekInfo(refDate: Date = new Date()): IsoWeekInfo {
  // ISO-8601 Thursday check
  const date = new Date(refDate.getFullYear(), refDate.getMonth(), refDate.getDate());
  const dayOfWeek = (date.getDay() + 6) % 7; // 0 = Mon, 3 = Thu, 6 = Sun
  date.setDate(date.getDate() - dayOfWeek + 3); // Nearest Thursday

  const isoYear = date.getFullYear();

  // First Thursday of the year
  const firstThursday = new Date(isoYear, 0, 4);
  const firstThursdayDayOfWeek = (firstThursday.getDay() + 6) % 7;
  firstThursday.setDate(firstThursday.getDate() - firstThursdayDayOfWeek + 3);

  const diffMs = date.getTime() - firstThursday.getTime();
  const weekNumber = 1 + Math.round(diffMs / (7 * 24 * 60 * 60 * 1000));
  const weekStr = String(weekNumber).padStart(2, '0');

  return {
    year: isoYear,
    week: weekNumber,
    formatted: `${isoYear}-W${weekStr}`,
  };
}

/**
 * Resolves the destination markdown file path for a weekly review note.
 */
export function getWeeklyReviewFilePath(
  folder: string = 'StudyFlow/Reviews',
  refDate: Date = new Date()
): string {
  const iso = getIsoWeekInfo(refDate);
  const cleanFolder = folder.replace(/\/+$/, '').trim() || 'StudyFlow/Reviews';
  return `${cleanFolder}/${iso.formatted}.md`;
}

export interface WeeklyReviewDataOptions {
  weekFormatted: string;
  startDateStr: string;
  endDateStr: string;
  subjects?: Subject[];
  sessions?: FocusSessionRecord[];
  habits?: HabitItem[];
  tasks?: TaskRecord[];
  template?: string;
}

/**
 * Generates the weekly review markdown content using statistics and template.
 */
export function buildWeeklyReviewContent(options: WeeklyReviewDataOptions): string {
  const {
    weekFormatted,
    startDateStr,
    endDateStr,
    subjects = [],
    sessions = [],
    habits = [],
    tasks = [],
    template = DEFAULT_WEEKLY_REVIEW_TEMPLATE,
  } = options;

  // 1. Subjects Summary
  let subjectsSummary = '';
  if (subjects.length === 0) {
    subjectsSummary = `_${t('weeklyReview.noSubjects')}_`;
  } else {
    const lines: string[] = [];
    for (const sub of subjects) {
      const stats = calculateSubjectWeeklyFocusMinutes(sessions, sub, startDateStr, endDateStr);
      const goalMinutes = Math.round((sub.weeklyGoalHours || 0) * 60);
      const actualHoursStr = formatMinutesHuman(stats.actualMinutes);
      const goalHoursStr = `${sub.weeklyGoalHours || 0}h`;
      const pct = goalMinutes > 0 ? Math.round((stats.actualMinutes / goalMinutes) * 100) : 0;
      const metBadge = stats.actualMinutes >= goalMinutes && goalMinutes > 0 ? ` ✓ (${t('weeklyReview.goalMetBadge')})` : '';

      lines.push(
        `- **${sub.name}** (\`${sub.tag}\`): ${actualHoursStr} / ${t('weeklyReview.goalLabel')}: ${goalHoursStr} (${pct}%)${metBadge}`
      );
    }
    subjectsSummary = lines.join('\n');
  }

  // 2. Sessions Summary
  let sessionsSummary = '';
  const weekSessions = sessions.filter(
    (s) => s.date >= startDateStr && s.date <= endDateStr
  );
  if (weekSessions.length === 0) {
    sessionsSummary = `_${t('weeklyReview.noSessions')}_`;
  } else {
    const totalMinutes = weekSessions.reduce((acc, s) => acc + (s.durationMinutes || 0), 0);
    const completedCount = weekSessions.filter((s) => !s.interrupted).length;
    const interruptedCount = weekSessions.filter((s) => s.interrupted).length;

    sessionsSummary = [
      `- **${t('weeklyReview.totalSessionsLabel')}:** ${weekSessions.length}`,
      `- **${t('weeklyReview.totalTimeLabel')}:** ${formatMinutesHuman(totalMinutes)}`,
      `- **${t('weeklyReview.completedSessionsLabel')}:** ${completedCount}`,
      `- **${t('weeklyReview.interruptedSessionsLabel')}:** ${interruptedCount}`,
    ].join('\n');
  }

  // 3. Habits Summary
  let habitsSummary = '';
  if (habits.length === 0) {
    habitsSummary = `_${t('weeklyReview.noHabits')}_`;
  } else {
    const habitLines: string[] = [];
    for (const h of habits) {
      const streakText = h.streak > 0 ? `🔥 ${t('weeklyReview.habitStreak', { days: h.streak })}` : t('weeklyReview.noActiveStreak');
      habitLines.push(`- **${h.name}**: ${streakText}`);
    }
    habitsSummary = habitLines.join('\n');
  }

  // 4. Tasks Completed & Overdue Summary
  const completedTasks = tasks.filter((t) => t.completed && !t.isIdea);
  const overdueTasks = tasks.filter(
    (t) => !t.completed && !t.isIdea && t.daysRemaining !== undefined && t.daysRemaining < 0
  );

  let tasksCompletedSummary = '';
  if (completedTasks.length === 0) {
    tasksCompletedSummary = `_${t('weeklyReview.noCompletedTasks')}_`;
  } else {
    tasksCompletedSummary = completedTasks
      .slice(0, 15)
      .map((task) => `- [x] ${task.text}`)
      .join('\n');
    if (completedTasks.length > 15) {
      tasksCompletedSummary += `\n_${t('weeklyReview.moreTasksCompleted', { count: completedTasks.length - 15 })}_`;
    }
  }

  let tasksOverdueSummary = '';
  if (overdueTasks.length === 0) {
    tasksOverdueSummary = `_${t('weeklyReview.noOverdueTasks')}_`;
  } else {
    tasksOverdueSummary = overdueTasks
      .slice(0, 15)
      .map((task) => `- [ ] ${task.text} ⚠️ (${t('weeklyReview.overdueOn', { date: task.dueDate || t('weeklyReview.pastDueDate') })})`)
      .join('\n');
    if (overdueTasks.length > 15) {
      tasksOverdueSummary += `\n_${t('weeklyReview.moreTasksOverdue', { count: overdueTasks.length - 15 })}_`;
    }
  }

  // Replace placeholders in template
  return template
    .replace(/\{\{week\}\}/g, weekFormatted)
    .replace(/\{\{startDate\}\}/g, startDateStr)
    .replace(/\{\{endDate\}\}/g, endDateStr)
    .replace(/\{\{subjectsSummary\}\}/g, subjectsSummary)
    .replace(/\{\{sessionsSummary\}\}/g, sessionsSummary)
    .replace(/\{\{habitsSummary\}\}/g, habitsSummary)
    .replace(/\{\{tasksCompletedSummary\}\}/g, tasksCompletedSummary)
    .replace(/\{\{tasksOverdueSummary\}\}/g, tasksOverdueSummary);
}

/**
 * Ensures folder structure exists in vault using native Obsidian API.
 */
async function ensureVaultFolder(app: App, folderPath: string): Promise<void> {
  const normalized = folderPath.replace(/\\/g, '/').replace(/^\/+|\/+$/g, '').trim();
  if (!normalized) return;

  const parts = normalized.split('/');
  let current = '';
  for (const part of parts) {
    current = current ? `${current}/${part}` : part;
    if (!app.vault.getAbstractFileByPath(current)) {
      await app.vault.createFolder(current);
    }
  }
}

/**
 * Creates or retrieves the weekly review file, preserving existing files and opening in workspace leaf.
 */
export async function generateWeeklyReviewFile(
  app: App,
  plugin: import('./main').default,
  refDate: Date = new Date()
): Promise<{ file: TFile; isNew: boolean }> {
  const folder = plugin.settings.weeklyReviewsFolder || 'StudyFlow/Reviews';
  const filePath = getWeeklyReviewFilePath(folder, refDate);
  const normalizedPath = filePath.replace(/\\/g, '/').trim();

  const existing = app.vault.getAbstractFileByPath(normalizedPath);
  if (existing && 'stat' in existing) {
    return { file: existing as TFile, isNew: false };
  }

  // Calculate review data
  const iso = getIsoWeekInfo(refDate);
  const weekRange = getLocalWeekRange(refDate);

  const subjects = plugin.settings.subjects || [];
  const sessions = plugin.focusSessions || [];
  const habits = await (async () => {
    try {
      const { loadHabitsFromFile } = await import('./habits.ts');
      return await loadHabitsFromFile(app, plugin.settings.habitsFilePath || 'StudyFlow/Habits.md');
    } catch {
      return [];
    }
  })();
  const tasks = plugin.taskIndex ? plugin.taskIndex.getAllTasks() : [];

  const template = plugin.settings.weeklyReviewTemplate || getDefaultWeeklyReviewTemplate(getEffectiveLanguage());

  const content = buildWeeklyReviewContent({
    weekFormatted: iso.formatted,
    startDateStr: weekRange.startDateStr,
    endDateStr: weekRange.endDateStr,
    subjects,
    sessions,
    habits,
    tasks,
    template,
  });

  const lastSlash = normalizedPath.lastIndexOf('/');
  if (lastSlash !== -1) {
    await ensureVaultFolder(app, normalizedPath.substring(0, lastSlash));
  }

  const file = await app.vault.create(normalizedPath, content);
  return { file, isNew: true };
}
