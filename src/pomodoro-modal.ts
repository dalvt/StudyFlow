import { App, Modal, Notice, setIcon } from 'obsidian';
import type StudyFlowPlugin from './main';
import { PomodoroStatus } from './pomodoro';
import type { PendingTaskItem } from './utils';
import { SubjectSelectModal } from './subject-modal';
import { HabitSelectModal } from './habit-select-modal';
import { t } from './i18n/index.ts';

export class PomodoroModal extends Modal {
  private plugin: StudyFlowPlugin;
  private unsubscribe: (() => void) | null = null;
  private isSelectingTask: boolean = false;
  private pendingTasks: PendingTaskItem[] = [];
  private lastTaskText: string | null = null;
  private lastSubjectId: string | null = null;
  private previousActiveElement: HTMLElement | null = null;

  constructor(app: App, plugin: StudyFlowPlugin) {
    super(app);
    this.plugin = plugin;
  }

  onOpen(): void {
    this.previousActiveElement = document.activeElement as HTMLElement | null;
    const { contentEl } = this;
    contentEl.empty();
    contentEl.addClass('study-flow-modal', 'study-flow-mini-timer-modal');

    this.renderUI();

    this.unsubscribe = this.plugin.pomodoro.subscribe(() => {
      this.updateClock();
    });
  }

  private loadPendingTasks(): void {
    if (this.plugin.taskIndex) {
      this.pendingTasks = this.plugin.taskIndex.getPendingTasks().filter((t) => !t.isIdea);
    } else {
      this.pendingTasks = [];
    }
  }

