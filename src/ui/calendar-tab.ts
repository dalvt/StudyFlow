import { App, Notice, setIcon, TFile } from 'obsidian';
import type StudyFlowPlugin from '../main';
import type { ActiveTab, TabComponent } from './types';
import {
  CalendarTimeBlock,
  DeadlineItem,
  createDeadlineTask,
  formatDateKey,
  formatMonthYearHeader,
  getCalendarMonthMatrix,
  getTimeBlocksForDate,
  SHORT_DAY_NAMES_ES,
  SHORT_DAY_NAMES_SUN_FIRST_ES,
  SHORT_DAY_NAMES_EN,
  SHORT_DAY_NAMES_SUN_FIRST_EN,
} from '../calendar';
import {
  deleteTaskFromFile,
  toggleTaskCompletionInFile,
} from '../tasks';
import {
  formatDeadlineHuman,
  TaskPriority,
} from '../utils';
import { t, getEffectiveLanguage } from '../i18n/index.ts';
import {
  DayDetailCallbacks,
  DayDetailState,
  renderDayDetailPanel,
} from './calendar-day-detail';
import { CalendarGridComponent } from './calendar-grid';

export class CalendarTab implements TabComponent {
  private app: App;
  private plugin: StudyFlowPlugin;
  private container: HTMLElement | null = null;
  private onSwitchTab: (tab: ActiveTab) => void;

  private calendarViewMode: 'month' | 'week' | 'day' | 'deadlines' = 'month';
  private calendarYear: number = new Date().getFullYear();
  private calendarMonth: number = new Date().getMonth();
  private selectedCalendarDate: string = formatDateKey(new Date());
  private allDeadlines: DeadlineItem[] = [];

  // State for Day Detail Panel
  private isAddingTimeBlock: boolean = false;
  private editingBlockId: string | null = null;
  private isAddingDeadline: boolean = false;
  private isPendingSelectorOpen: boolean = false;
  private selectedPendingTaskIds: Set<string> = new Set();
  private markMigratedInSource: boolean = false;

  private gridComponent: CalendarGridComponent;

  constructor(app: App, plugin: StudyFlowPlugin, onSwitchTab: (tab: ActiveTab) => void) {
    this.app = app;
    this.plugin = plugin;
    this.onSwitchTab = onSwitchTab;

    this.gridComponent = new CalendarGridComponent(this.app, this.plugin, {
      onSelectDate: async (dateStr: string) => {
        this.selectedCalendarDate = dateStr;
        const parts = dateStr.split('-').map(Number);
        if (parts.length === 3) {
          this.calendarYear = parts[0];
          this.calendarMonth = parts[1] - 1;
        }
        if (this.container) await this.render(this.container);
      },
      onRefresh: async () => {
        if (this.container) await this.render(this.container);
      },
      onSwitchTab: (tab: string) => {
        this.onSwitchTab(tab as ActiveTab);
      },
    });
  }

  private getDayDetailState(): DayDetailState {
    return {
      selectedCalendarDate: this.selectedCalendarDate,
      isAddingTimeBlock: this.isAddingTimeBlock,
      editingBlockId: this.editingBlockId,
      isAddingDeadline: this.isAddingDeadline,
      isPendingSelectorOpen: this.isPendingSelectorOpen,
      selectedPendingTaskIds: this.selectedPendingTaskIds,
      markMigratedInSource: this.markMigratedInSource,
    };
  }

  private getDayDetailCallbacks(): DayDetailCallbacks {
    return {
      onSwitchTab: this.onSwitchTab,
      onRefresh: async () => {
        if (this.container) await this.render(this.container);
      },
      onDateChange: async (dateStr: string) => {
        await this.openDate(dateStr);
      },
    };
  }

