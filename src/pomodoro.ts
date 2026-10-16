import { App, Menu, Modal, Notice, setTooltip } from 'obsidian';
import type StudyFlowPlugin from './main';
import { playPomodoroSound, playPomodoroChime } from './audio';
import { getDailyNotePath, getOrCreateFile, parseTaskPriority, getLocalDateString } from './utils';
import { toggleTaskCompletionInFile, incrementTaskPomodoroInFile, TaskRecord } from './tasks';
import { toggleTimeBlockCompletion } from './calendar';
import { extractTagsFromText, FocusSessionRecord } from './analytics';
import { appendFocusSessionToFile } from './storage-migration';
import { PomodoroClosingReviewModal, PomodoroTaskCheckModal } from './pomodoro-task-check-modal';
import { t } from './i18n/index.ts';
import { formatPomodoroLogLine } from './conventions.ts';
import type { Subject, PomodoroPreset } from './settings-utils';
import { SubjectSelectModal } from './subject-modal';
import { normalizeTag } from './subject-analytics';
import { toggleHabitStatus } from './habits';
import {
  countCompletedSessionsToday,
  shouldTriggerLongBreak,
  calculateCycleStreak,
  checkSessionInterrupted,
  restorePomodoroState,
  shouldSendSystemNotification,
  formatStatusBarDisplay,
  PomodoroState,
  PomodoroMode,
  ActivePomodoroTask,
  PersistedPomodoroState,
  PomodoroMachineConfig,
} from './pomodoro-state';

export type { PomodoroState, PomodoroMode, ActivePomodoroTask, PersistedPomodoroState };

export class PomodoroConfirmResetModal extends Modal {
  private onConfirm: () => void;

  constructor(app: App, onConfirm: () => void) {
    super(app);
    this.onConfirm = onConfirm;
  }

  onOpen(): void {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.addClass('study-flow-modal');

    contentEl.createEl('h3', { text: t('pomodoro.confirmResetTitle') });
    contentEl.createEl('p', { text: t('pomodoro.confirmResetMessage') });

    const footer = contentEl.createDiv({ cls: 'study-flow-modal-footer' });
    const cancelBtn = footer.createEl('button', {
      text: t('common.cancel'),
      cls: 'study-flow-btn-secondary',
    });
    cancelBtn.addEventListener('click', () => this.close());

    const confirmBtn = footer.createEl('button', {
      text: t('pomodoro.confirmResetBtn'),
      cls: 'mod-warning',
    });
    confirmBtn.addEventListener('click', () => {
      this.close();
      this.onConfirm();
    });
  }

  onClose(): void {
    this.contentEl.empty();
  }
}

export interface PomodoroStatus {
  state: PomodoroState;
  mode: PomodoroMode;
  isLongBreak: boolean;
  isCountUp: boolean;
  remainingSeconds: number;
  totalDurationSeconds: number;
  completedSessionsToday: number;
  progressPercent: number;
  streak: number;
  longBreakInterval: number;
  activeTask: ActivePomodoroTask | null;
  activeSubject: Subject | null;
}

export type PomodoroListener = (status: PomodoroStatus) => void;

export class PomodoroManager {
  private plugin: StudyFlowPlugin;
  private statusBarEl: HTMLElement | null = null;
  private intervalId: number | null = null;

  private state: PomodoroState = 'idle';
  private mode: PomodoroMode = 'work';
  private isLongBreak: boolean = false;
  private isCountUp: boolean = false;
  private breakTipIndex: number = 0;
  private remainingSeconds: number = 25 * 60;
  private totalDurationSeconds: number = 25 * 60;
  private endTime: number = 0;
  private activeTask: ActivePomodoroTask | null = null;
  private activeSubject: Subject | null = null;
  private listeners: Set<PomodoroListener> = new Set();
  private lastKnownDate: string = getLocalDateString(new Date());

  constructor(plugin: StudyFlowPlugin) {
    this.plugin = plugin;
    this.totalDurationSeconds = this.plugin.settings.pomodoroWorkDuration * 60;
    this.remainingSeconds = this.totalDurationSeconds;
  }

  public initStatusBar(statusBarEl: HTMLElement): void {
    this.statusBarEl = statusBarEl;
    this.statusBarEl.addClass('study-flow-pomodoro');

    this.plugin.registerDomEvent(this.statusBarEl, 'click', (evt: MouseEvent) => {
      evt.preventDefault();
      this.toggleStartPause();
    });

    this.plugin.registerDomEvent(this.statusBarEl, 'contextmenu', (evt: MouseEvent) => {
      evt.preventDefault();
      this.showStatusBarContextMenu(evt);
    });

    this.updateDisplay();
  }