  private renderUI(): void {
    const { contentEl } = this;
    contentEl.empty();

    const status = this.plugin.pomodoro.getStatus();
    this.lastTaskText = status.activeTask?.text || null;
    this.lastSubjectId = status.activeSubject?.id || null;

    // 1. Mini Header
    const header = contentEl.createDiv({ cls: 'study-flow-mini-timer-header' });
    header.createSpan({ text: t('pomodoro.miniTimerTitle'), cls: 'study-flow-mini-timer-title' });

    const badgeText = status.isCountUp
      ? t('pomodoro.countUpActive')
      : status.mode === 'work'
        ? t('pomodoro.modeFocus')
        : (status.isLongBreak ? t('pomodoro.modeLongBreak') : t('pomodoro.modeBreak'));
    header.createSpan({
      text: badgeText,
      cls: `study-flow-mini-timer-badge ${status.mode === 'work' ? 'is-work' : 'is-break'}`,
    });

    // 2. Countdown Digits
    contentEl.createDiv({
      text: this.plugin.pomodoro.formatTime(status.remainingSeconds),
      cls: 'study-flow-mini-timer-digits',
    });

    // 3. Progress Bar
    const progressTrack = contentEl.createDiv({ cls: 'study-flow-mini-timer-progress-bar' });
    const progressFill = progressTrack.createDiv({
      cls: `study-flow-mini-timer-progress-fill ${status.mode === 'work' ? 'is-work' : 'is-break'}`,
    });
    progressFill.style.width = `${Math.min(100, Math.max(0, status.progressPercent))}%`;

    // 4. Active Task / Link Task Section
    const taskContainer = contentEl.createDiv({ cls: 'study-flow-mini-timer-task' });
    if (status.activeTask) {
      const isHabit = Boolean(status.activeTask.id && status.activeTask.id.startsWith('habit-'));
      const taskIcon = taskContainer.createSpan({ cls: 'study-flow-task-target-icon' });
      setIcon(taskIcon, isHabit ? 'flame' : 'target');
      if (isHabit) {
        taskIcon.addClass('study-flow-habit-modal-icon');
      }
      taskContainer.createSpan({ text: ` ${status.activeTask.text}` });

      const completeBtn = taskContainer.createEl('button', {
        cls: 'study-flow-mini-btn mod-cta',
        attr: { 'aria-label': t('pomodoro.completeTask') },
      });
      setIcon(completeBtn, 'check');
      completeBtn.addEventListener('click', async () => {
        await this.plugin.pomodoro.completeActiveTask();
        this.renderUI();
      });

      const unlinkBtn = taskContainer.createEl('button', {
        cls: 'study-flow-mini-btn',
        attr: { 'aria-label': t('pomodoro.unlink') },
      });
      setIcon(unlinkBtn, 'x');
      unlinkBtn.addEventListener('click', () => {
        this.plugin.pomodoro.setActiveTask(null);
        this.renderUI();
      });
    } else if (status.activeSubject) {
      const subIcon = taskContainer.createSpan({ cls: 'study-flow-task-target-icon' });
      setIcon(subIcon, 'book-open');
      if (status.activeSubject.color) {
        subIcon.style.color = status.activeSubject.color;
      }
      const labelSpan = taskContainer.createSpan({
        text: ` ${status.activeSubject.name} (${status.activeSubject.tag})`,
      });
      if (status.activeSubject.color) {
        labelSpan.style.color = status.activeSubject.color;
      }

      const unlinkBtn = taskContainer.createEl('button', {
        cls: 'study-flow-mini-btn',
        attr: { 'aria-label': t('subjects.unlinkSubjectTooltip') },
      });
      setIcon(unlinkBtn, 'x');
      unlinkBtn.addEventListener('click', async () => {
        await this.plugin.pomodoro.setActiveSubject(null);
        this.renderUI();
      });
    } else if (this.isSelectingTask) {
      this.loadPendingTasks();
      const picker = contentEl.createDiv({ cls: 'study-flow-mini-picker' });
      if (this.pendingTasks.length === 0) {
        picker.createSpan({ text: t('pomodoro.noPendingTasksShort'), cls: 'study-flow-text-muted' });
      } else {
        const select = picker.createEl('select');
        select.createEl('option', { value: '', text: t('pomodoro.selectTaskPrompt') });
        this.pendingTasks.forEach((t) => {
          select.createEl('option', { value: t.id, text: t.text });
        });
        select.addEventListener('change', () => {
          const chosen = this.pendingTasks.find((t) => t.id === select.value);
          if (chosen) {
            this.plugin.pomodoro.setActiveTask({
              id: chosen.id,
              text: chosen.text,
              sourceFile: chosen.sourceFile,
            });
            this.isSelectingTask = false;
            this.renderUI();
          }
        });
      }
      const cancelBtn = picker.createEl('button', { text: t('common.cancel'), cls: 'study-flow-mini-btn' });
      cancelBtn.addEventListener('click', () => {
        this.isSelectingTask = false;
        this.renderUI();
      });
    } else {
      const btnRow = taskContainer.createDiv({ cls: 'study-flow-link-buttons-row' });
      const linkBtn = btnRow.createEl('button', {
        text: t('pomodoro.linkTaskDots'),
        cls: 'study-flow-link-task-btn',
      });
      linkBtn.addEventListener('click', () => {
        this.isSelectingTask = true;
        this.renderUI();
      });

      const linkHabitBtn = btnRow.createEl('button', {
        text: t('pomodoro.linkHabitDots'),
        cls: 'study-flow-link-task-btn study-flow-link-habit-btn',
      });
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
          this.renderUI();
        }).open();
      });

      if ((this.plugin.settings.subjects?.length || 0) > 0) {
        const linkSubBtn = btnRow.createEl('button', {
          text: t('subjects.chooseSubjectBtn'),
          cls: 'study-flow-link-task-btn study-flow-link-subject-btn',
        });
        linkSubBtn.addEventListener('click', () => {
          new SubjectSelectModal(this.app, this.plugin, async (chosen) => {
            await this.plugin.pomodoro.setActiveSubject(chosen);
            this.renderUI();
          }).open();
        });
      }
    }

    // 5. Controls Deck
    const controls = contentEl.createDiv({ cls: 'study-flow-mini-timer-controls' });

    const resetBtn = controls.createEl('button', {
      cls: 'study-flow-btn-icon clickable-icon',
      attr: { 'aria-label': t('common.reset') },
    });
    setIcon(resetBtn, 'rotate-ccw');
    resetBtn.addEventListener('click', () => {
      this.plugin.pomodoro.promptReset();
    });

    const isRunning = status.state === 'running';
    const playBtn = controls.createEl('button', {
      cls: `mod-cta study-flow-play-btn ${isRunning ? 'is-running' : ''} clickable-icon`,
      attr: { 'aria-label': isRunning ? t('common.pause') : t('common.start') },
    });
    setIcon(playBtn, isRunning ? 'pause' : 'play');
    playBtn.addEventListener('click', () => {
      this.plugin.pomodoro.toggleStartPause();
    });
    setTimeout(() => playBtn.focus(), 20);

    if (status.isCountUp) {
      if (status.state === 'running' || status.state === 'paused') {
        const finishBtn = controls.createEl('button', {
          text: t('pomodoro.finishSession'),
          cls: 'study-flow-btn-subtle',
          attr: { 'aria-label': t('pomodoro.finishSession') },
        });
        finishBtn.addEventListener('click', async () => {
          await this.plugin.pomodoro.finishCountUpSession();
          this.renderUI();
        });
      }
    } else {
      const skipBtn = controls.createEl('button', {
        cls: 'study-flow-btn-icon clickable-icon',
        attr: { 'aria-label': t('pomodoro.skipCycle') },
      });
      setIcon(skipBtn, 'skip-forward');
      skipBtn.addEventListener('click', () => {
        this.plugin.pomodoro.skipCycle();
      });

      const add5Btn = controls.createEl('button', {
        text: t('pomodoro.add5m'),
        cls: 'study-flow-btn-subtle',
        attr: { 'aria-label': t('pomodoro.add5mTooltip') },
      });
      add5Btn.addEventListener('click', () => {
        this.plugin.pomodoro.addMinutes(5);
      });
    }

    // 6. Streak Footer
    const interval = status.longBreakInterval || 4;
    contentEl.createDiv({
      text: t('pomodoro.footerStats', {
        streak: status.streak,
        interval,
        completed: status.completedSessionsToday,
      }),
      cls: 'study-flow-text-muted study-flow-mini-timer-footer',
    });
  }

  private updateClock(): void {
    const status = this.plugin.pomodoro.getStatus();

    const currentTaskText = status.activeTask?.text || null;
    const currentSubjectId = status.activeSubject?.id || null;
    if (currentTaskText !== this.lastTaskText || currentSubjectId !== this.lastSubjectId) {
      this.renderUI();
      return;
    }

    const digitsEl = this.contentEl.querySelector('.study-flow-mini-timer-digits');
    if (digitsEl) {
      digitsEl.setText(this.plugin.pomodoro.formatTime(status.remainingSeconds));
    }

    const badgeEl = this.contentEl.querySelector('.study-flow-mini-timer-badge');
    if (badgeEl) {
      const badgeText = status.isCountUp
        ? t('pomodoro.countUpActive')
        : status.mode === 'work'
          ? t('pomodoro.modeFocus')
          : (status.isLongBreak ? t('pomodoro.modeLongBreak') : t('pomodoro.modeBreak'));
      badgeEl.setText(badgeText);
      badgeEl.className = `study-flow-mini-timer-badge ${status.mode === 'work' ? 'is-work' : 'is-break'}`;
    }


    const progressFill = this.contentEl.querySelector('.study-flow-mini-timer-progress-fill') as HTMLElement | null;
    if (progressFill) {
      progressFill.style.width = `${Math.min(100, Math.max(0, status.progressPercent))}%`;
      progressFill.className = `study-flow-mini-timer-progress-fill ${status.mode === 'work' ? 'is-work' : 'is-break'}`;
    }

    const playBtn = this.contentEl.querySelector('.study-flow-play-btn');
    if (playBtn) {
      const isRunning = status.state === 'running';
      playBtn.className = `mod-cta study-flow-play-btn ${isRunning ? 'is-running' : ''}`;
      playBtn.empty();
      setIcon(playBtn as HTMLElement, isRunning ? 'pause' : 'play');
    }

    const footerEl = this.contentEl.querySelector('.study-flow-mini-timer-footer');
    if (footerEl) {
      const interval = status.longBreakInterval || 4;
      footerEl.setText(
        t('pomodoro.footerStats', {
          streak: status.streak,
          interval,
          completed: status.completedSessionsToday,
        })
      );
    }
  }

  onClose(): void {
    if (this.unsubscribe) {
      this.unsubscribe();
      this.unsubscribe = null;
    }
    this.contentEl.empty();
    if (this.previousActiveElement && typeof this.previousActiveElement.focus === 'function') {
      this.previousActiveElement.focus();
    }
  }
}
