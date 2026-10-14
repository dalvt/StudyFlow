import { App, Notice, setIcon, TFile } from 'obsidian';
import type StudyFlowPlugin from '../main';
import type { ActiveTab } from './types.ts';
import {
  CalendarTimeBlock,
  calculateBlockDurationMinutes,
  createDeadlineTask,
  deleteTimeBlock,
  formatLongDate,
  getTimeBlocksForDate,
  saveTimeBlock,
  syncTimeBlocksToDailyNote,
  toggleTimeBlockCompletion,
} from '../calendar.ts';
import {
  deleteTaskFromFile,
  toggleTaskCompletionInFile,
} from '../tasks.ts';
import {
  appendTaskToMarkdownSection,
  formatDeadlineHuman,
  getCleanTaskDisplayTitle,
  getDailyNotePath,
  getOrCreateFile,
  PendingTaskItem,
  TaskPriority,
} from '../utils.ts';
import { t, getEffectiveLanguage } from '../i18n/index.ts';

export interface DayDetailState {
  selectedCalendarDate: string;
  isAddingTimeBlock: boolean;
  editingBlockId: string | null;
  isAddingDeadline: boolean;
  isPendingSelectorOpen: boolean;
  selectedPendingTaskIds: Set<string>;
  markMigratedInSource: boolean;
}

export interface DayDetailCallbacks {
  onSwitchTab: (tab: ActiveTab) => void;
  onRefresh: () => Promise<void>;
  onDateChange?: (dateStr: string) => Promise<void>;
}

/**
 * Component responsible for rendering the detailed panel for the selected date:
 * 1. Panel Header (date, actions: plan pending, sync daily, open daily)
 * 2. Time Blocks Column (create/edit form, list with virtual schedule support)
 * 3. Day Deadlines Column (create form, list)
 * 4. Pending Tasks Selector Column (NextDayPlanner fusion, draggable onto grid)
 */
export async function renderDayDetailPanel(
  parentCard: HTMLElement,
  app: App,
  plugin: StudyFlowPlugin,
  state: DayDetailState,
  callbacks: DayDetailCallbacks
): Promise<void> {
  const detailPanel = parentCard.createDiv({ cls: 'study-flow-day-detail-panel' });

  // 1. Panel Header
  renderDayDetailHeader(detailPanel, app, plugin, state, callbacks);

  // 2. Columns container
  const contentColumns = detailPanel.createDiv({ cls: 'study-flow-day-columns' });

  // Column 1: Time Blocking
  await renderTimeBlocksColumn(contentColumns, app, plugin, state, callbacks);

  // Column 2: Deadlines
  await renderDeadlinesColumn(contentColumns, app, plugin, state, callbacks);

  // Column 3: Pending Tasks Selector (if open)
  if (state.isPendingSelectorOpen) {
    renderPendingTasksSelectorColumn(contentColumns, app, plugin, state, callbacks);
  }
}

/**
 * Header of the Day Detail panel
 */
