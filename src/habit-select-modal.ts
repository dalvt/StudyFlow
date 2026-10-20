import { App, Modal, setIcon } from 'obsidian';
import type StudyFlowPlugin from './main';
import { loadHabitsFromFile, type HabitItem } from './habits';
import { t } from './i18n/index.ts';

export class HabitSelectModal extends Modal {
  private plugin: StudyFlowPlugin;
  private onSelect: (habit: HabitItem | null) => Promise<void> | void;
  private previousActiveElement: HTMLElement | null = null;

  constructor(
    app: App,
    plugin: StudyFlowPlugin,
    onSelect: (habit: HabitItem | null) => Promise<void> | void
  ) {
    super(app);
    this.plugin = plugin;
    this.onSelect = onSelect;
  }

  async onOpen(): Promise<void> {
    this.previousActiveElement = document.activeElement as HTMLElement | null;
    const { contentEl } = this;
    contentEl.empty();
    contentEl.addClass('study-flow-modal', 'study-flow-subject-select-modal', 'study-flow-habit-select-modal');

    // Header
    const header = contentEl.createDiv({ cls: 'study-flow-modal-header' });
    const title = header.createEl('h2', { text: t('habits.selectModalTitle') });
    const iconSpan = title.createSpan({ cls: 'study-flow-header-icon' });
    setIcon(iconSpan, 'flame');

    contentEl.createEl('p', {
      text: t('habits.selectModalDesc'),
      cls: 'study-flow-modal-subtitle',
    });

    const listContainer = contentEl.createDiv({ cls: 'study-flow-subject-select-list study-flow-habit-select-list' });

    const habits = await loadHabitsFromFile(this.app, this.plugin.settings.habitsFilePath);

    if (habits.length === 0) {
      const emptyState = listContainer.createDiv({ cls: 'study-flow-card' });
      emptyState.createSpan({ text: t('habits.selectModalEmpty'), cls: 'study-flow-text-muted' });
    } else {
      habits.forEach((habit) => {
        const itemBtn = listContainer.createEl('button', {
          cls: 'study-flow-subject-select-item study-flow-habit-select-item',
        });
        const flameDot = itemBtn.createSpan({ cls: 'study-flow-subject-color-dot study-flow-habit-modal-icon' });
        setIcon(flameDot, 'flame');

        const textWrap = itemBtn.createDiv({ cls: 'study-flow-subject-item-text' });
        textWrap.createSpan({ text: habit.name, cls: 'study-flow-subject-item-name' });

        if (habit.streak > 0) {
          itemBtn.createSpan({
            text: `🔥 ${habit.streak}`,
            cls: 'study-flow-habit-streak-badge',
          });
        }

        if (habit.completedToday) {
          itemBtn.createSpan({
            text: '✓',
            cls: 'study-flow-habit-done-badge',
            attr: { 'aria-label': t('analytics.habitDoneToday') },
          });
        }

        itemBtn.addEventListener('click', () => {
          void (async () => {
            this.close();
            await this.onSelect(habit);
          })();
        });
      });
    }

    // "Sin hábito" / Unlink option
    const noHabitBtn = listContainer.createEl('button', {
      cls: 'study-flow-subject-select-item is-none',
    });
    const noIcon = noHabitBtn.createSpan({ cls: 'study-flow-subject-color-dot is-none' });
    setIcon(noIcon, 'minus');
    noHabitBtn.createSpan({ text: t('pomodoro.noHabitOption'), cls: 'study-flow-subject-item-name' });
    noHabitBtn.addEventListener('click', () => {
      void (async () => {
        this.close();
        await this.onSelect(null);
      })();
    });

    // Footer
    const footer = contentEl.createDiv({ cls: 'study-flow-modal-footer' });
    const cancelBtn = footer.createEl('button', { text: t('common.cancel') });
    cancelBtn.addEventListener('click', () => this.close());
  }

  onClose(): void {
    const { contentEl } = this;
    contentEl.empty();
    if (this.previousActiveElement && typeof this.previousActiveElement.focus === 'function') {
      this.previousActiveElement.focus();
    }
  }
}
