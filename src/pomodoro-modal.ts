import { App, Modal, Notice, setIcon, TFile } from 'obsidian';
import type StudyFlowPlugin from './main';
import { PomodoroStatus } from './pomodoro';
import { extractPendingTasksFromContent, PendingTaskItem } from './utils';

const CIRCLE_RADIUS = 82;
const CIRCUMFERENCE = 2 * Math.PI * CIRCLE_RADIUS;

export class PomodoroModal extends Modal {
  private plugin: StudyFlowPlugin;
  private unsubscribe: (() => void) | null = null;
  private isSelectingTask: boolean = false;
  private pendingTasks: PendingTaskItem[] = [];

  constructor(app: App, plugin: StudyFlowPlugin) {
    super(app);
    this.plugin = plugin;
  }

  onOpen(): void {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.addClass('study-flow-modal', 'study-flow-pomodoro-modal-luxury');

    this.renderUI();

    this.unsubscribe = this.plugin.pomodoro.subscribe(() => {
      this.updateClock();
    });
  }

  private async loadPendingTasks(): Promise<void> {
    this.pendingTasks = [];
    const inboxPath = this.plugin.settings.inboxFilePath || 'StudyFlow/Inbox.md';
    const file = this.app.vault.getAbstractFileByPath(inboxPath);
    if (file instanceof TFile) {
      const content = await this.app.vault.read(file);
      this.pendingTasks = extractPendingTasksFromContent(content, file.path).filter((t) => !t.isIdea);
    }
  }

