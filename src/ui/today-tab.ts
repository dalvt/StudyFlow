import { App, Notice, setIcon } from 'obsidian';
import type StudyFlowPlugin from '../main.ts';
import type { ActiveTab, StudyFlowViewHost, TabComponent } from './types.ts';
import { getTimeBlocksForDate } from '../calendar.ts';
import { toggleTaskCompletionInFile } from '../tasks.ts';
import { loadHabitsFromFile, toggleHabitStatus } from '../habits.ts';
import {
  getSpacedRepetitionQueue,
  reviewSpacedNote,
} from '../spaced-repetition.ts';
import { extractTagsFromText, getLocalDateString, formatDeadlineHuman, getDailyNotePath } from '../utils.ts';
import { t } from '../i18n/index.ts';

import {
  findCurrentOrNextTimeBlock,
  filterTodayAndOverdueTasks,
  filterUpcomingDeadlines,
  type CurrentOrNextBlock,
} from '../today-utils.ts';
import { calculateDaysRemaining } from '../markdown-utils.ts';
import { getCleanTaskDisplayTitle } from '../task-parser.ts';

export {
  findCurrentOrNextTimeBlock,
  filterTodayAndOverdueTasks,
  filterUpcomingDeadlines,
  type CurrentOrNextBlock,
};

export class TodayTab implements TabComponent {
  private app: App;
  private plugin: StudyFlowPlugin;
  private host: StudyFlowViewHost;
  private container: HTMLElement | null = null;

  // Incremental Section Elements
  private nowNextSectionEl: HTMLElement | null = null;
  private todayTasksSectionEl: HTMLElement | null = null;
  private habitsSectionEl: HTMLElement | null = null;
  private spacedSectionEl: HTMLElement | null = null;

  // Race condition sequence guards
  private nowNextSeq = 0;
  private habitsSeq = 0;
  private spacedSeq = 0;

  private isRendering = false;
  private pendingRender = false;

  constructor(app: App, plugin: StudyFlowPlugin, host: StudyFlowViewHost | ((tab: ActiveTab) => void)) {
    this.app = app;
    this.plugin = plugin;
    this.host = typeof host === 'function' ? { switchTab: host } : host;
  }

  private onSwitchTab(tab: ActiveTab): void {
    void this.host.switchTab(tab);
  }

