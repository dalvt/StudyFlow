import { App, Modal, Notice, Setting, setIcon } from 'obsidian';
import type StudyFlowPlugin from '../main';
import type { TabComponent } from './types';
import type { PomodoroPreset } from '../settings-utils';
import {
  parseTaskPomodoroEstimate,
  PendingTaskItem,
  getCleanTaskDisplayTitle,
  getOrCreateFile,
  appendTaskToMarkdownSection,
} from '../utils';
import { SubjectSelectModal } from '../subject-modal';
import { HabitSelectModal } from '../habit-select-modal';
import { t } from '../i18n/index.ts';

const CIRCLE_RADIUS = 76;
const CIRCUMFERENCE = 2 * Math.PI * CIRCLE_RADIUS;

export class PomodoroAdjustModal extends Modal {
  private plugin: StudyFlowPlugin;
  private onSaved: () => void;
  private workMinutes: number;
  private breakMinutes: number;

  constructor(app: App, plugin: StudyFlowPlugin, onSaved: () => void) {
    super(app);
    this.plugin = plugin;
    this.onSaved = onSaved;
    this.workMinutes = plugin.settings.pomodoroWorkDuration || 25;
    this.breakMinutes = plugin.settings.pomodoroBreakDuration || 5;
  }

  onOpen(): void {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.addClass('study-flow-modal');

    contentEl.createEl('h2', { text: t('pomodoro.customTimesTitle') });

    // Quick selection presets inside modal
    const quickBar = contentEl.createDiv({ cls: 'study-flow-presets-group' });
    quickBar.style.marginBottom = '16px';
    const quickPresets = [
      { name: '25 / 5', work: 25, break: 5 },
      { name: '50 / 10', work: 50, break: 10 },
      { name: '90 / 20', work: 90, break: 20 },
    ];

    let workInput: HTMLInputElement;
    let breakInput: HTMLInputElement;

    for (const q of quickPresets) {
      const chip = quickBar.createEl('button', {
        text: q.name,
        cls: 'study-flow-preset-chip',
      });
      chip.addEventListener('click', () => {
        this.workMinutes = q.work;
        this.breakMinutes = q.break;
        if (workInput) workInput.value = String(q.work);
        if (breakInput) breakInput.value = String(q.break);
      });
    }

    new Setting(contentEl)
      .setName(t('pomodoro.focusMinutes'))
      .addText((text) => {
        workInput = text.inputEl;
        text.inputEl.type = 'number';
        text.setValue(String(this.workMinutes));
        text.onChange((val) => {
          const num = parseInt(val, 10);
          if (!isNaN(num) && num > 0) this.workMinutes = num;
        });
      });

    new Setting(contentEl)
      .setName(t('pomodoro.breakMinutes'))
      .addText((text) => {
        breakInput = text.inputEl;
        text.inputEl.type = 'number';
        text.setValue(String(this.breakMinutes));
        text.onChange((val) => {
          const num = parseInt(val, 10);
          if (!isNaN(num) && num > 0) this.breakMinutes = num;
        });
      });

    let saveAsDefault = true;
    new Setting(contentEl)
      .setName(t('pomodoro.saveAsDefault'))
      .addToggle((toggle) => {
        toggle.setValue(true);
        toggle.onChange((val) => {
          saveAsDefault = val;
        });
      });

    const footer = contentEl.createDiv({ cls: 'study-flow-modal-footer' });
    const cancelBtn = footer.createEl('button', { text: t('common.cancel'), cls: 'study-flow-btn-secondary' });
    cancelBtn.addEventListener('click', () => this.close());

    const saveBtn = footer.createEl('button', { text: t('pomodoro.applyTimes'), cls: 'mod-cta' });
    saveBtn.addEventListener('click', async () => {
      await this.plugin.pomodoro.setCustomWorkAndBreak(this.workMinutes, this.breakMinutes, saveAsDefault);
      new Notice(t('pomodoro.timesConfiguredNotice', { work: String(this.workMinutes), break: String(this.breakMinutes) }));
      this.close();
      this.onSaved();
    });
  }

  onClose(): void {
    this.contentEl.empty();
  }
}
export const PomodoroCreatePresetModal = PomodoroAdjustModal;

export class PomodoroTab implements TabComponent {
  private app: App;
  private plugin: StudyFlowPlugin;
  private container: HTMLElement | null = null;
  private isSelectingTaskForPomodoro: boolean = false;
  private pendingInboxTasks: PendingTaskItem[] = [];
  private lastAnnouncedMode: 'work' | 'break' | null = null;