export function renderDayDetailHeader(
  container: HTMLElement,
  app: App,
  plugin: StudyFlowPlugin,
  state: DayDetailState,
  callbacks: DayDetailCallbacks
): HTMLElement {
  const detailHeader = container.createDiv({ cls: 'study-flow-day-detail-header' });
  const titleWrap = detailHeader.createDiv({ cls: 'study-flow-day-detail-title-wrap' });
  const calIcon = titleWrap.createSpan({ cls: 'study-flow-section-icon' });
  setIcon(calIcon, 'calendar');
  titleWrap.createEl('h3', {
    text: formatLongDate(state.selectedCalendarDate, getEffectiveLanguage()),
    cls: 'study-flow-day-detail-title',
  });

  const headerActions = detailHeader.createDiv({ cls: 'study-flow-day-header-actions' });

  // Plan Pending Tasks Toggle Button
  const planPendingBtn = headerActions.createEl('button', {
    cls: `study-flow-icon-action-btn-styled ${state.isPendingSelectorOpen ? 'is-active' : ''}`,
    attr: { 'aria-label': t('calendar.openPendingSelectorTooltip') },
  });
  const planIcon = planPendingBtn.createSpan();
  setIcon(planIcon, 'list-checks');
  planPendingBtn.createSpan({
    text: state.isPendingSelectorOpen ? t('calendar.hidePending') : t('calendar.planPending'),
  });
  planPendingBtn.addEventListener('click', async () => {
    state.isPendingSelectorOpen = !state.isPendingSelectorOpen;
    await callbacks.onRefresh();
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
    const blocks = await getTimeBlocksForDate(app, plugin.settings, state.selectedCalendarDate);
    if (blocks.length === 0) {
      new Notice(t('calendar.noBlocksToSyncNotice'));
      return;
    }
    const ok = await syncTimeBlocksToDailyNote(
      app,
      plugin.settings,
      state.selectedCalendarDate,
      blocks
    );
    if (ok) {
      const dailyPath = getDailyNotePath(plugin.settings, state.selectedCalendarDate);
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
    const dailyPath = getDailyNotePath(plugin.settings, state.selectedCalendarDate);
    const file = await getOrCreateFile(app, dailyPath, `# ${state.selectedCalendarDate}\n\n`);
    await app.workspace.getLeaf(false).openFile(file);
  });

  return detailHeader;
}

/**
 * Column 1: Time Blocks list & inline create/edit form
 */
export async function renderTimeBlocksColumn(
  container: HTMLElement,
  app: App,
  plugin: StudyFlowPlugin,
  state: DayDetailState,
  callbacks: DayDetailCallbacks
): Promise<HTMLElement> {
  const timeBlocksCol = container.createDiv({ cls: 'study-flow-day-column' });
  const tbHeader = timeBlocksCol.createDiv({ cls: 'study-flow-column-header' });
  const tbTitle = tbHeader.createDiv({ cls: 'study-flow-column-title' });
  const tbIcon = tbTitle.createSpan();
  setIcon(tbIcon, 'clock');
  tbTitle.createSpan({ text: t('calendar.timeBlocksTitle') });

  // Load existing blocks
  const blocks = await getTimeBlocksForDate(app, plugin.settings, state.selectedCalendarDate);

  // Inline Add/Edit Block Form
  const formWrapper = timeBlocksCol.createDiv({
    cls: `study-flow-block-create-form ${state.isAddingTimeBlock ? '' : 'is-hidden'}`,
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

  const addBlockBtn = tbHeader.createEl('button', {
    cls: 'study-flow-icon-action-btn-styled',
    attr: { 'aria-label': t('calendar.addBlockTooltip') },
  });
  const addBlockIcon = addBlockBtn.createSpan();
  setIcon(addBlockIcon, 'plus');
  addBlockBtn.createSpan({ text: t('calendar.newBlock') });
  addBlockBtn.addEventListener('click', () => {
    state.isAddingTimeBlock = !state.isAddingTimeBlock;
    if (state.isAddingTimeBlock) {
      state.editingBlockId = null;
      saveBlockBtn.setText(t('common.save'));
      titleInput.value = '';
      noteInput.value = '';
    }
    formWrapper.toggleClass('is-hidden', !state.isAddingTimeBlock);
  });

  saveBlockBtn.addEventListener('click', async () => {
    const title = titleInput.value.trim();
    const startTime = startInput.value.trim();
    const endTime = endInput.value.trim();
    if (!title || !startTime || !endTime) {
      new Notice(t('calendar.completeTimeFieldsNotice'));
      return;
    }
    const blockId = state.editingBlockId || String(Date.now());
    const existing = blocks.find((b) => b.id === state.editingBlockId);
    const newBlock: CalendarTimeBlock = {
      id: blockId,
      date: state.selectedCalendarDate,
      startTime,
      endTime,
      title,
      linkedNote: noteInput.value.trim() || undefined,
      completed: existing ? existing.completed : false,
      color: existing?.color,
      subject: existing?.subject,
      isVirtual: existing?.isVirtual,
    };
    await saveTimeBlock(plugin, newBlock);
    state.isAddingTimeBlock = false;
    state.editingBlockId = null;
    saveBlockBtn.setText(t('common.save'));
    new Notice(t('calendar.blockSavedNotice', { title }));
    await callbacks.onRefresh();
  });

  cancelBlockBtn.addEventListener('click', () => {
    state.isAddingTimeBlock = false;
    state.editingBlockId = null;
    saveBlockBtn.setText(t('common.save'));
    formWrapper.addClass('is-hidden');
  });

  // Time Blocks List
  const blocksListEl = timeBlocksCol.createDiv({ cls: 'study-flow-blocks-list' });

  if (blocks.length === 0) {
    blocksListEl.createDiv({
      cls: 'study-flow-empty-tasks',
      text: t('calendar.noBlocksForDay'),
    });
  } else {
    blocks.forEach((block) => {
      const isVirtual = !!block.isVirtual;
      const blockCard = blocksListEl.createDiv({
        cls: `study-flow-timeblock-card ${block.completed ? 'is-completed' : ''} ${isVirtual ? 'is-virtual' : ''}`,
      });

      // Checkbox
      const cb = blockCard.createEl('input', {
        type: 'checkbox',
        cls: 'study-flow-timeblock-cb',
      });
      cb.checked = !!block.completed;
      cb.addEventListener('change', async () => {
        await toggleTimeBlockCompletion(plugin, state.selectedCalendarDate, block.id, cb.checked);
        await callbacks.onRefresh();
      });

      // Time range badge
      const duration = calculateBlockDurationMinutes(block.startTime, block.endTime);
      const durText = duration > 0 ? ` (${duration}m)` : '';
      blockCard.createSpan({
        text: `${block.startTime} — ${block.endTime}${durText}`,
        cls: 'study-flow-timeblock-badge',
      });

      // Virtual schedule indicator badge if recurring
      if (isVirtual) {
        blockCard.createSpan({
          text: t('calendar.virtualScheduleBadge') || 'Horario',
          cls: 'study-flow-cal-chip is-virtual-chip',
        });
      }

      // Title & Subject
      const titleSpan = blockCard.createSpan({
        text: block.title,
        cls: `study-flow-timeblock-title ${block.completed ? 'is-strikethrough' : ''}`,
      });
      if (block.subject) {
        blockCard.createSpan({
          text: block.subject,
          cls: 'study-flow-subject-tag-badge',
          attr: block.color ? { style: `border-color: ${block.color}; color: ${block.color};` } : {},
        });
      }

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
          if (raw) app.workspace.openLinkText(raw, '', false);
        });
      }

      // Action: Pomodoro Focus
      const pomoBtn = blockCard.createEl('button', {
        cls: 'study-flow-icon-action-btn',
        attr: { 'aria-label': t('calendar.focusBlockTooltip') },
      });
      setIcon(pomoBtn, 'timer');
      pomoBtn.addEventListener('click', async () => {
        plugin.pomodoro.setActiveTask({
          id: block.id,
          text: `${block.title} [${block.startTime} - ${block.endTime}]`,
          sourceFile: getDailyNotePath(plugin.settings, state.selectedCalendarDate),
        });
        callbacks.onSwitchTab('pomodoro');
      });

      // Action: Edit Block
      const editBtn = blockCard.createEl('button', {
        cls: 'study-flow-icon-action-btn',
        attr: { 'aria-label': t('calendar.editBlockTooltip') },
      });
      setIcon(editBtn, 'pencil');
      editBtn.addEventListener('click', () => {
        state.editingBlockId = block.id;
        state.isAddingTimeBlock = true;
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
        await deleteTimeBlock(plugin, state.selectedCalendarDate, block.id);
        new Notice(t('calendar.blockDeletedNotice'));
        await callbacks.onRefresh();
      });
    });
  }

  return timeBlocksCol;
}

