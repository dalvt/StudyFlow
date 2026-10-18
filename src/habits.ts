import { App, Notice, setIcon, TFile } from 'obsidian';
import type StudyFlowPlugin from './main';
import { getOrCreateFile, getLocalDateString } from './utils.ts';
import {
  calculateHabitStreak,
  computeHabitWeeklyProgress,
  createHabitId,
  formatHabitsToMarkdown,
  type HabitFrequency,
  type HabitFrequencyType,
  type HabitItemData,
  type HabitWeeklyProgress,
  parseHabitLine,
  syncHabitsToMarkdown,
} from './markdown-utils.ts';
import { t } from './i18n/index.ts';

export {
  calculateHabitStreak,
  computeHabitWeeklyProgress,
  createHabitId,
  syncHabitsToMarkdown,
};
export type { HabitFrequency, HabitFrequencyType, HabitWeeklyProgress };

export interface HabitItem extends HabitItemData {
  id: string;
  name: string;
  completedToday: boolean;
  streak: number;
  lastCompletedDate: string;
  history: string[];
  frequency?: HabitFrequency;
  restDays?: string[];
  isRestDayToday?: boolean;
}

function getTodayString(): string {
  return getLocalDateString();
}

/**
 * Loads habits from Habits.md file. If file does not exist, initializes it.
 */
export async function loadHabitsFromFile(app: App, filePath: string): Promise<HabitItem[]> {
  const defaultHabitsContent = `# Registro de Hábitos

- [ ] 📚 Lectura 20 min <!-- streak: 0 | last:  -->
- [ ] 💧 Tomar 2L de agua <!-- streak: 0 | last:  -->
- [ ] 🏃‍♂️ Ejercicio / Estiramiento <!-- streak: 0 | last:  -->
- [ ] 🧘 Meditación o Desconexión <!-- streak: 0 | last:  -->
`;

  const file = await getOrCreateFile(app, filePath || 'Habits.md', defaultHabitsContent);
  const content = await app.vault.read(file);
  const lines = content.split(/\r?\n/);
  const habits: HabitItem[] = [];
  const today = getTodayString();

  for (let i = 0; i < lines.length; i++) {
    const parsed = parseHabitLine(lines[i], today);
    if (parsed) {
      parsed.streak = calculateHabitStreak(parsed);
      habits.push(parsed as HabitItem);
    }
  }

  return habits;
}

/**
 * Saves habits array back to Habits.md modifying ONLY habit lines
 * and preserving any other content in the file.
 */
export async function saveHabitsToFile(app: App, filePath: string, habits: HabitItem[]): Promise<void> {
  const file = await getOrCreateFile(app, filePath || 'Habits.md', '# Registro de Hábitos\n\n');
  await app.vault.process(file, (content) => {
    return syncHabitsToMarkdown(content, habits);
  });
}

/**
 * Toggles a habit's status for today and updates streak calculation.
 */
export async function toggleHabitStatus(
  app: App,
  filePath: string,
  habitId: string,
  newCompleted: boolean
): Promise<HabitItem[]> {
  const habits = await loadHabitsFromFile(app, filePath);
  const target = habits.find((h) => h.id === habitId);
  if (!target) return habits;

  const today = getTodayString();
  if (!target.history) target.history = [];
  if (!target.restDays) target.restDays = [];

  if (newCompleted) {
    target.completedToday = true;
    target.lastCompletedDate = today;
    if (!target.history.includes(today)) {
      target.history.push(today);
    }
    target.restDays = target.restDays.filter((d) => d !== today);
    target.isRestDayToday = false;
  } else {
    target.completedToday = false;
    target.history = target.history.filter((d) => d !== today);
    const sorted = [...target.history].sort();
    target.lastCompletedDate = sorted.length > 0 ? sorted[sorted.length - 1] : '';
  }

  target.streak = calculateHabitStreak(target);

  await saveHabitsToFile(app, filePath, habits);
  return habits;
}

