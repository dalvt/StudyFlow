import { App, Notice, setIcon, setTooltip, TFile } from 'obsidian';
import type StudyFlowPlugin from '../main.ts';
import type { ActiveTab, TabComponent } from './types.ts';
import { getTimeBlocksForDate, type CalendarTimeBlock, type DeadlineItem } from '../calendar.ts';
import { toggleTaskCompletionInFile, type TaskRecord } from '../tasks.ts';
import { loadHabitsFromFile, toggleHabitStatus, type HabitItem } from '../habits.ts';
import {
  getSpacedRepetitionQueue,
  reviewSpacedNote,
  type SpacedRepetitionNoteItem,
} from '../spaced-repetition.ts';
import type { PomodoroStatus } from '../pomodoro.ts';
import { extractTagsFromText, getLocalDateString, formatDeadlineHuman, getDailyNotePath } from '../utils.ts';
import { t } from '../i18n/index.ts';

import {
  findCurrentOrNextTimeBlock,
  filterTodayAndOverdueTasks,
  filterUpcomingDeadlines,
  type CurrentOrNextBlock,
} from '../today-utils.ts';

export {
  findCurrentOrNextTimeBlock,
  filterTodayAndOverdueTasks,
  filterUpcomingDeadlines,
  type CurrentOrNextBlock,
};

export class TodayTab implements TabComponent {
  private app: App;
  private plugin: StudyFlowPlugin;
  private onSwitchTab: (tab: ActiveTab) => void;
  private container: HTMLElement | null = null;

  // Incremental Section Elements
  private nowNextSectionEl: HTMLElement | null = null;
  private miniTimerSectionEl: HTMLElement | null = null;
  private miniTimerTimeEl: HTMLElement | null = null;
  private miniTimerModeEl: HTMLElement | null = null;
  private miniTimerPlayBtn: HTMLElement | null = null;
  private miniTimerTaskLabel: HTMLElement | null = null;
  private todayTasksSectionEl: HTMLElement | null = null;
  private habitsSectionEl: HTMLElement | null = null;
  private spacedSectionEl: HTMLElement | null = null;
  private deadlinesSectionEl: HTMLElement | null = null;

  constructor(app: App, plugin: StudyFlowPlugin, onSwitchTab: (tab: ActiveTab) => void) {
    this.app = app;
    this.plugin = plugin;
    this.onSwitchTab = onSwitchTab;
  }

