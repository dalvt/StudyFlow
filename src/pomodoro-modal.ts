import { App, Modal } from 'obsidian';
import type StudyFlowPlugin from './main';
import { PomodoroStatus } from './pomodoro';

export class PomodoroModal extends Modal {
  private plugin: StudyFlowPlugin;
  private unsubscribe: (() => void) | null = null;

  constructor(app: App, plugin: StudyFlowPlugin) {
    super(app);
    this.plugin = plugin;
  }

  onOpen(): void {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.addClass('study-flow-modal', 'study-flow-pomodoro-modal');

    this.renderUI();

    // Subscribe to live timer updates
    this.unsubscribe = this.plugin.pomodoro.subscribe(() => {
      this.updateClock();
    });
  }

  private renderUI(): void {
    const { contentEl } = this;
    contentEl.empty();

    const status = this.plugin.pomodoro.getStatus();

    contentEl.createEl('h2', { text: 'Temporizador Pomodoro' });

    // Mode Pill
    const pillContainer = contentEl.createDiv({ cls: 'study-flow-mode-pill-container' });
    const pill = pillContainer.createEl('span', {
      text: status.mode === 'work' ? '🍅 Sesión de Trabajo' : '☕ Tiempo de Descanso',
      cls: `study-flow-mode-pill ${status.mode === 'work' ? 'is-work' : 'is-break'}`,
    });

    // Big Timer Display
    const timerBox = contentEl.createDiv({ cls: 'study-flow-big-timer-card' });
    timerBox.createEl('div', {
      text: this.plugin.pomodoro.formatTime(status.remainingSeconds),
      cls: 'study-flow-big-clock',
    });

    // Progress bar
    const progressTrack = timerBox.createDiv({ cls: 'study-flow-progress-track' });
    const percent = Math.min(
      100,
      Math.max(0, ((status.totalDurationSeconds - status.remainingSeconds) / status.totalDurationSeconds) * 100)
    );
    progressTrack.createDiv({
      cls: 'study-flow-progress-fill',
      attr: { style: `width: ${percent}%;` },
    });

    // Session Counter
    timerBox.createEl('div', {
      text: `Sesiones completadas hoy: ${status.completedSessionsToday}`,
      cls: 'study-flow-session-counter',
    });

    // Main Control Buttons
    const controls = contentEl.createDiv({ cls: 'study-flow-pomodoro-controls' });

    const isRunning = status.state === 'running';
    const playPauseBtn = controls.createEl('button', {
      text: isRunning ? '⏸ Pausar' : '▶ Iniciar',
      cls: isRunning ? 'mod-warning' : 'mod-cta',
    });
    playPauseBtn.addEventListener('click', () => {
      this.plugin.pomodoro.toggleStartPause();
    });

    const resetBtn = controls.createEl('button', { text: '↺ Reiniciar' });
    resetBtn.addEventListener('click', () => {
      this.plugin.pomodoro.reset();
    });

    const skipBtn = controls.createEl('button', { text: '⏭ Saltar ciclo' });
    skipBtn.addEventListener('click', () => {
      this.plugin.pomodoro.skipCycle();
    });

    // Time Adjustment buttons
    const adjustRow = contentEl.createDiv({ cls: 'study-flow-adjust-row' });
    const add5Btn = adjustRow.createEl('button', { text: '+5 min' });
    add5Btn.addEventListener('click', () => {
      this.plugin.pomodoro.addMinutes(5);
    });

    const switchBtn = adjustRow.createEl('button', {
      text: status.mode === 'work' ? 'Cambiar a Descanso' : 'Cambiar a Trabajo',
    });
    switchBtn.addEventListener('click', () => {
      this.plugin.pomodoro.switchMode();
    });

    // Footer
    const footer = contentEl.createDiv({ cls: 'study-flow-button-row' });
    const closeBtn = footer.createEl('button', { text: 'Cerrar' });
    closeBtn.addEventListener('click', () => this.close());
  }

  private updateClock(): void {
    const status = this.plugin.pomodoro.getStatus();

    const clockEl = this.contentEl.querySelector('.study-flow-big-clock');
    if (clockEl) {
      clockEl.setText(this.plugin.pomodoro.formatTime(status.remainingSeconds));
    }

    const pillEl = this.contentEl.querySelector('.study-flow-mode-pill');
    if (pillEl) {
      pillEl.setText(status.mode === 'work' ? '🍅 Sesión de Trabajo' : '☕ Tiempo de Descanso');
      pillEl.className = `study-flow-mode-pill ${status.mode === 'work' ? 'is-work' : 'is-break'}`;
    }

    const progressFill = this.contentEl.querySelector('.study-flow-progress-fill') as HTMLElement | null;
    if (progressFill) {
      const percent = Math.min(
        100,
        Math.max(0, ((status.totalDurationSeconds - status.remainingSeconds) / status.totalDurationSeconds) * 100)
      );
      progressFill.style.width = `${percent}%`;
    }

    const counterEl = this.contentEl.querySelector('.study-flow-session-counter');
    if (counterEl) {
      counterEl.setText(`Sesiones completadas hoy: ${status.completedSessionsToday}`);
    }

    const playPauseBtn = this.contentEl.querySelector('.study-flow-pomodoro-controls button:first-child');
    if (playPauseBtn) {
      const isRunning = status.state === 'running';
      playPauseBtn.setText(isRunning ? '⏸ Pausar' : '▶ Iniciar');
      playPauseBtn.className = isRunning ? 'mod-warning' : 'mod-cta';
    }
  }

  onClose(): void {
    if (this.unsubscribe) {
      this.unsubscribe();
      this.unsubscribe = null;
    }
    const { contentEl } = this;
    contentEl.empty();
  }
}