/**
 * Toggles a habit's rest day status for today without breaking streak.
 */
export async function toggleHabitRestDay(
  app: App,
  filePath: string,
  habitId: string
): Promise<HabitItem[]> {
  const habits = await loadHabitsFromFile(app, filePath);
  const target = habits.find((h) => h.id === habitId);
  if (!target) return habits;

  const today = getTodayString();
  if (!target.restDays) target.restDays = [];
  if (!target.history) target.history = [];

  if (target.restDays.includes(today)) {
    target.restDays = target.restDays.filter((d) => d !== today);
    target.isRestDayToday = false;
  } else {
    target.restDays.push(today);
    target.isRestDayToday = true;
    target.completedToday = false;
    target.history = target.history.filter((d) => d !== today);
    const sorted = [...target.history].sort();
    target.lastCompletedDate = sorted.length > 0 ? sorted[sorted.length - 1] : '';
  }

  target.streak = calculateHabitStreak(target);

  await saveHabitsToFile(app, filePath, habits);
  return habits;
}

/**
 * Adds a new habit to the list.
 */
export async function addHabitToFile(
  app: App,
  filePath: string,
  name: string,
  frequency: HabitFrequency = { type: 'daily' }
): Promise<HabitItem[]> {
  const habits = await loadHabitsFromFile(app, filePath);
  habits.push({
    id: createHabitId(name),
    name: name.trim(),
    completedToday: false,
    streak: 0,
    lastCompletedDate: '',
    history: [],
    frequency,
    restDays: [],
    isRestDayToday: false,
  });

  await saveHabitsToFile(app, filePath, habits);
  return habits;
}

/**
 * Updates an existing habit's frequency and optionally its name.
 * Recalculates streak based on the updated frequency.
 */
export async function updateHabitInFile(
  app: App,
  filePath: string,
  habitId: string,
  updates: {
    name?: string;
    frequency?: HabitFrequency;
  }
): Promise<HabitItem[]> {
  const habits = await loadHabitsFromFile(app, filePath);
  const target = habits.find((h) => h.id === habitId);
  if (!target) return habits;

  if (updates.name !== undefined && updates.name.trim()) {
    target.name = updates.name.trim();
  }
  if (updates.frequency !== undefined) {
    target.frequency = updates.frequency;
  }

  target.streak = calculateHabitStreak(target);

  await saveHabitsToFile(app, filePath, habits);
  return habits;
}

/**
 * Deletes a habit from the list.
 */
export async function deleteHabitFromFile(app: App, filePath: string, habitId: string): Promise<HabitItem[]> {
  let habits = await loadHabitsFromFile(app, filePath);
  habits = habits.filter((h) => h.id !== habitId);
  await saveHabitsToFile(app, filePath, habits);
  return habits;
}

export interface HeatmapDay {
  date: string;
  dayOfWeek: number;
  completedCount: number;
  totalHabits: number;
  intensity: number; // 0, 1, 2, 3, 4
  isToday?: boolean;
  isFuture?: boolean;
}

export interface HeatmapYearWeek {
  weekIndex: number;
  monthLabel?: string;
  days: HeatmapDay[];
}

export interface HeatmapYearData {
  weeks: HeatmapYearWeek[];
  totalCompletedInYear: number;
}

/**
 * Computes habit consistency over the last N days (for backward compatibility).
 */
export function computeHabitHeatmap(habits: HabitItem[], numDays: number = 35): HeatmapDay[] {
  const days: HeatmapDay[] = [];
  const today = new Date();
  const total = habits.length;

  for (let i = numDays - 1; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    const dateStr = getLocalDateString(d);
    const completedCount = habits.filter((h) => h.history && h.history.includes(dateStr)).length;
    const ratio = total > 0 ? completedCount / total : 0;

    let intensity = 0;
    if (completedCount > 0) {
      if (ratio >= 0.99) intensity = 4;
      else if (ratio >= 0.66) intensity = 3;
      else if (ratio >= 0.33) intensity = 2;
      else intensity = 1;
    }

    days.push({
      date: dateStr,
      dayOfWeek: d.getDay(),
      completedCount,
      totalHabits: total,
      intensity,
    });
  }

  return days;
}