  public async openDate(dateStr: string, showPendingSelector: boolean = false): Promise<void> {
    this.selectedCalendarDate = dateStr;
    const parts = dateStr.split('-').map(Number);
    if (parts.length === 3) {
      this.calendarYear = parts[0];
      this.calendarMonth = parts[1] - 1;
    }
    if (showPendingSelector) {
      this.isPendingSelectorOpen = true;
    }
    if (this.container) {
      await this.render(this.container);
    }
  }

  public async openTomorrowWithPlanner(): Promise<void> {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const tomorrowStr = formatDateKey(tomorrow);
    await this.openDate(tomorrowStr, true);
  }

  async render(container: HTMLElement): Promise<void> {
    this.container = container;
    container.empty();

    if (this.plugin.taskIndex) {
      this.allDeadlines = this.plugin.taskIndex.getAllDeadlines();
    }

    const card = container.createDiv({ cls: 'study-flow-card study-flow-calendar-main-card' });

    // Top Navigation & Control Bar
    const topBar = card.createDiv({ cls: 'study-flow-calendar-top-bar' });

    // Left: Month/Week/Day Navigation
    const navGroup = topBar.createDiv({ cls: 'study-flow-calendar-nav-group' });
    const prevBtn = navGroup.createEl('button', {
      cls: 'study-flow-header-icon-btn',
      attr: { 'aria-label': t('calendar.prev') },
    });
    setIcon(prevBtn, 'chevron-left');
    prevBtn.addEventListener('click', async () => {
      const parts = this.selectedCalendarDate.split('-').map(Number);
      const d = new Date(parts[0], parts[1] - 1, parts[2]);

      if (this.calendarViewMode === 'day') {
        d.setDate(d.getDate() - 1);
        this.calendarYear = d.getFullYear();
        this.calendarMonth = d.getMonth();
        this.selectedCalendarDate = formatDateKey(d);
      } else if (this.calendarViewMode === 'week') {
        d.setDate(d.getDate() - 7);
        this.calendarYear = d.getFullYear();
        this.calendarMonth = d.getMonth();
        this.selectedCalendarDate = formatDateKey(d);
      } else {
        if (this.calendarMonth === 0) {
          this.calendarMonth = 11;
          this.calendarYear -= 1;
        } else {
          this.calendarMonth -= 1;
        }
      }
      if (this.container) await this.render(this.container);
    });

    const titleText = this.calendarViewMode === 'day'
      ? this.selectedCalendarDate
      : formatMonthYearHeader(this.calendarYear, this.calendarMonth, getEffectiveLanguage());

    navGroup.createEl('span', {
      cls: 'study-flow-calendar-month-title',
      text: titleText,
    });

    const nextBtn = navGroup.createEl('button', {
      cls: 'study-flow-header-icon-btn',
      attr: { 'aria-label': t('calendar.next') },
    });
    setIcon(nextBtn, 'chevron-right');
    nextBtn.addEventListener('click', async () => {
      const parts = this.selectedCalendarDate.split('-').map(Number);
      const d = new Date(parts[0], parts[1] - 1, parts[2]);

      if (this.calendarViewMode === 'day') {
        d.setDate(d.getDate() + 1);
        this.calendarYear = d.getFullYear();
        this.calendarMonth = d.getMonth();
        this.selectedCalendarDate = formatDateKey(d);
      } else if (this.calendarViewMode === 'week') {
        d.setDate(d.getDate() + 7);
        this.calendarYear = d.getFullYear();
        this.calendarMonth = d.getMonth();
        this.selectedCalendarDate = formatDateKey(d);
      } else {
        if (this.calendarMonth === 11) {
          this.calendarMonth = 0;
          this.calendarYear += 1;
        } else {
          this.calendarMonth += 1;
        }
      }
      if (this.container) await this.render(this.container);
    });

    const todayBtn = navGroup.createEl('button', {
      cls: 'study-flow-icon-action-btn-styled study-flow-calendar-today-btn',
      text: t('common.today'),
    });
    todayBtn.addEventListener('click', async () => {
      const now = new Date();
      this.calendarYear = now.getFullYear();
      this.calendarMonth = now.getMonth();
      this.selectedCalendarDate = formatDateKey(now);
      if (this.container) await this.render(this.container);
    });

    // Right: Segmented view toggles (Mes, Semana, Día, Deadlines)
    const viewSwitcher = topBar.createDiv({ cls: 'study-flow-segmented-control' });
    const pendingDlCount = this.allDeadlines.filter((d) => !d.completed).length;
    const viewButtons = [
      { id: 'month' as const, label: t('calendar.viewMonth'), icon: 'calendar' },
      { id: 'week' as const, label: t('calendar.viewWeek'), icon: 'columns' },
      { id: 'day' as const, label: t('calendar.viewDay') || 'Día', icon: 'calendar-days' },
      {
        id: 'deadlines' as const,
        label: t('calendar.viewDeadlines', { count: String(pendingDlCount) }),
        icon: 'alert-circle',
      },
    ];

    viewButtons.forEach((v) => {
      const btn = viewSwitcher.createEl('button', {
        cls: `study-flow-segmented-btn ${this.calendarViewMode === v.id ? 'is-active' : ''}`,
        attr: { 'aria-label': v.label },
      });
      const iconSpan = btn.createSpan();
      setIcon(iconSpan, v.icon);
      btn.createSpan({ text: v.label, cls: 'study-flow-segmented-label' });
      btn.addEventListener('click', async () => {
        this.calendarViewMode = v.id;
        if (this.container) await this.render(this.container);
      });
    });

    // Sub-view router
    if (this.calendarViewMode === 'month') {
      await this.renderCalendarMonthGrid(card, container);
      await renderDayDetailPanel(
        card,
        this.app,
        this.plugin,
        this.getDayDetailState(),
        this.getDayDetailCallbacks()
      );
    } else if (this.calendarViewMode === 'week') {
      await this.gridComponent.renderGrid(card, 'week', this.selectedCalendarDate);
      await renderDayDetailPanel(
        card,
        this.app,
        this.plugin,
        this.getDayDetailState(),
        this.getDayDetailCallbacks()
      );
    } else if (this.calendarViewMode === 'day') {
      await this.gridComponent.renderGrid(card, 'day', this.selectedCalendarDate);
      await renderDayDetailPanel(
        card,
        this.app,
        this.plugin,
        this.getDayDetailState(),
        this.getDayDetailCallbacks()
      );
    } else if (this.calendarViewMode === 'deadlines') {
      await this.renderDeadlinesMasterHub(card, container);
    }
  }