  public getElapsedSeconds(): number {
    if (this.state === 'idle') return 0;
    const currentRemaining = this.state === 'running'
      ? Math.max(0, Math.ceil((this.endTime - Date.now()) / 1000))
      : this.remainingSeconds;
    return Math.max(0, this.totalDurationSeconds - currentRemaining);
  }

  public promptReset(): void {
    if ((this.state === 'running' || this.state === 'paused') && this.getElapsedSeconds() > 60) {
      new PomodoroConfirmResetModal(this.plugin.app, async () => {
        await this.reset();
        new Notice(t('pomodoro.timerResetNotice'));
      }).open();
    } else {
      void (async () => {
        await this.reset();
        new Notice(t('pomodoro.timerResetNotice'));
      })();
    }
  }

  public showStatusBarContextMenu(evt: MouseEvent): void {
    const menu = new Menu();

    menu.addItem((item) => {
      item
        .setTitle(t('pomodoro.menuReset'))
        .setIcon('rotate-ccw')
        .onClick(() => {
          this.promptReset();
        });
    });

    menu.addItem((item) => {
      item
        .setTitle(t('pomodoro.menuSkipPhase'))
        .setIcon('fast-forward')
        .onClick(() => {
          void this.skipCycle();
        });
    });

    menu.addSeparator();

    menu.addItem((item) => {
      item
        .setTitle(t('pomodoro.presetCountUp'))
        .setIcon('play-circle')
        .onClick(() => {
          void this.startCountUp();
        });
    });

    menu.addSeparator();

    const presets = this.plugin.settings.pomodoroPresets || [];
    for (const p of presets) {
      menu.addItem((item) => {
        item
          .setTitle(`${p.name} (${p.workMinutes}m / ${p.breakMinutes}m)`)
          .setIcon('timer')
          .onClick(() => {
            void this.applyPreset(p);
          });
      });
    }

    menu.showAtMouseEvent(evt);
  }

  public subscribe(listener: PomodoroListener): () => void {
    this.listeners.add(listener);
    listener(this.getStatus());
    return () => {
      this.listeners.delete(listener);
    };
  }

  public getStatus(): PomodoroStatus {
    const progressPercent = this.totalDurationSeconds > 0
      ? Math.min(100, Math.max(0, (this.remainingSeconds / this.totalDurationSeconds) * 100))
      : (this.isCountUp ? 100 : 0);

    const completedToday = this.getCompletedSessionsToday();
    const interval = this.plugin.settings.pomodoroLongBreakInterval || 4;
    const streak = calculateCycleStreak(completedToday, interval);

    return {
      state: this.state,
      mode: this.mode,
      isLongBreak: this.isLongBreak,
      isCountUp: this.isCountUp,
      remainingSeconds: this.remainingSeconds,
      totalDurationSeconds: this.totalDurationSeconds,
      completedSessionsToday: completedToday,
      progressPercent,
      streak,
      longBreakInterval: interval,
      activeTask: this.activeTask,
      activeSubject: this.activeSubject,
    };
  }

  public getCompletedSessionsToday(): number {
    return countCompletedSessionsToday(this.plugin.focusSessions, new Date());
  }

  public isLongBreakMode(): boolean {
    return this.isLongBreak;
  }

  public async setActiveTask(task: ActivePomodoroTask | null): Promise<void> {
    this.activeTask = task;
    await this.savePomodoroState();
    this.notifyListeners();
    if (task) {
      new Notice(t('pomodoro.focusedOnNotice', { task: task.text }));
    }
  }

  public getActiveTask(): ActivePomodoroTask | null {
    return this.activeTask;
  }

  public async setActiveSubject(subject: Subject | null): Promise<void> {
    this.activeSubject = subject;
    await this.savePomodoroState();
    this.notifyListeners();
  }

  public getActiveSubject(): Subject | null {
    return this.activeSubject;
  }

