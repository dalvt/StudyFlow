import { Notice, TFile, setTooltip } from 'obsidian';
import type StudyFlowPlugin from './main';
import { getDailyNotePath, getOrCreateFile } from './utils';

export type PomodoroState = 'idle' | 'running' | 'paused';
export type PomodoroMode = 'work' | 'break';

export class PomodoroManager {
  private plugin: StudyFlowPlugin;
  private statusBarEl: HTMLElement | null = null;
  private intervalId: number | null = null;

  private state: PomodoroState = 'idle';
  private mode: PomodoroMode = 'work';
  private remainingSeconds: number = 25 * 60;
  private endTime: number = 0;

  constructor(plugin: StudyFlowPlugin) {
    this.plugin = plugin;
    this.remainingSeconds = this.plugin.settings.pomodoroWorkDuration * 60;
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

  public onSettingsUpdated(): void {
    if (this.state === 'idle') {
      const durationMin =
        this.mode === 'work'
          ? this.plugin.settings.pomodoroWorkDuration
          : this.plugin.settings.pomodoroBreakDuration;
      this.remainingSeconds = durationMin * 60;
      this.updateDisplay();
    }
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
  }

  public reset(): void {
    if (this.intervalId !== null) {
      window.clearInterval(this.intervalId);
      this.intervalId = null;
    }

    this.state = 'idle';
    this.mode = 'work';
    this.remainingSeconds = this.plugin.settings.pomodoroWorkDuration * 60;
    this.updateDisplay();
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
    this.remainingSeconds = durationMin * 60;
    this.updateDisplay();
  }

  private tick(): void {
    const remaining = Math.max(0, Math.ceil((this.endTime - Date.now()) / 1000));
    this.remainingSeconds = remaining;

    if (remaining <= 0) {
      this.onCycleComplete();
    } else {
      this.updateDisplay();
    }
  }

  private async onCycleComplete(): Promise<void> {
    if (this.intervalId !== null) {
      window.clearInterval(this.intervalId);
      this.intervalId = null;
    }

    if (this.mode === 'work') {
      new Notice('¡Pomodoro completado!');
      if (this.plugin.settings.logPomodoroToDailyNote) {
        await this.logSession();
      }

      // Switch to break
      this.mode = 'break';
      this.state = 'idle';
      this.remainingSeconds = this.plugin.settings.pomodoroBreakDuration * 60;
    } else {
      new Notice('¡Descanso completado! Preparado para una nueva sesión.');
      // Switch back to work
      this.mode = 'work';
      this.state = 'idle';
      this.remainingSeconds = this.plugin.settings.pomodoroWorkDuration * 60;
    }

    this.updateDisplay();
  }

  private async logSession(): Promise<void> {
    try {
      const now = new Date();
      const hh = String(now.getHours()).padStart(2, '0');
      const mm = String(now.getMinutes()).padStart(2, '0');
      const logLine = `- [x] Pomodoro completado a las ${hh}:${mm}`;

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

  private formatTime(totalSeconds: number): string {
    const mins = Math.floor(totalSeconds / 60);
    const secs = totalSeconds % 60;
    return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  }

  private updateDisplay(): void {
    if (!this.statusBarEl) return;

    const icon = this.mode === 'work' ? '🍅' : '☕';
    const formatted = this.formatTime(this.remainingSeconds);
    let label = `[${icon} ${formatted}]`;

    this.statusBarEl.removeClass('is-running', 'is-break', 'is-paused');

    if (this.state === 'running') {
      if (this.mode === 'break') {
        this.statusBarEl.addClass('is-break');
      } else {
        this.statusBarEl.addClass('is-running');
      }
    } else if (this.state === 'paused') {
      this.statusBarEl.addClass('is-paused');
      label = `[${icon} ${formatted} ⏸]`;
    }

    this.statusBarEl.setText(label);

    let tooltip = 'Clic: Iniciar/Pausar | Clic derecho: Reiniciar';
    if (this.state === 'running') {
      tooltip = `En curso (${this.mode === 'work' ? 'Trabajo' : 'Descanso'}). Clic para pausar.`;
    } else if (this.state === 'paused') {
      tooltip = 'Pausado. Clic para reanudar | Clic derecho: Reiniciar.';
    }
    setTooltip(this.statusBarEl, tooltip);
  }

  public destroy(): void {
    if (this.intervalId !== null) {
      window.clearInterval(this.intervalId);
      this.intervalId = null;
    }
  }
}