  public async render(container: HTMLElement): Promise<void> {
    this.container = container;
    if (this.isRendering) {
      this.pendingRender = true;
      return;
    }

    this.isRendering = true;
    try {
      container.empty();
      container.addClass('study-flow-today-tab');

    const cfg = this.plugin.settings.todaySections || {
      showNowNext: true,
      showTodayTasks: true,
      showHabits: true,
      showSpacedRepetition: true,
    };

    // 1. Header Row
    const headerRow = container.createDiv({ cls: 'study-flow-today-header' });
    headerRow.createEl('h2', { text: t('today.heading'), cls: 'study-flow-today-title' });
    headerRow.createEl('p', { text: t('today.subheading'), cls: 'study-flow-today-subtitle' });

    // 2. Section: Ahora / Siguiente
    if (cfg.showNowNext) {
      this.nowNextSectionEl = container.createDiv({ cls: 'study-flow-today-section study-flow-today-now-next-sec' });
      await this.renderNowNextSection();
    }

    // 3. Section: Tareas de Hoy y Próximas Entregas (Unificadas)
    if (cfg.showTodayTasks) {
      this.todayTasksSectionEl = container.createDiv({ cls: 'study-flow-today-section study-flow-today-tasks-sec' });
      this.renderTodayTasksSection();
    }

    // 4. Section: Hábitos Pendientes
    if (cfg.showHabits) {
      this.habitsSectionEl = container.createDiv({ cls: 'study-flow-today-section study-flow-today-habits-sec' });
      await this.renderHabitsSection();
    }

    // 5. Section: Repasos Espaciados (#repasar)
    if (cfg.showSpacedRepetition) {
      this.spacedSectionEl = container.createDiv({ cls: 'study-flow-today-section study-flow-today-spaced-sec' });
      await this.renderSpacedSection();
    }
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

  // --- Incremental Updates ---

  public onTasksChanged(): void {
    if (this.todayTasksSectionEl) {
      this.renderTodayTasksSection();
    }
  }

  public async onHabitsChanged(): Promise<void> {
    if (this.habitsSectionEl) {
      await this.renderHabitsSection();
    }
  }

  public destroy(): void {
    this.nowNextSeq++;
    this.habitsSeq++;
    this.spacedSeq++;
    this.container = null;
    this.nowNextSectionEl = null;
    this.todayTasksSectionEl = null;
    this.habitsSectionEl = null;
    this.spacedSectionEl = null;
    this.isRendering = false;
    this.pendingRender = false;
  }

  // --- 1. Ahora / Siguiente ---

  private async renderNowNextSection(): Promise<void> {
    if (!this.nowNextSectionEl) return;
    const seq = ++this.nowNextSeq;

    const todayDate = getLocalDateString(new Date());
    const blocks = await getTimeBlocksForDate(this.app, this.plugin.settings, todayDate);
    if (seq !== this.nowNextSeq || !this.nowNextSectionEl) return;
    this.nowNextSectionEl.empty();

    const now = new Date();
    const currentHHMM = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
    const currentOrNext = findCurrentOrNextTimeBlock(blocks, currentHHMM);

    const card = this.nowNextSectionEl.createDiv({ cls: 'study-flow-card study-flow-today-block-card' });

    if (!currentOrNext) {
      const emptyRow = card.createDiv({ cls: 'study-flow-today-empty-row' });
      const eIcon = emptyRow.createSpan({ cls: 'study-flow-empty-icon' });
      setIcon(eIcon, 'calendar-off');
      emptyRow.createSpan({ text: t('today.noScheduledBlocks'), cls: 'study-flow-empty-text' });
      const openCalBtn = emptyRow.createEl('button', {
        text: t('today.openCalendarBtn'),
        cls: 'study-flow-btn-secondary',
      });
      openCalBtn.addEventListener('click', () => this.onSwitchTab('calendar'));
      return;
    }

    const { type, block } = currentOrNext;
    const isNow = type === 'now';

    const header = card.createDiv({ cls: 'study-flow-today-block-header' });
    header.createSpan({
      cls: `study-flow-today-badge ${isNow ? 'is-now' : 'is-next'}`,
      text: isNow ? t('today.nowBadge') : t('today.nextBadge'),
    });
    header.createSpan({
      cls: 'study-flow-today-block-time',
      text: `${block.startTime} - ${block.endTime}`,
    });

    const body = card.createDiv({ cls: 'study-flow-today-block-body' });
    body.createSpan({ text: block.title, cls: 'study-flow-today-block-title' });

    const blockTags = extractTagsFromText(block.title);
    const matchedSubject = (this.plugin.settings.subjects || []).find(
      (s) => blockTags.some((bt) => bt.toLowerCase() === s.tag.toLowerCase())
    );
    const displayTag = matchedSubject ? matchedSubject.tag : (blockTags[0] ?? null);

    if (displayTag) {
      const subjectChip = body.createSpan({
        cls: 'study-flow-today-subject-chip',
        text: displayTag,
      });
      if (matchedSubject?.color) {
        subjectChip.style.color = matchedSubject.color;
        subjectChip.style.borderColor = `${matchedSubject.color}66`;
        subjectChip.style.backgroundColor = `${matchedSubject.color}1a`;
      }
    }

    const footer = card.createDiv({ cls: 'study-flow-today-block-footer' });
    const startBtn = footer.createEl('button', {
      cls: 'study-flow-btn mod-cta study-flow-today-focus-btn',
      attr: { 'aria-label': t('today.startFocusBtn') },
    });
    const playIcon = startBtn.createSpan({ cls: 'study-flow-btn-icon' });
    setIcon(playIcon, 'play');
    startBtn.createSpan({ text: t('today.startFocusBtn') });

    startBtn.addEventListener('click', () => {
      void (async () => {
        if (matchedSubject) {
          await this.plugin.pomodoro.setActiveSubject(matchedSubject);
        }
        const dailyPath = getDailyNotePath(this.plugin.settings, todayDate);
        await this.plugin.pomodoro.setActiveTask({
          id: block.id,
          text: `${block.title} [${block.startTime} - ${block.endTime}]`,
          sourceFile: dailyPath,
          isTimeBlock: true,
        });
        const status = this.plugin.pomodoro.getStatus();
        if (status.state === 'idle' || status.state === 'paused') {
          await this.plugin.pomodoro.start();
        }
        this.onSwitchTab('pomodoro');
      })();
    });
  }

  // --- 2. Tareas de Hoy y Entregas Próximas (Unificadas) ---

  private renderTodayTasksSection(): void {
    if (!this.todayTasksSectionEl) return;
    this.todayTasksSectionEl.empty();

    const todayDate = getLocalDateString(new Date());
    const allTasks = this.plugin.taskIndex?.getAllTasks() || [];
    const todayTasks = filterTodayAndOverdueTasks(allTasks, todayDate, 5);
    const allDeadlines = this.plugin.taskIndex?.getAllDeadlines() || [];
    const upcomingDeadlines = filterUpcomingDeadlines(
      allDeadlines.filter((d) => d.daysRemaining > 0),
      3
    );

    const card = this.todayTasksSectionEl.createDiv({ cls: 'study-flow-card' });

    const header = card.createDiv({ cls: 'study-flow-today-sec-header' });
    const titleGroup = header.createDiv({ cls: 'study-flow-sec-title-group' });
    const sIcon = titleGroup.createSpan({ cls: 'study-flow-sec-icon' });
    setIcon(sIcon, 'check-circle-2');
    titleGroup.createSpan({ text: t('today.tasksTitle'), cls: 'study-flow-sec-heading' });

    const viewAllBtn = header.createEl('button', {
      text: t('today.viewAllTasksBtn'),
      cls: 'study-flow-link-btn',
    });
    viewAllBtn.addEventListener('click', () => this.onSwitchTab('tasks'));

    if (todayTasks.length === 0 && upcomingDeadlines.length === 0) {
      const emptyRow = card.createDiv({ cls: 'study-flow-today-empty-row' });
      const eIcon = emptyRow.createSpan({ cls: 'study-flow-empty-icon' });
      setIcon(eIcon, 'check');
      emptyRow.createSpan({ text: t('today.noTasksToday'), cls: 'study-flow-empty-text' });
      return;
    }

    const list = card.createDiv({ cls: 'study-flow-today-items-list' });

    todayTasks.forEach((task) => {
      const itemRow = list.createDiv({ cls: 'study-flow-today-task-row' });

      const check = itemRow.createEl('input', {
        type: 'checkbox',
        cls: 'study-flow-task-checkbox',
        attr: { 'aria-label': t('tasks.checkboxAria', { title: getCleanTaskDisplayTitle(task.text) }) },
      });
      check.checked = Boolean(task.completed);

      const titleEl = itemRow.createSpan({
        cls: `study-flow-today-item-title ${task.completed ? 'is-strikethrough' : ''}`,
        text: task.text,
      });

      check.addEventListener('change', () => {
        void (async () => {
          titleEl.toggleClass('is-strikethrough', check.checked);
          itemRow.toggleClass('is-done', check.checked);
          task.completed = check.checked;
          await toggleTaskCompletionInFile(this.app, task, check.checked);
          new Notice(check.checked ? t('tasks.markedCompletedNotice') : t('tasks.unmarkedNotice'));
        })();
      });

      titleEl.addEventListener('click', () => {
        check.checked = !check.checked;
        check.dispatchEvent(new Event('change'));
      });

      const daysRemaining = task.dueDate ? calculateDaysRemaining(task.dueDate) : task.daysRemaining;
      if (daysRemaining !== undefined && daysRemaining < 0) {
        const badge = itemRow.createSpan({ cls: 'study-flow-deadline-badge is-overdue' });
        const bIcon = badge.createSpan({ cls: 'study-flow-badge-icon' });
        setIcon(bIcon, 'alert-circle');
        badge.createSpan({
          text: t('today.daysOverdue', { days: String(Math.abs(daysRemaining)) }),
        });
      } else if (daysRemaining === 0 || task.dueDate === todayDate) {
        const badge = itemRow.createSpan({ cls: 'study-flow-deadline-badge is-today' });
        const bIcon = badge.createSpan({ cls: 'study-flow-badge-icon' });
        setIcon(bIcon, 'clock');
        badge.createSpan({ text: t('today.dueToday') });
      }

      const pomoBtn = itemRow.createEl('button', {
        cls: 'study-flow-icon-action-btn study-flow-today-quick-pomo-btn',
        attr: {
          'aria-label': t('today.startFocusBtn') || 'Pomodoro',
          title: t('today.startFocusBtn') || 'Pomodoro',
        },
      });
      setIcon(pomoBtn, 'timer');
      pomoBtn.addEventListener('click', (e: MouseEvent) => {
        e.stopPropagation();
        void (async () => {
          await this.plugin.pomodoro.setActiveTask({
            id: task.id,
            text: task.text,
            sourceFile: task.sourceFile,
            originalLine: task.originalLine,
            lineNumber: task.lineNumber,
            lineHash: task.lineHash,
          });
          await this.plugin.pomodoro.start();
          await this.host.switchTab('pomodoro');
        })();
      });
    });

    if (upcomingDeadlines.length > 0) {
      const subHeader = list.createDiv({ cls: 'study-flow-today-subsec-label' });
      subHeader.setText(t('today.deadlinesTitle'));

      upcomingDeadlines.forEach((item) => {
        const itemRow = list.createDiv({
          cls: 'study-flow-today-deadline-row study-flow-clickable-row',
          attr: {
            role: 'button',
            tabindex: '0',
            'aria-label': `${item.cleanTitle} - ${formatDeadlineHuman(item.daysRemaining, item.dueDate)}`,
          },
        });
        const activateUpcoming = () => {
          if (this.host.openTasksUpcoming) {
            void this.host.openTasksUpcoming();
          } else {
            void this.host.switchTab('tasks', { taskView: 'upcoming' });
          }
        };
        itemRow.addEventListener('click', activateUpcoming);
        itemRow.addEventListener('keydown', (e: KeyboardEvent) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            activateUpcoming();
          }
        });

        itemRow.createSpan({
          cls: 'study-flow-today-item-title',
          text: item.cleanTitle,
        });

        const badge = itemRow.createSpan({
          cls: `study-flow-deadline-badge ${item.daysRemaining <= 3 ? 'is-soon' : ''}`,
        });
        const bIcon = badge.createSpan({ cls: 'study-flow-badge-icon' });
        setIcon(bIcon, 'calendar');
        badge.createSpan({
          text: formatDeadlineHuman(item.daysRemaining, item.dueDate),
        });
      });
    }
  }