  public async completeActiveTask(): Promise<void> {
    if (!this.activeTask) return;
    try {
      const activeTask = this.activeTask;
      const srcFile = activeTask.sourceFile || getDailyNotePath(this.plugin.settings, getLocalDateString(new Date()));

      if (activeTask.id && activeTask.id.startsWith('habit-')) {
        const habitId = activeTask.id.replace(/^habit-/, '');
        const habitsPath = this.plugin.settings.habitsFilePath || 'StudyFlow/Habits.md';
        const updatedHabits = await toggleHabitStatus(this.plugin.app, habitsPath, habitId, true);
        const targetHabit = updatedHabits.find((h) => h.id === habitId);
        const streakCount = targetHabit ? targetHabit.streak : 1;
        new Notice(t('habits.habitFulfilledNotice', { streak: streakCount }));
        this.activeTask = null;
        await this.savePomodoroState();
        this.notifyListeners();
        return;
      }

      if (
        activeTask.id &&
        (activeTask.id.startsWith('block-') ||
          activeTask.id.startsWith('virtual-') ||
          activeTask.text.includes('['))
      ) {
        const blockId = activeTask.id.replace(/^block-/, '');
        const dateMatch = srcFile.match(/(\d{4}-\d{2}-\d{2})/);
        const dateStr = dateMatch ? dateMatch[1] : getLocalDateString(new Date());
        await toggleTimeBlockCompletion(this.plugin, dateStr, blockId, true);
        new Notice(t('pomodoro.taskCompletedNotice', { task: activeTask.text }));
        this.activeTask = null;
        await this.savePomodoroState();
        this.notifyListeners();
        return;
      }


      const { priority } = parseTaskPriority(activeTask.text);
      const taskRecord: TaskRecord = {
        id: activeTask.id,
        originalLine: `- [ ] ${activeTask.text}`,
        text: activeTask.text,
        sourceFile: srcFile,
        completed: false,
        statusChar: ' ',
        priority,
      };

      await toggleTaskCompletionInFile(this.plugin.app, taskRecord, true);
      new Notice(t('pomodoro.taskCompletedNotice', { task: activeTask.text }));
      this.activeTask = null;
      await this.savePomodoroState();
      this.notifyListeners();
    } catch (err) {
      console.error('Error completando tarea activa de pomodoro:', err);
      new Notice(t('pomodoro.taskCompleteError'));
    }
  }

  private notifyListeners(): void {
    const status = this.getStatus();
    this.listeners.forEach((listener) => {
      try {
        listener(status);
      } catch (err) {
        console.error('Error in pomodoro listener:', err);
      }
    });
  }

  private getLocalStorageKey(): string {
    const vaultName = this.plugin.app.vault?.getName?.() || 'default';
    return `study-flow-pomodoro:${vaultName}`;
  }

  private async savePomodoroState(): Promise<void> {
    try {
      const persisted: PersistedPomodoroState = {
        mode: this.mode,
        state: this.state,
        endTime: this.state === 'running' ? this.endTime : 0,
        remainingSeconds: this.remainingSeconds,
        totalDurationSeconds: this.totalDurationSeconds,
        isLongBreak: this.isLongBreak,
        isCountUp: this.isCountUp,
        activeTask: this.activeTask,
        activeSubject: this.activeSubject,
      };
      const key = this.getLocalStorageKey();
      if (typeof this.plugin.app.saveLocalStorage === 'function') {
        this.plugin.app.saveLocalStorage(key, persisted);
      }
    } catch (err) {
      console.error('Study Flow Assistant: Error persistiendo estado pomodoro', err);
    }
  }

  public async restoreState(): Promise<void> {
    const key = this.getLocalStorageKey();
    let persisted: PersistedPomodoroState | null = null;

    if (typeof this.plugin.app.loadLocalStorage === 'function') {
      persisted = this.plugin.app.loadLocalStorage(key);
    }

    // Migration from data.json if not yet in localStorage
    if (!persisted && this.plugin.settings.persistedPomodoro) {
      persisted = this.plugin.settings.persistedPomodoro;
      if (typeof this.plugin.app.saveLocalStorage === 'function') {
        this.plugin.app.saveLocalStorage(key, persisted);
      }
      this.plugin.settings.persistedPomodoro = null;
      await this.plugin.saveSettings();
    } else if (this.plugin.settings.persistedPomodoro) {
      // Clear legacy state from settings/data.json
      this.plugin.settings.persistedPomodoro = null;
      await this.plugin.saveSettings();
    }

    if (!persisted) {
      this.totalDurationSeconds = this.plugin.settings.pomodoroWorkDuration * 60;
      this.remainingSeconds = this.totalDurationSeconds;
      this.updateDisplay();
      return;
    }

    const config: PomodoroMachineConfig = {
      workDurationMin: this.plugin.settings.pomodoroWorkDuration,
      breakDurationMin: this.plugin.settings.pomodoroBreakDuration,
      longBreakDurationMin: this.plugin.settings.pomodoroLongBreakDuration,
      longBreakInterval: this.plugin.settings.pomodoroLongBreakInterval,
      autoStartNextPhase: this.plugin.settings.autoStartNextPhase,
    };

    const countToday = this.getCompletedSessionsToday();
    const nowMs = Date.now();
    const { restored, completedSessionOnRestore, completedMode } = restorePomodoroState(
      persisted,
      config,
      countToday,
      nowMs
    );

    this.activeTask = restored.activeTask;
    this.activeSubject = restored.activeSubject || null;
    this.isLongBreak = restored.isLongBreak;
    this.isCountUp = Boolean(restored.isCountUp);
    this.mode = restored.mode;
    this.totalDurationSeconds = restored.totalDurationSeconds;
    this.remainingSeconds = restored.remainingSeconds;
    this.endTime = restored.endTime;

    if (completedSessionOnRestore && completedMode) {
      if (completedMode === 'work') {
        const durationMin = Math.round(persisted.totalDurationSeconds / 60) || this.plugin.settings.pomodoroWorkDuration;
        const sessionRecord = await this.recordFocusSession(durationMin, false);
        if (this.plugin.settings.logPomodoroToDailyNote) {
          await this.logSession();
        }
        const restoredTask = this.activeTask;
        if (restoredTask) {
          if (!restoredTask.id?.startsWith('habit-')) {
            try {
              const res = await incrementTaskPomodoroInFile(this.plugin.app, restoredTask);
              if (res) {
                restoredTask.text = res.updatedText;
              }
            } catch (e) {
              console.error('Error incrementing pomodoro count on task during restore:', e);
            }
          }
          if (this.plugin.settings.enableSessionClosingReview) {
            new PomodoroClosingReviewModal(this.plugin.app, this.plugin, restoredTask, sessionRecord).open();
          } else {
            new PomodoroTaskCheckModal(this.plugin.app, this.plugin, restoredTask, sessionRecord).open();
          }
        }
        new Notice(t('pomodoro.completedOfflineNotice'));
      } else {
        new Notice(t('pomodoro.breakCompletedOfflineNotice'));
      }

      this.state = 'idle';
      await this.savePomodoroState();
    } else if (restored.state === 'running') {
      this.state = 'running';
      if (this.intervalId !== null) {
        window.clearInterval(this.intervalId);
      }
      this.intervalId = window.setInterval(() => {
        this.tick();
      }, 1000);
      this.plugin.registerInterval(this.intervalId);
    } else {
      this.state = restored.state;
    }

    this.updateDisplay();
    this.notifyListeners();
  }

