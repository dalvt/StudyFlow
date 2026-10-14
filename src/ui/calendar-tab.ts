import { App, Notice, setIcon, TFile } from 'obsidian';
import type StudyFlowPlugin from '../main';
import type { ActiveTab, TabComponent } from './types';
import {
  CalendarTimeBlock,
  DeadlineItem,
  calculateBlockDurationMinutes,
  createDeadlineTask,
  deleteTimeBlock,
  formatDateKey,
  formatLongDate,
  formatMonthYearHeader,
  getCalendarMonthMatrix,
  getTimeBlocksForDate,
  getWeekDays,
  saveTimeBlock,
  SHORT_DAY_NAMES_ES,
  SHORT_DAY_NAMES_SUN_FIRST_ES,
  SHORT_DAY_NAMES_EN,
  SHORT_DAY_NAMES_SUN_FIRST_EN,
  syncTimeBlocksToDailyNote,
  toggleTimeBlockCompletion,
} from '../calendar';
import {
  deleteTaskFromFile,
  toggleTaskCompletionInFile,
} from '../tasks';
import {
  appendTaskToMarkdownSection,
  formatDeadlineHuman,
  getDailyNotePath,
  getOrCreateFile,
  PendingTaskItem,
  TaskPriority,
} from '../utils';
import { t, getEffectiveLanguage } from '../i18n/index.ts';

export class CalendarTab implements TabComponent {
  private app: App;
  private plugin: StudyFlowPlugin;
  private container: HTMLElement | null = null;
  private onSwitchTab: (tab: ActiveTab) => void;

  private calendarViewMode: 'month' | 'week' | 'deadlines' = 'month';
  private calendarYear: number = new Date().getFullYear();
  private calendarMonth: number = new Date().getMonth();
  private selectedCalendarDate: string = formatDateKey(new Date());
  private allDeadlines: DeadlineItem[] = [];

  private isAddingTimeBlock: boolean = false;
  private editingBlockId: string | null = null;
  private isAddingDeadline: boolean = false;

  // Fusion with NextDayPlannerModal: Pending tasks selector
  private isPendingSelectorOpen: boolean = false;
  private selectedPendingTaskIds: Set<string> = new Set();
  private markMigratedInSource: boolean = false;