  public async render(container: HTMLElement): Promise<void> {
    this.container = container;
    container.empty();
    container.addClass('study-flow-today-tab');

    const cfg = this.plugin.settings.todaySections || {
      showNowNext: true,
      showMiniTimer: true,
      showTodayTasks: true,
      showHabits: true,
      showSpacedRepetition: true,
      showUpcomingDeadlines: true,
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

    // 3. Section: Mini Timer
    if (cfg.showMiniTimer) {
      this.miniTimerSectionEl = container.createDiv({ cls: 'study-flow-today-section study-flow-today-timer-sec' });
      this.renderMiniTimerSection();
    }

    // 4. Section: Tareas de Hoy y Vencidas
    if (cfg.showTodayTasks) {
      this.todayTasksSectionEl = container.createDiv({ cls: 'study-flow-today-section study-flow-today-tasks-sec' });
      this.renderTodayTasksSection();
    }

    // 5. Section: Hábitos Pendientes
    if (cfg.showHabits) {
      this.habitsSectionEl = container.createDiv({ cls: 'study-flow-today-section study-flow-today-habits-sec' });
      await this.renderHabitsSection();
    }

    // 6. Section: Repasos Espaciados
    if (cfg.showSpacedRepetition) {
      this.spacedSectionEl = container.createDiv({ cls: 'study-flow-today-section study-flow-today-spaced-sec' });
      await this.renderSpacedSection();
    }

    // 7. Section: Próximas Entregas
    if (cfg.showUpcomingDeadlines) {
      this.deadlinesSectionEl = container.createDiv({ cls: 'study-flow-today-section study-flow-today-deadlines-sec' });
      this.renderDeadlinesSection();
    }
  }

  // --- Incremental Updates ---

  public onPomodoroTick(status: PomodoroStatus): void {
    if (!this.miniTimerSectionEl) return;
    this.updateMiniTimerDisplay(status);
  }

  public onTasksChanged(): void {
    if (this.todayTasksSectionEl) {
      this.renderTodayTasksSection();
    }
    if (this.deadlinesSectionEl) {
      this.renderDeadlinesSection();
    }
  }

  public async onHabitsChanged(): Promise<void> {
    if (this.habitsSectionEl) {
      await this.renderHabitsSection();
    }
  }

  public destroy(): void {
    this.container = null;
    this.nowNextSectionEl = null;
    this.miniTimerSectionEl = null;
    this.todayTasksSectionEl = null;
    this.habitsSectionEl = null;
    this.spacedSectionEl = null;
    this.deadlinesSectionEl = null;
  }

  // --- 1. Ahora / Siguiente ---

  private async renderNowNextSection(): Promise<void> {
    if (!this.nowNextSectionEl) return;
    this.nowNextSectionEl.empty();

    const todayDate = getLocalDateString(new Date());
    const blocks = await getTimeBlocksForDate(this.app, this.plugin.settings, todayDate);
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
    const badge = header.createSpan({
      cls: `study-flow-today-badge ${isNow ? 'is-now' : 'is-next'}`,
      text: isNow ? t('today.nowBadge') : t('today.nextBadge'),
    });
    const timeSpan = header.createSpan({
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

    startBtn.addEventListener('click', async () => {
      if (matchedSubject) {
        await this.plugin.pomodoro.setActiveSubject(matchedSubject);
      }
      const dailyPath = getDailyNotePath(this.plugin.settings, todayDate);
      await this.plugin.pomodoro.setActiveTask({
        id: `block-${block.id}`,
        text: block.title,
        sourceFile: dailyPath,
      });
      const status = this.plugin.pomodoro.getStatus();
      if (status.state === 'idle' || status.state === 'paused') {
        await this.plugin.pomodoro.start();
      }
      this.onSwitchTab('pomodoro');
    });
  }

  // --- 2. Mini Timer ---

  private renderMiniTimerSection(): void {
    if (!this.miniTimerSectionEl) return;
    this.miniTimerSectionEl.empty();

    const status = this.plugin.pomodoro.getStatus();
    const card = this.miniTimerSectionEl.createDiv({ cls: 'study-flow-card study-flow-today-minitimer-card' });

    const topRow = card.createDiv({ cls: 'study-flow-today-timer-top' });
    this.miniTimerModeEl = topRow.createSpan({
      cls: `study-flow-timer-mode-badge ${status.mode === 'work' ? 'is-work' : 'is-break'}`,
      text: status.mode === 'work' ? t('pomodoro.modeFocus') : t('pomodoro.modeBreak'),
    });

    const timerControls = topRow.createDiv({ cls: 'study-flow-today-timer-controls' });

    const mins = Math.floor(status.remainingSeconds / 60);
    const secs = status.remainingSeconds % 60;
    this.miniTimerTimeEl = timerControls.createSpan({
      cls: 'study-flow-today-timer-digits',
      text: `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`,
    });

    this.miniTimerPlayBtn = timerControls.createEl('button', {
      cls: 'study-flow-minitimer-btn clickable-icon',
      attr: { 'aria-label': status.state === 'running' ? t('common.pause') : t('common.start') },
    });
    setIcon(this.miniTimerPlayBtn, status.state === 'running' ? 'pause' : 'play');

    this.miniTimerPlayBtn.addEventListener('click', async (e: MouseEvent) => {
      e.stopPropagation();
      const current = this.plugin.pomodoro.getStatus();
      if (current.state === 'running') {
        await this.plugin.pomodoro.pause();
      } else {
        await this.plugin.pomodoro.start();
      }
    });

    const taskRow = card.createDiv({ cls: 'study-flow-today-timer-task-row' });
    const tIcon = taskRow.createSpan({ cls: 'study-flow-task-icon' });
    setIcon(tIcon, 'target');

    this.miniTimerTaskLabel = taskRow.createSpan({
      cls: 'study-flow-today-timer-task-text',
      text: status.activeTask?.text || t('today.noActiveTask'),
    });

    card.addEventListener('click', (e) => {
      if ((e.target as HTMLElement).closest('.study-flow-minitimer-btn')) return;
      this.onSwitchTab('pomodoro');
    });
  }

  private updateMiniTimerDisplay(status: PomodoroStatus): void {
    if (this.miniTimerTimeEl) {
      const mins = Math.floor(status.remainingSeconds / 60);
      const secs = status.remainingSeconds % 60;
      this.miniTimerTimeEl.setText(`${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`);
    }

    if (this.miniTimerModeEl) {
      this.miniTimerModeEl.setText(status.mode === 'work' ? t('pomodoro.modeFocus') : t('pomodoro.modeBreak'));
      this.miniTimerModeEl.toggleClass('is-work', status.mode === 'work');
      this.miniTimerModeEl.toggleClass('is-break', status.mode !== 'work');
    }

    if (this.miniTimerPlayBtn) {
      this.miniTimerPlayBtn.empty();
      setIcon(this.miniTimerPlayBtn, status.state === 'running' ? 'pause' : 'play');
      this.miniTimerPlayBtn.setAttribute(
        'aria-label',
        status.state === 'running' ? t('common.pause') : t('common.start')
      );
    }

    if (this.miniTimerTaskLabel) {
      this.miniTimerTaskLabel.setText(status.activeTask?.text || t('today.noActiveTask'));
    }
  }

  // --- 3. Tareas de Hoy y Vencidas ---

  private renderTodayTasksSection(): void {
    if (!this.todayTasksSectionEl) return;
    this.todayTasksSectionEl.empty();

    const todayDate = getLocalDateString(new Date());
    const allTasks = this.plugin.taskIndex?.getAllTasks() || [];
    const todayTasks = filterTodayAndOverdueTasks(allTasks, todayDate, 5);

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

    if (todayTasks.length === 0) {
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
      });
      check.checked = Boolean(task.completed);

      const titleEl = itemRow.createSpan({
        cls: `study-flow-today-item-title ${task.completed ? 'is-strikethrough' : ''}`,
        text: task.text,
      });

      check.addEventListener('change', async () => {
        titleEl.toggleClass('is-strikethrough', check.checked);
        itemRow.toggleClass('is-done', check.checked);
        task.completed = check.checked;
        await toggleTaskCompletionInFile(this.app, task, check.checked);
        new Notice(check.checked ? t('tasks.markedCompletedNotice') : t('tasks.unmarkedNotice'));
      });

      titleEl.addEventListener('click', () => {
        check.checked = !check.checked;
        check.dispatchEvent(new Event('change'));
      });

      if (task.daysRemaining !== undefined && task.daysRemaining < 0) {
        const badge = itemRow.createSpan({ cls: 'study-flow-deadline-badge is-overdue' });
        const bIcon = badge.createSpan({ cls: 'study-flow-badge-icon' });
        setIcon(bIcon, 'alert-circle');
        badge.createSpan({
          text: t('today.daysOverdue', { days: String(Math.abs(task.daysRemaining)) }),
        });
      } else if (task.daysRemaining === 0 || task.dueDate === todayDate) {
        const badge = itemRow.createSpan({ cls: 'study-flow-deadline-badge is-today' });
        const bIcon = badge.createSpan({ cls: 'study-flow-badge-icon' });
        setIcon(bIcon, 'clock');
        badge.createSpan({ text: t('today.dueToday') });
      }
    });
  }