  public async onSettingsUpdated(): Promise<void> {
    if (this.state === 'idle' && !this.isCountUp) {
      const durationMin =
        this.mode === 'work'
          ? this.plugin.settings.pomodoroWorkDuration
          : (this.isLongBreak
            ? this.plugin.settings.pomodoroLongBreakDuration
            : this.plugin.settings.pomodoroBreakDuration);
      this.totalDurationSeconds = durationMin * 60;
      this.remainingSeconds = this.totalDurationSeconds;
      await this.savePomodoroState();
      this.updateDisplay();
      this.notifyListeners();
    }
  }

  public async applyPreset(preset: PomodoroPreset): Promise<void> {
    await this.handleInterruptedSessionIfNeeded();

    if (this.intervalId !== null) {
      window.clearInterval(this.intervalId);
      this.intervalId = null;
    }

    this.isCountUp = false;
    this.mode = 'work';
    this.isLongBreak = false;
    this.state = 'idle';
    this.plugin.settings.pomodoroWorkDuration = Math.max(1, preset.workMinutes);
    this.plugin.settings.pomodoroBreakDuration = Math.max(1, preset.breakMinutes);
    await this.plugin.saveSettings();

    this.totalDurationSeconds = this.plugin.settings.pomodoroWorkDuration * 60;
    this.remainingSeconds = this.totalDurationSeconds;
    this.endTime = 0;
    await this.savePomodoroState();
    this.updateDisplay();
    this.notifyListeners();
  }