  constructor(app: App, plugin: StudyFlowPlugin, onSwitchTab: (tab: ActiveTab) => void) {
    this.app = app;
    this.plugin = plugin;
    this.onSwitchTab = onSwitchTab;
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

    // Left: Month/Week Navigation
    const navGroup = topBar.createDiv({ cls: 'study-flow-calendar-nav-group' });
    const prevBtn = navGroup.createEl('button', {
      cls: 'study-flow-header-icon-btn',
      attr: { 'aria-label': t('calendar.prev') },
    });
    setIcon(prevBtn, 'chevron-left');
    prevBtn.addEventListener('click', async () => {
      if (this.calendarViewMode === 'week') {
        const parts = this.selectedCalendarDate.split('-').map(Number);
        const d = new Date(parts[0], parts[1] - 1, parts[2]);
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

    navGroup.createEl('span', {
      cls: 'study-flow-calendar-month-title',
      text: formatMonthYearHeader(this.calendarYear, this.calendarMonth, getEffectiveLanguage()),
    });

    const nextBtn = navGroup.createEl('button', {
      cls: 'study-flow-header-icon-btn',
      attr: { 'aria-label': t('calendar.next') },
    });
    setIcon(nextBtn, 'chevron-right');
    nextBtn.addEventListener('click', async () => {
      if (this.calendarViewMode === 'week') {
        const parts = this.selectedCalendarDate.split('-').map(Number);
        const d = new Date(parts[0], parts[1] - 1, parts[2]);
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

    // Right: Segmented view toggles (Mes, Semana, Deadlines)
    const viewSwitcher = topBar.createDiv({ cls: 'study-flow-segmented-control' });
    const pendingDlCount = this.allDeadlines.filter((d) => !d.completed).length;
    const viewButtons = [
      { id: 'month' as const, label: t('calendar.viewMonth'), icon: 'calendar' },
      { id: 'week' as const, label: t('calendar.viewWeek'), icon: 'columns' },
      { id: 'deadlines' as const, label: t('calendar.viewDeadlines', { count: String(pendingDlCount) }), icon: 'alert-circle' },
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
      await this.renderDayDetailPanel(card, container);
    } else if (this.calendarViewMode === 'week') {
      await this.renderCalendarWeekView(card, container);
      await this.renderDayDetailPanel(card, container);
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

  private async renderCalendarWeekView(card: HTMLElement, tabContainer: HTMLElement): Promise<void> {
    const weekWrapper = card.createDiv({ cls: 'study-flow-week-wrapper' });
    const parts = this.selectedCalendarDate.split('-').map(Number);
    const refDate = new Date(parts[0], parts[1] - 1, parts[2]);
    const weekStart = this.plugin.settings.weekStartDay || 'monday';
    const weekDays = getWeekDays(refDate, weekStart, getEffectiveLanguage());

    const weekGrid = weekWrapper.createDiv({ cls: 'study-flow-week-grid' });

    const weekBlocksMap = new Map<string, CalendarTimeBlock[]>();
    await Promise.all(
      weekDays.map(async (day) => {
        const blocks = await getTimeBlocksForDate(this.app, this.plugin.settings, day.dateStr);
        weekBlocksMap.set(day.dateStr, blocks);
      })
    );

    weekDays.forEach((day) => {
      const isSelected = day.dateStr === this.selectedCalendarDate;
      const dayCard = weekGrid.createDiv({
        cls: `study-flow-week-day-card ${day.isToday ? 'is-today' : ''} ${isSelected ? 'is-selected' : ''}`,
      });

      const header = dayCard.createDiv({ cls: 'study-flow-week-day-header' });
      header.createSpan({ text: day.shortDay, cls: 'study-flow-week-day-name' });
      header.createSpan({ text: String(day.dayNumber), cls: 'study-flow-week-day-num' });

      // Badges
      const dayDeadlines = this.allDeadlines.filter((d) => d.dueDate === day.dateStr && !d.completed);
      const dayBlocks = weekBlocksMap.get(day.dateStr) || [];

      const badgesWrap = dayCard.createDiv({ cls: 'study-flow-calendar-cell-badges' });
      if (dayDeadlines.length > 0) {
        const dlChip = badgesWrap.createSpan({
          cls: 'study-flow-cal-chip is-deadline',
        });
        const dlIcon = dlChip.createSpan({ cls: 'study-flow-chip-icon' });
        setIcon(dlIcon, 'alert-circle');
        dlChip.createSpan({ text: ` ${dayDeadlines.length}` });
      }
      if (dayBlocks.length > 0) {
        const blChip = badgesWrap.createSpan({
          cls: 'study-flow-cal-chip is-block',
        });
        const blIcon = blChip.createSpan({ cls: 'study-flow-chip-icon' });
        setIcon(blIcon, 'clock');
        blChip.createSpan({ text: ` ${dayBlocks.length}` });
      }

      // Blocks preview
      const previewList = dayCard.createDiv({ cls: 'study-flow-week-blocks-preview' });
      if (dayBlocks.length === 0) {
        previewList.createDiv({ text: t('calendar.weekFree'), cls: 'study-flow-week-empty-label' });
      } else {
        dayBlocks.slice(0, 3).forEach((b) => {
          previewList.createDiv({
            text: `${b.startTime} ${b.title}`,
            cls: `study-flow-week-block-item ${b.completed ? 'is-completed' : ''}`,
          });
        });
        if (dayBlocks.length > 3) {
          previewList.createDiv({
            text: t('calendar.moreItems', { count: String(dayBlocks.length - 3) }),
            cls: 'study-flow-week-more-label',
          });
        }
      }

      dayCard.addEventListener('click', async () => {
        this.selectedCalendarDate = day.dateStr;
        if (this.container) await this.render(this.container);
      });
    });
  }

  private async renderDayDetailPanel(parentCard: HTMLElement, tabContainer: HTMLElement): Promise<void> {
    const detailPanel = parentCard.createDiv({ cls: 'study-flow-day-detail-panel' });

    // Panel Header
    const detailHeader = detailPanel.createDiv({ cls: 'study-flow-day-detail-header' });
    const titleWrap = detailHeader.createDiv({ cls: 'study-flow-day-detail-title-wrap' });
    const calIcon = titleWrap.createSpan({ cls: 'study-flow-section-icon' });
    setIcon(calIcon, 'calendar');
    titleWrap.createEl('h3', {
      text: formatLongDate(this.selectedCalendarDate, getEffectiveLanguage()),
      cls: 'study-flow-day-detail-title',
    });

    const headerActions = detailHeader.createDiv({ cls: 'study-flow-day-header-actions' });

    // Plan Pending Tasks Toggle Button (Fusion with NextDayPlannerModal)
    const planPendingBtn = headerActions.createEl('button', {
      cls: `study-flow-icon-action-btn-styled ${this.isPendingSelectorOpen ? 'is-active' : ''}`,
      attr: { 'aria-label': t('calendar.openPendingSelectorTooltip') },
    });
    const planIcon = planPendingBtn.createSpan();
    setIcon(planIcon, 'list-checks');
    planPendingBtn.createSpan({
      text: this.isPendingSelectorOpen ? t('calendar.hidePending') : t('calendar.planPending'),
    });
    planPendingBtn.addEventListener('click', async () => {
      this.isPendingSelectorOpen = !this.isPendingSelectorOpen;
      if (this.container) await this.render(this.container);
    });

    // Sync to Daily Note Button
    const syncDailyBtn = headerActions.createEl('button', {
      cls: 'study-flow-icon-action-btn-styled',
      attr: { 'aria-label': t('calendar.syncDailyTooltip') },
    });
    const syncIcon = syncDailyBtn.createSpan();
    setIcon(syncIcon, 'file-output');
    syncDailyBtn.createSpan({ text: t('calendar.syncDaily') });
    syncDailyBtn.addEventListener('click', async () => {
      const blocks = await getTimeBlocksForDate(this.app, this.plugin.settings, this.selectedCalendarDate);
      if (blocks.length === 0) {
        new Notice(t('calendar.noBlocksToSyncNotice'));
        return;
      }
      const ok = await syncTimeBlocksToDailyNote(
        this.app,
        this.plugin.settings,
        this.selectedCalendarDate,
        blocks
      );
      if (ok) {
        const dailyPath = getDailyNotePath(this.plugin.settings, this.selectedCalendarDate);
        new Notice(t('calendar.blocksSyncedNotice', { path: dailyPath }));
      } else {
        new Notice(t('calendar.blocksSyncErrorNotice'));
      }
    });

    // Open Daily Note Button
    const openDailyBtn = headerActions.createEl('button', {
      cls: 'study-flow-header-icon-btn',
      attr: { 'aria-label': t('calendar.openDailyTooltip') },
    });
    setIcon(openDailyBtn, 'file-text');
    openDailyBtn.addEventListener('click', async () => {
      const dailyPath = getDailyNotePath(this.plugin.settings, this.selectedCalendarDate);
      const file = await getOrCreateFile(this.app, dailyPath, `# ${this.selectedCalendarDate}\n\n`);
      await this.app.workspace.getLeaf(false).openFile(file);
    });

    // Columns: Time Blocking, Deadlines, and Pending Tasks Selector
    const contentColumns = detailPanel.createDiv({ cls: 'study-flow-day-columns' });

    // === Column 1: Time Blocking ===
    const timeBlocksCol = contentColumns.createDiv({ cls: 'study-flow-day-column' });
    const tbHeader = timeBlocksCol.createDiv({ cls: 'study-flow-column-header' });
    const tbTitle = tbHeader.createDiv({ cls: 'study-flow-column-title' });
    const tbIcon = tbTitle.createSpan();
    setIcon(tbIcon, 'clock');
    tbTitle.createSpan({ text: t('calendar.timeBlocksTitle') });

    const addBlockBtn = tbHeader.createEl('button', {
      cls: 'study-flow-icon-action-btn-styled',
      attr: { 'aria-label': t('calendar.addBlockTooltip') },
    });
    const addBlockIcon = addBlockBtn.createSpan();
    setIcon(addBlockIcon, 'plus');
    addBlockBtn.createSpan({ text: t('calendar.newBlock') });
    addBlockBtn.addEventListener('click', () => {
      this.isAddingTimeBlock = !this.isAddingTimeBlock;
      if (this.isAddingTimeBlock) {
        this.editingBlockId = null;
        saveBlockBtn.setText(t('common.save'));
        titleInput.value = '';
        noteInput.value = '';
      }
      formWrapper.toggleClass('is-hidden', !this.isAddingTimeBlock);
    });

    // Inline Add Block Form
    const formWrapper = timeBlocksCol.createDiv({
      cls: `study-flow-block-create-form ${this.isAddingTimeBlock ? '' : 'is-hidden'}`,
    });
    const formRow1 = formWrapper.createDiv({ cls: 'study-flow-form-row' });
    const startInput = formRow1.createEl('input', {
      type: 'text',
      cls: 'study-flow-time-input',
      value: '09:00',
      attr: { placeholder: '09:00' },
    });
    formRow1.createSpan({ text: '—', cls: 'study-flow-time-sep' });
    const endInput = formRow1.createEl('input', {
      type: 'text',
      cls: 'study-flow-time-input',
      value: '10:30',
      attr: { placeholder: '10:30' },
    });
    const titleInput = formRow1.createEl('input', {
      type: 'text',
      cls: 'study-flow-block-title-input',
      attr: { placeholder: t('calendar.blockTitlePlaceholder') },
    });

    const formRow2 = formWrapper.createDiv({ cls: 'study-flow-form-row' });
    const noteInput = formRow2.createEl('input', {
      type: 'text',
      cls: 'study-flow-block-note-input',
      attr: { placeholder: t('calendar.blockNotePlaceholder') },
    });
    const saveBlockBtn = formRow2.createEl('button', {
      cls: 'mod-cta study-flow-btn-sm',
      text: t('common.save'),
    });
    const cancelBlockBtn = formRow2.createEl('button', {
      cls: 'study-flow-btn-sm',
      text: t('common.cancel'),
    });

    saveBlockBtn.addEventListener('click', async () => {
      const title = titleInput.value.trim();
      const startTime = startInput.value.trim();
      const endTime = endInput.value.trim();
      if (!title || !startTime || !endTime) {
        new Notice(t('calendar.completeTimeFieldsNotice'));
        return;
      }
      const blockId = this.editingBlockId || String(Date.now());
      const newBlock: CalendarTimeBlock = {
        id: blockId,
        date: this.selectedCalendarDate,
        startTime,
        endTime,
        title,
        linkedNote: noteInput.value.trim() || undefined,
        completed: false,
      };
      await saveTimeBlock(this.plugin, newBlock);
      this.isAddingTimeBlock = false;
      this.editingBlockId = null;
      new Notice(t('calendar.blockSavedNotice', { title }));
      if (this.container) await this.render(this.container);
    });

    cancelBlockBtn.addEventListener('click', () => {
      this.isAddingTimeBlock = false;
      this.editingBlockId = null;
      saveBlockBtn.setText(t('common.save'));
      formWrapper.addClass('is-hidden');
    });

    // Time Blocks List
    const blocks = await getTimeBlocksForDate(this.app, this.plugin.settings, this.selectedCalendarDate);
    const blocksListEl = timeBlocksCol.createDiv({ cls: 'study-flow-blocks-list' });

    if (blocks.length === 0) {
      blocksListEl.createDiv({
        cls: 'study-flow-empty-tasks',
        text: t('calendar.noBlocksForDay'),
      });
    } else {
      blocks.forEach((block) => {
        const blockCard = blocksListEl.createDiv({
          cls: `study-flow-timeblock-card ${block.completed ? 'is-completed' : ''}`,
        });

        // Checkbox
        const cb = blockCard.createEl('input', {
          type: 'checkbox',
          cls: 'study-flow-timeblock-cb',
        });
        cb.checked = !!block.completed;
        cb.addEventListener('change', async () => {
          await toggleTimeBlockCompletion(this.plugin, this.selectedCalendarDate, block.id, cb.checked);
          if (this.container) await this.render(this.container);
        });

        // Time range badge
        const duration = calculateBlockDurationMinutes(block.startTime, block.endTime);
        const durText = duration > 0 ? ` (${duration}m)` : '';
        blockCard.createSpan({
          text: `${block.startTime} — ${block.endTime}${durText}`,
          cls: 'study-flow-timeblock-badge',
        });

        // Title
        blockCard.createSpan({
          text: block.title,
          cls: `study-flow-timeblock-title ${block.completed ? 'is-strikethrough' : ''}`,
        });

        // Linked Note
        if (block.linkedNote) {
          const noteBtn = blockCard.createEl('button', {
            cls: 'study-flow-timeblock-note-link',
            attr: { 'aria-label': t('calendar.openLinkedNoteTooltip') },
          });
          const noteIcon = noteBtn.createSpan();
          setIcon(noteIcon, 'file-text');
          noteBtn.createSpan({ text: block.linkedNote.replace(/[\[\]]/g, '').trim() });
          noteBtn.addEventListener('click', () => {
            const raw = block.linkedNote?.replace(/[\[\]]/g, '').trim();
            if (raw) this.app.workspace.openLinkText(raw, '', false);
          });
        }

        // Action: Pomodoro Focus
        const pomoBtn = blockCard.createEl('button', {
          cls: 'study-flow-icon-action-btn',
          attr: { 'aria-label': t('calendar.focusBlockTooltip') },
        });
        setIcon(pomoBtn, 'timer');
        pomoBtn.addEventListener('click', async () => {
          this.plugin.pomodoro.setActiveTask({
            id: block.id,
            text: `${block.title} [${block.startTime} - ${block.endTime}]`,
            sourceFile: getDailyNotePath(this.plugin.settings, this.selectedCalendarDate),
          });
          this.onSwitchTab('pomodoro');
        });

        // Action: Edit Block
        const editBtn = blockCard.createEl('button', {
          cls: 'study-flow-icon-action-btn',
          attr: { 'aria-label': t('calendar.editBlockTooltip') },
        });
        setIcon(editBtn, 'pencil');
        editBtn.addEventListener('click', () => {
          this.editingBlockId = block.id;
          this.isAddingTimeBlock = true;
          startInput.value = block.startTime;
          endInput.value = block.endTime;
          titleInput.value = block.title;
          noteInput.value = block.linkedNote || '';
          saveBlockBtn.setText(t('common.update'));
          formWrapper.removeClass('is-hidden');
          titleInput.focus();
        });

        // Action: Delete Block
        const delBtn = blockCard.createEl('button', {
          cls: 'study-flow-icon-action-btn',
          attr: { 'aria-label': t('calendar.deleteBlockTooltip') },
        });
        setIcon(delBtn, 'trash-2');
        delBtn.addEventListener('click', async () => {
          await deleteTimeBlock(this.plugin, this.selectedCalendarDate, block.id);
          new Notice(t('calendar.blockDeletedNotice'));
          if (this.container) await this.render(this.container);
        });
      });
    }

    // === Column 2: Deadlines del Día ===
    const deadlinesCol = contentColumns.createDiv({ cls: 'study-flow-day-column' });
    const dlHeader = deadlinesCol.createDiv({ cls: 'study-flow-column-header' });
    const dlTitle = dlHeader.createDiv({ cls: 'study-flow-column-title' });
    const dlIcon = dlTitle.createSpan();
    setIcon(dlIcon, 'alert-circle');
    dlTitle.createSpan({ text: t('calendar.dayDeadlinesTitle') });

    const addDlBtn = dlHeader.createEl('button', {
      cls: 'study-flow-icon-action-btn-styled',
      attr: { 'aria-label': t('calendar.addDeadlineTooltip') },
    });
    const addDlIcon = addDlBtn.createSpan();
    setIcon(addDlIcon, 'plus');
    addDlBtn.createSpan({ text: t('calendar.newDeadline') });
    addDlBtn.addEventListener('click', () => {
      this.isAddingDeadline = !this.isAddingDeadline;
      dlFormWrapper.toggleClass('is-hidden', !this.isAddingDeadline);
    });

    // Inline Add Deadline Form
    const dlFormWrapper = deadlinesCol.createDiv({
      cls: `study-flow-block-create-form ${this.isAddingDeadline ? '' : 'is-hidden'}`,
    });
    const dlRow1 = dlFormWrapper.createDiv({ cls: 'study-flow-form-row' });
    const dlTitleInput = dlRow1.createEl('input', {
      type: 'text',
      cls: 'study-flow-block-title-input',
      attr: { placeholder: t('calendar.deadlineTitlePlaceholder') },
    });
    const dlTimeInput = dlRow1.createEl('input', {
      type: 'text',
      cls: 'study-flow-time-input',
      attr: { placeholder: t('calendar.deadlineTimePlaceholder') },
    });

    const dlRow2 = dlFormWrapper.createDiv({ cls: 'study-flow-form-row' });
    const prioritySelect = dlRow2.createEl('select', {
      cls: 'study-flow-select-input dropdown',
      attr: { 'aria-label': t('calendar.deadlinePriorityAria') },
    });
    const priorities: Array<{ val: TaskPriority; label: string }> = [
      { val: 'none', label: t('priority.noPriority') },
      { val: 'high', label: t('priority.high') },
      { val: 'medium', label: t('priority.medium') },
      { val: 'low', label: t('priority.low') },
    ];
    priorities.forEach((p) => {
      const opt = prioritySelect.createEl('option', { value: p.val, text: p.label });
      if (p.val === 'high') opt.selected = true;
    });

    const pomoInput = dlRow2.createEl('input', {
      type: 'number',
      cls: 'study-flow-number-input',
      attr: { placeholder: t('calendar.pomodoroEstimatePlaceholder'), min: '0', max: '20', 'aria-label': t('calendar.pomodoroEstimateAria') },
    });

    const saveDlBtn = dlRow2.createEl('button', {
      cls: 'mod-cta study-flow-btn-sm',
      text: t('calendar.createDeadlineBtn'),
    });
    const cancelDlBtn = dlRow2.createEl('button', {
      cls: 'study-flow-btn-sm',
      text: t('common.cancel'),
    });

    saveDlBtn.addEventListener('click', async () => {
      const tVal = dlTitleInput.value.trim();
      if (!tVal) {
        new Notice(t('calendar.enterDeadlineTitleNotice'));
        return;
      }
      const timeVal = dlTimeInput.value.trim() || undefined;
      const prioVal = prioritySelect.value as TaskPriority;
      const pomoVal = pomoInput.value ? parseInt(pomoInput.value, 10) : undefined;

      const ok = await createDeadlineTask(
        this.app,
        this.plugin.settings,
        tVal,
        this.selectedCalendarDate,
        timeVal,
        prioVal,
        pomoVal
      );
      if (ok) {
        this.isAddingDeadline = false;
        new Notice(t('calendar.deadlineCreatedNotice', { date: this.selectedCalendarDate }));
        if (this.container) await this.render(this.container);
      }
    });

    cancelDlBtn.addEventListener('click', () => {
      this.isAddingDeadline = false;
      dlFormWrapper.addClass('is-hidden');
    });

    // List of day deadlines
    const dayDeadlines = this.allDeadlines.filter((d) => d.dueDate === this.selectedCalendarDate);
    const dlListEl = deadlinesCol.createDiv({ cls: 'study-flow-deadlines-list' });

    if (dayDeadlines.length === 0) {
      dlListEl.createDiv({
        cls: 'study-flow-empty-tasks',
        text: t('calendar.noDeadlinesForDay'),
      });
    } else {
      dayDeadlines.forEach((item) => {
        const itemCard = dlListEl.createDiv({
          cls: `study-flow-deadline-card ${item.completed ? 'is-completed' : ''}`,
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

        if (item.dueTime) {
          itemCard.createSpan({
            text: `⏰ ${item.dueTime}`,
            cls: 'study-flow-time-chip',
          });
        }

        const badgeText = formatDeadlineHuman(item.daysRemaining, item.dueDate);
        let badgeCls = 'study-flow-deadline-badge';
        if (item.daysRemaining < 0) badgeCls += ' is-overdue';
        else if (item.daysRemaining === 0) badgeCls += ' is-today';
        else if (item.daysRemaining <= 3) badgeCls += ' is-soon';
        itemCard.createSpan({ text: badgeText, cls: badgeCls });

        // Action: Pomodoro Focus
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

        // Action: Delete
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
    }

    // === Column 3: Selector de Pendientes (NextDayPlannerModal Fusion) ===
    if (this.isPendingSelectorOpen) {
      this.renderPendingTasksSelectorColumn(contentColumns);
    }
  }

  private renderPendingTasksSelectorColumn(columnsContainer: HTMLElement): void {
    const selectorCol = columnsContainer.createDiv({ cls: 'study-flow-day-column study-flow-planner-column' });
    const colHeader = selectorCol.createDiv({ cls: 'study-flow-column-header' });
    const colTitle = colHeader.createDiv({ cls: 'study-flow-column-title' });
    const pIcon = colTitle.createSpan();
    setIcon(pIcon, 'check-circle');

    const pendingTasks = this.plugin.taskIndex
      ? this.plugin.taskIndex.getPendingTasks().filter((t) => !t.isIdea)
      : [];

    colTitle.createSpan({ text: t('calendar.pendingSelectorTitle', { count: String(pendingTasks.length) }) });

    if (pendingTasks.length > 0) {
      const bulkActions = colHeader.createDiv({ cls: 'study-flow-bulk-actions' });
      const selectAllBtn = bulkActions.createEl('button', { text: t('calendar.allBtn'), cls: 'study-flow-mini-btn' });
      selectAllBtn.addEventListener('click', () => {
        pendingTasks.forEach((t) => this.selectedPendingTaskIds.add(t.id));
        if (this.container) void this.render(this.container);
      });

      const deselectAllBtn = bulkActions.createEl('button', { text: t('calendar.noneBtn'), cls: 'study-flow-mini-btn' });
      deselectAllBtn.addEventListener('click', () => {
        this.selectedPendingTaskIds.clear();
        if (this.container) void this.render(this.container);
      });
    }

    const taskListEl = selectorCol.createDiv({ cls: 'study-flow-task-list-cards', attr: { style: 'max-height: 280px; overflow-y: auto;' } });

    if (pendingTasks.length === 0) {
      taskListEl.createDiv({
        cls: 'study-flow-empty-tasks',
        text: t('calendar.noPendingVault'),
      });
    } else {
      pendingTasks.forEach((task) => {
        const itemEl = taskListEl.createDiv({ cls: 'study-flow-task-card' });
        const cbWrapper = itemEl.createDiv({ cls: 'study-flow-cb-wrapper' });
        const checkbox = cbWrapper.createEl('input', { type: 'checkbox' });
        checkbox.checked = this.selectedPendingTaskIds.has(task.id);

        checkbox.addEventListener('change', () => {
          if (checkbox.checked) {
            this.selectedPendingTaskIds.add(task.id);
          } else {
            this.selectedPendingTaskIds.delete(task.id);
          }
        });

        const label = itemEl.createEl('span', { text: task.text, cls: 'study-flow-task-text' });
        label.addEventListener('click', () => {
          checkbox.checked = !checkbox.checked;
          checkbox.dispatchEvent(new Event('change'));
        });

        if (task.priority === 'high') {
          const pSpan = itemEl.createSpan({ cls: 'study-flow-priority-badge is-high' });
          const pIcon = pSpan.createSpan({ cls: 'study-flow-badge-icon' });
          setIcon(pIcon, 'chevrons-up');
          pSpan.createSpan({ text: ` ${t('priority.high')}` });
        } else if (task.priority === 'medium') {
          const pSpan = itemEl.createSpan({ cls: 'study-flow-priority-badge is-medium' });
          const pIcon = pSpan.createSpan({ cls: 'study-flow-badge-icon' });
          setIcon(pIcon, 'chevron-up');
          pSpan.createSpan({ text: ` ${t('priority.medium')}` });
        } else if (task.priority === 'low') {
          const pSpan = itemEl.createSpan({ cls: 'study-flow-priority-badge is-low' });
          const pIcon = pSpan.createSpan({ cls: 'study-flow-badge-icon' });
          setIcon(pIcon, 'chevron-down');
          pSpan.createSpan({ text: ` ${t('priority.low')}` });
        }

        itemEl.createSpan({
          text: task.sourceFile.endsWith('.md')
            ? task.sourceFile.substring(0, task.sourceFile.length - 3)
            : task.sourceFile,
          cls: 'study-flow-source-chip',
        });
      });
    }

    // Actions row for applying to the day
    const actionsCard = selectorCol.createDiv({ cls: 'study-flow-planner-actions' });
    const toggleWrap = actionsCard.createDiv({ cls: 'study-flow-planner-toggle-wrap' });
    const migrateCb = toggleWrap.createEl('input', {
      type: 'checkbox',
      attr: { id: 'sf-mark-migrated-cb' },
    });
    migrateCb.checked = this.markMigratedInSource;
    migrateCb.addEventListener('change', () => {
      this.markMigratedInSource = migrateCb.checked;
    });
    toggleWrap.createEl('label', {
      text: t('calendar.markMigratedLabel'),
      attr: { for: 'sf-mark-migrated-cb' },
    });

    const addSelectedBtn = actionsCard.createEl('button', {
      cls: 'mod-cta study-flow-btn-sm',
    });
    const addIcon = addSelectedBtn.createSpan();
    setIcon(addIcon, 'calendar-plus');
    addSelectedBtn.createSpan({
      text: t('calendar.incorporateToDate', { date: this.selectedCalendarDate, count: String(this.selectedPendingTaskIds.size) }),
    });

    addSelectedBtn.addEventListener('click', async () => {
      const selected = pendingTasks.filter((t) => this.selectedPendingTaskIds.has(t.id));
      if (selected.length === 0) {
        new Notice(t('calendar.selectAtLeastOneNotice'));
        return;
      }
      await this.applySelectedTasksToDate(selected);
    });
  }

  private async applySelectedTasksToDate(selected: PendingTaskItem[]): Promise<void> {
    try {
      const targetPath = getDailyNotePath(this.plugin.settings, this.selectedCalendarDate);
      const targetFile = await getOrCreateFile(
        this.app,
        targetPath,
        `# ${this.selectedCalendarDate}\n\n`
      );

      const sectionHeader = this.plugin.settings.tasksSectionHeader || '## Tareas';

      await this.app.vault.process(targetFile, (content) => {
        let updated = content;
        for (const task of selected) {
          updated = appendTaskToMarkdownSection(updated, task.text, sectionHeader);
        }
        return updated;
      });

      if (this.markMigratedInSource) {
        await this.markTasksAsMigrated(selected);
      }

      this.selectedPendingTaskIds.clear();
      new Notice(t('calendar.tasksIncorporatedNotice', { count: String(selected.length), file: targetFile.basename }));
      if (this.container) await this.render(this.container);
    } catch (err) {
      console.error('Study Flow: Error incorporando tareas pendientes al calendario', err);
      new Notice(t('calendar.tasksIncorporatedError'));
    }
  }

  private async markTasksAsMigrated(selected: PendingTaskItem[]): Promise<void> {
    const tasksByFile = new Map<string, PendingTaskItem[]>();
    for (const task of selected) {
      const fileTasks = tasksByFile.get(task.sourceFile) || [];
      fileTasks.push(task);
      tasksByFile.set(task.sourceFile, fileTasks);
    }

    for (const [filePath, tasks] of tasksByFile.entries()) {
      const file = this.app.vault.getAbstractFileByPath(filePath);
      if (file instanceof TFile) {
        await this.app.vault.process(file, (content) => {
          let updated = content;
          for (const task of tasks) {
            const escapedText = task.text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            const regex = new RegExp(`^(\\s*)-\\s+\\[\\s\\]\\s+${escapedText}`, 'm');
            updated = updated.replace(regex, `$1- [>] ${task.text}`);
          }
          return updated;
        });
      }
    }
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
      attr: { placeholder: t('calendar.pomodoroEstimatePlaceholder'), min: '0', max: '20', 'aria-label': t('calendar.pomodoroEstimateAria') },
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