/**
 * Computes 52 weeks of habit consistency aligned to Monday-Sunday columns, exactly like GitHub.
 */
export function computeHabitHeatmapYear(
  habits: HabitItem[],
  referenceDate: Date = new Date(),
  numWeeks: number = 52
): HeatmapYearData {
  const todayStr = getLocalDateString(referenceDate);
  const totalHabits = habits.length;

  // Day of week where Monday is 0 and Sunday is 6
  const refDayOfWeek = (referenceDate.getDay() + 6) % 7;

  // End date is Sunday of current week
  const endDate = new Date(referenceDate);
  endDate.setDate(endDate.getDate() + (6 - refDayOfWeek));
  endDate.setHours(23, 59, 59, 999);

  // Start date is Monday 51 weeks before
  const startDate = new Date(endDate);
  startDate.setDate(startDate.getDate() - (numWeeks * 7 - 1));
  startDate.setHours(0, 0, 0, 0);

  const MONTH_NAMES_ES = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
  const MONTH_NAMES_EN = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const isSpanish = t('habits.heatmapLess') === 'Menos';
  const monthNames = isSpanish ? MONTH_NAMES_ES : MONTH_NAMES_EN;

  const weeks: HeatmapYearWeek[] = [];
  let totalCompletedInYear = 0;
  let lastMonthSeen = -1;
  let weeksSinceLastMonthLabel = 99;

  const currentCursor = new Date(startDate);

  for (let w = 0; w < numWeeks; w++) {
    const days: HeatmapDay[] = [];
    let weekMonthLabel: string | undefined = undefined;

    for (let d = 0; d < 7; d++) {
      const dateStr = getLocalDateString(currentCursor);
      const isToday = dateStr === todayStr;
      const isFuture = dateStr > todayStr;
      const dayOfWeek = d; // 0 (Mon) to 6 (Sun)

      let completedCount = 0;
      let intensity = 0;

      if (!isFuture) {
        completedCount = habits.filter((h) => h.history && h.history.includes(dateStr)).length;
        if (completedCount > 0) {
          totalCompletedInYear += completedCount;
          const ratio = totalHabits > 0 ? completedCount / totalHabits : 0;
          if (ratio >= 0.99) intensity = 4;
          else if (ratio >= 0.66) intensity = 3;
          else if (ratio >= 0.33) intensity = 2;
          else intensity = 1;
        }
      }

      // Check month label when we encounter a new month in week's early days
      if (d === 0 || d === 1) {
        const curMonth = currentCursor.getMonth();
        if (curMonth !== lastMonthSeen && weeksSinceLastMonthLabel >= 3) {
          weekMonthLabel = monthNames[curMonth];
          lastMonthSeen = curMonth;
          weeksSinceLastMonthLabel = 0;
        }
      }

      days.push({
        date: dateStr,
        dayOfWeek,
        completedCount,
        totalHabits,
        intensity,
        isToday,
        isFuture,
      });

      currentCursor.setDate(currentCursor.getDate() + 1);
    }

    weeksSinceLastMonthLabel++;
    weeks.push({
      weekIndex: w,
      monthLabel: weekMonthLabel,
      days,
    });
  }

  return {
    weeks,
    totalCompletedInYear,
  };
}

/**
 * Renders a full-year GitHub-style habit activity heatmap in the target container.
 */