  public async addCustomPreset(name: string, workMinutes: number, breakMinutes: number): Promise<PomodoroPreset> {
    const newPreset: PomodoroPreset = {
      id: `custom-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      name: name.trim() || `${workMinutes}/${breakMinutes}`,
      workMinutes: Math.max(1, workMinutes),
      breakMinutes: Math.max(1, breakMinutes),
      isCustom: true,
    };
    if (!this.plugin.settings.pomodoroPresets) {
      this.plugin.settings.pomodoroPresets = [];
    }
    this.plugin.settings.pomodoroPresets.push(newPreset);
    await this.plugin.saveSettings();
    this.notifyListeners();
    return newPreset;
  }

  public async deleteCustomPreset(presetId: string): Promise<void> {
    if (!this.plugin.settings.pomodoroPresets) return;
    this.plugin.settings.pomodoroPresets = this.plugin.settings.pomodoroPresets.filter((p) => p.id !== presetId);
    await this.plugin.saveSettings();
    this.notifyListeners();
  }

  public async startCountUp(): Promise<void> {
    await this.handleInterruptedSessionIfNeeded();

    if (this.intervalId !== null) {
      window.clearInterval(this.intervalId);
      this.intervalId = null;
    }

    this.isCountUp = true;
    this.mode = 'work';
    this.isLongBreak = false;
    this.state = 'running';
    this.totalDurationSeconds = 0;
    this.remainingSeconds = 0;
    this.endTime = Date.now();

    this.intervalId = window.setInterval(() => {
      this.tick();
    }, 1000);
    this.plugin.registerInterval(this.intervalId);

    if (this.plugin.settings.autoZenMode && !this.plugin.zen.isZen()) {
      this.plugin.zen.enableZen(true);
    }

    await this.savePomodoroState();
    this.updateDisplay();
    this.notifyListeners();
    new Notice(t('pomodoro.countUpActive'));
  }

  public async finishCountUpSession(): Promise<void> {
    if (!this.isCountUp) return;

    if (this.intervalId !== null) {
      window.clearInterval(this.intervalId);
      this.intervalId = null;
    }

    const elapsedSeconds = this.state === 'running'
      ? Math.max(0, Math.floor((Date.now() - this.endTime) / 1000))
      : this.remainingSeconds;

    const durationMin = Math.max(1, Math.round(elapsedSeconds / 60));
    this.isCountUp = false;
    await this.onCycleComplete(durationMin);
  }

  public async setCustomMinutes(minutes: number, mode: PomodoroMode = 'work'): Promise<void> {
    await this.handleInterruptedSessionIfNeeded();

    if (this.intervalId !== null) {
      window.clearInterval(this.intervalId);
      this.intervalId = null;
    }
    this.isCountUp = false;
    this.mode = mode;
    this.isLongBreak = false;
    this.state = 'idle';
    this.totalDurationSeconds = Math.max(1, minutes) * 60;
    this.remainingSeconds = this.totalDurationSeconds;
    this.endTime = 0;
    await this.savePomodoroState();
    this.updateDisplay();
    this.notifyListeners();
  }

  public async setCustomWorkAndBreak(
    workMinutes: number,
    breakMinutes: number,
    saveAsDefault: boolean = false
  ): Promise<void> {
    if (saveAsDefault) {
      this.plugin.settings.pomodoroWorkDuration = Math.max(1, workMinutes);
      this.plugin.settings.pomodoroBreakDuration = Math.max(1, breakMinutes);
      await this.plugin.saveSettings();
    }
    const targetMins = this.mode === 'work' ? workMinutes : breakMinutes;
    await this.setCustomMinutes(targetMins, this.mode);
  }

  public async toggleStartPause(): Promise<void> {
    if (this.isCountUp) {
      if (this.state === 'running') {
        await this.pause();
      } else if (this.state === 'paused') {
        await this.start();
      } else {
        await this.startCountUp();
      }
      return;
    }

    if (this.state === 'running') {
      await this.pause();
    } else if (this.state === 'paused') {
      await this.start();
    } else {
      // Idle mode: prompt for subject if none active and subjects exist
      if (
        this.mode === 'work' &&
        !this.activeTask &&
        !this.activeSubject &&
        (this.plugin.settings.subjects?.length || 0) > 0
      ) {
        new SubjectSelectModal(this.plugin.app, this.plugin, async (chosen) => {
          await this.setActiveSubject(chosen);
          await this.start();
        }).open();
        return;
      }
      await this.start();
    }
  }

  public async start(): Promise<void> {
    if (this.isCountUp) {
      this.state = 'running';
      this.endTime = Date.now() - (this.remainingSeconds * 1000);
      if (this.intervalId !== null) {
        window.clearInterval(this.intervalId);
      }
      this.intervalId = window.setInterval(() => {
        this.tick();
      }, 1000);
      this.plugin.registerInterval(this.intervalId);
      if (this.plugin.settings.autoZenMode && !this.plugin.zen.isZen()) {
        this.plugin.zen.enableZen(true);
      }
      await this.savePomodoroState();
      this.updateDisplay();
      this.notifyListeners();
      return;
    }

    if (this.remainingSeconds <= 0) {
      await this.reset();
    }

    this.state = 'running';
    this.endTime = Date.now() + this.remainingSeconds * 1000;

    if (this.intervalId !== null) {
      window.clearInterval(this.intervalId);
    }

    this.intervalId = window.setInterval(() => {
      this.tick();
    }, 1000);
    this.plugin.registerInterval(this.intervalId);

    if (this.mode === 'work' && this.plugin.settings.autoZenMode) {
      this.plugin.zen.enableZen(true);
    }

    await this.savePomodoroState();
    this.updateDisplay();
    this.notifyListeners();
  }

  public async pause(): Promise<void> {
    if (this.state !== 'running') return;

    if (this.isCountUp) {
      this.state = 'paused';
      if (this.intervalId !== null) {
        window.clearInterval(this.intervalId);
        this.intervalId = null;
      }
      this.remainingSeconds = Math.max(0, Math.floor((Date.now() - this.endTime) / 1000));
      this.endTime = 0;
      await this.savePomodoroState();
      this.updateDisplay();
      this.notifyListeners();
      return;
    }

    this.state = 'paused';
    if (this.intervalId !== null) {
      window.clearInterval(this.intervalId);
      this.intervalId = null;
    }

    this.remainingSeconds = Math.max(0, Math.ceil((this.endTime - Date.now()) / 1000));
    this.endTime = 0;
    await this.savePomodoroState();
    this.updateDisplay();
    this.notifyListeners();
  }

  public async reset(): Promise<void> {
    await this.handleInterruptedSessionIfNeeded();

    if (this.intervalId !== null) {
      window.clearInterval(this.intervalId);
      this.intervalId = null;
    }

    if (this.plugin.settings.autoZenMode && this.plugin.zen.isZen()) {
      this.plugin.zen.disableZen(true);
    }

    this.isCountUp = false;
    this.state = 'idle';
    this.isLongBreak = false;
    const durationMin =
      this.mode === 'work'
        ? this.plugin.settings.pomodoroWorkDuration
        : this.plugin.settings.pomodoroBreakDuration;
    this.totalDurationSeconds = durationMin * 60;
    this.remainingSeconds = this.totalDurationSeconds;
    this.endTime = 0;
    await this.savePomodoroState();
    this.updateDisplay();
    this.notifyListeners();
  }

  public async addMinutes(minutes: number): Promise<void> {
    const additionalSeconds = minutes * 60;
    this.remainingSeconds = Math.max(10, this.remainingSeconds + additionalSeconds);
    this.totalDurationSeconds = Math.max(this.remainingSeconds, this.totalDurationSeconds + additionalSeconds);
    if (this.state === 'running') {
      this.endTime += additionalSeconds * 1000;
    }
    await this.savePomodoroState();
    this.updateDisplay();
    this.notifyListeners();
  }

  public async skipCycle(): Promise<void> {
    await this.handleInterruptedSessionIfNeeded();

    if (this.intervalId !== null) {
      window.clearInterval(this.intervalId);
      this.intervalId = null;
    }

    if (this.mode === 'work') {
      const completedToday = this.getCompletedSessionsToday();
      const isLong = shouldTriggerLongBreak(completedToday, this.plugin.settings.pomodoroLongBreakInterval);
      this.isLongBreak = isLong;
      this.mode = 'break';
      const durationMin = isLong
        ? this.plugin.settings.pomodoroLongBreakDuration
        : this.plugin.settings.pomodoroBreakDuration;
      this.totalDurationSeconds = durationMin * 60;
    } else {
      this.mode = 'work';
      this.isLongBreak = false;
      this.totalDurationSeconds = this.plugin.settings.pomodoroWorkDuration * 60;
    }

    this.state = 'idle';
    this.remainingSeconds = this.totalDurationSeconds;
    this.endTime = 0;
    await this.savePomodoroState();
    this.updateDisplay();
    this.notifyListeners();
  }

  public async switchMode(newMode?: PomodoroMode): Promise<void> {
    await this.handleInterruptedSessionIfNeeded();

    if (this.intervalId !== null) {
      window.clearInterval(this.intervalId);
      this.intervalId = null;
    }

    this.mode = newMode ?? (this.mode === 'work' ? 'break' : 'work');
    this.isLongBreak = false;
    this.state = 'idle';
    const durationMin =
      this.mode === 'work'
        ? this.plugin.settings.pomodoroWorkDuration
        : this.plugin.settings.pomodoroBreakDuration;
    this.totalDurationSeconds = durationMin * 60;
    this.remainingSeconds = this.totalDurationSeconds;
    this.endTime = 0;
    await this.savePomodoroState();
    this.updateDisplay();
    this.notifyListeners();
  }

  private async handleInterruptedSessionIfNeeded(): Promise<void> {
    if (this.mode !== 'work' || (this.state !== 'running' && this.state !== 'paused')) {
      return;
    }

    if (this.isCountUp) {
      const elapsedSeconds = this.state === 'running'
        ? Math.max(0, Math.floor((Date.now() - this.endTime) / 1000))
        : this.remainingSeconds;
      if (elapsedSeconds >= 300) {
        const elapsedMinutes = Math.max(1, Math.round(elapsedSeconds / 60));
        await this.recordFocusSession(elapsedMinutes, true);
        new Notice(t('pomodoro.sessionInterruptedNotice', { minutes: elapsedMinutes }));
      }
      return;
    }

    const currentRemaining = this.state === 'running'
      ? Math.max(0, Math.ceil((this.endTime - Date.now()) / 1000))
      : this.remainingSeconds;

    const check = checkSessionInterrupted('work', this.state, this.totalDurationSeconds, currentRemaining);
    if (check.isInterrupted) {
      await this.recordFocusSession(check.elapsedMinutes, true);
      new Notice(t('pomodoro.sessionInterruptedNotice', { minutes: check.elapsedMinutes }));
    }
  }

  private sendSystemNotification(title: string, body: string): void {
    if (!this.plugin.settings.enableSystemNotifications) return;
    const isFocused = typeof document !== 'undefined' && typeof document.hasFocus === 'function' ? document.hasFocus() : true;
    if (!shouldSendSystemNotification(this.plugin.settings.enableSystemNotifications, isFocused)) {
      return;
    }

    if (typeof Notification !== 'undefined') {
      if (Notification.permission === 'granted') {
        new Notification(title, { body });
      } else if (Notification.permission === 'default') {
        Notification.requestPermission().then((perm) => {
          if (perm === 'granted') {
            new Notification(title, { body });
          }
        });
      }
    }
  }

  private tick(): void {
    if (this.isCountUp) {
      const elapsed = Math.max(0, Math.floor((Date.now() - this.endTime) / 1000));
      this.remainingSeconds = elapsed;

      const currentDate = getLocalDateString(new Date());
      if (currentDate !== this.lastKnownDate) {
        this.lastKnownDate = currentDate;
        this.notifyListeners();
      }

      this.updateDisplay();
      this.notifyListeners();
      return;
    }

    const remaining = Math.max(0, Math.ceil((this.endTime - Date.now()) / 1000));
    this.remainingSeconds = remaining;

    const currentDate = getLocalDateString(new Date());
    if (currentDate !== this.lastKnownDate) {
      this.lastKnownDate = currentDate;
      this.notifyListeners();
    }

    if (remaining <= 0) {
      this.onCycleComplete();
    } else {
      this.updateDisplay();
      this.notifyListeners();
    }
  }

  private async onCycleComplete(forcedWorkDurationMin?: number): Promise<void> {
    if (this.intervalId !== null) {
      window.clearInterval(this.intervalId);
      this.intervalId = null;
    }

    if (this.mode === 'work') {
      const durationMin =
        forcedWorkDurationMin ??
        (Math.round(this.totalDurationSeconds / 60) || this.plugin.settings.pomodoroWorkDuration);
      const sessionRecord = await this.recordFocusSession(durationMin, false);

      const completedToday = this.getCompletedSessionsToday();
      const isLong = shouldTriggerLongBreak(completedToday, this.plugin.settings.pomodoroLongBreakInterval);
      this.isLongBreak = isLong;

      let breakTipText = '';
      if (this.plugin.settings.enableBreakTips) {
        const tips = [
          'pomodoro.breakTip1',
          'pomodoro.breakTip2',
          'pomodoro.breakTip3',
          'pomodoro.breakTip4',
          'pomodoro.breakTip5',
        ];
        const tipKey = tips[this.breakTipIndex % tips.length];
        this.breakTipIndex = (this.breakTipIndex + 1) % tips.length;
        breakTipText = ` • ${t(tipKey as any)}`;
      }

      // Single Notice at session end
      const noticeMsg =
        (this.activeTask
          ? (isLong
              ? t('pomodoro.pomodoroFinishedTaskLongBreak', { task: this.activeTask.text })
              : t('pomodoro.pomodoroFinishedTask', { task: this.activeTask.text }))
          : (isLong
              ? t('pomodoro.pomodoroFinishedLongBreak')
              : t('pomodoro.pomodoroFinished'))) + breakTipText;
      new Notice(noticeMsg);

      this.sendSystemNotification(
        'Study Flow Assistant',
        isLong ? t('pomodoro.pomodoroFinishedLongBreak') : t('pomodoro.pomodoroFinishedTakeBreak')
      );

      if (this.plugin.settings.enableChimeSound) {
        playPomodoroSound(this.plugin.settings.pomodoroSound || 'bell', 'work', this.plugin.settings.chimeVolume);
      }

      const activeTaskRef = this.activeTask;
      if (activeTaskRef) {
        if (!activeTaskRef.id?.startsWith('habit-')) {
          try {
            const res = await incrementTaskPomodoroInFile(this.plugin.app, activeTaskRef);
            if (res) {
              activeTaskRef.text = res.updatedText;
            }
          } catch (e) {
            console.error('Error incrementing pomodoro count on task:', e);
          }
        }
      }

      if (this.plugin.settings.logPomodoroToDailyNote) {
        await this.logSession();
      }

      if (this.plugin.settings.autoZenMode && this.plugin.zen.isZen()) {
        this.plugin.zen.disableZen(true);
      }

      this.mode = 'break';
      this.isCountUp = false;
      const breakDuration = isLong
        ? this.plugin.settings.pomodoroLongBreakDuration
        : this.plugin.settings.pomodoroBreakDuration;
      this.totalDurationSeconds = breakDuration * 60;
      this.remainingSeconds = this.totalDurationSeconds;

      if (this.plugin.settings.autoStartNextPhase) {
        this.state = 'running';
        this.endTime = Date.now() + this.remainingSeconds * 1000;
        this.intervalId = window.setInterval(() => {
          this.tick();
        }, 1000);
        this.plugin.registerInterval(this.intervalId);
      } else {
        this.state = 'idle';
        this.endTime = 0;
      }

      await this.savePomodoroState();
      this.updateDisplay();
      this.notifyListeners();

      if (this.plugin.settings.enableSessionClosingReview) {
        new PomodoroClosingReviewModal(this.plugin.app, this.plugin, activeTaskRef, sessionRecord).open();
      } else if (activeTaskRef) {
        new PomodoroTaskCheckModal(this.plugin.app, this.plugin, activeTaskRef, sessionRecord).open();
      }
    } else {
      new Notice(t('pomodoro.breakFinishedNotice'));
      this.sendSystemNotification('Study Flow Assistant', t('pomodoro.breakFinishedNotice'));

      if (this.plugin.settings.enableChimeSound) {
        playPomodoroSound(this.plugin.settings.pomodoroSound || 'bell', 'break', this.plugin.settings.chimeVolume);
      }

      this.mode = 'work';
      this.isCountUp = false;
      this.isLongBreak = false;
      this.totalDurationSeconds = this.plugin.settings.pomodoroWorkDuration * 60;
      this.remainingSeconds = this.totalDurationSeconds;

      if (this.plugin.settings.autoStartNextPhase) {
        this.state = 'running';
        this.endTime = Date.now() + this.remainingSeconds * 1000;
        this.intervalId = window.setInterval(() => {
          this.tick();
        }, 1000);
        this.plugin.registerInterval(this.intervalId);
      } else {
        this.state = 'idle';
        this.endTime = 0;
      }

      await this.savePomodoroState();
      this.updateDisplay();
      this.notifyListeners();
    }
  }

  private async logSession(): Promise<void> {
    try {
      const now = new Date();
      const hh = String(now.getHours()).padStart(2, '0');
      const mm = String(now.getMinutes()).padStart(2, '0');
      const timeStr = `${hh}:${mm}`;
      const taskText = this.activeTask?.text;
      const subjectName = this.activeSubject?.name || this.activeSubject?.tag;
      const logLine = formatPomodoroLogLine(timeStr, taskText, subjectName);

      const dailyPath = getDailyNotePath(this.plugin.settings, 0);
      const file = await getOrCreateFile(this.plugin.app, dailyPath, `# ${getLocalDateString(now)}\n\n`);

      await this.plugin.app.vault.process(file, (content) => {
        return content.trimEnd().length === 0
          ? `${logLine}\n`
          : `${content.trimEnd()}\n${logLine}\n`;
      });
      // Exactly ONE Notice per session finish: second Notice omitted here intentionally.
    } catch (err) {
      console.error('Study Flow Assistant: Error registrando sesión de Pomodoro', err);
    }
  }

