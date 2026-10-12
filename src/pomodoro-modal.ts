import { App, Modal, setIcon } from 'obsidian';
import type StudyFlowPlugin from './main';
import { PomodoroStatus } from './pomodoro';

const CIRCLE_RADIUS = 75;
const CIRCUMFERENCE = 2 * Math.PI * CIRCLE_RADIUS;

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

    this.unsubscribe = this.plugin.pomodoro.subscribe(() => {
      this.updateClock();
    });
  }

  private renderUI(): void {
    const { contentEl } = this;
    contentEl.empty();

    const status = this.plugin.pomodoro.getStatus();

    const header = contentEl.createDiv({ cls: 'study-flow-modal-header' });
    const headerTitle = header.createEl('h2', { text: 'Enfoque Pomodoro' });
    const iconSpan = headerTitle.createSpan({ cls: 'study-flow-header-icon' });
    setIcon(iconSpan, 'timer');

    // Preset chips
    const presetsRow = contentEl.createDiv({ cls: 'study-flow-presets-bar' });
    const presets = [
      { label: '25m Enfoque', mins: 25, mode: 'work' as const },
      { label: '50m Deep Work', mins: 50, mode: 'work' as const },
      { label: '5m Descanso', mins: 5, mode: 'break' as const },
      { label: '15m Pausa Larga', mins: 15, mode: 'break' as const },
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

    // Circular Timer Display
    const dialContainer = contentEl.createDiv({ cls: 'study-flow-dial-container' });

    // SVG Circle
    const svgEl = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svgEl.setAttribute('class', 'study-flow-dial-svg');
    svgEl.setAttribute('viewBox', '0 0 180 180');

    const bgCircle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    bgCircle.setAttribute('class', 'study-flow-dial-bg');
    bgCircle.setAttribute('cx', '90');
    bgCircle.setAttribute('cy', '90');
    bgCircle.setAttribute('r', String(CIRCLE_RADIUS));
    svgEl.appendChild(bgCircle);

    const progressCircle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    progressCircle.setAttribute('class', 'study-flow-dial-progress');
    progressCircle.setAttribute('cx', '90');
    progressCircle.setAttribute('cy', '90');
    progressCircle.setAttribute('r', String(CIRCLE_RADIUS));
    progressCircle.setAttribute('stroke-dasharray', String(CIRCUMFERENCE));
    svgEl.appendChild(progressCircle);

    dialContainer.appendChild(svgEl);

    // Center contents
    const centerInfo = dialContainer.createDiv({ cls: 'study-flow-dial-center' });

    const modePill = centerInfo.createDiv({
      text: status.mode === 'work' ? 'TRABAJO' : 'DESCANSO',
      cls: `study-flow-badge-pill ${status.mode === 'work' ? 'is-work' : 'is-break'}`,
    });

    centerInfo.createDiv({
      text: this.plugin.pomodoro.formatTime(status.remainingSeconds),
      cls: 'study-flow-dial-time',
    });

    centerInfo.createDiv({
      text: `${status.completedSessionsToday} sesiones hoy`,
      cls: 'study-flow-dial-stats',
    });

    // Main Control Buttons
    const controls = contentEl.createDiv({ cls: 'study-flow-main-controls' });

    const isRunning = status.state === 'running';
    const playBtn = controls.createEl('button', {
      cls: `study-flow-action-btn ${isRunning ? 'mod-warning' : 'mod-cta'}`,
    });
    const playIcon = playBtn.createSpan();
    setIcon(playIcon, isRunning ? 'pause' : 'play');
    playBtn.createSpan({ text: isRunning ? 'Pausar' : 'Iniciar' });
    playBtn.addEventListener('click', () => {
      this.plugin.pomodoro.toggleStartPause();
    });

    const resetBtn = controls.createEl('button', { cls: 'study-flow-action-btn' });
    const resetIcon = resetBtn.createSpan();
    setIcon(resetIcon, 'rotate-ccw');
    resetBtn.createSpan({ text: 'Reiniciar' });
    resetBtn.addEventListener('click', () => {
      this.plugin.pomodoro.reset();
    });

    const skipBtn = controls.createEl('button', { cls: 'study-flow-action-btn' });
    const skipIcon = skipBtn.createSpan();
    setIcon(skipIcon, 'skip-forward');
    skipBtn.createSpan({ text: 'Saltar' });
    skipBtn.addEventListener('click', () => {
      this.plugin.pomodoro.skipCycle();
    });

    const add5Btn = controls.createEl('button', { cls: 'study-flow-action-btn' });
    const addIcon = add5Btn.createSpan();
    setIcon(addIcon, 'plus');
    add5Btn.createSpan({ text: '+5m' });
    add5Btn.addEventListener('click', () => {
      this.plugin.pomodoro.addMinutes(5);
    });

    // Close button
    const footer = contentEl.createDiv({ cls: 'study-flow-modal-footer' });
    const closeBtn = footer.createEl('button', { text: 'Cerrar' });
    closeBtn.addEventListener('click', () => this.close());

    this.updateProgressRing(status);
  }

  private updateClock(): void {
    const status = this.plugin.pomodoro.getStatus();

    const timeEl = this.contentEl.querySelector('.study-flow-dial-time');
    if (timeEl) {
      timeEl.setText(this.plugin.pomodoro.formatTime(status.remainingSeconds));
    }

    const pillEl = this.contentEl.querySelector('.study-flow-badge-pill');
    if (pillEl) {
      pillEl.setText(status.mode === 'work' ? 'TRABAJO' : 'DESCANSO');
      pillEl.className = `study-flow-badge-pill ${status.mode === 'work' ? 'is-work' : 'is-break'}`;
    }

    const statsEl = this.contentEl.querySelector('.study-flow-dial-stats');
    if (statsEl) {
      statsEl.setText(`${status.completedSessionsToday} sesiones hoy`);
    }

    const playBtn = this.contentEl.querySelector('.study-flow-main-controls button:first-child');
    if (playBtn) {
      const isRunning = status.state === 'running';
      playBtn.className = `study-flow-action-btn ${isRunning ? 'mod-warning' : 'mod-cta'}`;
      playBtn.empty();
      const iconSpan = playBtn.createSpan();
      setIcon(iconSpan, isRunning ? 'pause' : 'play');
      playBtn.createSpan({ text: isRunning ? 'Pausar' : 'Iniciar' });
    }

    this.updateProgressRing(status);
  }

  private updateProgressRing(status: PomodoroStatus): void {
    const progressCircle = this.contentEl.querySelector('.study-flow-dial-progress') as SVGCircleElement | null;
    if (progressCircle) {
      const offset = CIRCUMFERENCE * (1 - status.progressPercent / 100);
      progressCircle.setAttribute('stroke-dashoffset', String(offset));

      if (status.mode === 'break') {
        progressCircle.classList.add('is-break-stroke');
      } else {
        progressCircle.classList.remove('is-break-stroke');
      }
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