/**
 * Column 2: Day Deadlines list & inline create form
 */
export async function renderDeadlinesColumn(
  container: HTMLElement,
  app: App,
  plugin: StudyFlowPlugin,
  state: DayDetailState,
  callbacks: DayDetailCallbacks
): Promise<HTMLElement> {
  const deadlinesCol = container.createDiv({ cls: 'study-flow-day-column' });
  const dlHeader = deadlinesCol.createDiv({ cls: 'study-flow-column-header' });
  const dlTitle = dlHeader.createDiv({ cls: 'study-flow-column-title' });
  const dlIcon = dlTitle.createSpan();
  setIcon(dlIcon, 'alert-circle');
  dlTitle.createSpan({ text: t('calendar.dayDeadlinesTitle') });

  // Inline Add Deadline Form
  const dlFormWrapper = deadlinesCol.createDiv({
    cls: `study-flow-block-create-form ${state.isAddingDeadline ? '' : 'is-hidden'}`,
  });

  const addDlBtn = dlHeader.createEl('button', {
    cls: 'study-flow-icon-action-btn-styled',
    attr: { 'aria-label': t('calendar.addDeadlineTooltip') },
  });
  const addDlIcon = addDlBtn.createSpan();
  setIcon(addDlIcon, 'plus');
  addDlBtn.createSpan({ text: t('calendar.newDeadline') });
  addDlBtn.addEventListener('click', () => {
    state.isAddingDeadline = !state.isAddingDeadline;
    dlFormWrapper.toggleClass('is-hidden', !state.isAddingDeadline);
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
    attr: {
      placeholder: t('calendar.pomodoroEstimatePlaceholder'),
      min: '0',
      max: '20',
      'aria-label': t('calendar.pomodoroEstimateAria'),
    },
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
      app,
      plugin.settings,
      tVal,
      state.selectedCalendarDate,
      timeVal,
      prioVal,
      pomoVal
    );
    if (ok) {
      state.isAddingDeadline = false;
      new Notice(t('calendar.deadlineCreatedNotice', { date: state.selectedCalendarDate }));
      await callbacks.onRefresh();
    }
  });

  cancelDlBtn.addEventListener('click', () => {
    state.isAddingDeadline = false;
    dlFormWrapper.addClass('is-hidden');
  });

  // List of day deadlines
  const allDeadlines = plugin.taskIndex ? plugin.taskIndex.getAllDeadlines() : [];
  const dayDeadlines = allDeadlines.filter((d) => d.dueDate === state.selectedCalendarDate);
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
        await toggleTaskCompletionInFile(app, item, cb.checked);
        await callbacks.onRefresh();
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
        plugin.pomodoro.setActiveTask({
          id: item.id,
          text: item.text,
          sourceFile: item.sourceFile,
        });
        callbacks.onSwitchTab('pomodoro');
      });

      // Action: Delete
      const delBtn = itemCard.createEl('button', {
        cls: 'study-flow-icon-action-btn',
        attr: { 'aria-label': t('calendar.deleteDeadlineTooltip') },
      });
      setIcon(delBtn, 'trash-2');
      delBtn.addEventListener('click', async () => {
        await deleteTaskFromFile(app, item);
        new Notice(t('calendar.deadlineDeletedNotice'));
        await callbacks.onRefresh();
      });
    });
  }

  return deadlinesCol;
}

