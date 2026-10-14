import { App, Notice, setIcon } from 'obsidian';
import type StudyFlowPlugin from '../main';
import type { TabComponent } from './types';
import {
  parseTaskPomodoroEstimate,
  PendingTaskItem,
  getCleanTaskDisplayTitle,
  getOrCreateFile,
  appendTaskToMarkdownSection,
} from '../utils';
import { SubjectSelectModal } from '../subject-modal';
import { t } from '../i18n/index.ts';

const CIRCLE_RADIUS = 76;
const CIRCUMFERENCE = 2 * Math.PI * CIRCLE_RADIUS;

export class PomodoroTab implements TabComponent {
  private app: App;
  private plugin: StudyFlowPlugin;
  private container: HTMLElement | null = null;
  private isAdjustingPomodoroTimes: boolean = false;
  private isSelectingTaskForPomodoro: boolean = false;
  private pendingInboxTasks: PendingTaskItem[] = [];

  constructor(app: App, plugin: StudyFlowPlugin) {
    this.app = app;
    this.plugin = plugin;
  }

  async render(container: HTMLElement): Promise<void> {
    this.container = container;
    container.empty();

    const status = this.plugin.pomodoro.getStatus();
    const card = container.createDiv({ cls: 'study-flow-card study-flow-pomodoro-luxury-card' });

    // Presets bar
    const presetsRow = card.createDiv({ cls: 'study-flow-presets-bar' });
    const presets = [
      { label: '25m', mins: 25, mode: 'work' as const },
      { label: '50m', mins: 50, mode: 'work' as const },
      { label: '5m', mins: 5, mode: 'break' as const },
      { label: '15m', mins: 15, mode: 'break' as const },
    ];

    presets.forEach((p) => {
      const chip = presetsRow.createEl('button', {
        text: p.label,
        cls: 'study-flow-preset-chip',
      });
      chip.addEventListener('click', () => {
        this.plugin.pomodoro.setCustomMinutes(p.mins, p.mode);
      });
    });

    // In-place adjust toggle chip
    const adjustBtn = presetsRow.createEl('button', {
      cls: `study-flow-preset-chip study-flow-adjust-toggle-chip ${this.isAdjustingPomodoroTimes ? 'is-active' : ''}`,
      attr: { 'aria-label': t('pomodoro.configureTimes') },
    });
    const adjIcon = adjustBtn.createSpan();
    setIcon(adjIcon, 'sliders');
    adjustBtn.createSpan({ text: this.isAdjustingPomodoroTimes ? t('common.close') : t('pomodoro.adjust') });
    adjustBtn.addEventListener('click', () => {
      this.isAdjustingPomodoroTimes = !this.isAdjustingPomodoroTimes;
      if (this.container) void this.render(this.container);
    });

    const zenBtn = presetsRow.createEl('button', {
      cls: `study-flow-preset-chip study-flow-zen-toggle-chip ${this.plugin.zen.isZen() ? 'is-active' : ''}`,
      attr: { 'aria-label': t('pomodoro.toggleZenTooltip') },
    });
    const zenIcon = zenBtn.createSpan();
    setIcon(zenIcon, 'eye-off');
    zenBtn.createSpan({ text: this.plugin.zen.isZen() ? t('pomodoro.zenActive') : t('pomodoro.zen') });
    zenBtn.addEventListener('click', () => {
      this.plugin.zen.toggleZen();
      if (this.container) void this.render(this.container);
    });

    // In-place Custom Durations Panel
    if (this.isAdjustingPomodoroTimes) {
      const customPanel = card.createDiv({ cls: 'study-flow-pomodoro-custom-panel' });

      const panelTitle = customPanel.createDiv({ cls: 'study-flow-custom-panel-title' });
      const titleIcon = panelTitle.createSpan({ cls: 'study-flow-panel-title-icon' });
      setIcon(titleIcon, 'clock');
      panelTitle.createSpan({ text: ` ${t('pomodoro.customTimesTitle')}` });

      const controlsRow = customPanel.createDiv({ cls: 'study-flow-custom-controls-row' });

      // Work Duration Stepper
      const workCol = controlsRow.createDiv({ cls: 'study-flow-stepper-col' });
      workCol.createEl('span', { text: t('pomodoro.focusMinutes'), cls: 'study-flow-stepper-label' });
      const workControls = workCol.createDiv({ cls: 'study-flow-stepper-controls' });
      const workMinusBtn = workControls.createEl('button', {
        text: '−',
        cls: 'study-flow-stepper-btn',
        attr: { 'aria-label': t('pomodoro.decreaseFocus') },
      });
      const workInput = workControls.createEl('input', {
        type: 'number',
        cls: 'study-flow-stepper-input',
        value: String(this.plugin.settings.pomodoroWorkDuration),
        attr: { min: '1', max: '180', step: '5', 'aria-label': t('pomodoro.focusMinutesAria') },
      });
      const workPlusBtn = workControls.createEl('button', {
        text: '+',
        cls: 'study-flow-stepper-btn',
        attr: { 'aria-label': t('pomodoro.increaseFocus') },
      });

      workMinusBtn.addEventListener('click', () => {
        const val = Math.max(1, (parseInt(workInput.value, 10) || 25) - 5);
        workInput.value = String(val);
      });
      workPlusBtn.addEventListener('click', () => {
        const val = Math.min(180, (parseInt(workInput.value, 10) || 25) + 5);
        workInput.value = String(val);
      });

      // Break Duration Stepper
      const breakCol = controlsRow.createDiv({ cls: 'study-flow-stepper-col' });
      breakCol.createEl('span', { text: t('pomodoro.breakMinutes'), cls: 'study-flow-stepper-label' });
      const breakControls = breakCol.createDiv({ cls: 'study-flow-stepper-controls' });
      const breakMinusBtn = breakControls.createEl('button', {
        text: '−',
        cls: 'study-flow-stepper-btn',
        attr: { 'aria-label': t('pomodoro.decreaseBreak') },
      });
      const breakInput = breakControls.createEl('input', {
        type: 'number',
        cls: 'study-flow-stepper-input',
        value: String(this.plugin.settings.pomodoroBreakDuration),
        attr: { min: '1', max: '60', step: '1', 'aria-label': t('pomodoro.breakMinutesAria') },
      });
      const breakPlusBtn = breakControls.createEl('button', {
        text: '+',
        cls: 'study-flow-stepper-btn',
        attr: { 'aria-label': t('pomodoro.increaseBreak') },
      });

      breakMinusBtn.addEventListener('click', () => {
        const val = Math.max(1, (parseInt(breakInput.value, 10) || 5) - 1);
        breakInput.value = String(val);
      });
      breakPlusBtn.addEventListener('click', () => {
        const val = Math.min(60, (parseInt(breakInput.value, 10) || 5) + 1);
        breakInput.value = String(val);
      });

      // Default Checkbox & Apply button
      const actionsRow = customPanel.createDiv({ cls: 'study-flow-custom-actions-row' });
      const checkWrap = actionsRow.createDiv({ cls: 'study-flow-custom-check-wrap' });
      const defaultCheck = checkWrap.createEl('input', {
        type: 'checkbox',
        cls: 'study-flow-checkbox',
        attr: { id: 'sf-save-default' },
      });
      defaultCheck.checked = true;
      checkWrap.createEl('label', { text: t('pomodoro.saveAsDefault'), attr: { for: 'sf-save-default' } });

      const applyBtn = actionsRow.createEl('button', {
        cls: 'mod-cta study-flow-btn-sm',
        text: t('pomodoro.applyTimes'),
      });
      applyBtn.addEventListener('click', async () => {
        const workVal = Math.max(1, parseInt(workInput.value, 10) || 25);
        const breakVal = Math.max(1, parseInt(breakInput.value, 10) || 5);
        await this.plugin.pomodoro.setCustomWorkAndBreak(workVal, breakVal, defaultCheck.checked);
        new Notice(t('pomodoro.timesConfiguredNotice', { work: String(workVal), break: String(breakVal) }));
        this.isAdjustingPomodoroTimes = false;
        if (this.container) await this.render(this.container);
      });
    }

    // Active Task Linking Section
    await this.renderActiveTaskBanner(card, status);

    // Luxury Dial Wrapper
    const dialWrapper = card.createDiv({ cls: 'study-flow-dial-wrapper' });
    dialWrapper.createDiv({
      cls: `study-flow-dial-aura ${status.mode === 'work' ? 'is-work' : 'is-break'} ${status.state === 'running' ? 'is-pulsing' : ''}`,
    });

    const dialContainer = dialWrapper.createDiv({ cls: 'study-flow-dial-container' });

    const svgEl = dialContainer.createSvg('svg', {
      cls: 'study-flow-dial-svg',
      attr: { viewBox: '0 0 190 190' },
    });

    // Defs for gradients
    const defs = svgEl.createSvg('defs');
    const gradWork = defs.createSvg('linearGradient', {
      attr: { id: 'view-pomodoro-grad-work', x1: '0%', y1: '0%', x2: '100%', y2: '100%' },
    });
    gradWork.createSvg('stop', { attr: { offset: '0%', 'stop-color': '#ff4d4f' } });
    gradWork.createSvg('stop', { attr: { offset: '100%', 'stop-color': '#fa8c16' } });

    const gradBreak = defs.createSvg('linearGradient', {
      attr: { id: 'view-pomodoro-grad-break', x1: '0%', y1: '0%', x2: '100%', y2: '100%' },
    });
    gradBreak.createSvg('stop', { attr: { offset: '0%', 'stop-color': '#10b981' } });
    gradBreak.createSvg('stop', { attr: { offset: '100%', 'stop-color': '#06b6d4' } });

    // 12 Chronograph ticks
    const ticksGroup = svgEl.createSvg('g', { cls: 'study-flow-ticks-group' });
    for (let i = 0; i < 12; i++) {
      const angle = (i / 12) * 2 * Math.PI;
      const x1 = 95 + (CIRCLE_RADIUS - 6) * Math.cos(angle);
      const y1 = 95 + (CIRCLE_RADIUS - 6) * Math.sin(angle);
      const x2 = 95 + (CIRCLE_RADIUS + 6) * Math.cos(angle);
      const y2 = 95 + (CIRCLE_RADIUS + 6) * Math.sin(angle);

      ticksGroup.createSvg('line', {
        cls: 'study-flow-dial-tick',
        attr: { x1: String(x1), y1: String(y1), x2: String(x2), y2: String(y2) },
      });
    }

    // Track circle
    svgEl.createSvg('circle', {
      cls: 'study-flow-dial-bg',
      attr: { cx: '95', cy: '95', r: String(CIRCLE_RADIUS) },
    });

    // Progress circle
    svgEl.createSvg('circle', {
      cls: `study-flow-dial-progress ${status.mode === 'work' ? 'is-work' : 'is-break'}`,
      attr: {
        cx: '95',
        cy: '95',
        r: String(CIRCLE_RADIUS),
        'stroke-dasharray': String(CIRCUMFERENCE),
      },
    });

    // Dial center text
    const centerInfo = dialContainer.createDiv({ cls: 'study-flow-dial-center' });

    const pillText = status.mode === 'work'
      ? t('pomodoro.pillFocus')
      : (status.isLongBreak ? t('pomodoro.pillLongBreak') : t('pomodoro.pillBreak'));

    centerInfo.createDiv({
      text: pillText,
      cls: `study-flow-luxury-pill ${status.mode === 'work' ? 'is-work' : 'is-break'}`,
    });

    centerInfo.createDiv({
      text: this.plugin.pomodoro.formatTime(status.remainingSeconds),
      cls: 'study-flow-dial-time-hero',
    });

    // Streak / Cycle dots
    const streakRow = centerInfo.createDiv({ cls: 'study-flow-streak-dots' });
    const interval = status.longBreakInterval || 4;
    for (let i = 1; i <= interval; i++) {
      const dot = streakRow.createDiv({
        cls: `study-flow-streak-dot ${i <= status.streak ? 'is-filled' : ''}`,
      });
      dot.setAttribute('title', t('pomodoro.sessionIndicator', { current: String(i), total: String(interval) }));
    }

    centerInfo.createDiv({
      text: t('pomodoro.completedToday', { count: String(status.completedSessionsToday) }),
      cls: 'study-flow-dial-stats-sub',
    });

    // Control Deck
    const controlDeck = card.createDiv({ cls: 'study-flow-control-deck' });

    const resetBtn = controlDeck.createEl('button', {
      cls: 'study-flow-deck-btn study-flow-deck-btn-secondary',
      attr: { 'aria-label': t('pomodoro.reset') },
    });
    setIcon(resetBtn, 'rotate-ccw');
    resetBtn.addEventListener('click', () => {
      this.plugin.pomodoro.reset();
    });

    const isRunning = status.state === 'running';
    const heroBtn = controlDeck.createEl('button', {
      cls: `study-flow-hero-play-btn ${isRunning ? 'is-running' : ''} ${status.mode === 'work' ? 'is-work' : 'is-break'}`,
      attr: { 'aria-label': isRunning ? t('pomodoro.pause') : t('pomodoro.start') },
    });
    const heroIcon = heroBtn.createSpan({ cls: 'study-flow-hero-icon' });
    setIcon(heroIcon, isRunning ? 'pause' : 'play');
    heroBtn.addEventListener('click', () => {
      this.plugin.pomodoro.toggleStartPause();
    });

    const skipBtn = controlDeck.createEl('button', {
      cls: 'study-flow-deck-btn study-flow-deck-btn-secondary',
      attr: { 'aria-label': t('pomodoro.skip') },
    });
    setIcon(skipBtn, 'skip-forward');
    skipBtn.addEventListener('click', () => {
      this.plugin.pomodoro.skipCycle();
    });

    const add5Btn = controlDeck.createEl('button', {
      cls: 'study-flow-deck-btn study-flow-deck-btn-secondary',
      attr: { 'aria-label': t('pomodoro.add5mTooltip') },
    });
    const plusIcon = add5Btn.createSpan();
    setIcon(plusIcon, 'plus');
    add5Btn.createSpan({ text: '5m', cls: 'study-flow-deck-btn-label' });
    add5Btn.addEventListener('click', () => {
      this.plugin.pomodoro.addMinutes(5);
    });

    this.updateProgressRing(status);
  }