  private async renderCalendarMonthGrid(card: HTMLElement, tabContainer: HTMLElement): Promise<void> {
    const gridWrapper = card.createDiv({ cls: 'study-flow-calendar-wrapper' });

    // Days of Week Header
    const weekStart = this.plugin.settings.weekStartDay || 'monday';
    const lang = getEffectiveLanguage();
    const dayNames = weekStart === 'sunday'
      ? (lang === 'en' ? SHORT_DAY_NAMES_SUN_FIRST_EN : SHORT_DAY_NAMES_SUN_FIRST_ES)
      : (lang === 'en' ? SHORT_DAY_NAMES_EN : SHORT_DAY_NAMES_ES);
    const headerRow = gridWrapper.createDiv({ cls: 'study-flow-calendar-header-row' });
    dayNames.forEach((dayName) => {
      headerRow.createDiv({ cls: 'study-flow-calendar-header-cell', text: dayName });
    });

    // Month Matrix
    const matrix = getCalendarMonthMatrix(this.calendarYear, this.calendarMonth, undefined, weekStart);
    const grid = gridWrapper.createDiv({ cls: 'study-flow-calendar-grid' });

    const dayBlocksMap = new Map<string, CalendarTimeBlock[]>();
    await Promise.all(
      matrix.map(async (cell) => {
        const blocks = await getTimeBlocksForDate(this.app, this.plugin.settings, cell.dateStr);
        dayBlocksMap.set(cell.dateStr, blocks);
      })
    );

    matrix.forEach((cell) => {
      const cellEl = grid.createDiv({
        cls: `study-flow-calendar-cell ${cell.isCurrentMonth ? '' : 'is-other-month'} ${cell.isToday ? 'is-today' : ''} ${cell.dateStr === this.selectedCalendarDate ? 'is-selected' : ''}`,
      });

      const topRow = cellEl.createDiv({ cls: 'study-flow-calendar-cell-top' });
      topRow.createSpan({ text: String(cell.dayNumber), cls: 'study-flow-calendar-day-num' });

      // Badges
      const dayDeadlines = this.allDeadlines.filter((d) => d.dueDate === cell.dateStr && !d.completed);
      const dayBlocks = dayBlocksMap.get(cell.dateStr) || [];

      const badgesWrap = cellEl.createDiv({ cls: 'study-flow-calendar-cell-badges' });

      if (dayDeadlines.length > 0) {
        const hasOverdue = dayDeadlines.some((d) => d.daysRemaining < 0);
        const hasToday = dayDeadlines.some((d) => d.daysRemaining === 0);
        let dCls = 'study-flow-cal-chip is-deadline';
        if (hasOverdue) dCls += ' is-overdue';
        else if (hasToday) dCls += ' is-today';
        const dlChip = badgesWrap.createSpan({
          cls: dCls,
          attr: { title: t('calendar.pendingDeadlinesTooltip', { count: String(dayDeadlines.length) }) },
        });
        const dlIcon = dlChip.createSpan({ cls: 'study-flow-chip-icon' });
        setIcon(dlIcon, 'alert-circle');
        dlChip.createSpan({ text: ` ${dayDeadlines.length}` });
      }

      if (dayBlocks.length > 0) {
        const blChip = badgesWrap.createSpan({
          cls: 'study-flow-cal-chip is-block',
          attr: { title: t('calendar.studyBlocksTooltip', { count: String(dayBlocks.length) }) },
        });
        const blIcon = blChip.createSpan({ cls: 'study-flow-chip-icon' });
        setIcon(blIcon, 'clock');
        blChip.createSpan({ text: ` ${dayBlocks.length}` });
      }

      cellEl.addEventListener('click', async () => {
        this.selectedCalendarDate = cell.dateStr;
        if (!cell.isCurrentMonth) {
          this.calendarYear = cell.year;
          this.calendarMonth = cell.month;
        }
        if (this.container) await this.render(this.container);
      });
    });
  }