  private renderUI(): void {
    const { contentEl } = this;
    contentEl.empty();

    const status = this.plugin.pomodoro.getStatus();

    // Top Header
    const header = contentEl.createDiv({ cls: 'study-flow-modal-header' });
    const headerTitle = header.createEl('h2', { text: 'Enfoque Pomodoro' });
    const iconSpan = headerTitle.createSpan({ cls: 'study-flow-header-icon' });
    setIcon(iconSpan, 'flame');

    // Presets Row
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

    const zenBtn = presetsRow.createEl('button', {
      cls: `study-flow-preset-chip study-flow-zen-toggle-chip ${this.plugin.zen.isZen() ? 'is-active' : ''}`,
      attr: { 'aria-label': 'Alternar Modo Zen (plegar barras laterales)' },
    });
    const zenIcon = zenBtn.createSpan();
    setIcon(zenIcon, 'eye-off');
    zenBtn.createSpan({ text: this.plugin.zen.isZen() ? 'Zen Activo' : 'Zen' });
    zenBtn.addEventListener('click', () => {
      this.plugin.zen.toggleZen();
      this.renderUI();
    });

    // Active Task Bar
    this.renderActiveTaskSection(contentEl, status);

    // Luxury Dial Container with Ambient Aura
    const dialWrapper = contentEl.createDiv({ cls: 'study-flow-dial-wrapper' });
    dialWrapper.createDiv({
      cls: `study-flow-dial-aura ${status.mode === 'work' ? 'is-work' : 'is-break'} ${status.state === 'running' ? 'is-pulsing' : ''}`,
    });

    const dialContainer = dialWrapper.createDiv({ cls: 'study-flow-dial-container' });

    // SVG
    const svgEl = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svgEl.setAttribute('class', 'study-flow-dial-svg');
    svgEl.setAttribute('viewBox', '0 0 200 200');

    // Defs for gradients
    const defs = document.createElementNS('http://www.w3.org/2000/svg', 'defs');
    defs.innerHTML = `
      <linearGradient id="pomodoro-grad-work" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stop-color="#ff4d4f" />
        <stop offset="100%" stop-color="#fa8c16" />
      </linearGradient>
      <linearGradient id="pomodoro-grad-break" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stop-color="#10b981" />
        <stop offset="100%" stop-color="#06b6d4" />
      </linearGradient>
    `;
    svgEl.appendChild(defs);

    // 12 Chronograph tick marks
    const ticksGroup = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    ticksGroup.setAttribute('class', 'study-flow-ticks-group');
    for (let i = 0; i < 12; i++) {
      const angle = (i / 12) * 2 * Math.PI;
      const x1 = 100 + (CIRCLE_RADIUS - 7) * Math.cos(angle);
      const y1 = 100 + (CIRCLE_RADIUS - 7) * Math.sin(angle);
      const x2 = 100 + (CIRCLE_RADIUS + 7) * Math.cos(angle);
      const y2 = 100 + (CIRCLE_RADIUS + 7) * Math.sin(angle);

      const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
      line.setAttribute('x1', String(x1));
      line.setAttribute('y1', String(y1));
      line.setAttribute('x2', String(x2));
      line.setAttribute('y2', String(y2));
      line.setAttribute('class', 'study-flow-dial-tick');
      ticksGroup.appendChild(line);
    }
    svgEl.appendChild(ticksGroup);

    // Background track circle
    const bgCircle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    bgCircle.setAttribute('class', 'study-flow-dial-bg');
    bgCircle.setAttribute('cx', '100');
    bgCircle.setAttribute('cy', '100');
    bgCircle.setAttribute('r', String(CIRCLE_RADIUS));
    svgEl.appendChild(bgCircle);

    // Animated progress circle
    const progressCircle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    progressCircle.setAttribute('class', `study-flow-dial-progress ${status.mode === 'work' ? 'is-work' : 'is-break'}`);
    progressCircle.setAttribute('cx', '100');
    progressCircle.setAttribute('cy', '100');
    progressCircle.setAttribute('r', String(CIRCLE_RADIUS));
    progressCircle.setAttribute('stroke-dasharray', String(CIRCUMFERENCE));
    svgEl.appendChild(progressCircle);

    dialContainer.appendChild(svgEl);

    // Center Display
    const centerInfo = dialContainer.createDiv({ cls: 'study-flow-dial-center' });

    centerInfo.createDiv({
      text: status.mode === 'work' ? '• ENFOQUE •' : '• DESCANSO •',
      cls: `study-flow-luxury-pill ${status.mode === 'work' ? 'is-work' : 'is-break'}`,
    });

    centerInfo.createDiv({
      text: this.plugin.pomodoro.formatTime(status.remainingSeconds),
      cls: 'study-flow-dial-time-hero',
    });

    // Streak / Cycle dots (4 dots per cycle)
    const streakRow = centerInfo.createDiv({ cls: 'study-flow-streak-dots' });
    const currentStreak = status.streak || (status.completedSessionsToday > 0 ? 4 : 0);
    for (let i = 1; i <= 4; i++) {
      const dot = streakRow.createDiv({
        cls: `study-flow-streak-dot ${i <= currentStreak ? 'is-filled' : ''}`,
      });
      dot.setAttribute('title', `Sesión ${i}/4`);
    }

    centerInfo.createDiv({
      text: `${status.completedSessionsToday} completadas hoy`,
      cls: 'study-flow-dial-stats-sub',
    });

    // Hero Control Deck
    const controlDeck = contentEl.createDiv({ cls: 'study-flow-control-deck' });

    // Reset button
    const resetBtn = controlDeck.createEl('button', {
      cls: 'study-flow-deck-btn study-flow-deck-btn-secondary',
      attr: { 'aria-label': 'Reiniciar temporizador' },
    });
    setIcon(resetBtn, 'rotate-ccw');
    resetBtn.addEventListener('click', () => {
      this.plugin.pomodoro.reset();
    });

    // Primary Hero Play/Pause Button
    const isRunning = status.state === 'running';
    const heroBtn = controlDeck.createEl('button', {
      cls: `study-flow-hero-play-btn ${isRunning ? 'is-running' : ''} ${status.mode === 'work' ? 'is-work' : 'is-break'}`,
      attr: { 'aria-label': isRunning ? 'Pausar' : 'Iniciar' },
    });
    const heroIcon = heroBtn.createSpan({ cls: 'study-flow-hero-icon' });
    setIcon(heroIcon, isRunning ? 'pause' : 'play');
    heroBtn.addEventListener('click', () => {
      this.plugin.pomodoro.toggleStartPause();
    });

    // Skip button
    const skipBtn = controlDeck.createEl('button', {
      cls: 'study-flow-deck-btn study-flow-deck-btn-secondary',
      attr: { 'aria-label': 'Saltar ciclo' },
    });
    setIcon(skipBtn, 'skip-forward');
    skipBtn.addEventListener('click', () => {
      this.plugin.pomodoro.skipCycle();
    });

    // Quick +5m button
    const add5Btn = controlDeck.createEl('button', {
      cls: 'study-flow-deck-btn study-flow-deck-btn-secondary',
      attr: { 'aria-label': 'Añadir 5 minutos' },
    });
    const plusIcon = add5Btn.createSpan();
    setIcon(plusIcon, 'plus');
    add5Btn.createSpan({ text: '5m', cls: 'study-flow-deck-btn-label' });
    add5Btn.addEventListener('click', () => {
      this.plugin.pomodoro.addMinutes(5);
    });

    // Modal Footer
    const footer = contentEl.createDiv({ cls: 'study-flow-modal-footer' });
    const closeBtn = footer.createEl('button', { text: 'Cerrar' });
    closeBtn.addEventListener('click', () => this.close());

    this.updateProgressRing(status);
  }

