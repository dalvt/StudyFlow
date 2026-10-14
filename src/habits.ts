import { App, Notice, setIcon, TFile } from 'obsidian';
import type StudyFlowPlugin from './main';
import { getOrCreateFile, getLocalDateString } from './utils';
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
} from './markdown-utils';
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
}

/**
 * Computes habit consistency over the last N days (default 35 days: 5 full weeks).
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
 * Renders a GitHub-style habit activity heatmap in the target container.
 */
export function renderHabitHeatmap(container: HTMLElement, habits: HabitItem[]): HTMLElement {
  const card = container.createDiv({ cls: 'study-flow-heatmap-card' });
  const header = card.createDiv({ cls: 'study-flow-heatmap-header' });
  const title = header.createSpan({ cls: 'study-flow-heatmap-title' });
  const iconSpan = title.createSpan();
  setIcon(iconSpan, 'flame');
  title.createSpan({ text: t('habits.heatmapTitle') });

  const grid = card.createDiv({ cls: 'study-flow-heatmap-grid' });
  const days = computeHabitHeatmap(habits, 35);

  days.forEach((day) => {
    const cell = grid.createDiv({
      cls: `study-flow-heatmap-cell is-level-${day.intensity}`,
    });
    const pct = day.totalHabits > 0 ? Math.round((day.completedCount / day.totalHabits) * 100) : 0;
    cell.setAttribute(
      'title',
      t('habits.heatmapCellTooltip', {
        date: day.date,
        completed: day.completedCount,
        total: day.totalHabits,
        pct,
      })
    );
  });

  const legend = card.createDiv({ cls: 'study-flow-heatmap-legend' });
  legend.createSpan({ text: t('habits.heatmapLess'), cls: 'study-flow-legend-label' });
  for (let lvl = 0; lvl <= 4; lvl++) {
    legend.createDiv({ cls: `study-flow-heatmap-cell is-level-${lvl}` });
  }
  legend.createSpan({ text: t('habits.heatmapMore'), cls: 'study-flow-legend-label' });

  return card;
}
