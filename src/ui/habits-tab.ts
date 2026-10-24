import { App, Notice, setIcon } from 'obsidian';
import type StudyFlowPlugin from '../main';
import type { TabComponent } from './types';
import {
  addHabitToFile,
  computeHabitWeeklyProgress,
  deleteHabitFromFile,
  formatHabitLine,
  getHabitRawLine,
  type HabitFrequency,
  HabitItem,
  loadHabitsFromFile,
  renderHabitHeatmap,
  restoreHabitLineToFile,
  toggleHabitRestDay,
  toggleHabitStatus,
  updateHabitInFile,
} from '../habits.ts';
import { HabitEditModal } from '../habit-edit-modal.ts';
import { t } from '../i18n/index.ts';

function showUndoNotice(message: string, onUndo: () => Promise<void>): void {
  const notice = new Notice('', 6000);
  const el = notice.messageEl;
  el.empty();
  const wrapper = el.createDiv({ cls: 'study-flow-notice-undo-wrapper' });
  wrapper.createSpan({ text: message, cls: 'study-flow-notice-undo-msg' });
  const btn = wrapper.createEl('button', {
    text: t('tasks.undoAction') || t('common.undo'),
    cls: 'study-flow-notice-undo-btn mod-cta',
  });
  btn.addEventListener('click', (e: MouseEvent) => {
    void (async () => {
      e.stopPropagation();
      notice.hide();
      await onUndo();
    })();
  });
}

export class HabitsTab implements TabComponent {
  private app: App;
  private plugin: StudyFlowPlugin;
  private container: HTMLElement | null = null;
  private habits: HabitItem[] = [];
  private isRendering = false;
  private pendingRender = false;

  constructor(app: App, plugin: StudyFlowPlugin) {
    this.app = app;
    this.plugin = plugin;
  }