  // --- 4. Hábitos Pendientes ---

  private async renderHabitsSection(): Promise<void> {
    if (!this.habitsSectionEl) return;
    this.habitsSectionEl.empty();

    const habits = await loadHabitsFromFile(this.app, this.plugin.settings.habitsFilePath);
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
      });
      check.checked = false;
      check.addEventListener('change', async () => {
        await toggleHabitStatus(this.app, this.plugin.settings.habitsFilePath, habit.id, true);
        new Notice(t('habits.habitFulfilledNotice', { streak: habit.streak + 1 }));
        await this.renderHabitsSection();
      });

      itemRow.createSpan({ cls: 'study-flow-today-item-title', text: habit.name });

      if (habit.streak > 0) {
        const streakBadge = itemRow.createSpan({ cls: 'study-flow-habit-streak-badge' });
        streakBadge.createSpan({ text: `🔥 ${habit.streak}` });
      }
    });
  }

  // --- 5. Repasos Espaciados de Hoy ---

  private async renderSpacedSection(): Promise<void> {
    if (!this.spacedSectionEl) return;
    this.spacedSectionEl.empty();

    const todayDate = getLocalDateString(new Date());
    const queue = await getSpacedRepetitionQueue(this.app, todayDate, this.plugin);
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
      easyBtn.addEventListener('click', async () => {
        const nextState = await reviewSpacedNote(this.app, item.file, 'facil', new Date(), this.plugin);
        new Notice(t('spaced.reviewedEasyNotice', { title: item.title, next: `${nextState.nextInterval}d` }));
        await this.renderSpacedSection();
      });

      const hardBtn = actions.createEl('button', {
        text: t('today.reviewHard'),
        cls: 'study-flow-btn-mini is-hard',
        attr: { 'aria-label': t('today.reviewHard') },
      });
      hardBtn.addEventListener('click', async () => {
        await reviewSpacedNote(this.app, item.file, 'dificil', new Date(), this.plugin);
        new Notice(t('spaced.reviewedHardNotice', { title: item.title }));
        await this.renderSpacedSection();
      });
    });
  }

  // --- 6. Próximas Entregas ---

  private renderDeadlinesSection(): void {
    if (!this.deadlinesSectionEl) return;
    this.deadlinesSectionEl.empty();

    const allDeadlines = this.plugin.taskIndex?.getAllDeadlines() || [];
    const topDeadlines = filterUpcomingDeadlines(allDeadlines, 3);

    const card = this.deadlinesSectionEl.createDiv({ cls: 'study-flow-card' });

    const header = card.createDiv({ cls: 'study-flow-today-sec-header' });
    const titleGroup = header.createDiv({ cls: 'study-flow-sec-title-group' });
    const dIcon = titleGroup.createSpan({ cls: 'study-flow-sec-icon' });
    setIcon(dIcon, 'alert-circle');
    titleGroup.createSpan({ text: t('today.deadlinesTitle'), cls: 'study-flow-sec-heading' });

    const viewCalBtn = header.createEl('button', {
      text: t('tabs.calendar'),
      cls: 'study-flow-link-btn',
    });
    viewCalBtn.addEventListener('click', () => this.onSwitchTab('calendar'));

    if (topDeadlines.length === 0) {
      const emptyRow = card.createDiv({ cls: 'study-flow-today-empty-row' });
      const eIcon = emptyRow.createSpan({ cls: 'study-flow-empty-icon' });
      setIcon(eIcon, 'check-check');
      emptyRow.createSpan({ text: t('today.noUpcomingDeadlines'), cls: 'study-flow-empty-text' });
      return;
    }

    const list = card.createDiv({ cls: 'study-flow-today-items-list' });

    topDeadlines.forEach((item) => {
      const itemRow = list.createDiv({ cls: 'study-flow-today-deadline-row study-flow-clickable-row' });
      itemRow.addEventListener('click', () => {
        this.onSwitchTab('calendar');
      });

      itemRow.createSpan({
        cls: 'study-flow-today-item-title',
        text: item.cleanTitle,
      });

      const badge = itemRow.createSpan({
        cls: `study-flow-deadline-badge ${item.daysRemaining < 0 ? 'is-overdue' : (item.daysRemaining === 0 ? 'is-today' : '')}`,
      });
      const bIcon = badge.createSpan({ cls: 'study-flow-badge-icon' });
      setIcon(bIcon, item.daysRemaining < 0 ? 'alert-circle' : 'clock');
      badge.createSpan({
        text: formatDeadlineHuman(item.daysRemaining, item.dueDate),
      });
    });
  }
}