/**
 * Column 3: Pending Tasks Selector Column (NextDayPlanner fusion)
 * Tasks can also be dragged directly onto the calendar hourly grid!
 */
export function renderPendingTasksSelectorColumn(
  columnsContainer: HTMLElement,
  app: App,
  plugin: StudyFlowPlugin,
  state: DayDetailState,
  callbacks: DayDetailCallbacks
): HTMLElement {
  const selectorCol = columnsContainer.createDiv({
    cls: 'study-flow-day-column study-flow-planner-column',
  });
  let updateAddButtonLabel = (): void => {};

  const colHeader = selectorCol.createDiv({ cls: 'study-flow-column-header' });
  const colTitle = colHeader.createDiv({ cls: 'study-flow-column-title' });
  const pIcon = colTitle.createSpan();
  setIcon(pIcon, 'check-circle');

  const pendingTasks = plugin.taskIndex
    ? plugin.taskIndex.getPendingTasks().filter((t) => !t.isIdea)
    : [];

  colTitle.createSpan({
    text: t('calendar.pendingSelectorTitle', { count: String(pendingTasks.length) }),
  });

  if (pendingTasks.length > 0) {
    const bulkActions = colHeader.createDiv({ cls: 'study-flow-bulk-actions' });
    const selectAllBtn = bulkActions.createEl('button', {
      text: t('calendar.allBtn'),
      cls: 'study-flow-mini-btn',
    });
    selectAllBtn.addEventListener('click', () => {
      pendingTasks.forEach((t) => state.selectedPendingTaskIds.add(t.id));
      void callbacks.onRefresh();
    });

    const deselectAllBtn = bulkActions.createEl('button', {
      text: t('calendar.noneBtn'),
      cls: 'study-flow-mini-btn',
    });
    deselectAllBtn.addEventListener('click', () => {
      state.selectedPendingTaskIds.clear();
      void callbacks.onRefresh();
    });
  }

  const taskListEl = selectorCol.createDiv({
    cls: 'study-flow-task-list-cards',
    attr: { style: 'max-height: 280px; overflow-y: auto;' },
  });

  if (pendingTasks.length === 0) {
    taskListEl.createDiv({
      cls: 'study-flow-empty-tasks',
      text: t('calendar.noPendingVault'),
    });
  } else {
    pendingTasks.forEach((task) => {
      const itemEl = taskListEl.createDiv({
        cls: 'study-flow-task-card study-flow-draggable-task',
        attr: {
          draggable: 'true',
          title: t('calendar.dragTaskTooltip') || 'Arrastra esta tarea a la cuadrícula horaria',
        },
      });

      // Drag event to create block on grid
      itemEl.addEventListener('dragstart', (e: DragEvent) => {
        if (!e.dataTransfer) return;
        const payload = JSON.stringify({
          type: 'study-flow-task',
          id: task.id,
          text: task.text,
          cleanTitle: getCleanTaskDisplayTitle(task.text),
          estimatedPomodoros: task.estimatedPomodoros || 1,
          priority: task.priority,
          sourceFile: task.sourceFile,
        });
        e.dataTransfer.setData('application/json', payload);
        e.dataTransfer.setData('text/plain', task.text);
        e.dataTransfer.effectAllowed = 'copyMove';
        itemEl.addClass('is-dragging');
      });

      itemEl.addEventListener('dragend', () => {
        itemEl.removeClass('is-dragging');
      });

      const cbWrapper = itemEl.createDiv({ cls: 'study-flow-cb-wrapper' });
      const checkbox = cbWrapper.createEl('input', { type: 'checkbox' });
      checkbox.checked = state.selectedPendingTaskIds.has(task.id);

      checkbox.addEventListener('change', () => {
        if (checkbox.checked) {
          state.selectedPendingTaskIds.add(task.id);
        } else {
          state.selectedPendingTaskIds.delete(task.id);
        }
        updateAddButtonLabel();
      });

      const label = itemEl.createEl('span', { text: task.text, cls: 'study-flow-task-text' });
      label.addEventListener('click', () => {
        checkbox.checked = !checkbox.checked;
        checkbox.dispatchEvent(new Event('change'));
      });

      // Priority badge
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

      // Pomodoro estimate chip
      if (task.estimatedPomodoros && task.estimatedPomodoros > 0) {
        itemEl.createSpan({
          text: `🍅 ${task.estimatedPomodoros}`,
          cls: 'study-flow-pomo-chip',
          attr: { title: `${task.estimatedPomodoros} pomodoro(s)` },
        });
      }

      // Source note chip
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
  migrateCb.checked = state.markMigratedInSource;
  migrateCb.addEventListener('change', () => {
    state.markMigratedInSource = migrateCb.checked;
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
  const addSelectedBtnText = addSelectedBtn.createSpan({
    text: t('calendar.incorporateToDate', {
      date: state.selectedCalendarDate,
      count: String(state.selectedPendingTaskIds.size),
    }),
  });

  updateAddButtonLabel = () => {
    addSelectedBtnText.setText(
      t('calendar.incorporateToDate', {
        date: state.selectedCalendarDate,
        count: String(state.selectedPendingTaskIds.size),
      })
    );
  };

  addSelectedBtn.addEventListener('click', async () => {
    const selected = pendingTasks.filter((t) => state.selectedPendingTaskIds.has(t.id));
    if (selected.length === 0) {
      new Notice(t('calendar.selectAtLeastOneNotice'));
      return;
    }
    await applySelectedTasksToDate(app, plugin, state, selected, callbacks);
  });

  return selectorCol;
}

/**
 * Incorporates selected tasks into target daily note's ## Tareas section
 */
export async function applySelectedTasksToDate(
  app: App,
  plugin: StudyFlowPlugin,
  state: DayDetailState,
  selected: PendingTaskItem[],
  callbacks: DayDetailCallbacks
): Promise<void> {
  try {
    const targetPath = getDailyNotePath(plugin.settings, state.selectedCalendarDate);
    const targetFile = await getOrCreateFile(
      app,
      targetPath,
      `# ${state.selectedCalendarDate}\n\n`
    );

    const sectionHeader = plugin.settings.tasksSectionHeader || '## Tareas';

    await app.vault.process(targetFile, (content) => {
      let updated = content;
      for (const task of selected) {
        updated = appendTaskToMarkdownSection(updated, task.text, sectionHeader);
      }
      return updated;
    });

    if (state.markMigratedInSource) {
      await markTasksAsMigrated(app, selected);
    }

    state.selectedPendingTaskIds.clear();
    new Notice(
      t('calendar.tasksIncorporatedNotice', {
        count: String(selected.length),
        file: targetFile.basename,
      })
    );
    await callbacks.onRefresh();
  } catch (err) {
    console.error('Study Flow: Error incorporando tareas pendientes al calendario', err);
    new Notice(t('calendar.tasksIncorporatedError'));
  }
}

/**
 * Marks tasks in source file with [>] (migrated)
 */
export async function markTasksAsMigrated(app: App, selected: PendingTaskItem[]): Promise<void> {
  const tasksByFile = new Map<string, PendingTaskItem[]>();
  for (const task of selected) {
    const fileTasks = tasksByFile.get(task.sourceFile) || [];
    fileTasks.push(task);
    tasksByFile.set(task.sourceFile, fileTasks);
  }

  for (const [filePath, tasks] of tasksByFile.entries()) {
    const file = app.vault.getAbstractFileByPath(filePath);
    if (file instanceof TFile) {
      await app.vault.process(file, (content) => {
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