  async render(container: HTMLElement): Promise<void> {
    this.container = container;
    if (this.isRendering) {
      this.pendingRender = true;
      return;
    }

    this.isRendering = true;
    try {
      const path = this.plugin.settings.habitsFilePath || 'StudyFlow/Habits.md';
      this.habits = await loadHabitsFromFile(this.app, path);

      container.empty();

      const card = container.createDiv({ cls: 'study-flow-card' });

    // Stats bar
    const completedCount = this.habits.filter((h) => h.completedToday).length;
    const statsBar = card.createDiv({ cls: 'study-flow-stats-bar' });
    statsBar.createSpan({
      text: t('habits.completedToday', { count: String(completedCount), total: String(this.habits.length) }),
      cls: 'study-flow-badge-stat is-pending',
    });

    // Add new habit bar
    const addSection = card.createDiv({ cls: 'study-flow-search-bar study-flow-habit-add-bar' });
    const addInput = addSection.createEl('input', {
      type: 'text',
      placeholder: t('habits.newHabitPlaceholder'),
      cls: 'study-flow-task-input',
      attr: { 'aria-label': t('habits.newHabitLabel') },
    });

    const freqSelect = addSection.createEl('select', {
      cls: 'study-flow-habit-freq-select',
      attr: { 'aria-label': t('habits.frequencyLabel') },
    });
    freqSelect.createEl('option', { value: 'daily', text: t('habits.freqDailyOption') });
    freqSelect.createEl('option', { value: 'weekly', text: t('habits.freqWeeklyOption') });
    freqSelect.createEl('option', { value: 'specific_days', text: t('habits.freqWeekdaysOption') });

    const targetInput = addSection.createEl('input', {
      type: 'number',
      cls: 'study-flow-task-input study-flow-habit-target-input is-hidden',
      attr: {
        min: '1',
        max: '7',
        placeholder: '3',
        'aria-label': t('habits.timesPerWeekPlaceholder'),
      },
      value: '3',
    });

    freqSelect.addEventListener('change', () => {
      targetInput.toggleClass('is-hidden', freqSelect.value !== 'weekly');
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
      if (this.container) await this.render(this.container);
    };

    addBtn.addEventListener('click', () => {
      void handleAdd();
    });
    addInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        void handleAdd();
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
        const openEditModal = () => {
          new HabitEditModal(this.app, this.plugin, habit, async (updates) => {
            this.habits = await updateHabitInFile(this.app, path, habit.id, updates);
            new Notice(t('habits.habitUpdatedNotice', { name: updates.name }));
            if (this.container) await this.render(this.container);
          }).open();
        };

        const hCard = listContainer.createDiv({
          cls: `study-flow-task-card study-flow-habit-card ${habit.completedToday ? 'is-done' : ''} ${habit.isRestDayToday ? 'is-rest-day' : ''}`,
        });

        const cbWrapper = hCard.createDiv({ cls: 'study-flow-cb-wrapper' });
        const cb = cbWrapper.createEl('input', {
          type: 'checkbox',
          attr: { 'aria-label': t('habits.checkboxAria', { name: habit.name }) },
        });
        cb.checked = habit.completedToday;

        cb.addEventListener('change', () => {
          void (async () => {
            this.habits = await toggleHabitStatus(this.app, path, habit.id, cb.checked);
            const updated = this.habits.find((h) => h.id === habit.id);
            const currentStreak = updated ? updated.streak : habit.streak;
            new Notice(
              cb.checked
                ? t('habits.streakIncreasedNotice', { streak: String(currentStreak) })
                : t('habits.habitUnmarkedNotice')
            );
            if (this.container) await this.render(this.container);
          })();
        });

        const infoWrap = hCard.createDiv({ cls: 'study-flow-habit-info' });

        const titleRow = infoWrap.createDiv({ cls: 'study-flow-habit-title-row' });
        const textSpan = titleRow.createSpan({
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
        freqBadge.addClass('is-clickable');
        freqBadge.setAttribute('title', t('habits.editHabitTooltip'));
        freqBadge.setAttribute('aria-label', t('habits.editHabitTooltip'));
        freqBadge.setAttribute('role', 'button');
        freqBadge.setAttribute('tabindex', '0');
        freqBadge.addEventListener('click', (e) => {
          e.stopPropagation();
          openEditModal();
        });
        freqBadge.addEventListener('keydown', (e: KeyboardEvent) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            e.stopPropagation();
            openEditModal();
          }
        });

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
        const restBtn = hCard.createEl('button', {
          cls: `study-flow-icon-action-btn-styled study-flow-habit-rest-btn ${habit.isRestDayToday ? 'is-active' : ''}`,
          text: habit.isRestDayToday ? t('habits.restDayBadge') : t('habits.restDayBtn'),
          attr: { 'aria-label': t('habits.restDayBtn') },
        });
        restBtn.addEventListener('click', (e) => {
          void (async () => {
            e.stopPropagation();
            this.habits = await toggleHabitRestDay(this.app, path, habit.id);
            const updated = this.habits.find((h) => h.id === habit.id);
            if (updated?.isRestDayToday) {
              new Notice(t('habits.restDayMarkedNotice', { name: habit.name }));
            } else {
              new Notice(t('habits.restDayUnmarkedNotice', { name: habit.name }));
            }
            if (this.container) await this.render(this.container);
          })();
        });

        // Flame Streak Badge
        const streakBadge = hCard.createDiv({ cls: 'study-flow-streak-badge' });
        const fIcon = streakBadge.createSpan({ cls: 'study-flow-flame-icon' });
        setIcon(fIcon, 'flame');
        const streakText = freq.type === 'weekly'
          ? t('habits.weeksStreak', { count: String(habit.streak) })
          : t('habits.daysStreak', { count: String(habit.streak) });
        streakBadge.createSpan({ text: streakText });

        // Edit button
        const editBtn = hCard.createEl('button', {
          cls: 'study-flow-icon-action-btn',
          attr: { 'aria-label': t('habits.editHabitTooltip') },
        });
        setIcon(editBtn, 'pencil');
        editBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          openEditModal();
        });

        // Delete button
        const delBtn = hCard.createEl('button', {
          cls: 'study-flow-icon-action-btn',
          attr: { 'aria-label': t('habits.deleteTooltip') },
        });
        setIcon(delBtn, 'trash-2');
        delBtn.addEventListener('click', (e) => {
          void (async () => {
            e.stopPropagation();
            const rawLine = (await getHabitRawLine(this.app, path, habit.id)) || formatHabitLine(habit);
            this.habits = await deleteHabitFromFile(this.app, path, habit.id);
            if (this.container) await this.render(this.container);

            showUndoNotice(t('habits.habitDeletedNotice'), async () => {
              if (rawLine) {
                this.habits = await restoreHabitLineToFile(this.app, path, rawLine);
                if (this.container) await this.render(this.container);
              }
            });
          })();
        });
      });
    }

    // Heatmap consistency visualization
    renderHabitHeatmap(container, this.habits, this.plugin.settings.weekStartDay || 'monday');
    } finally {
      this.isRendering = false;
      if (this.pendingRender) {
        this.pendingRender = false;
        if (this.container) {
          void this.render(this.container);
        }
      }
    }
  }

  public async onHabitsModified(): Promise<void> {
    if (this.container) {
      await this.render(this.container);
    }
  }

  destroy(): void {
    this.container = null;
    this.isRendering = false;
    this.pendingRender = false;
  }
}
