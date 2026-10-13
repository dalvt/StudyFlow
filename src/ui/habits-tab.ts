import { App, Notice, setIcon } from 'obsidian';
import type StudyFlowPlugin from '../main';
import type { TabComponent } from './types';
import {
  addHabitToFile,
  deleteHabitFromFile,
  HabitItem,
  loadHabitsFromFile,
  renderHabitHeatmap,
  toggleHabitStatus,
} from '../habits';
import { t } from '../i18n/index.ts';

export class HabitsTab implements TabComponent {
  private app: App;
  private plugin: StudyFlowPlugin;
  private container: HTMLElement | null = null;
  private habits: HabitItem[] = [];

  constructor(app: App, plugin: StudyFlowPlugin) {
    this.app = app;
    this.plugin = plugin;
  }

  async render(container: HTMLElement): Promise<void> {
    this.container = container;
    container.empty();

    const path = this.plugin.settings.habitsFilePath || 'Habits.md';
    this.habits = await loadHabitsFromFile(this.app, path);

    const card = container.createDiv({ cls: 'study-flow-card' });

    // Stats bar
    const completedCount = this.habits.filter((h) => h.completedToday).length;
    const statsBar = card.createDiv({ cls: 'study-flow-stats-bar' });
    statsBar.createSpan({
      text: t('habits.completedToday', { count: String(completedCount), total: String(this.habits.length) }),
      cls: 'study-flow-badge-stat is-pending',
    });

    // Add new habit bar
    const addSection = card.createDiv({ cls: 'study-flow-search-bar' });
    const addInput = addSection.createEl('input', {
      type: 'text',
      placeholder: t('habits.newHabitPlaceholder'),
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
      this.habits = await addHabitToFile(this.app, path, val);
      addInput.value = '';
      new Notice(t('habits.habitAddedNotice', { name: val }));
      if (this.container) await this.render(this.container);
    };

    addBtn.addEventListener('click', handleAdd);
    addInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        handleAdd();
      }
    });

    // Habits List
    const listContainer = card.createDiv({ cls: 'study-flow-task-list-cards' });

    if (this.habits.length === 0) {
      const emptyState = listContainer.createDiv({ cls: 'study-flow-empty-state' });
      const emptyIcon = emptyState.createDiv({ cls: 'study-flow-empty-icon' });
      setIcon(emptyIcon, 'flame');
      emptyState.createEl('h4', { text: t('habits.emptyTitle') });
      emptyState.createEl('p', { text: t('habits.emptyDesc') });
    } else {
      this.habits.forEach((habit) => {
        const hCard = listContainer.createDiv({
          cls: `study-flow-task-card study-flow-habit-card ${habit.completedToday ? 'is-done' : ''}`,
        });

        const cbWrapper = hCard.createDiv({ cls: 'study-flow-cb-wrapper' });
        const cb = cbWrapper.createEl('input', { type: 'checkbox' });
        cb.checked = habit.completedToday;

        cb.addEventListener('change', async () => {
          this.habits = await toggleHabitStatus(this.app, path, habit.id, cb.checked);
          new Notice(cb.checked ? t('habits.streakIncreasedNotice', { streak: String(habit.streak + 1) }) : t('habits.habitUnmarkedNotice'));
          if (this.container) await this.render(this.container);
        });

        const textSpan = hCard.createEl('span', {
          text: habit.name,
          cls: `study-flow-task-text ${habit.completedToday ? 'is-strikethrough' : ''}`,
        });
        textSpan.addEventListener('click', () => {
          cb.checked = !cb.checked;
          cb.dispatchEvent(new Event('change'));
        });

        // Flame Streak Badge
        const streakBadge = hCard.createDiv({ cls: 'study-flow-streak-badge' });
        const fIcon = streakBadge.createSpan({ cls: 'study-flow-flame-icon' });
        setIcon(fIcon, 'flame');
        streakBadge.createSpan({ text: t('habits.daysStreak', { count: String(habit.streak) }) });

        // Delete button
        const delBtn = hCard.createEl('button', {
          cls: 'study-flow-icon-action-btn',
          attr: { 'aria-label': t('habits.deleteTooltip') },
        });
        setIcon(delBtn, 'trash-2');
        delBtn.addEventListener('click', async (e) => {
          e.stopPropagation();
          this.habits = await deleteHabitFromFile(this.app, path, habit.id);
          new Notice(t('habits.habitDeletedNotice'));
          if (this.container) await this.render(this.container);
        });
      });
    }

    // Heatmap consistency visualization
    renderHabitHeatmap(container, this.habits);
  }

  public async onHabitsModified(): Promise<void> {
    if (this.container) {
      await this.render(this.container);
    }
  }

  destroy(): void {
    this.container = null;
  }
}
