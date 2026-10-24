import { App, Notice, setIcon } from 'obsidian';
import type StudyFlowPlugin from '../main';
import {
  type BlockLayout,
  type CalendarTimeBlock,
  computeBlockLayouts,
  deleteTimeBlock,
  formatDateKey,
  getTimeBlocksForDate,
  getWeekDays,
  minutesToTimeString,
  saveTimeBlock,
  snapTo15Minutes,
  timeStringToMinutes,
  toggleTimeBlockCompletion,
} from '../calendar.ts';
import { loadScheduleItems } from '../schedule.ts';
import { getDailyNotePath } from '../utils.ts';
import { t, getEffectiveLanguage } from '../i18n/index.ts';
import { PromptModal } from './prompt-modal.ts';

export { type BlockLayout, snapTo15Minutes, minutesToTimeString, computeBlockLayouts };

export interface CalendarGridCallbacks {
  onSelectDate: (dateStr: string) => Promise<void>;
  onRefresh: () => Promise<void>;
  onSwitchTab: (tab: string) => void;
}

export class CalendarGridComponent {
  private app: App;
  private plugin: StudyFlowPlugin;
  private callbacks: CalendarGridCallbacks;

  private hourHeight = 52; // pixels per hour (15m = 13px)
  private activeDragCleanup: (() => void) | null = null;

  constructor(app: App, plugin: StudyFlowPlugin, callbacks: CalendarGridCallbacks) {
    this.app = app;
    this.plugin = plugin;
    this.callbacks = callbacks;
  }