  // --- 3. Hábitos Pendientes ---

  private async renderHabitsSection(): Promise<void> {
    if (!this.habitsSectionEl) return;
    const seq = ++this.habitsSeq;

    const habits = await loadHabitsFromFile(this.app, this.plugin.settings.habitsFilePath);
    if (seq !== this.habitsSeq || !this.habitsSectionEl) return;
    this.habitsSectionEl.empty();
    const pendingHabits = habits.filter((h) => !h.completedToday && !h.isRestDayToday);

    const card = this.habitsSectionEl.createDiv({ cls: 'study-flow-card' });

    const header = card.createDiv({ cls: 'study-flow-today-sec-header' });
    const titleGroup = header.createDiv({ cls: 'study-flow-sec-title-group' });
    const hIcon = titleGroup.createSpan({ cls: 'study-flow-sec-icon' });
    setIcon(hIcon, 'flame');
    titleGroup.createSpan({ text: t('today.habitsTitle'), cls: 'study-flow-sec-heading' });

    const viewAllBtn = header.createEl('button', {
      text: t('tabs.habits'),
      cls: 'study-flow-link-btn',
    });
    viewAllBtn.addEventListener('click', () => this.onSwitchTab('habits'));

    if (habits.length === 0) {
      const emptyRow = card.createDiv({ cls: 'study-flow-today-empty-row' });
      emptyRow.createSpan({ text: t('today.noHabitsConfigured'), cls: 'study-flow-empty-text' });
      return;
    }

    if (pendingHabits.length === 0) {
      const emptyRow = card.createDiv({ cls: 'study-flow-today-empty-row' });
      const eIcon = emptyRow.createSpan({ cls: 'study-flow-empty-icon' });
      setIcon(eIcon, 'flame');
      emptyRow.createSpan({ text: t('today.allHabitsDone'), cls: 'study-flow-empty-text' });
      return;
    }

    const list = card.createDiv({ cls: 'study-flow-today-items-list' });

    pendingHabits.forEach((habit) => {
      const itemRow = list.createDiv({ cls: 'study-flow-today-habit-row' });

      const check = itemRow.createEl('input', {
        type: 'checkbox',
        cls: 'study-flow-task-checkbox',
        attr: { 'aria-label': t('habits.checkboxAria', { name: habit.name }) },
      });
      check.checked = false;
      check.addEventListener('change', () => {
        void (async () => {
          const updatedHabits = await toggleHabitStatus(this.app, this.plugin.settings.habitsFilePath, habit.id, true);
          const updated = updatedHabits.find((h) => h.id === habit.id);
          const currentStreak = updated ? updated.streak : habit.streak;
          new Notice(t('habits.habitFulfilledNotice', { streak: currentStreak }));
          await this.renderHabitsSection();
        })();
      });

      itemRow.createSpan({ cls: 'study-flow-today-item-title', text: habit.name });

      if (habit.streak > 0) {
        const streakBadge = itemRow.createSpan({ cls: 'study-flow-habit-streak-badge' });
        streakBadge.createSpan({ text: `🔥 ${habit.streak}` });
      }

      const pomoBtn = itemRow.createEl('button', {
        cls: 'study-flow-icon-action-btn study-flow-today-quick-pomo-btn',
        attr: {
          'aria-label': t('today.startFocusBtn') || 'Pomodoro',
          title: t('today.startFocusBtn') || 'Pomodoro',
        },
      });
      setIcon(pomoBtn, 'timer');
      pomoBtn.addEventListener('click', (e: MouseEvent) => {
        e.stopPropagation();
        void (async () => {
          await this.plugin.pomodoro.setActiveHabit(habit);
          await this.plugin.pomodoro.start();
          await this.host.switchTab('pomodoro');
        })();
      });
    });
  }

