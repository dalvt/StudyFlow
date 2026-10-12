import { Notice, setTooltip } from 'obsidian';
import type StudyFlowPlugin from './main';
import { playPomodoroChime } from './audio';
import { getDailyNotePath, getOrCreateFile, parseTaskPriority } from './utils';
import { toggleTaskCompletionInFile, TaskRecord } from './tasks';
import { extractTagsFromText, getLocalDateString, FocusSessionRecord } from './analytics';

export type PomodoroState = 'idle' | 'running' | 'paused';
export type PomodoroMode = 'work' | 'break';

export interface ActivePomodoroTask {
  id: string;
  text: string;
  sourceFile: string;
}

export interface PomodoroStatus {
  state: PomodoroState;
  mode: PomodoroMode;
  remainingSeconds: number;
  totalDurationSeconds: number;
  completedSessionsToday: number;
  progressPercent: number;
  streak: number; // 0 to 4 within current cycle
  activeTask: ActivePomodoroTask | null;
}

export type PomodoroListener = (status: PomodoroStatus) => void;

export class PomodoroManager {
  private plugin: StudyFlowPlugin;
  private statusBarEl: HTMLElement | null = null;
  private intervalId: number | null = null;

  private state: PomodoroState = 'idle';
  private mode: PomodoroMode = 'work';
  private remainingSeconds: number = 25 * 60;
  private totalDurationSeconds: number = 25 * 60;
  private endTime: number = 0;
  private completedSessionsToday: number = 0;
  private activeTask: ActivePomodoroTask | null = null;
  private listeners: Set<PomodoroListener> = new Set();

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
      this.reset();
      new Notice('Pomodoro reiniciado');
    });

    this.updateDisplay();
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
      : 0;

    const streak = this.completedSessionsToday % 4;

    return {
      state: this.state,
      mode: this.mode,
      remainingSeconds: this.remainingSeconds,
      totalDurationSeconds: this.totalDurationSeconds,
      completedSessionsToday: this.completedSessionsToday,
      progressPercent,
      streak,
      activeTask: this.activeTask,
    };
  }

  public setActiveTask(task: ActivePomodoroTask | null): void {
    this.activeTask = task;
    this.notifyListeners();
    if (task) {
      new Notice(`Enfocado en: ${task.text}`);
    }
  }

  public getActiveTask(): ActivePomodoroTask | null {
    return this.activeTask;
  }

  public async completeActiveTask(): Promise<void> {
    if (!this.activeTask) return;
    try {
      const { priority } = parseTaskPriority(this.activeTask.text);
      const taskRecord: TaskRecord = {
        id: this.activeTask.id,
        originalLine: `- [ ] ${this.activeTask.text}`,
        text: this.activeTask.text,
        sourceFile: this.activeTask.sourceFile,
        completed: false,
        statusChar: ' ',
        priority,
      };

      await toggleTaskCompletionInFile(this.plugin.app, taskRecord, true);
      new Notice(`✓ Tarea completada: ${this.activeTask.text}`);
      this.activeTask = null;
      this.notifyListeners();
    } catch (err) {
      console.error('Error completando tarea activa de pomodoro:', err);
      new Notice('Error al marcar la tarea como completada');
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

  public onSettingsUpdated(): void {
    if (this.state === 'idle') {
      const durationMin =
        this.mode === 'work'
          ? this.plugin.settings.pomodoroWorkDuration
          : this.plugin.settings.pomodoroBreakDuration;
      this.totalDurationSeconds = durationMin * 60;
      this.remainingSeconds = this.totalDurationSeconds;
      this.updateDisplay();
      this.notifyListeners();
    }
  }

  public setCustomMinutes(minutes: number, mode: PomodoroMode = 'work'): void {
    if (this.intervalId !== null) {
      window.clearInterval(this.intervalId);
      this.intervalId = null;
    }
    this.mode = mode;
    this.state = 'idle';
    this.totalDurationSeconds = Math.max(1, minutes) * 60;
    this.remainingSeconds = this.totalDurationSeconds;
    this.updateDisplay();
    this.notifyListeners();
  }

  public toggleStartPause(): void {
    if (this.state === 'idle' || this.state === 'paused') {
      this.start();
    } else if (this.state === 'running') {
      this.pause();
    }
  }

  public start(): void {
    if (this.remainingSeconds <= 0) {
      this.reset();
    }

    this.state = 'running';
    this.endTime = Date.now() + this.remainingSeconds * 1000;

    if (this.intervalId !== null) {
      window.clearInterval(this.intervalId);
    }

    this.intervalId = window.setInterval(() => {
      this.tick();
    }, 1000);

    this.updateDisplay();
    this.notifyListeners();
  }

  public pause(): void {
    if (this.state !== 'running') return;

    this.state = 'paused';
    if (this.intervalId !== null) {
      window.clearInterval(this.intervalId);
      this.intervalId = null;
    }

    this.remainingSeconds = Math.max(0, Math.ceil((this.endTime - Date.now()) / 1000));
    this.updateDisplay();
    this.notifyListeners();
  }

  public reset(): void {
    if (this.intervalId !== null) {
      window.clearInterval(this.intervalId);
      this.intervalId = null;
    }

    this.state = 'idle';
    const durationMin =
      this.mode === 'work'
        ? this.plugin.settings.pomodoroWorkDuration
        : this.plugin.settings.pomodoroBreakDuration;
    this.totalDurationSeconds = durationMin * 60;
    this.remainingSeconds = this.totalDurationSeconds;
    this.updateDisplay();
    this.notifyListeners();
  }

  public addMinutes(minutes: number): void {
    const additionalSeconds = minutes * 60;
    this.remainingSeconds = Math.max(10, this.remainingSeconds + additionalSeconds);
    this.totalDurationSeconds = Math.max(this.remainingSeconds, this.totalDurationSeconds + additionalSeconds);
    if (this.state === 'running') {
      this.endTime += additionalSeconds * 1000;
    }
    this.updateDisplay();
    this.notifyListeners();
  }

  public skipCycle(): void {
    if (this.mode === 'work') {
      this.mode = 'break';
      this.totalDurationSeconds = this.plugin.settings.pomodoroBreakDuration * 60;
    } else {
      this.mode = 'work';
      this.totalDurationSeconds = this.plugin.settings.pomodoroWorkDuration * 60;
    }
    this.state = 'idle';
    this.remainingSeconds = this.totalDurationSeconds;
    if (this.intervalId !== null) {
      window.clearInterval(this.intervalId);
      this.intervalId = null;
    }
    this.updateDisplay();
    this.notifyListeners();
  }

  public switchMode(newMode?: PomodoroMode): void {
    if (this.intervalId !== null) {
      window.clearInterval(this.intervalId);
      this.intervalId = null;
    }

    this.mode = newMode ?? (this.mode === 'work' ? 'break' : 'work');
    this.state = 'idle';
    const durationMin =
      this.mode === 'work'
        ? this.plugin.settings.pomodoroWorkDuration
        : this.plugin.settings.pomodoroBreakDuration;
    this.totalDurationSeconds = durationMin * 60;
    this.remainingSeconds = this.totalDurationSeconds;
    this.updateDisplay();
    this.notifyListeners();
  }

  private tick(): void {
    const remaining = Math.max(0, Math.ceil((this.endTime - Date.now()) / 1000));
    this.remainingSeconds = remaining;

    if (remaining <= 0) {
      this.onCycleComplete();
    } else {
      this.updateDisplay();
      this.notifyListeners();
    }
  }

  private async onCycleComplete(): Promise<void> {
    if (this.intervalId !== null) {
      window.clearInterval(this.intervalId);
      this.intervalId = null;
    }

    if (this.mode === 'work') {
      this.completedSessionsToday++;
      const durationMin = Math.round(this.totalDurationSeconds / 60) || this.plugin.settings.pomodoroWorkDuration;
      const noticeMsg = this.activeTask
        ? `¡Pomodoro completado! Tarea: ${this.activeTask.text}`
        : '¡Pomodoro completado!';
      new Notice(noticeMsg);

      if (this.plugin.settings.enableChimeSound) {
        playPomodoroChime('work', this.plugin.settings.chimeVolume);
      }

      // Record to analytics history
      await this.recordFocusSession(durationMin);

      if (this.plugin.settings.logPomodoroToDailyNote) {
        await this.logSession();
      }

      this.mode = 'break';
      this.state = 'idle';
      this.totalDurationSeconds = this.plugin.settings.pomodoroBreakDuration * 60;
      this.remainingSeconds = this.totalDurationSeconds;
    } else {
      new Notice('¡Descanso completado! Preparado para una nueva sesión.');

      if (this.plugin.settings.enableChimeSound) {
        playPomodoroChime('break', this.plugin.settings.chimeVolume);
      }

      this.mode = 'work';
      this.state = 'idle';
      this.totalDurationSeconds = this.plugin.settings.pomodoroWorkDuration * 60;
      this.remainingSeconds = this.totalDurationSeconds;
    }

    this.updateDisplay();
    this.notifyListeners();
  }

  private async logSession(): Promise<void> {
    try {
      const now = new Date();
      const hh = String(now.getHours()).padStart(2, '0');
      const mm = String(now.getMinutes()).padStart(2, '0');
      const taskSuffix = this.activeTask ? ` — *${this.activeTask.text}*` : '';
      const logLine = `- [x] Pomodoro completado a las ${hh}:${mm}${taskSuffix}`;

      const dailyPath = getDailyNotePath(this.plugin.settings, 0);
      const file = await getOrCreateFile(this.plugin.app, dailyPath, `# ${now.toISOString().slice(0, 10)}\n\n`);

      const content = await this.plugin.app.vault.read(file);
      const updated = content.trimEnd().length === 0
        ? `${logLine}\n`
        : `${content.trimEnd()}\n${logLine}\n`;

      await this.plugin.app.vault.modify(file, updated);
      new Notice(`Sesión registrada en ${file.basename}`);
    } catch (err) {
      console.error('Study Flow Assistant: Error registrando sesión de Pomodoro', err);
      new Notice('Error al registrar la sesión de Pomodoro');
    }
  }

  private async recordFocusSession(durationMin: number): Promise<void> {
    try {
      const now = new Date();
      const dateStr = getLocalDateString(now);
      const taskText = this.activeTask?.text || '';
      const tags = extractTagsFromText(taskText);

      const session: FocusSessionRecord = {
        id: `focus-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        timestamp: Date.now(),
        date: dateStr,
        durationMinutes: durationMin,
        taskText,
        tags,
      };

      if (!this.plugin.settings.focusHistory) {
        this.plugin.settings.focusHistory = [];
      }
      this.plugin.settings.focusHistory.push(session);

      // Keep recent 1000 sessions
      if (this.plugin.settings.focusHistory.length > 1000) {
        this.plugin.settings.focusHistory = this.plugin.settings.focusHistory.slice(-1000);
      }

      await this.plugin.saveSettings();
    } catch (err) {
      console.error('Study Flow Assistant: Error guardando métricas de sesión de enfoque', err);
    }
  }

  public formatTime(totalSeconds: number): string {
    const mins = Math.floor(totalSeconds / 60);
    const secs = totalSeconds % 60;
    return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  }

  private updateDisplay(): void {
    if (!this.statusBarEl) return;

    const icon = this.mode === 'work' ? '🍅' : '☕';
    const formatted = this.formatTime(this.remainingSeconds);
    const taskTag = this.activeTask ? ` [${this.activeTask.text.slice(0, 10)}...]` : '';
    let label = `[${icon} ${formatted}]${taskTag}`;

    this.statusBarEl.removeClass('is-running', 'is-break', 'is-paused');

    if (this.state === 'running') {
      if (this.mode === 'break') {
        this.statusBarEl.addClass('is-break');
      } else {
        this.statusBarEl.addClass('is-running');
      }
    } else if (this.state === 'paused') {
      this.statusBarEl.addClass('is-paused');
      label = `[${icon} ${formatted} ⏸]${taskTag}`;
    }

    this.statusBarEl.setText(label);

    let tooltip = 'Clic: Iniciar/Pausar | Clic derecho: Reiniciar';
    if (this.activeTask) {
      tooltip = `Enfocado en: "${this.activeTask.text}". ${tooltip}`;
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