  private async recordFocusSession(durationMin: number, interrupted: boolean = false): Promise<FocusSessionRecord | null> {
    try {
      const now = new Date();
      const dateStr = getLocalDateString(now);
      const taskText = this.activeTask?.text || '';
      const tags = extractTagsFromText(taskText);
      if (this.activeSubject) {
        const norm = normalizeTag(this.activeSubject.tag);
        if (norm && !tags.some((t) => normalizeTag(t) === norm)) {
          tags.push(norm);
        }
      }

      const session: FocusSessionRecord = {
        id: `focus-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        timestamp: Date.now(),
        date: dateStr,
        durationMinutes: durationMin,
        taskText,
        tags,
        interrupted,
      };

      if (!this.plugin.focusSessions) {
        this.plugin.focusSessions = [];
      }
      this.plugin.focusSessions.push(session);

      await appendFocusSessionToFile(this.plugin.app, session);
      return session;
    } catch (err) {
      console.error('Study Flow Assistant: Error guardando métricas de sesión de enfoque', err);
      return null;
    }
  }

  public formatTime(totalSeconds: number): string {
    const mins = Math.floor(totalSeconds / 60);
    const secs = totalSeconds % 60;
    return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  }

  private updateDisplay(): void {
    if (!this.statusBarEl) return;

    const formatted = this.formatTime(this.remainingSeconds);
    const label = formatStatusBarDisplay(
      this.mode,
      formatted,
      this.isLongBreak,
      this.state,
      this.activeTask?.text,
      this.isCountUp
    );

    this.statusBarEl.removeClass('is-running', 'is-break', 'is-paused');

    if (this.state === 'running') {
      if (this.mode === 'break') {
        this.statusBarEl.addClass('is-break');
      } else {
        this.statusBarEl.addClass('is-running');
      }
    } else if (this.state === 'paused') {
      this.statusBarEl.addClass('is-paused');
    }

    this.statusBarEl.setText(label);

    let tooltip = t('pomodoro.statusBarTooltip');
    if (this.activeTask) {
      tooltip = t('pomodoro.statusBarFocusedTooltip', { task: this.activeTask.text, actions: tooltip });
    }
    setTooltip(this.statusBarEl, tooltip);
  }

  public destroy(): void {
    if (this.intervalId !== null) {
      window.clearInterval(this.intervalId);
      this.intervalId = null;
    }
    this.listeners.clear();
  }
}