  constructor(app: App, plugin: StudyFlowPlugin) {
    this.app = app;
    this.plugin = plugin;
  }

  async render(container: HTMLElement): Promise<void> {
    try {
      this.container = container;
      container.empty();

      const status = this.plugin.pomodoro.getStatus();
      const isRunning = status.state === 'running';
      const card = container.createDiv({
        cls: `study-flow-card study-flow-pomodoro-luxury-card ${status.mode === 'work' ? 'is-work' : 'is-break'} ${isRunning ? 'is-running' : ''}`,
      });

      // Top bar: Adjust pomodoro button on the left, utilities (Count-up & Zen) on the right
      const topBar = card.createDiv({ cls: 'study-flow-presets-bar' });

      // Single button to adjust the Pomodoro timer
      const workDur = this.plugin.settings.pomodoroWorkDuration || 25;
      const breakDur = this.plugin.settings.pomodoroBreakDuration || 5;

      const adjustBtn = topBar.createEl('button', {
        cls: 'study-flow-preset-chip study-flow-adjust-btn',
        attr: { 'aria-label': t('pomodoro.configureTimes') },
      });
      const adjIcon = adjustBtn.createSpan({ cls: 'study-flow-chip-icon' });
      setIcon(adjIcon, 'sliders');
      adjustBtn.createSpan({ text: `${t('pomodoro.adjust')} (${workDur}m / ${breakDur}m)` });
      adjustBtn.addEventListener('click', () => {
        new PomodoroAdjustModal(this.app, this.plugin, () => {
          if (this.container) void this.render(this.container);
        }).open();
      });

      // Utilities group (Count-up & Zen)
      const utilitiesGroup = topBar.createDiv({ cls: 'study-flow-utilities-group' });

      // Count-up mode chip (Modo sin límite)
      const countUpBtn = utilitiesGroup.createEl('button', {
        cls: `study-flow-preset-chip study-flow-countup-chip ${status.isCountUp ? 'is-active' : ''}`,
        text: t('pomodoro.presetCountUp'),
        attr: { 'aria-label': t('pomodoro.presetCountUpTooltip') },
      });
      countUpBtn.addEventListener('click', async () => {
        if (!status.isCountUp) {
          await this.plugin.pomodoro.startCountUp();
        } else {
          await this.plugin.pomodoro.finishCountUpSession();
        }
        if (this.container) await this.render(this.container);
      });

      // Zen toggle chip
      const zenBtn = utilitiesGroup.createEl('button', {
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

      // Active Task Linking Section
      await this.renderActiveTaskBanner(card, status);

      // Native Dial Wrapper
      const dialWrapper = card.createDiv({ cls: 'study-flow-dial-wrapper' });
      const liveAnnouncer = dialWrapper.createDiv({
        cls: 'sr-only study-flow-sr-announcer',
        attr: { 'aria-live': 'polite', 'aria-atomic': 'true' },
      });

      const dialContainer = dialWrapper.createDiv({ cls: 'study-flow-dial-container' });

      const svgEl = dialContainer.createSvg('svg', {
        cls: 'study-flow-dial-svg',
        attr: { viewBox: '0 0 190 190' },
      });

      // Track circle
      svgEl.createSvg('circle', {
        cls: 'study-flow-dial-bg',
        attr: { cx: '95', cy: '95', r: String(CIRCLE_RADIUS) },
      });

      // Progress circle
      const progressCircle = svgEl.createSvg('circle', {
        attr: {
          cx: '95',
          cy: '95',
          r: String(CIRCLE_RADIUS),
          'stroke-dasharray': String(CIRCUMFERENCE),
        },
      });
      const activeModeCls = status.isCountUp ? 'is-countup' : (status.mode === 'work' ? 'is-work' : 'is-break');
      progressCircle.setAttribute(
        'class',
        `study-flow-dial-progress ${activeModeCls}${isRunning ? ' is-running' : ''}`
      );

    // Dial center text
    const centerInfo = dialContainer.createDiv({ cls: 'study-flow-dial-center' });

    const pillText = status.isCountUp
      ? t('pomodoro.countUpActive')
      : (status.mode === 'work'
          ? t('pomodoro.pillFocus')
          : (status.isLongBreak ? t('pomodoro.pillLongBreak') : t('pomodoro.pillBreak')));

    centerInfo.createDiv({
      text: pillText,
      cls: `study-flow-mode-pill study-flow-luxury-pill ${activeModeCls}`,
    });

    const timeHeroEl = centerInfo.createDiv({
      text: this.plugin.pomodoro.formatTime(status.remainingSeconds),
      cls: `study-flow-dial-time-hero ${isRunning ? 'is-running' : ''}`,
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
      this.plugin.pomodoro.promptReset();
    });

    if (!status.isCountUp) {
      const prevBtn = controlDeck.createEl('button', {
        cls: 'study-flow-deck-btn study-flow-deck-btn-secondary study-flow-deck-btn-prev',
        attr: { 'aria-label': t('pomodoro.previousCycle') },
      });
      setIcon(prevBtn, 'skip-back');
      prevBtn.addEventListener('click', async () => {
        await this.plugin.pomodoro.previousCycle();
        if (this.container) await this.render(this.container);
      });
    }

    const heroBtn = controlDeck.createEl('button', {
      cls: `study-flow-hero-play-btn ${isRunning ? 'is-running' : ''} ${activeModeCls}`,
      attr: { 'aria-label': isRunning ? t('pomodoro.pause') : t('pomodoro.start') },
    });
    const heroIcon = heroBtn.createSpan({ cls: 'study-flow-hero-icon' });
    setIcon(heroIcon, isRunning ? 'pause' : 'play');
    heroBtn.addEventListener('click', () => {
      this.plugin.pomodoro.toggleStartPause();
    });

    if (status.isCountUp) {
      const finishBtn = controlDeck.createEl('button', {
        cls: 'study-flow-deck-btn study-flow-deck-btn-finish',
        attr: { 'aria-label': t('pomodoro.finishSession') },
      });
      setIcon(finishBtn, 'check-square');
      finishBtn.addEventListener('click', async () => {
        await this.plugin.pomodoro.finishCountUpSession();
        if (this.container) await this.render(this.container);
      });
    } else {
      const skipBtn = controlDeck.createEl('button', {
        cls: 'study-flow-deck-btn study-flow-deck-btn-secondary study-flow-deck-btn-next',
        attr: { 'aria-label': t('pomodoro.skip') },
      });
      setIcon(skipBtn, 'skip-forward');
      skipBtn.addEventListener('click', async () => {
        await this.plugin.pomodoro.skipCycle();
        if (this.container) await this.render(this.container);
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
    }

      this.updateProgressRing(status);
    } catch (err) {
      console.error('[Study Flow Pomodoro] Error rendering pomodoro tab:', err);
      new Notice(`Pomodoro Render Error: ${(err as Error).message}`);
    }
  }

  private async renderActiveTaskBanner(container: HTMLElement, status: any): Promise<void> {
    const taskSection = container.createDiv({ cls: 'study-flow-active-task-container' });

    if (status.activeTask) {
      const isHabit = Boolean(status.activeTask.id && status.activeTask.id.startsWith('habit-'));
      const banner = taskSection.createDiv({
        cls: `study-flow-active-task-banner ${isHabit ? 'study-flow-active-habit-banner' : ''}`,
      });
      const targetIcon = banner.createSpan({ cls: 'study-flow-task-target-icon' });
      setIcon(targetIcon, isHabit ? 'flame' : 'target');

      const textWrap = banner.createDiv({ cls: 'study-flow-task-banner-text' });
      textWrap.createSpan({
        text: isHabit ? t('pomodoro.habitLabel') : t('pomodoro.focusedOn'),
        cls: 'study-flow-task-banner-label',
      });
      textWrap.createSpan({ text: getCleanTaskDisplayTitle(status.activeTask.text), cls: 'study-flow-task-banner-name' });

      if (!isHabit) {
        const { estimated, completed } = parseTaskPomodoroEstimate(status.activeTask.text);
        if (estimated || (completed && completed > 0)) {
          const estText = (completed && completed > 0 && estimated)
            ? ` • 🍅 ${completed}/${estimated}`
            : (estimated ? ` • 🍅 ${estimated} est.` : ` • 🍅 ${completed}`);
          textWrap.createSpan({ text: estText, cls: 'study-flow-active-task-pomo-hint' });
        }
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
        const linkBtn = btnRow.createEl('button', {
          cls: 'study-flow-link-task-btn study-flow-link-task-btn-task',
          attr: { 'aria-label': t('pomodoro.linkTask') },
        });
        const tIcon = linkBtn.createSpan({ cls: 'study-flow-link-btn-icon' });
        setIcon(tIcon, 'target');
        linkBtn.createSpan({ text: t('pomodoro.linkTaskShort') });
        linkBtn.addEventListener('click', async () => {
          this.isSelectingTaskForPomodoro = true;
          this.loadPendingInboxTasks();
          if (this.container) await this.render(this.container);
        });

        const linkHabitBtn = btnRow.createEl('button', {
          cls: 'study-flow-link-task-btn study-flow-link-habit-btn',
          attr: { 'aria-label': t('pomodoro.linkHabit') },
        });
        const hIcon = linkHabitBtn.createSpan({ cls: 'study-flow-link-btn-icon' });
        setIcon(hIcon, 'flame');
        linkHabitBtn.createSpan({ text: t('pomodoro.linkHabitShort') });
        linkHabitBtn.addEventListener('click', () => {
          new HabitSelectModal(this.app, this.plugin, async (chosen) => {
            if (chosen) {
              await this.plugin.pomodoro.setActiveTask({
                id: `habit-${chosen.id}`,
                text: chosen.name,
                sourceFile: this.plugin.settings.habitsFilePath || 'StudyFlow/Habits.md',
              });
            } else {
              this.plugin.pomodoro.setActiveTask(null);
            }
            if (this.container) await this.render(this.container);
          }).open();
        });

        if (!status.activeSubject) {
          const linkSubBtn = btnRow.createEl('button', {
            cls: 'study-flow-link-task-btn study-flow-link-subject-btn',
            attr: { 'aria-label': t('subjects.chooseSubjectBtn') },
          });
          const subIcon = linkSubBtn.createSpan({ cls: 'study-flow-link-btn-icon' });
          setIcon(subIcon, 'book-open');
          linkSubBtn.createSpan({ text: t('subjects.chooseSubjectShort') });
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
    const isRunning = status.state === 'running';

    const card = this.container.querySelector('.study-flow-pomodoro-luxury-card') as HTMLElement | null;
    if (card) {
      card.classList.toggle('is-work', status.mode === 'work');
      card.classList.toggle('is-break', status.mode === 'break');
      card.classList.toggle('is-running', isRunning);
    }

    const timeEl = this.container.querySelector('.study-flow-dial-time-hero');
    if (timeEl) {
      timeEl.setText(this.plugin.pomodoro.formatTime(status.remainingSeconds));
      timeEl.classList.toggle('is-running', isRunning);
    }

    const activeModeCls = status.isCountUp ? 'is-countup' : (status.mode === 'work' ? 'is-work' : 'is-break');
    const pillEl = this.container.querySelector('.study-flow-luxury-pill');
    if (pillEl) {
      pillEl.setText(
        status.isCountUp
          ? t('pomodoro.countUpActive')
          : (status.mode === 'work'
              ? t('pomodoro.pillFocus')
              : (status.isLongBreak ? t('pomodoro.pillLongBreak') : t('pomodoro.pillBreak')))
      );
      pillEl.className = `study-flow-mode-pill study-flow-luxury-pill ${activeModeCls}`;
    }

    if (this.lastAnnouncedMode !== null && this.lastAnnouncedMode !== status.mode) {
      const announcer = this.container.querySelector('.study-flow-sr-announcer');
      if (announcer) {
        announcer.setText(
          status.mode === 'break'
            ? t('pomodoro.sessionCompletedAnnounce')
            : t('pomodoro.breakCompletedAnnounce')
        );
      }
    }
    this.lastAnnouncedMode = status.mode;

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
      heroBtn.className = `study-flow-hero-play-btn ${isRunning ? 'is-running' : ''} ${activeModeCls}`;
      heroBtn.setAttribute('aria-label', isRunning ? t('pomodoro.pause') : t('pomodoro.start'));
      heroBtn.empty();
      const heroIcon = heroBtn.createSpan({ cls: 'study-flow-hero-icon' });
      setIcon(heroIcon, isRunning ? 'pause' : 'play');
    }

    this.updateProgressRing(status);
  }

  private updateProgressRing(status: { progressPercent: number; mode: string; state?: string; isCountUp?: boolean }): void {
    if (!this.container) return;
    const progressCircle = this.container.querySelector('.study-flow-dial-progress') as SVGCircleElement | null;
    if (progressCircle) {
      const offset = CIRCUMFERENCE * (1 - status.progressPercent / 100);
      progressCircle.setAttribute('stroke-dashoffset', String(offset));
      const isRunning = status.state === 'running';
      const activeModeCls = status.isCountUp ? 'is-countup' : (status.mode === 'work' ? 'is-work' : 'is-break');
      progressCircle.setAttribute(
        'class',
        `study-flow-dial-progress ${activeModeCls}${isRunning ? ' is-running' : ''}`
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