  /**
   * Renders the hourly grid for either a single day or a 7-day week.
   */
  public async renderGrid(
    container: HTMLElement,
    mode: 'day' | 'week',
    selectedDateStr: string
  ): Promise<void> {
    const startHour = this.plugin.settings.calendarStartHour ?? 7;
    const endHour = this.plugin.settings.calendarEndHour ?? 22;
    const totalHours = Math.max(1, endHour - startHour + 1);

    // Grid Container
    const gridContainer = container.createDiv({
      cls: `study-flow-calendar-grid-container is-mode-${mode}`,
    });

    // Determine columns (1 for day, 7 for week)
    let days: Array<{ dateStr: string; label: string; isToday: boolean; isSelected: boolean }> = [];
    if (mode === 'day') {
      const todayStr = formatDateKey(new Date());
      days = [
        {
          dateStr: selectedDateStr,
          label: selectedDateStr,
          isToday: selectedDateStr === todayStr,
          isSelected: true,
        },
      ];
    } else {
      const parts = selectedDateStr.split('-').map(Number);
      const refDate = new Date(parts[0], parts[1] - 1, parts[2]);
      const weekStart = this.plugin.settings.weekStartDay || 'monday';
      const weekDays = getWeekDays(refDate, weekStart, getEffectiveLanguage());
      days = weekDays.map((w) => ({
        dateStr: w.dateStr,
        label: `${w.shortDay} ${w.dayNumber}`,
        isToday: w.isToday,
        isSelected: w.dateStr === selectedDateStr,
      }));
    }

    // Top Header Row: Gutter space + Day Column Headers
    const headerRow = gridContainer.createDiv({ cls: 'study-flow-grid-header-row' });
    headerRow.createDiv({ cls: 'study-flow-grid-gutter-header' }); // Empty spacer above time labels

    const daysHeaderWrap = headerRow.createDiv({ cls: 'study-flow-grid-days-header' });
    days.forEach((day) => {
      const dayHeaderEl = daysHeaderWrap.createDiv({
        cls: `study-flow-grid-day-header ${day.isToday ? 'is-today' : ''} ${day.isSelected ? 'is-selected' : ''}`,
        attr: {
          role: 'button',
          tabindex: '0',
          'aria-label': `${day.label} (${day.dateStr})`,
        },
      });
      dayHeaderEl.createSpan({ text: day.label, cls: 'study-flow-grid-day-header-title' });

      if (day.isToday) {
        dayHeaderEl.createSpan({ text: t('common.today'), cls: 'study-flow-grid-today-badge' });
      }

      const selectDay = async () => {
        if (day.dateStr !== selectedDateStr) {
          await this.callbacks.onSelectDate(day.dateStr);
        }
      };

      dayHeaderEl.addEventListener('click', () => {
        void selectDay();
      });
      dayHeaderEl.addEventListener('keydown', (e: KeyboardEvent) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          void selectDay();
        }
      });
    });

    // Main Scrollable Body
    const scrollBody = gridContainer.createDiv({ cls: 'study-flow-grid-scroll-body' });
    const contentRow = scrollBody.createDiv({ cls: 'study-flow-grid-content-row' });

    // 1. Time Gutter (Left labels: 07:00, 08:00, ...)
    const gutter = contentRow.createDiv({ cls: 'study-flow-grid-gutter' });
    for (let h = startHour; h <= endHour; h++) {
      const label = gutter.createDiv({ cls: 'study-flow-grid-hour-label' });
      label.setText(`${String(h).padStart(2, '0')}:00`);
    }

    // 2. Day Columns
    const columnsWrap = contentRow.createDiv({ cls: 'study-flow-grid-columns-wrap' });

    // Load blocks for each day in parallel
    const scheduleItems = await loadScheduleItems(
      this.app,
      this.plugin.settings.scheduleFilePath || 'StudyFlow/Schedule.md'
    );
    const blocksMap = new Map<string, CalendarTimeBlock[]>();
    await Promise.all(
      days.map(async (d) => {
        const bl = await getTimeBlocksForDate(
          this.app,
          this.plugin.settings,
          d.dateStr,
          true,
          scheduleItems
        );
        blocksMap.set(d.dateStr, bl);
      })
    );

    days.forEach((day) => {
      const dayBlocks = blocksMap.get(day.dateStr) || [];
      this.renderDayColumn(
        columnsWrap,
        day.dateStr,
        dayBlocks,
        startHour,
        endHour,
        totalHours,
        day.isSelected
      );
    });
  }

  /**
   * Renders a single vertical day column with hour lines, drop target, and positioned blocks.
   */
  private renderDayColumn(
    parent: HTMLElement,
    dateStr: string,
    blocks: CalendarTimeBlock[],
    startHour: number,
    endHour: number,
    totalHours: number,
    isSelected: boolean
  ): HTMLElement {
    const col = parent.createDiv({
      cls: `study-flow-grid-day-col ${isSelected ? 'is-selected' : ''}`,
    });

    const totalHeight = totalHours * this.hourHeight;
    col.style.height = `${totalHeight}px`;

    // Hour background grid lines
    const linesWrap = col.createDiv({ cls: 'study-flow-grid-lines-wrap' });
    for (let h = 0; h < totalHours; h++) {
      const line = linesWrap.createDiv({ cls: 'study-flow-grid-hour-line' });
      line.style.top = `${h * this.hourHeight}px`;
      line.style.height = `${this.hourHeight}px`;

      // 30-min dashed subdivider
      const halfLine = line.createDiv({ cls: 'study-flow-grid-half-hour-line' });
      halfLine.style.top = `${this.hourHeight / 2}px`;
    }

    // Drop Target for tasks dragged from Pending Tasks panel
    col.addEventListener('dragover', (e: DragEvent) => {
      e.preventDefault();
      if (e.dataTransfer) {
        e.dataTransfer.dropEffect = 'copy';
      }
      col.addClass('is-drag-over');
    });

    col.addEventListener('dragleave', () => {
      col.removeClass('is-drag-over');
    });

    col.addEventListener('drop', (e: DragEvent) => {
      void (async () => {
        e.preventDefault();
        col.removeClass('is-drag-over');

        let taskData: { text?: string; cleanTitle?: string; estimatedPomodoros?: number } | null = null;
        try {
          const json = e.dataTransfer?.getData('application/json');
          if (json) {
            taskData = JSON.parse(json) as { text?: string; cleanTitle?: string; estimatedPomodoros?: number };
          }
        } catch {
          taskData = null;
        }

        const text = taskData?.cleanTitle || taskData?.text || e.dataTransfer?.getData('text/plain');
        if (!text) return;

        const rect = col.getBoundingClientRect();
        const relativeY = Math.max(0, e.clientY - rect.top);
        const clickedMins = startHour * 60 + (relativeY / this.hourHeight) * 60;

        const pomos = taskData?.estimatedPomodoros && taskData.estimatedPomodoros > 0 ? taskData.estimatedPomodoros : 1;
        const pomoDuration = this.plugin.settings.pomodoroWorkDuration || 25;
        const durationMins = Math.max(15, pomos * pomoDuration);
        const startMin = Math.min(1439 - 15, snapTo15Minutes(clickedMins));
        const endMin = Math.min(1439, startMin + durationMins);

        const newBlock: CalendarTimeBlock = {
          id: String(Date.now()),
          date: dateStr,
          startTime: minutesToTimeString(startMin),
          endTime: minutesToTimeString(endMin),
          title: text.trim(),
          completed: false,
        };

        await saveTimeBlock(this.plugin, newBlock);
        new Notice(
          t('calendar.blockCreatedNotice', {
            title: newBlock.title,
            time: `${newBlock.startTime}—${newBlock.endTime}`,
          }) || `Bloque creado: ${newBlock.title} (${newBlock.startTime} - ${newBlock.endTime})`
        );
        await this.callbacks.onRefresh();
      })();
    });

    // Click/Drag on empty slot to create a new block
    col.addEventListener('pointerdown', (e: PointerEvent) => {
      // Ignore if clicking on an existing block or button
      if ((e.target as HTMLElement).closest('.study-flow-grid-block')) {
        return;
      }
      if (e.button !== 0) return; // Left click only
      if (e.pointerType === 'touch') return; // Do not start drag creation on touch to allow native vertical scroll

      const startY = e.clientY;
      const rect = col.getBoundingClientRect();
      const relativeStartY = e.clientY - rect.top;
      const startMins = Math.min(1439 - 15, snapTo15Minutes(startHour * 60 + (relativeStartY / this.hourHeight) * 60));

      let didDrag = false;
      let preview: HTMLElement | null = null;
      let currentEndMins = Math.min(1439, startMins + 30);

      const onPointerMove = (moveEv: PointerEvent) => {
        if (!didDrag) {
          if (Math.abs(moveEv.clientY - startY) < 6) {
            return;
          }
          didDrag = true;
          preview = col.createDiv({ cls: 'study-flow-grid-block is-creation-preview' });
          preview.style.top = `${((startMins - startHour * 60) / 60) * this.hourHeight}px`;
          preview.style.height = `${(30 / 60) * this.hourHeight}px`;
          preview.setText(t('calendar.newBlock') || 'Nuevo bloque');
        }

        const moveY = moveEv.clientY - rect.top;
        const rawMins = startHour * 60 + (moveY / this.hourHeight) * 60;
        const snapped = snapTo15Minutes(rawMins);
        if (snapped > startMins) {
          currentEndMins = Math.min(1439, snapped);
        } else {
          currentEndMins = Math.min(1439, startMins + 15);
        }
        const heightMins = currentEndMins - startMins;
        if (preview) {
          preview.style.height = `${(heightMins / 60) * this.hourHeight}px`;
        }
      };

      const cleanupDrag = () => {
        window.removeEventListener('pointermove', onPointerMove);
        window.removeEventListener('pointerup', onPointerUp);
        window.removeEventListener('pointercancel', onPointerCancel);
        if (preview && preview.parentElement) {
          preview.remove();
        }
        if (this.activeDragCleanup === cleanupDrag) {
          this.activeDragCleanup = null;
        }
      };
      this.activeDragCleanup = cleanupDrag;

      const onPointerCancel = () => {
        cleanupDrag();
      };

      const onPointerUp = () => {
        cleanupDrag();
        if (!didDrag) return;

        const startTime = minutesToTimeString(startMins);
        const endTime = minutesToTimeString(Math.min(1439, currentEndMins));

        new PromptModal(
          this.app,
          t('calendar.newBlock') || 'Nuevo bloque de estudio',
          t('calendar.defaultBlockTitle') || 'Estudio',
          (blockTitle) => {
            void (async () => {
              const title = blockTitle.trim() || t('calendar.defaultBlockTitle') || 'Estudio';
              const newBlock: CalendarTimeBlock = {
                id: String(Date.now()),
                date: dateStr,
                startTime,
                endTime,
                title,
                completed: false,
              };

              await saveTimeBlock(this.plugin, newBlock);
              new Notice(
                t('calendar.blockCreatedNotice', {
                  title: newBlock.title,
                  time: `${newBlock.startTime}—${newBlock.endTime}`,
                }) || `Bloque creado: ${newBlock.title} (${newBlock.startTime} - ${newBlock.endTime})`
              );
              await this.callbacks.onRefresh();
            })();
          },
          { defaultValueOnEmpty: t('calendar.defaultBlockTitle') }
        ).open();
      };

      window.addEventListener('pointermove', onPointerMove);
      window.addEventListener('pointerup', onPointerUp);
      window.addEventListener('pointercancel', onPointerCancel);
    });

    // Render Blocks
    const layouts = computeBlockLayouts(blocks);
    layouts.forEach((layout) => {
      this.renderPositionedBlock(col, layout, startHour, endHour);
    });

    return col;
  }

  /**
   * Renders a single positioned time block with drag-to-move, resize handles, and touch support.
   */
  private renderPositionedBlock(
    col: HTMLElement,
    layout: BlockLayout,
    startHour: number,
    endHour: number
  ): HTMLElement {
    const { block, startMin, endMin, colIndex, totalCols, hasOverlap } = layout;

    const blockEl = col.createDiv({
      cls: `study-flow-grid-block ${block.completed ? 'is-completed' : ''} ${block.isVirtual ? 'is-virtual' : ''} ${hasOverlap ? 'is-overlapping' : ''}`,
    });

    // Positioning
    const topPx = ((startMin - startHour * 60) / 60) * this.hourHeight;
    const heightPx = Math.max(22, ((endMin - startMin) / 60) * this.hourHeight);
    blockEl.style.top = `${topPx}px`;
    blockEl.style.height = `${heightPx}px`;

    // Side-by-side sub-columns when overlapping
    const colWidthPct = 100 / totalCols;
    blockEl.style.width = `calc(${colWidthPct}% - 4px)`;
    blockEl.style.left = `calc(${colIndex * colWidthPct}% + 2px)`;

    // Custom subject color border/accent
    if (block.color) {
      blockEl.style.borderLeftColor = block.color;
    }

    // Top Resize Handle
    const topHandle = blockEl.createDiv({
      cls: 'study-flow-grid-resize-handle study-flow-grid-resize-top',
      attr: { 'aria-label': t('calendar.resizeStartLabel') },
    });

    // Content container
    const content = blockEl.createDiv({ cls: 'study-flow-grid-block-content' });

    // Time & Badges Row
    const topMeta = content.createDiv({ cls: 'study-flow-grid-block-meta' });
    topMeta.createSpan({
      text: `${block.startTime}–${block.endTime}`,
      cls: 'study-flow-grid-block-time',
    });

    if (block.isVirtual) {
      topMeta.createSpan({
        text: t('calendar.virtualSchedulePillLetter'),
        cls: 'study-flow-grid-virtual-pill',
        attr: { title: t('calendar.virtualScheduleBadge') || 'Horario recurrente' },
      });
    }

    if (hasOverlap) {
      const warnIcon = topMeta.createSpan({
        cls: 'study-flow-grid-overlap-pill',
        attr: { title: t('calendar.overlappingBadge') || 'Solapamiento de horario detectado' },
      });
      setIcon(warnIcon, 'alert-triangle');
    }

    // Title
    content.createDiv({
      text: block.title,
      cls: `study-flow-grid-block-title ${block.completed ? 'is-strikethrough' : ''}`,
    });

    // Actions bar (Focus timer, Checkbox, Delete)
    const actionsBar = content.createDiv({ cls: 'study-flow-grid-block-actions' });

    // Checkbox
    const cb = actionsBar.createEl('input', {
      type: 'checkbox',
      cls: 'study-flow-timeblock-cb',
      attr: { 'aria-label': t('calendar.timeBlockCheckboxAria', { title: block.title }) },
    });
    cb.checked = !!block.completed;
    cb.addEventListener('change', (e) => {
      void (async () => {
        e.stopPropagation();
        await toggleTimeBlockCompletion(this.plugin, block.date, block.id, cb.checked);
        await this.callbacks.onRefresh();
      })();
    });

    // Pomodoro Focus button
    const pomoBtn = actionsBar.createEl('button', {
      cls: 'study-flow-icon-action-btn',
      attr: { 'aria-label': t('calendar.focusBlockTooltip') },
    });
    setIcon(pomoBtn, 'timer');
    pomoBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      void this.plugin.pomodoro.setActiveTask({
        id: block.id,
        text: `${block.title} [${block.startTime} - ${block.endTime}]`,
        sourceFile: getDailyNotePath(this.plugin.settings, block.date),
        isTimeBlock: true,
      });
      this.callbacks.onSwitchTab('pomodoro');
    });

    // Edit button
    const editBtn = actionsBar.createEl('button', {
      cls: 'study-flow-icon-action-btn',
      attr: { 'aria-label': t('calendar.editBlockTooltip') },
    });
    setIcon(editBtn, 'pencil');
    editBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      new PromptModal(
        this.app,
        t('calendar.blockTitlePlaceholder') || 'Título del bloque',
        block.title,
        (newTitle) => {
          void (async () => {
            const trimmed = newTitle.trim();
            if (trimmed && trimmed !== block.title) {
              block.title = trimmed;
              await saveTimeBlock(this.plugin, block);
              new Notice(t('calendar.blockSavedNotice', { title: trimmed }));
              await this.callbacks.onRefresh();
            }
          })();
        },
        { initialValue: block.title }
      ).open();
    });

    // Delete button
    const delBtn = actionsBar.createEl('button', {
      cls: 'study-flow-icon-action-btn',
      attr: { 'aria-label': t('calendar.deleteBlockTooltip') },
    });
    setIcon(delBtn, 'trash-2');
    delBtn.addEventListener('click', (e) => {
      void (async () => {
        e.stopPropagation();
        await deleteTimeBlock(this.plugin, block.date, block.id);
        new Notice(t('calendar.blockDeletedNotice'));
        await this.callbacks.onRefresh();
      })();
    });

    // Bottom Resize Handle
    const bottomHandle = blockEl.createDiv({
      cls: 'study-flow-grid-resize-handle study-flow-grid-resize-bottom',
      attr: { 'aria-label': t('calendar.resizeEndLabel') },
    });

    // Setup Drag-To-Move and Resizing with PointerEvents
    this.attachPointerInteractions(blockEl, topHandle, bottomHandle, block, startHour, endHour);

    return blockEl;
  }

  /**
   * Unifies drag-to-move, top-resize, and bottom-resize with PointerEvents
   * supporting desktop mice and touch screens with 15-min snapping.
   */
  private attachPointerInteractions(
    blockEl: HTMLElement,
    topHandle: HTMLElement,
    bottomHandle: HTMLElement,
    block: CalendarTimeBlock,
    startHour: number,
    endHour: number
  ): void {
    let activeMode: 'move' | 'resize-top' | 'resize-bottom' | null = null;
    let initialY = 0;
    let initialStartMins = 0;
    let initialEndMins = 0;
    let origDuration = 0;

    const handlePointerDown = (e: PointerEvent, mode: 'move' | 'resize-top' | 'resize-bottom') => {
      // Ignore if clicking on interactive buttons or checkbox
      if ((e.target as HTMLElement).closest('button, input, a')) {
        return;
      }
      if (e.button !== 0) return;

      activeMode = mode;
      initialY = e.clientY;
      initialStartMins = timeStringToMinutes(block.startTime);
      initialEndMins = timeStringToMinutes(block.endTime);
      origDuration = initialEndMins - initialStartMins;

      blockEl.addClass('is-dragging');
      blockEl.setPointerCapture(e.pointerId);
      e.stopPropagation();
    };

    topHandle.addEventListener('pointerdown', (e) => handlePointerDown(e, 'resize-top'));
    bottomHandle.addEventListener('pointerdown', (e) => handlePointerDown(e, 'resize-bottom'));
    blockEl.addEventListener('pointerdown', (e) => {
      if (e.target === topHandle || e.target === bottomHandle) return;
      handlePointerDown(e, 'move');
    });

    blockEl.addEventListener('pointermove', (e: PointerEvent) => {
      if (!activeMode) return;

      const deltaY = e.clientY - initialY;
      const deltaMins = Math.round(((deltaY / this.hourHeight) * 60) / 15) * 15;

      if (activeMode === 'move') {
        const minAllowed = startHour * 60;
        const maxAllowed = Math.min(1439, (endHour + 1) * 60) - origDuration;
        const newStart = Math.max(minAllowed, Math.min(maxAllowed, initialStartMins + deltaMins));
        const newTop = ((newStart - startHour * 60) / 60) * this.hourHeight;
        blockEl.style.top = `${newTop}px`;
      } else if (activeMode === 'resize-top') {
        const minAllowed = startHour * 60;
        const maxAllowed = Math.min(1439, initialEndMins) - 15; // At least 15 mins duration
        const newStart = Math.max(minAllowed, Math.min(maxAllowed, initialStartMins + deltaMins));
        const newTop = ((newStart - startHour * 60) / 60) * this.hourHeight;
        const newHeight = ((Math.min(1439, initialEndMins) - newStart) / 60) * this.hourHeight;
        blockEl.style.top = `${newTop}px`;
        blockEl.style.height = `${newHeight}px`;
      } else if (activeMode === 'resize-bottom') {
        const minAllowed = initialStartMins + 15; // At least 15 mins duration
        const maxAllowed = Math.min(1439, (endHour + 1) * 60);
        const newEnd = Math.min(1439, Math.max(minAllowed, Math.min(maxAllowed, initialEndMins + deltaMins)));
        const newHeight = ((newEnd - initialStartMins) / 60) * this.hourHeight;
        blockEl.style.height = `${newHeight}px`;
      }
    });

    const handlePointerEnd = async (e: PointerEvent) => {
      if (!activeMode) return;

      const mode = activeMode;
      activeMode = null;
      blockEl.removeClass('is-dragging');
      try {
        blockEl.releasePointerCapture(e.pointerId);
      } catch {
        // Safe ignore
      }

      const deltaY = e.clientY - initialY;
      const deltaMins = Math.round(((deltaY / this.hourHeight) * 60) / 15) * 15;

      let finalStartMins = initialStartMins;
      let finalEndMins = initialEndMins;

      if (mode === 'move') {
        const minAllowed = startHour * 60;
        const maxAllowed = Math.min(1439, (endHour + 1) * 60) - origDuration;
        finalStartMins = Math.max(minAllowed, Math.min(maxAllowed, initialStartMins + deltaMins));
        finalEndMins = Math.min(1439, finalStartMins + origDuration);
      } else if (mode === 'resize-top') {
        const minAllowed = startHour * 60;
        const maxAllowed = Math.min(1439, initialEndMins) - 15;
        finalStartMins = Math.max(minAllowed, Math.min(maxAllowed, initialStartMins + deltaMins));
        finalEndMins = Math.min(1439, initialEndMins);
      } else if (mode === 'resize-bottom') {
        const minAllowed = initialStartMins + 15;
        const maxAllowed = Math.min(1439, (endHour + 1) * 60);
        finalEndMins = Math.min(1439, Math.max(minAllowed, Math.min(maxAllowed, initialEndMins + deltaMins)));
      }

      // If changed, persist updated block
      if (finalStartMins !== initialStartMins || finalEndMins !== initialEndMins) {
        const updatedBlock: CalendarTimeBlock = {
          ...block,
          startTime: minutesToTimeString(finalStartMins),
          endTime: minutesToTimeString(finalEndMins),
          isVirtual: undefined, // Strips virtual when user moves/resizes it
        };
        await saveTimeBlock(this.plugin, updatedBlock);
        await this.callbacks.onRefresh();
      }
    };

    blockEl.addEventListener('pointerup', (e: PointerEvent) => {
      void handlePointerEnd(e);
    });
    blockEl.addEventListener('pointercancel', (e: PointerEvent) => {
      void handlePointerEnd(e);
    });
  }

  public destroy(): void {
    if (this.activeDragCleanup) {
      this.activeDragCleanup();
      this.activeDragCleanup = null;
    }
    const danglingPreviews = document.querySelectorAll('.study-flow-grid-block.is-creation-preview');
    danglingPreviews.forEach((el) => el.remove());
  }
}