  private async renderActiveTaskBanner(container: HTMLElement, status: any): Promise<void> {
    const taskSection = container.createDiv({ cls: 'study-flow-active-task-container' });

    if (status.activeTask) {
      const banner = taskSection.createDiv({ cls: 'study-flow-active-task-banner' });
      const targetIcon = banner.createSpan({ cls: 'study-flow-task-target-icon' });
      setIcon(targetIcon, 'target');

      const textWrap = banner.createDiv({ cls: 'study-flow-task-banner-text' });
      textWrap.createSpan({ text: t('pomodoro.focusedOn'), cls: 'study-flow-task-banner-label' });
      textWrap.createSpan({ text: getCleanTaskDisplayTitle(status.activeTask.text), cls: 'study-flow-task-banner-name' });

      const { estimated, completed } = parseTaskPomodoroEstimate(status.activeTask.text);
      if (estimated || (completed && completed > 0)) {
        const estText = (completed && completed > 0 && estimated)
          ? ` • 🍅 ${completed}/${estimated}`
          : (estimated ? ` • 🍅 ${estimated} est.` : ` • 🍅 ${completed}`);
        textWrap.createSpan({ text: estText, cls: 'study-flow-active-task-pomo-hint' });
      }

      const completeBtn = banner.createEl('button', {
        cls: 'study-flow-task-complete-btn',
        attr: { 'aria-label': t('pomodoro.markAsCompleted') },
      });
      const cIcon = completeBtn.createSpan();
      setIcon(cIcon, 'check');
      completeBtn.createSpan({ text: t('pomodoro.complete') });
      completeBtn.addEventListener('click', async () => {
        await this.plugin.pomodoro.completeActiveTask();
        if (this.container) await this.render(this.container);
      });

      const unlinkBtn = banner.createEl('button', {
        cls: 'study-flow-icon-action-btn',
        attr: { 'aria-label': t('pomodoro.unlinkTask') },
      });
      setIcon(unlinkBtn, 'x');
      unlinkBtn.addEventListener('click', async () => {
        this.plugin.pomodoro.setActiveTask(null);
        if (this.container) await this.render(this.container);
      });
    } else {
      // If a subject is actively chosen without a task, render active subject banner
      if (status.activeSubject) {
        const subBanner = taskSection.createDiv({ cls: 'study-flow-active-task-banner study-flow-active-subject-banner' });
        if (status.activeSubject.color) {
          subBanner.style.borderLeftColor = status.activeSubject.color;
        }
        const sIcon = subBanner.createSpan({ cls: 'study-flow-task-target-icon' });
        setIcon(sIcon, 'book-open');
        if (status.activeSubject.color) {
          sIcon.style.color = status.activeSubject.color;
        }

        const textWrap = subBanner.createDiv({ cls: 'study-flow-task-banner-text' });
        textWrap.createSpan({ text: t('subjects.title'), cls: 'study-flow-task-banner-label' });
        const nameSpan = textWrap.createSpan({ text: status.activeSubject.name, cls: 'study-flow-task-banner-name' });
        if (status.activeSubject.color) {
          nameSpan.style.color = status.activeSubject.color;
        }
        textWrap.createSpan({
          text: ` (${status.activeSubject.tag})`,
          cls: 'study-flow-text-muted study-flow-subject-tag-hint',
        });

        const changeBtn = subBanner.createEl('button', {
          cls: 'study-flow-mini-btn',
          text: t('subjects.chooseSubjectBtn'),
          attr: { 'aria-label': t('subjects.changeSubjectTooltip') },
        });
        changeBtn.addEventListener('click', () => {
          new SubjectSelectModal(this.app, this.plugin, async (chosen) => {
            await this.plugin.pomodoro.setActiveSubject(chosen);
            if (this.container) await this.render(this.container);
          }).open();
        });

        const unlinkSubBtn = subBanner.createEl('button', {
          cls: 'study-flow-icon-action-btn',
          attr: { 'aria-label': t('subjects.unlinkSubjectTooltip') },
        });
        setIcon(unlinkSubBtn, 'x');
        unlinkSubBtn.addEventListener('click', async () => {
          await this.plugin.pomodoro.setActiveSubject(null);
          if (this.container) await this.render(this.container);
        });
      }

      if (!this.isSelectingTaskForPomodoro) {
        const btnRow = taskSection.createDiv({ cls: 'study-flow-link-buttons-row' });
        const linkBtn = btnRow.createEl('button', { cls: 'study-flow-link-task-btn' });
        const tIcon = linkBtn.createSpan();
        setIcon(tIcon, 'target');
        linkBtn.createSpan({ text: t('pomodoro.linkTask') });
        linkBtn.addEventListener('click', async () => {
          this.isSelectingTaskForPomodoro = true;
          this.loadPendingInboxTasks();
          if (this.container) await this.render(this.container);
        });

        if (!status.activeSubject) {
          const linkSubBtn = btnRow.createEl('button', { cls: 'study-flow-link-task-btn study-flow-link-subject-btn' });
          const subIcon = linkSubBtn.createSpan();
          setIcon(subIcon, 'book-open');
          linkSubBtn.createSpan({ text: t('subjects.chooseSubjectBtn') });
          linkSubBtn.addEventListener('click', () => {
            new SubjectSelectModal(this.app, this.plugin, async (chosen) => {
              await this.plugin.pomodoro.setActiveSubject(chosen);
              if (this.container) await this.render(this.container);
            }).open();
          });
        }
      } else {
        const pickerBox = taskSection.createDiv({ cls: 'study-flow-task-picker-box' });
        pickerBox.createEl('div', { text: t('pomodoro.selectInboxTask'), cls: 'study-flow-picker-title' });

        // Quick add task input
        const quickRow = pickerBox.createDiv({ cls: 'study-flow-search-bar study-flow-task-add-bar study-flow-picker-add-row' });
        const quickInput = quickRow.createEl('input', {
          type: 'text',
          placeholder: t('pomodoro.quickTaskPlaceholder'),
          cls: 'study-flow-task-input',
        });
        const quickBtn = quickRow.createEl('button', { cls: 'mod-cta' });
        quickBtn.createSpan({ text: t('pomodoro.linkQuickTaskBtn') });

        const handleQuickLink = async () => {
          const val = quickInput.value.trim();
          if (!val) return;
          const inboxPath = this.plugin.settings.inboxFilePath || 'StudyFlow/Inbox.md';
          const defaultContent = `# Inbox\n\n## Tareas\n\n## Icebox\n\n`;
          const file = await getOrCreateFile(this.app, inboxPath, defaultContent);
          await this.app.vault.process(file, (content) => {
            return appendTaskToMarkdownSection(content, val, this.plugin.settings.tasksSectionHeader);
          });
          if (this.plugin.taskIndex) {
            await this.plugin.taskIndex.indexFile(file);
          }
          await this.plugin.pomodoro.setActiveTask({
            id: `${file.path}#${val}`,
            text: val,
            sourceFile: file.path,
          });
          this.isSelectingTaskForPomodoro = false;
          new Notice(t('pomodoro.focusedOnNotice', { task: val }));
          if (this.container) await this.render(this.container);
        };

        quickBtn.addEventListener('click', () => {
          void handleQuickLink();
        });
        quickInput.addEventListener('keydown', (e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            void handleQuickLink();
          }
        });

        if (this.pendingInboxTasks.length === 0) {
          pickerBox.createDiv({ cls: 'study-flow-empty-tasks', text: t('pomodoro.noPendingTasks') });
        } else {
          this.pendingInboxTasks.forEach((tTask) => {
            const cleanTitle = getCleanTaskDisplayTitle(tTask.text);
            const item = pickerBox.createEl('button', {
              cls: 'study-flow-picker-item',
              attr: { 'aria-label': t('pomodoro.selectTaskLabel', { text: cleanTitle }) },
            });
            item.createSpan({ text: cleanTitle });
            item.addEventListener('click', async () => {
              this.plugin.pomodoro.setActiveTask({
                id: tTask.id,
                text: tTask.text,
                sourceFile: tTask.sourceFile,
              });
              this.isSelectingTaskForPomodoro = false;
              if (this.container) await this.render(this.container);
            });
          });
        }

        const cancelPicker = pickerBox.createEl('button', { text: t('common.cancel'), cls: 'study-flow-mini-btn' });
        cancelPicker.addEventListener('click', async () => {
          this.isSelectingTaskForPomodoro = false;
          if (this.container) await this.render(this.container);
        });
      }
    }
  }

  private loadPendingInboxTasks(): void {
    if (this.plugin.taskIndex) {
      this.pendingInboxTasks = this.plugin.taskIndex.getPendingTasks();
    } else {
      this.pendingInboxTasks = [];
    }
  }

  public updateClock(): void {
    if (!this.container) return;
    const status = this.plugin.pomodoro.getStatus();

    const timeEl = this.container.querySelector('.study-flow-dial-time-hero');
    if (timeEl) {
      timeEl.setText(this.plugin.pomodoro.formatTime(status.remainingSeconds));
    }

    const pillEl = this.container.querySelector('.study-flow-luxury-pill');
    if (pillEl) {
      pillEl.setText(
        status.mode === 'work'
          ? t('pomodoro.pillFocus')
          : (status.isLongBreak ? t('pomodoro.pillLongBreak') : t('pomodoro.pillBreak'))
      );
      pillEl.className = `study-flow-luxury-pill ${status.mode === 'work' ? 'is-work' : 'is-break'}`;
    }

    const auraEl = this.container.querySelector('.study-flow-dial-aura');
    if (auraEl) {
      auraEl.className = `study-flow-dial-aura ${status.mode === 'work' ? 'is-work' : 'is-break'} ${status.state === 'running' ? 'is-pulsing' : ''}`;
    }

    const statsEl = this.container.querySelector('.study-flow-dial-stats-sub');
    if (statsEl) {
      statsEl.setText(t('pomodoro.completedToday', { count: String(status.completedSessionsToday) }));
    }

    // Streak dots
    const streakRow = this.container.querySelector('.study-flow-streak-dots');
    if (streakRow) {
      streakRow.empty();
      const interval = status.longBreakInterval || 4;
      for (let i = 1; i <= interval; i++) {
        const dot = streakRow.createDiv({
          cls: `study-flow-streak-dot ${i <= status.streak ? 'is-filled' : ''}`,
        });
        dot.setAttribute('title', t('pomodoro.sessionIndicator', { current: String(i), total: String(interval) }));
      }
    }

    // Hero button
    const heroBtn = this.container.querySelector('.study-flow-hero-play-btn');
    if (heroBtn) {
      const isRunning = status.state === 'running';
      heroBtn.className = `study-flow-hero-play-btn ${isRunning ? 'is-running' : ''} ${status.mode === 'work' ? 'is-work' : 'is-break'}`;
      heroBtn.empty();
      const heroIcon = heroBtn.createSpan({ cls: 'study-flow-hero-icon' });
      setIcon(heroIcon, isRunning ? 'pause' : 'play');
    }

    this.updateProgressRing(status);
  }

  private updateProgressRing(status: { progressPercent: number; mode: string }): void {
    if (!this.container) return;
    const progressCircle = this.container.querySelector('.study-flow-dial-progress') as SVGCircleElement | null;
    if (progressCircle) {
      const offset = CIRCUMFERENCE * (1 - status.progressPercent / 100);
      progressCircle.setAttribute('stroke-dashoffset', String(offset));
      progressCircle.setAttribute(
        'class',
        `study-flow-dial-progress ${status.mode === 'work' ? 'is-work' : 'is-break'}`
      );
    }
  }

  public onTasksChanged(): void {
    if (this.isSelectingTaskForPomodoro) {
      this.loadPendingInboxTasks();
      if (this.container) void this.render(this.container);
    }
  }

  destroy(): void {
    this.container = null;
  }
}