  // --- 4. Repasos Espaciados de Hoy ---

  private async renderSpacedSection(): Promise<void> {
    if (!this.spacedSectionEl) return;
    const seq = ++this.spacedSeq;

    const todayDate = getLocalDateString(new Date());
    const queue = await getSpacedRepetitionQueue(this.app, todayDate, this.plugin);
    if (seq !== this.spacedSeq || !this.spacedSectionEl) return;
    this.spacedSectionEl.empty();
    const dueToday = queue.filter((item) => item.isDueToday);

    const card = this.spacedSectionEl.createDiv({ cls: 'study-flow-card' });

    const header = card.createDiv({ cls: 'study-flow-today-sec-header' });
    const titleGroup = header.createDiv({ cls: 'study-flow-sec-title-group' });
    const sIcon = titleGroup.createSpan({ cls: 'study-flow-sec-icon' });
    setIcon(sIcon, 'book-open');
    titleGroup.createSpan({ text: t('today.spacedRepetitionTitle'), cls: 'study-flow-sec-heading' });

    if (dueToday.length === 0) {
      const emptyRow = card.createDiv({ cls: 'study-flow-today-empty-row' });
      const eIcon = emptyRow.createSpan({ cls: 'study-flow-empty-icon' });
      setIcon(eIcon, 'sparkles');
      emptyRow.createSpan({ text: t('today.noSpacedDue'), cls: 'study-flow-empty-text' });
      return;
    }

    const list = card.createDiv({ cls: 'study-flow-today-items-list' });

    dueToday.forEach((item) => {
      const itemRow = list.createDiv({ cls: 'study-flow-today-spaced-row' });

      const linkEl = itemRow.createEl('a', {
        cls: 'study-flow-today-item-title study-flow-spaced-link',
        text: item.title,
      });
      linkEl.addEventListener('click', (e) => {
        e.preventDefault();
        void this.app.workspace.openLinkText(item.path, '', false);
      });

      const actions = itemRow.createDiv({ cls: 'study-flow-today-spaced-actions' });

      const easyBtn = actions.createEl('button', {
        text: t('today.reviewEasy'),
        cls: 'study-flow-btn-mini is-easy',
        attr: { 'aria-label': t('today.reviewEasy') },
      });
      easyBtn.addEventListener('click', () => {
        void (async () => {
          const nextState = await reviewSpacedNote(this.app, item.file, 'facil', new Date(), this.plugin);
          new Notice(t('spaced.reviewedEasyNotice', { title: item.title, next: `${nextState.nextInterval}d` }));
          await this.renderSpacedSection();
        })();
      });

      const hardBtn = actions.createEl('button', {
        text: t('today.reviewHard'),
        cls: 'study-flow-btn-mini is-hard',
        attr: { 'aria-label': t('today.reviewHard') },
      });
      hardBtn.addEventListener('click', () => {
        void (async () => {
          await reviewSpacedNote(this.app, item.file, 'dificil', new Date(), this.plugin);
          new Notice(t('spaced.reviewedHardNotice', { title: item.title }));
          await this.renderSpacedSection();
        })();
      });
    });
  }
}