export function renderHabitHeatmap(container: HTMLElement, habits: HabitItem[]): HTMLElement {
  const card = container.createDiv({ cls: 'study-flow-heatmap-card' });
  const yearData = computeHabitHeatmapYear(habits, new Date(), 52);

  // 1. Header
  const header = card.createDiv({ cls: 'study-flow-heatmap-header' });
  const title = header.createSpan({ cls: 'study-flow-heatmap-title' });
  const iconSpan = title.createSpan();
  setIcon(iconSpan, 'flame');
  title.createSpan({ text: t('habits.heatmapTitle') });

  if (yearData.totalCompletedInYear > 0) {
    header.createSpan({
      cls: 'study-flow-heatmap-badge',
      text: t('habits.heatmapYearBadge', { count: String(yearData.totalCompletedInYear) }),
    });
  }

  // 2. Horizontal Scroll Wrap
  const scrollWrap = card.createDiv({ cls: 'study-flow-heatmap-scroll-wrap' });
  const githubContainer = scrollWrap.createDiv({ cls: 'study-flow-heatmap-github-container' });

  // 2a. Months row
  const monthsRow = githubContainer.createDiv({ cls: 'study-flow-heatmap-months-row' });
  monthsRow.createDiv({ cls: 'study-flow-heatmap-weekday-spacer' });
  const monthsTrack = monthsRow.createDiv({ cls: 'study-flow-heatmap-months-track' });
  for (const week of yearData.weeks) {
    const slot = monthsTrack.createDiv({ cls: 'study-flow-heatmap-month-slot' });
    if (week.monthLabel) {
      slot.createSpan({ cls: 'study-flow-heatmap-month-text', text: week.monthLabel });
    }
  }

  // 2b. Body row (Weekday column + 52 Week columns)
  const bodyRow = githubContainer.createDiv({ cls: 'study-flow-heatmap-body-row' });

  // Weekdays on left
  const weekdaysCol = bodyRow.createDiv({ cls: 'study-flow-heatmap-weekdays-col' });
  weekdaysCol.createSpan({ text: t('habits.heatmapWeekdayMon') });
  weekdaysCol.createSpan();
  weekdaysCol.createSpan({ text: t('habits.heatmapWeekdayWed') });
  weekdaysCol.createSpan();
  weekdaysCol.createSpan({ text: t('habits.heatmapWeekdayFri') });
  weekdaysCol.createSpan();
  weekdaysCol.createSpan();

  // 52 Week columns
  const weeksTrack = bodyRow.createDiv({ cls: 'study-flow-heatmap-weeks-track' });
  for (const week of yearData.weeks) {
    const weekCol = weeksTrack.createDiv({ cls: 'study-flow-heatmap-week-col' });
    for (const day of week.days) {
      const cellCls = [
        'study-flow-heatmap-cell',
        `is-level-${day.intensity}`,
        day.isToday ? 'is-today-cell' : '',
        day.isFuture ? 'is-future' : '',
      ]
        .filter(Boolean)
        .join(' ');

      const cell = weekCol.createDiv({ cls: cellCls });

      if (!day.isFuture) {
        const pct = day.totalHabits > 0 ? Math.round((day.completedCount / day.totalHabits) * 100) : 0;
        const tooltip = day.completedCount > 0
          ? t('habits.heatmapCellTooltip', {
              date: day.date,
              completed: day.completedCount,
              total: day.totalHabits,
              pct,
            })
          : t('habits.heatmapCellEmpty', { date: day.date });

        cell.setAttribute('title', day.isToday ? `${tooltip} [${t('analytics.chartTodayPill')}]` : tooltip);
      }
    }
  }

  // Auto-scroll to the end (today) so recent weeks are immediately visible
  setTimeout(() => {
    scrollWrap.scrollLeft = scrollWrap.scrollWidth;
  }, 10);

  // 3. Legend at bottom
  const legend = card.createDiv({ cls: 'study-flow-heatmap-legend' });
  legend.createSpan({ text: t('habits.heatmapLess'), cls: 'study-flow-legend-label' });
  for (let lvl = 0; lvl <= 4; lvl++) {
    legend.createDiv({ cls: `study-flow-heatmap-cell is-level-${lvl}` });
  }
  legend.createSpan({ text: t('habits.heatmapMore'), cls: 'study-flow-legend-label' });

  return card;
}
