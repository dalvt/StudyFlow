import { App, Modal, Notice, setIcon, TFile } from 'obsidian';
import type StudyFlowPlugin from './main';
import { getOrCreateFile, getLocalDateString } from './utils';
import { formatHabitsToMarkdown, createHabitId, syncHabitsToMarkdown } from './markdown-utils';
import { t } from './i18n/index.ts';

export { createHabitId, syncHabitsToMarkdown };

export interface HabitItem {
  id: string;
  name: string;
  completedToday: boolean;
  streak: number;
  lastCompletedDate: string;
  history: string[];
}

function getTodayString(): string {
  return getLocalDateString();
}

function getYesterdayString(): string {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return getLocalDateString(d);
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
    const line = lines[i];
    // Matches: - [ ] Name <!-- streak: N | last: YYYY-MM-DD | history: YYYY-MM-DD,... -->
    const match = line.match(/^\s*-\s+\[(.)\]\s+(.*?)(?:\s*<!--\s*streak:\s*(\d+)\s*\|\s*last:\s*([^>|]*?)(?:\s*\|\s*history:\s*([^>]*?))?\s*-->)?$/);
    if (match) {
      const statusChar = match[1];
      const name = match[2].trim();
      const streak = parseInt(match[3] || '0', 10) || 0;
      const lastCompletedDate = (match[4] || '').trim();
      const historyRaw = (match[5] || '').trim();
      const history = historyRaw
        ? historyRaw.split(',').map((s) => s.trim()).filter(Boolean)
        : (lastCompletedDate ? [lastCompletedDate] : []);

      const completedToday = statusChar.toLowerCase() === 'x' && lastCompletedDate === today;

      habits.push({
        id: createHabitId(name),
        name,
        completedToday,
        streak,
        lastCompletedDate,
        history,
      });
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
  const yesterday = getYesterdayString();
  if (!target.history) target.history = [];

  if (newCompleted) {
    target.completedToday = true;
    if (target.lastCompletedDate === yesterday) {
      target.streak += 1;
    } else if (target.lastCompletedDate === today) {
      // Already today, keep
    } else {
      // Broken streak or first time
      target.streak = 1;
    }
    target.lastCompletedDate = today;
    if (!target.history.includes(today)) {
      target.history.push(today);
    }
  } else {
    target.completedToday = false;
    if (target.lastCompletedDate === today) {
      target.streak = Math.max(0, target.streak - 1);
      target.lastCompletedDate = '';
    }
    target.history = target.history.filter((d) => d !== today);
  }

  await saveHabitsToFile(app, filePath, habits);
  return habits;
}

/**
 * Adds a new habit to the list.
 */
export async function addHabitToFile(app: App, filePath: string, name: string): Promise<HabitItem[]> {
  const habits = await loadHabitsFromFile(app, filePath);
  habits.push({
    id: createHabitId(name),
    name: name.trim(),
    completedToday: false,
    streak: 0,
    lastCompletedDate: '',
    history: [],
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
    const addSection = contentEl.createDiv({ cls: 'study-flow-search-bar' });
    const addInput = addSection.createEl('input', {
      type: 'text',
      placeholder: t('habits.modalNewPlaceholder'),
      cls: 'study-flow-task-input',
      attr: { 'aria-label': t('habits.newHabitLabel') },
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
      this.habits = await addHabitToFile(this.app, path, val);
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
          cls: `study-flow-task-card study-flow-habit-card ${habit.completedToday ? 'is-done' : ''}`,
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

        const textSpan = card.createEl('span', {
          text: habit.name,
          cls: `study-flow-task-text ${habit.completedToday ? 'is-strikethrough' : ''}`,
        });
        textSpan.addEventListener('click', () => {
          cb.checked = !cb.checked;
          cb.dispatchEvent(new Event('change'));
        });

        // Streak Flame Badge
        const streakBadge = card.createDiv({ cls: 'study-flow-streak-badge' });
        const fIcon = streakBadge.createSpan({ cls: 'study-flow-flame-icon' });
        setIcon(fIcon, 'flame');
        streakBadge.createSpan({ text: t('habits.daysStreak', { count: habit.streak }) });

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