  private async renderDeadlinesMasterHub(card: HTMLElement, tabContainer: HTMLElement): Promise<void> {
    const hubWrapper = card.createDiv({ cls: 'study-flow-deadlines-hub' });

    // Header bar
    const hubHeader = hubWrapper.createDiv({ cls: 'study-flow-hub-header' });
    const hubTitle = hubHeader.createDiv({ cls: 'study-flow-hub-title' });
    const dlIcon = hubTitle.createSpan();
    setIcon(dlIcon, 'target');
    hubTitle.createEl('h3', { text: t('calendar.deadlinesHubTitle') });

    const newDlBtn = hubHeader.createEl('button', {
      cls: 'mod-cta study-flow-btn-sm',
    });
    const plusIcon = newDlBtn.createSpan();
    setIcon(plusIcon, 'plus');
    newDlBtn.createSpan({ text: t('calendar.newDeadline') });
    newDlBtn.addEventListener('click', () => {
      this.isAddingDeadline = !this.isAddingDeadline;
      formWrapper.toggleClass('is-hidden', !this.isAddingDeadline);
    });

    // Inline form for master hub
    const formWrapper = hubWrapper.createDiv({
      cls: `study-flow-block-create-form ${this.isAddingDeadline ? '' : 'is-hidden'}`,
    });
    const r1 = formWrapper.createDiv({ cls: 'study-flow-form-row' });
    const titleIn = r1.createEl('input', {
      type: 'text',
      cls: 'study-flow-block-title-input',
      attr: { placeholder: t('calendar.masterHubDeadlinePlaceholder') },
    });
    const dateIn = r1.createEl('input', {
      type: 'date',
      cls: 'study-flow-date-input',
      value: this.selectedCalendarDate,
    });
    const timeIn = r1.createEl('input', {
      type: 'text',
      cls: 'study-flow-time-input',
      attr: { placeholder: t('calendar.deadlineTimePlaceholder') },
    });

    const r2 = formWrapper.createDiv({ cls: 'study-flow-form-row' });
    const prioIn = r2.createEl('select', {
      cls: 'study-flow-select-input dropdown',
      attr: { 'aria-label': t('tasks.priorityName') },
    });
    [
      { val: 'none', label: t('priority.noPriority') },
      { val: 'high', label: t('priority.high') },
      { val: 'medium', label: t('priority.medium') },
      { val: 'low', label: t('priority.low') },
    ].forEach((p) => {
      const opt = prioIn.createEl('option', { value: p.val, text: p.label });
      if (p.val === 'high') opt.selected = true;
    });

    const pomosIn = r2.createEl('input', {
      type: 'number',
      cls: 'study-flow-number-input',
      attr: {
        placeholder: t('calendar.pomodoroEstimatePlaceholder'),
        min: '0',
        max: '20',
        'aria-label': t('calendar.pomodoroEstimateAria'),
      },
    });

    const saveHubDl = r2.createEl('button', {
      cls: 'mod-cta study-flow-btn-sm',
      text: t('calendar.saveDeadlineBtn'),
    });
    const cancelHubDl = r2.createEl('button', {
      cls: 'study-flow-btn-sm',
      text: t('common.cancel'),
    });

    saveHubDl.addEventListener('click', async () => {
      const tVal = titleIn.value.trim();
      const d = dateIn.value.trim();
      if (!tVal || !d) {
        new Notice(t('calendar.enterTitleAndDateNotice'));
        return;
      }
      const ok = await createDeadlineTask(
        this.app,
        this.plugin.settings,
        tVal,
        d,
        timeIn.value.trim() || undefined,
        prioIn.value as TaskPriority,
        pomosIn.value ? parseInt(pomosIn.value, 10) : undefined
      );
      if (ok) {
        this.isAddingDeadline = false;
        new Notice(t('calendar.deadlineCreatedNotice', { date: d }));
        if (this.container) await this.render(this.container);
      }
    });

    cancelHubDl.addEventListener('click', () => {
      this.isAddingDeadline = false;
      formWrapper.addClass('is-hidden');
    });

    // Urgency Groups
    const overdue = this.allDeadlines.filter((d) => !d.completed && d.daysRemaining < 0);
    const dueToday = this.allDeadlines.filter((d) => !d.completed && d.daysRemaining === 0);
    const dueSoon = this.allDeadlines.filter((d) => !d.completed && d.daysRemaining > 0 && d.daysRemaining <= 7);
    const dueLater = this.allDeadlines.filter((d) => !d.completed && d.daysRemaining > 7);
    const completed = this.allDeadlines.filter((d) => d.completed);

    const groups = [
      { key: 'overdue', label: t('calendar.groupOverdue'), icon: 'alert-triangle', items: overdue, cls: 'is-overdue-group' },
      { key: 'today', label: t('calendar.groupToday'), icon: 'alert-circle', items: dueToday, cls: 'is-today-group' },
      { key: 'soon', label: t('calendar.groupSoon'), icon: 'clock', items: dueSoon, cls: 'is-soon-group' },
      { key: 'later', label: t('calendar.groupLater'), icon: 'calendar', items: dueLater, cls: 'is-later-group' },
      { key: 'completed', label: t('calendar.groupCompleted'), icon: 'check-circle-2', items: completed, cls: 'is-completed-group' },
    ];

    if (this.allDeadlines.length === 0) {
      hubWrapper.createDiv({
        cls: 'study-flow-empty-tasks',
        text: t('calendar.noDeadlinesRegistered'),
      });
      return;
    }

    groups.forEach((grp) => {
      if (grp.items.length === 0) return;

      const groupSection = hubWrapper.createDiv({ cls: `study-flow-hub-group ${grp.cls}` });
      const grpHeader = groupSection.createDiv({ cls: 'study-flow-hub-group-header' });
      const grpIcon = grpHeader.createSpan({ cls: 'study-flow-group-icon' });
      setIcon(grpIcon, grp.icon);
      grpHeader.createSpan({ text: ` ${grp.label} (${grp.items.length})`, cls: 'study-flow-hub-group-title' });

      const listEl = groupSection.createDiv({ cls: 'study-flow-deadlines-hub-list' });
      grp.items.forEach((item) => {
        const itemCard = listEl.createDiv({
          cls: `study-flow-deadline-hub-card ${item.completed ? 'is-completed' : ''}`,
        });

        const cb = itemCard.createEl('input', {
          type: 'checkbox',
          cls: 'study-flow-task-cb',
        });
        cb.checked = item.completed;
        cb.addEventListener('change', async () => {
          await toggleTaskCompletionInFile(this.app, item, cb.checked);
          if (this.container) await this.render(this.container);
        });

        const textSpan = itemCard.createSpan({
          text: item.cleanTitle,
          cls: `study-flow-deadline-item-title ${item.completed ? 'is-strikethrough' : ''}`,
        });
        textSpan.addEventListener('click', () => {
          cb.checked = !cb.checked;
          cb.dispatchEvent(new Event('change'));
        });

        const dText = formatDeadlineHuman(item.daysRemaining, item.dueDate);
        let badgeCls = 'study-flow-deadline-badge';
        if (item.daysRemaining < 0) badgeCls += ' is-overdue';
        else if (item.daysRemaining === 0) badgeCls += ' is-today';
        else if (item.daysRemaining <= 3) badgeCls += ' is-soon';
        itemCard.createSpan({ text: dText, cls: badgeCls });

        if (item.dueTime) {
          itemCard.createSpan({ text: `⏰ ${item.dueTime}`, cls: 'study-flow-time-chip' });
        }

        // Source note chip
        const srcFile = this.app.vault.getAbstractFileByPath(item.sourceFile);
        const srcName = srcFile instanceof TFile ? srcFile.basename : item.sourceFile;
        const srcChip = itemCard.createSpan({ text: `#${srcName}`, cls: 'study-flow-source-chip' });
        srcChip.addEventListener('click', () => {
          if (srcFile instanceof TFile) {
            this.app.workspace.getLeaf(false).openFile(srcFile);
          }
        });

        // Quick Focus
        const pomoBtn = itemCard.createEl('button', {
          cls: 'study-flow-icon-action-btn',
          attr: { 'aria-label': t('tasks.focusPomodoroTooltip') },
        });
        setIcon(pomoBtn, 'timer');
        pomoBtn.addEventListener('click', async () => {
          this.plugin.pomodoro.setActiveTask({
            id: item.id,
            text: item.text,
            sourceFile: item.sourceFile,
          });
          this.onSwitchTab('pomodoro');
        });

        // Delete
        const delBtn = itemCard.createEl('button', {
          cls: 'study-flow-icon-action-btn',
          attr: { 'aria-label': t('calendar.deleteDeadlineTooltip') },
        });
        setIcon(delBtn, 'trash-2');
        delBtn.addEventListener('click', async () => {
          await deleteTaskFromFile(this.app, item);
          new Notice(t('calendar.deadlineDeletedNotice'));
          if (this.container) await this.render(this.container);
        });
      });
    });
  }

  public onTasksChanged(): void {
    if (this.plugin.taskIndex) {
      this.allDeadlines = this.plugin.taskIndex.getAllDeadlines();
    }
    if (this.container) {
      void this.render(this.container);
    }
  }

  destroy(): void {
    this.container = null;
  }
}
