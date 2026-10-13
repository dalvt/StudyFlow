import { App, Modal, Notice, setIcon, TFile } from 'obsidian';
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

/**
 * Dedicated Habits Modal
 */
export class HabitsModal extends Modal {
  private plugin: StudyFlowPlugin;
  private habits: HabitItem[] = [];

  constructor(app: App, plugin: StudyFlowPlugin) {
    super(app);
    this.plugin = plugin;
  }

  async onOpen(): Promise<void> {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.addClass('study-flow-modal', 'study-flow-habits-modal');

    await this.refresh();
    this.renderUI();
  }

  private async refresh(): Promise<void> {
    const path = this.plugin.settings.habitsFilePath || 'Habits.md';
    this.habits = await loadHabitsFromFile(this.app, path);
  }

  private renderUI(): void {
    const { contentEl } = this;
    contentEl.empty();

    // Header
    const header = contentEl.createDiv({ cls: 'study-flow-modal-header' });
    const title = header.createEl('h2', { text: t('habits.modalTitle') });
    const iconSpan = title.createSpan({ cls: 'study-flow-header-icon' });
    setIcon(iconSpan, 'sparkles');

    // Stats bar
    const completedCount = this.habits.filter((h) => h.completedToday).length;
    const statsBar = contentEl.createDiv({ cls: 'study-flow-stats-bar' });
    statsBar.createSpan({
      text: t('habits.completedToday', { count: completedCount, total: this.habits.length }),
      cls: 'study-flow-badge-stat is-pending',
    });

    // Add new habit bar
    const addSection = contentEl.createDiv({ cls: 'study-flow-search-bar study-flow-habit-add-bar' });
    const addInput = addSection.createEl('input', {
      type: 'text',
      placeholder: t('habits.modalNewPlaceholder'),
      cls: 'study-flow-task-input',
      attr: { 'aria-label': t('habits.newHabitLabel') },
    });

    const freqSelect = addSection.createEl('select', {
      cls: 'study-flow-tasks-sort-select study-flow-habit-freq-select',
      attr: { 'aria-label': t('habits.frequencyLabel') },
    });
    freqSelect.createEl('option', { value: 'daily', text: t('habits.freqDailyOption') });
    freqSelect.createEl('option', { value: 'weekly', text: t('habits.freqWeeklyOption') });
    freqSelect.createEl('option', { value: 'specific_days', text: t('habits.freqWeekdaysOption') });

    const targetInput = addSection.createEl('input', {
      type: 'number',
      cls: 'study-flow-task-input study-flow-habit-target-input',
      attr: {
        min: '1',
        max: '7',
        placeholder: '3',
        style: 'display: none; width: 60px;',
        'aria-label': t('habits.timesPerWeekPlaceholder'),
      },
      value: '3',
    });

    freqSelect.addEventListener('change', () => {
      targetInput.style.display = freqSelect.value === 'weekly' ? 'inline-block' : 'none';
    });

    const addBtn = addSection.createEl('button', {
      cls: 'mod-cta',
      attr: { 'aria-label': t('habits.addHabitTooltip') },
    });
    const aIcon = addBtn.createSpan();
    setIcon(aIcon, 'plus');
    addBtn.createSpan({ text: t('common.add') });

    const handleAdd = async () => {
      const val = addInput.value.trim();
      if (!val) return;
      const path = this.plugin.settings.habitsFilePath || 'Habits.md';
      let freq: HabitFrequency = { type: 'daily' };
      if (freqSelect.value === 'weekly') {
        const tgt = parseInt(targetInput.value, 10) || 3;
        freq = { type: 'weekly', weeklyTarget: Math.max(1, Math.min(7, tgt)) };
      } else if (freqSelect.value === 'specific_days') {
        freq = { type: 'specific_days', daysOfWeek: [1, 2, 3, 4, 5] };
      }

      this.habits = await addHabitToFile(this.app, path, val, freq);
      addInput.value = '';
      new Notice(t('habits.habitAddedNotice', { name: val }));
      this.renderUI();
    };

    addBtn.addEventListener('click', handleAdd);
    addInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        handleAdd();
      }
    });

    // Habits List Cards
    const listContainer = contentEl.createDiv({ cls: 'study-flow-task-list-cards' });

    if (this.habits.length === 0) {
      const emptyState = listContainer.createDiv({ cls: 'study-flow-empty-state' });
      const emptyIcon = emptyState.createDiv({ cls: 'study-flow-empty-icon' });
      setIcon(emptyIcon, 'flame');
      emptyState.createEl('h4', { text: t('habits.modalEmptyTitle') });
      emptyState.createEl('p', { text: t('habits.modalEmptyDesc') });
    } else {
      this.habits.forEach((habit) => {
        const card = listContainer.createDiv({
          cls: `study-flow-task-card study-flow-habit-card ${habit.completedToday ? 'is-done' : ''} ${habit.isRestDayToday ? 'is-rest-day' : ''}`,
        });

        const cbWrapper = card.createDiv({ cls: 'study-flow-cb-wrapper' });
        const cb = cbWrapper.createEl('input', { type: 'checkbox' });
        cb.checked = habit.completedToday;

        cb.addEventListener('change', async () => {
          const path = this.plugin.settings.habitsFilePath || 'Habits.md';
          this.habits = await toggleHabitStatus(this.app, path, habit.id, cb.checked);
          new Notice(
            cb.checked
              ? t('habits.habitFulfilledNotice', { streak: habit.streak + 1 })
              : t('habits.habitUnmarkedNotice')
          );
          this.renderUI();
        });

        const infoWrap = card.createDiv({ cls: 'study-flow-habit-info' });

        const titleRow = infoWrap.createDiv({ cls: 'study-flow-habit-title-row' });
        const textSpan = titleRow.createEl('span', {
          text: habit.name,
          cls: `study-flow-task-text ${habit.completedToday ? 'is-strikethrough' : ''}`,
        });
        textSpan.addEventListener('click', () => {
          cb.checked = !cb.checked;
          cb.dispatchEvent(new Event('change'));
        });

        // Frequency pill badge
        const freq = habit.frequency || { type: 'daily' };
        const freqBadge = titleRow.createSpan({ cls: 'study-flow-habit-freq-badge' });
        if (freq.type === 'weekly') {
          freqBadge.setText(t('habits.frequencyWeekly', { target: String(freq.weeklyTarget || 3) }));
        } else if (freq.type === 'specific_days') {
          freqBadge.setText(t('habits.freqWeekdaysOption'));
        } else {
          freqBadge.setText(t('habits.frequencyDaily'));
        }

        // Weekly progress
        const prog = computeHabitWeeklyProgress(habit);
        const progRow = infoWrap.createDiv({ cls: 'study-flow-habit-progress-row' });
        progRow.createSpan({
          text: t('habits.weeklyProgress', {
            completed: String(prog.completedCount),
            target: String(prog.target),
          }),
          cls: 'study-flow-habit-progress-text',
        });
        const bar = progRow.createDiv({ cls: 'study-flow-habit-progress-bar' });
        const fill = bar.createDiv({
          cls: `study-flow-habit-progress-fill ${prog.isMet ? 'is-met' : ''}`,
        });
        fill.style.width = `${prog.percentage}%`;

        // Rest day button
        const restBtn = card.createEl('button', {
          cls: `study-flow-icon-action-btn-styled study-flow-habit-rest-btn ${habit.isRestDayToday ? 'is-active' : ''}`,
          text: habit.isRestDayToday ? t('habits.restDayBadge') : t('habits.restDayBtn'),
          attr: { 'aria-label': t('habits.restDayBtn') },
        });
        restBtn.addEventListener('click', async (e) => {
          e.stopPropagation();
          const path = this.plugin.settings.habitsFilePath || 'Habits.md';
          this.habits = await toggleHabitRestDay(this.app, path, habit.id);
          const updated = this.habits.find((h) => h.id === habit.id);
          if (updated?.isRestDayToday) {
            new Notice(t('habits.restDayMarkedNotice', { name: habit.name }));
          } else {
            new Notice(t('habits.restDayUnmarkedNotice', { name: habit.name }));
          }
          this.renderUI();
        });

        // Streak Flame Badge
        const streakBadge = card.createDiv({ cls: 'study-flow-streak-badge' });
        const fIcon = streakBadge.createSpan({ cls: 'study-flow-flame-icon' });
        setIcon(fIcon, 'flame');
        const streakText = freq.type === 'weekly'
          ? t('habits.weeksStreak', { count: String(habit.streak) })
          : t('habits.daysStreak', { count: String(habit.streak) });
        streakBadge.createSpan({ text: streakText });

        // Delete button
        const delBtn = card.createEl('button', {
          cls: 'study-flow-icon-action-btn',
          attr: { 'aria-label': t('habits.deleteTooltip') },
        });
        setIcon(delBtn, 'trash-2');
        delBtn.addEventListener('click', async (e) => {
          e.stopPropagation();
          const path = this.plugin.settings.habitsFilePath || 'Habits.md';
          this.habits = await deleteHabitFromFile(this.app, path, habit.id);
          new Notice(t('habits.habitDeletedNotice'));
          this.renderUI();
        });
      });
    }

    // Heatmap Visualization
    renderHabitHeatmap(contentEl, this.habits);

    // Modal Footer
    const footer = contentEl.createDiv({ cls: 'study-flow-modal-footer' });
    const closeBtn = footer.createEl('button', { text: t('common.close') });
    closeBtn.addEventListener('click', () => this.close());
  }

  onClose(): void {
    const { contentEl } = this;
    contentEl.empty();
  }
}