  private renderActiveTaskSection(container: HTMLElement, status: PomodoroStatus): void {
    const taskSection = container.createDiv({ cls: 'study-flow-active-task-container' });

    if (status.activeTask) {
      const banner = taskSection.createDiv({ cls: 'study-flow-active-task-banner' });
      const targetIcon = banner.createSpan({ cls: 'study-flow-task-target-icon' });
      setIcon(targetIcon, 'target');

      const textWrap = banner.createDiv({ cls: 'study-flow-task-banner-text' });
      textWrap.createSpan({ text: 'Enfocado en: ', cls: 'study-flow-task-banner-label' });
      textWrap.createSpan({ text: status.activeTask.text, cls: 'study-flow-task-banner-name' });

      // Action: Complete task
      const completeBtn = banner.createEl('button', {
        cls: 'study-flow-task-complete-btn',
        attr: { 'aria-label': 'Marcar como completada' },
      });
      const cIcon = completeBtn.createSpan();
      setIcon(cIcon, 'check');
      completeBtn.createSpan({ text: 'Completar' });
      completeBtn.addEventListener('click', async () => {
        await this.plugin.pomodoro.completeActiveTask();
        this.renderUI();
      });

      // Action: Unlink task
      const unlinkBtn = banner.createEl('button', {
        cls: 'study-flow-icon-action-btn',
        attr: { 'aria-label': 'Desvincular tarea' },
      });
      setIcon(unlinkBtn, 'x');
      unlinkBtn.addEventListener('click', () => {
        this.plugin.pomodoro.setActiveTask(null);
        this.renderUI();
      });
    } else {
      if (!this.isSelectingTask) {
        const linkBtn = taskSection.createEl('button', { cls: 'study-flow-link-task-btn' });
        const tIcon = linkBtn.createSpan();
        setIcon(tIcon, 'target');
        linkBtn.createSpan({ text: 'Vincular tarea a este Pomodoro' });
        linkBtn.addEventListener('click', async () => {
          this.isSelectingTask = true;
          await this.loadPendingTasks();
          this.renderUI();
        });
      } else {
        const pickerBox = taskSection.createDiv({ cls: 'study-flow-task-picker-box' });
        pickerBox.createEl('div', { text: 'Selecciona una tarea de tu Inbox:', cls: 'study-flow-picker-title' });

        if (this.pendingTasks.length === 0) {
          pickerBox.createDiv({ cls: 'study-flow-empty-tasks', text: 'No hay tareas pendientes en el Inbox.' });
        } else {
          this.pendingTasks.forEach((t) => {
            const item = pickerBox.createDiv({ cls: 'study-flow-picker-item' });
            item.createSpan({ text: t.text });
            item.addEventListener('click', () => {
              this.plugin.pomodoro.setActiveTask({
                id: t.id,
                text: t.text,
                sourceFile: t.sourceFile,
              });
              this.isSelectingTask = false;
              this.renderUI();
            });
          });
        }

        const cancelPicker = pickerBox.createEl('button', { text: 'Cancelar selección', cls: 'study-flow-mini-btn' });
        cancelPicker.addEventListener('click', () => {
          this.isSelectingTask = false;
          this.renderUI();
        });
      }
    }
  }

  private updateClock(): void {
    const status = this.plugin.pomodoro.getStatus();

    const timeEl = this.contentEl.querySelector('.study-flow-dial-time-hero');
    if (timeEl) {
      timeEl.setText(this.plugin.pomodoro.formatTime(status.remainingSeconds));
    }

    const pillEl = this.contentEl.querySelector('.study-flow-luxury-pill');
    if (pillEl) {
      pillEl.setText(status.mode === 'work' ? '• ENFOQUE •' : '• DESCANSO •');
      pillEl.className = `study-flow-luxury-pill ${status.mode === 'work' ? 'is-work' : 'is-break'}`;
    }

    const auraEl = this.contentEl.querySelector('.study-flow-dial-aura');
    if (auraEl) {
      auraEl.className = `study-flow-dial-aura ${status.mode === 'work' ? 'is-work' : 'is-break'} ${status.state === 'running' ? 'is-pulsing' : ''}`;
    }

    const statsEl = this.contentEl.querySelector('.study-flow-dial-stats-sub');
    if (statsEl) {
      statsEl.setText(`${status.completedSessionsToday} completadas hoy`);
    }

    // Update streak dots
    const streakRow = this.contentEl.querySelector('.study-flow-streak-dots');
    if (streakRow) {
      streakRow.empty();
      const currentStreak = status.streak || (status.completedSessionsToday > 0 ? 4 : 0);
      for (let i = 1; i <= 4; i++) {
        const dot = streakRow.createDiv({
          cls: `study-flow-streak-dot ${i <= currentStreak ? 'is-filled' : ''}`,
        });
        dot.setAttribute('title', `Sesión ${i}/4`);
      }
    }

    // Update Hero button
    const heroBtn = this.contentEl.querySelector('.study-flow-hero-play-btn');
    if (heroBtn) {
      const isRunning = status.state === 'running';
      heroBtn.className = `study-flow-hero-play-btn ${isRunning ? 'is-running' : ''} ${status.mode === 'work' ? 'is-work' : 'is-break'}`;
      heroBtn.empty();
      const iconSpan = heroBtn.createSpan({ cls: 'study-flow-hero-icon' });
      setIcon(iconSpan, isRunning ? 'pause' : 'play');
    }

    this.updateProgressRing(status);
  }

  private updateProgressRing(status: PomodoroStatus): void {
    const progressCircle = this.contentEl.querySelector('.study-flow-dial-progress') as SVGCircleElement | null;
    if (progressCircle) {
      const offset = CIRCUMFERENCE * (1 - status.progressPercent / 100);
      progressCircle.setAttribute('stroke-dashoffset', String(offset));
      progressCircle.setAttribute(
        'class',
        `study-flow-dial-progress ${status.mode === 'work' ? 'is-work' : 'is-break'}`
      );
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
