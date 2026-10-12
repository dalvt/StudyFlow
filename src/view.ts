import { ItemView, Notice, setIcon, WorkspaceLeaf, TFile } from 'obsidian';
import type StudyFlowPlugin from './main';
import {
  addHabitToFile,
  deleteHabitFromFile,
  HabitItem,
  loadHabitsFromFile,
  renderHabitHeatmap,
  toggleHabitStatus,
} from './habits';
import {
  deleteTaskFromFile,
  extractAllTasksFromContent,
  TaskRecord,
  toggleTaskCompletionInFile,
  promoteIdeaToTaskInFile,
  incrementTaskPomodoroInFile,
} from './tasks';
import {
  appendTaskToMarkdownSection,
  extractPendingTasksFromContent,
  formatDeadlineHuman,
  formatTaskWithPomodoroEstimate,
  formatTaskWithPriority,
  getDailyNotePath,
  getOrCreateFile,
  parseTaskPomodoroEstimate,
  PendingTaskItem,
  TaskPriority,
} from './utils';
import { renderAnalyticsDashboard } from './analytics-ui';
import {
  CalendarTimeBlock,
  DeadlineItem,
  calculateBlockDurationMinutes,
  createDeadlineTask,
  deleteTimeBlock,
  formatDateKey,
  formatLongDate,
  formatMonthYearHeader,
  getCalendarMonthMatrix,
  getTimeBlocksForDate,
  getWeekDays,
  loadAllDeadlines,
  saveTimeBlock,
  SHORT_DAY_NAMES_ES,
  syncTimeBlocksToDailyNote,
  toggleTimeBlockCompletion,
} from './calendar';

export const VIEW_TYPE_STUDY_FLOW = 'study-flow-view';

export type ActiveTab = 'pomodoro' | 'tasks' | 'habits' | 'calendar' | 'analytics' | 'planner';

const CIRCLE_RADIUS = 76;
const CIRCUMFERENCE = 2 * Math.PI * CIRCLE_RADIUS;

export class StudyFlowView extends ItemView {
  private plugin: StudyFlowPlugin;
  private activeTab: ActiveTab = 'pomodoro';
  private unsubscribePomodoro: (() => void) | null = null;
  private isSelectingTaskForPomodoro: boolean = false;
  private pendingInboxTasks: PendingTaskItem[] = [];

  // Tasks state
  private tasks: TaskRecord[] = [];
  private taskFilter: 'pending' | 'ideas' | 'completed' | 'all' = 'pending';

  // Habits state
  private habits: HabitItem[] = [];

  // Calendar & Deadlines state
  private calendarViewMode: 'month' | 'week' | 'deadlines' = 'month';
  private calendarYear: number = new Date().getFullYear();
  private calendarMonth: number = new Date().getMonth();
  private selectedCalendarDate: string = formatDateKey(new Date());
  private allDeadlines: DeadlineItem[] = [];
  private isAddingTimeBlock: boolean = false;
  private isAddingDeadline: boolean = false;

  // Planner state
  private pendingPlannerTasks: PendingTaskItem[] = [];
  private selectedPlannerTaskIds: Set<string> = new Set();
  private plannerDateOffset: number = 0; // 0 for today, 1 for tomorrow
  private studyBlocks: Array<{ id: string; startTime: string; endTime: string; title: string; linkedNote?: string }> = [
    { id: '1', startTime: '08:00', endTime: '09:30', title: 'Bloque Matutino', linkedNote: '' },
    { id: '2', startTime: '10:00', endTime: '11:30', title: 'Bloque Práctico', linkedNote: '' },
  ];

  constructor(leaf: WorkspaceLeaf, plugin: StudyFlowPlugin) {
    super(leaf);
    this.plugin = plugin;
  }

  public async setActiveTab(tab: ActiveTab): Promise<void> {
    this.activeTab = tab;
    await this.renderView();
  }

  getViewType(): string {
    return VIEW_TYPE_STUDY_FLOW;
  }

  getDisplayText(): string {
    return 'Study Flow Hub';
  }

  getIcon(): string {
    return 'clock';
  }

  async onOpen(): Promise<void> {
    const { containerEl } = this;
    containerEl.empty();
    containerEl.addClass('study-flow-view-root');

    await this.renderView();

    this.unsubscribePomodoro = this.plugin.pomodoro.subscribe(() => {
      if (this.activeTab === 'pomodoro') {
        this.updatePomodoroClock();
      }
    });
  }

  async onClose(): Promise<void> {
    if (this.unsubscribePomodoro) {
      this.unsubscribePomodoro();
      this.unsubscribePomodoro = null;
    }
    this.containerEl.empty();
  }

  private async renderView(): Promise<void> {
    const { containerEl } = this;
    containerEl.empty();

    const rootWrapper = containerEl.createDiv({ cls: 'study-flow-container' });

    // Top Brand Header
    const brandRow = rootWrapper.createDiv({ cls: 'study-flow-brand-header' });
    const brandTitle = brandRow.createDiv({ cls: 'study-flow-brand-title' });
    const brandIcon = brandTitle.createSpan();
    setIcon(brandIcon, 'sparkles');
    brandTitle.createSpan({ text: 'Study Flow Hub' });

    // Header Action Buttons
    const headerActions = brandRow.createDiv({ cls: 'study-flow-header-actions' });
    const isMainTab = this.leaf.getRoot() === this.app.workspace.rootSplit;

    if (!isMainTab) {
      const expandBtn = headerActions.createEl('button', {
        cls: 'study-flow-expand-tab-btn',
      });
      const expIcon = expandBtn.createSpan();
      setIcon(expIcon, 'maximize-2');
      expandBtn.createSpan({ text: 'Pestaña completa' });
      expandBtn.addEventListener('click', async () => {
        await this.plugin.activateView(true);
      });
    } else {
      const dockBtn = headerActions.createEl('button', {
        cls: 'study-flow-header-icon-btn',
        attr: { 'aria-label': 'Mover a la barra lateral' },
      });
      setIcon(dockBtn, 'panel-right');
      dockBtn.addEventListener('click', async () => {
        await this.plugin.activateView(false);
      });
    }

    const refreshBtn = headerActions.createEl('button', {
      cls: 'study-flow-header-icon-btn',
      attr: { 'aria-label': 'Recargar vista' },
    });
    setIcon(refreshBtn, 'rotate-cw');
    refreshBtn.addEventListener('click', async () => {
      await this.renderView();
    });

    // Navigation Tab Bar with 5 tabs
    const navBar = rootWrapper.createDiv({ cls: 'study-flow-segmented-nav' });

    const tabs: Array<{ id: ActiveTab; label: string; icon: string }> = [
      { id: 'pomodoro', label: 'Pomodoro', icon: 'timer' },
      { id: 'tasks', label: 'Tareas', icon: 'check-square' },
      { id: 'habits', label: 'Hábitos', icon: 'flame' },
      { id: 'calendar', label: 'Calendario', icon: 'calendar-days' },
      { id: 'analytics', label: 'Métricas', icon: 'bar-chart-2' },
    ];

    tabs.forEach((tab) => {
      const btn = navBar.createEl('button', {
        cls: `study-flow-nav-pill ${this.activeTab === tab.id ? 'is-active' : ''}`,
      });
      const iconSpan = btn.createSpan();
      setIcon(iconSpan, tab.icon);
      btn.createSpan({ text: tab.label });

      btn.addEventListener('click', async () => {
        this.activeTab = tab.id;
        await this.renderView();
      });
    });

    // Content Body
    const contentBody = rootWrapper.createDiv({ cls: 'study-flow-tab-body' });

    if (this.activeTab === 'pomodoro') {
      await this.renderPomodoroTab(contentBody);
    } else if (this.activeTab === 'tasks') {
      await this.renderTasksTab(contentBody);
    } else if (this.activeTab === 'habits') {
      await this.renderHabitsTab(contentBody);
    } else if (this.activeTab === 'calendar' || this.activeTab === 'planner') {
      await this.renderCalendarTab(contentBody);
    } else if (this.activeTab === 'analytics') {
      await this.renderAnalyticsTab(contentBody);
    }
  }

  // ===================== POMODORO TAB =====================
  private async renderPomodoroTab(container: HTMLElement): Promise<void> {
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

    const zenBtn = presetsRow.createEl('button', {
      cls: `study-flow-preset-chip study-flow-zen-toggle-chip ${this.plugin.zen.isZen() ? 'is-active' : ''}`,
      attr: { 'aria-label': 'Alternar Modo Zen (plegar barras laterales)' },
    });
    const zenIcon = zenBtn.createSpan();
    setIcon(zenIcon, 'eye-off');
    zenBtn.createSpan({ text: this.plugin.zen.isZen() ? 'Zen Activo' : 'Zen' });
    zenBtn.addEventListener('click', () => {
      this.plugin.zen.toggleZen();
      this.renderView();
    });

    // Active Task Linking Section
    await this.renderActiveTaskBannerInView(card, status);

    // Luxury Dial Wrapper
    const dialWrapper = card.createDiv({ cls: 'study-flow-dial-wrapper' });
    dialWrapper.createDiv({
      cls: `study-flow-dial-aura ${status.mode === 'work' ? 'is-work' : 'is-break'} ${status.state === 'running' ? 'is-pulsing' : ''}`,
    });

    const dialContainer = dialWrapper.createDiv({ cls: 'study-flow-dial-container' });

    const svgEl = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svgEl.setAttribute('class', 'study-flow-dial-svg');
    svgEl.setAttribute('viewBox', '0 0 190 190');

    // Defs for gradients
    const defs = document.createElementNS('http://www.w3.org/2000/svg', 'defs');
    defs.innerHTML = `
      <linearGradient id="view-pomodoro-grad-work" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stop-color="#ff4d4f" />
        <stop offset="100%" stop-color="#fa8c16" />
      </linearGradient>
      <linearGradient id="view-pomodoro-grad-break" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stop-color="#10b981" />
        <stop offset="100%" stop-color="#06b6d4" />
      </linearGradient>
    `;
    svgEl.appendChild(defs);

    // 12 Chronograph ticks
    const ticksGroup = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    ticksGroup.setAttribute('class', 'study-flow-ticks-group');
    for (let i = 0; i < 12; i++) {
      const angle = (i / 12) * 2 * Math.PI;
      const x1 = 95 + (CIRCLE_RADIUS - 6) * Math.cos(angle);
      const y1 = 95 + (CIRCLE_RADIUS - 6) * Math.sin(angle);
      const x2 = 95 + (CIRCLE_RADIUS + 6) * Math.cos(angle);
      const y2 = 95 + (CIRCLE_RADIUS + 6) * Math.sin(angle);

      const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
      line.setAttribute('x1', String(x1));
      line.setAttribute('y1', String(y1));
      line.setAttribute('x2', String(x2));
      line.setAttribute('y2', String(y2));
      line.setAttribute('class', 'study-flow-dial-tick');
      ticksGroup.appendChild(line);
    }
    svgEl.appendChild(ticksGroup);

    // Track circle
    const bgCircle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    bgCircle.setAttribute('class', 'study-flow-dial-bg');
    bgCircle.setAttribute('cx', '95');
    bgCircle.setAttribute('cy', '95');
    bgCircle.setAttribute('r', String(CIRCLE_RADIUS));
    svgEl.appendChild(bgCircle);

    // Progress circle
    const progressCircle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    progressCircle.setAttribute('class', `study-flow-dial-progress ${status.mode === 'work' ? 'is-work' : 'is-break'}`);
    progressCircle.setAttribute('cx', '95');
    progressCircle.setAttribute('cy', '95');
    progressCircle.setAttribute('r', String(CIRCLE_RADIUS));
    progressCircle.setAttribute('stroke-dasharray', String(CIRCUMFERENCE));
    svgEl.appendChild(progressCircle);

    dialContainer.appendChild(svgEl);

    // Dial center text
    const centerInfo = dialContainer.createDiv({ cls: 'study-flow-dial-center' });

    centerInfo.createDiv({
      text: status.mode === 'work' ? '• ENFOQUE •' : '• DESCANSO •',
      cls: `study-flow-luxury-pill ${status.mode === 'work' ? 'is-work' : 'is-break'}`,
    });

    centerInfo.createDiv({
      text: this.plugin.pomodoro.formatTime(status.remainingSeconds),
      cls: 'study-flow-dial-time-hero',
    });

    // Streak / Cycle dots
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

    // Control Deck
    const controlDeck = card.createDiv({ cls: 'study-flow-control-deck' });

    const resetBtn = controlDeck.createEl('button', {
      cls: 'study-flow-deck-btn study-flow-deck-btn-secondary',
      attr: { 'aria-label': 'Reiniciar' },
    });
    setIcon(resetBtn, 'rotate-ccw');
    resetBtn.addEventListener('click', () => {
      this.plugin.pomodoro.reset();
    });

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

    const skipBtn = controlDeck.createEl('button', {
      cls: 'study-flow-deck-btn study-flow-deck-btn-secondary',
      attr: { 'aria-label': 'Saltar' },
    });
    setIcon(skipBtn, 'skip-forward');
    skipBtn.addEventListener('click', () => {
      this.plugin.pomodoro.skipCycle();
    });

    const add5Btn = controlDeck.createEl('button', {
      cls: 'study-flow-deck-btn study-flow-deck-btn-secondary',
      attr: { 'aria-label': '+5m' },
    });
    const plusIcon = add5Btn.createSpan();
    setIcon(plusIcon, 'plus');
    add5Btn.createSpan({ text: '5m', cls: 'study-flow-deck-btn-label' });
    add5Btn.addEventListener('click', () => {
      this.plugin.pomodoro.addMinutes(5);
    });

    this.updateProgressRing(status);
  }

  private async renderActiveTaskBannerInView(container: HTMLElement, status: any): Promise<void> {
    const taskSection = container.createDiv({ cls: 'study-flow-active-task-container' });

    if (status.activeTask) {
      const banner = taskSection.createDiv({ cls: 'study-flow-active-task-banner' });
      const targetIcon = banner.createSpan({ cls: 'study-flow-task-target-icon' });
      setIcon(targetIcon, 'target');

      const textWrap = banner.createDiv({ cls: 'study-flow-task-banner-text' });
      textWrap.createSpan({ text: 'Enfocado en: ', cls: 'study-flow-task-banner-label' });
      textWrap.createSpan({ text: status.activeTask.text, cls: 'study-flow-task-banner-name' });

      const { estimated, completed } = parseTaskPomodoroEstimate(status.activeTask.text);
      if (estimated || (completed && completed > 0)) {
        const estText = (completed && completed > 0 && estimated)
          ? ` • 🍅 ${completed}/${estimated}`
          : (estimated ? ` • 🍅 ${estimated} est.` : ` • 🍅 ${completed}`);
        textWrap.createSpan({ text: estText, cls: 'study-flow-active-task-pomo-hint' });
      }

      const completeBtn = banner.createEl('button', {
        cls: 'study-flow-task-complete-btn',
        attr: { 'aria-label': 'Marcar como completada' },
      });
      const cIcon = completeBtn.createSpan();
      setIcon(cIcon, 'check');
      completeBtn.createSpan({ text: 'Completar' });
      completeBtn.addEventListener('click', async () => {
        await this.plugin.pomodoro.completeActiveTask();
        this.containerEl.empty();
        await this.renderView();
      });

      const unlinkBtn = banner.createEl('button', {
        cls: 'study-flow-icon-action-btn',
        attr: { 'aria-label': 'Desvincular tarea' },
      });
      setIcon(unlinkBtn, 'x');
      unlinkBtn.addEventListener('click', async () => {
        this.plugin.pomodoro.setActiveTask(null);
        this.containerEl.empty();
        await this.renderView();
      });
    } else {
      if (!this.isSelectingTaskForPomodoro) {
        const linkBtn = taskSection.createEl('button', { cls: 'study-flow-link-task-btn' });
        const tIcon = linkBtn.createSpan();
        setIcon(tIcon, 'target');
        linkBtn.createSpan({ text: 'Vincular tarea a este Pomodoro' });
        linkBtn.addEventListener('click', async () => {
          this.isSelectingTaskForPomodoro = true;
          await this.loadPendingInboxTasks();
          this.containerEl.empty();
          await this.renderView();
        });
      } else {
        const pickerBox = taskSection.createDiv({ cls: 'study-flow-task-picker-box' });
        pickerBox.createEl('div', { text: 'Selecciona una tarea de tu Inbox:', cls: 'study-flow-picker-title' });

        if (this.pendingInboxTasks.length === 0) {
          pickerBox.createDiv({ cls: 'study-flow-empty-tasks', text: 'No hay tareas pendientes en el Inbox.' });
        } else {
          this.pendingInboxTasks.forEach((t) => {
            const item = pickerBox.createDiv({ cls: 'study-flow-picker-item' });
            item.createSpan({ text: t.text });
            item.addEventListener('click', async () => {
              this.plugin.pomodoro.setActiveTask({
                id: t.id,
                text: t.text,
                sourceFile: t.sourceFile,
              });
              this.isSelectingTaskForPomodoro = false;
              this.containerEl.empty();
              await this.renderView();
            });
          });
        }

        const cancelPicker = pickerBox.createEl('button', { text: 'Cancelar', cls: 'study-flow-mini-btn' });
        cancelPicker.addEventListener('click', async () => {
          this.isSelectingTaskForPomodoro = false;
          this.containerEl.empty();
          await this.renderView();
        });
      }
    }
  }

  private async loadPendingInboxTasks(): Promise<void> {
    this.pendingInboxTasks = [];
    const inboxPath = this.plugin.settings.inboxFilePath || 'Inbox.md';
    const file = this.app.vault.getAbstractFileByPath(inboxPath);
    if (file instanceof TFile) {
      const content = await this.app.vault.read(file);
      this.pendingInboxTasks = extractPendingTasksFromContent(content, file.path).filter((t) => !t.isIdea);
    }
  }

  private updatePomodoroClock(): void {
    const status = this.plugin.pomodoro.getStatus();

    const timeEl = this.containerEl.querySelector('.study-flow-dial-time-hero');
    if (timeEl) {
      timeEl.setText(this.plugin.pomodoro.formatTime(status.remainingSeconds));
    }

    const pillEl = this.containerEl.querySelector('.study-flow-luxury-pill');
    if (pillEl) {
      pillEl.setText(status.mode === 'work' ? '• ENFOQUE •' : '• DESCANSO •');
      pillEl.className = `study-flow-luxury-pill ${status.mode === 'work' ? 'is-work' : 'is-break'}`;
    }

    const auraEl = this.containerEl.querySelector('.study-flow-dial-aura');
    if (auraEl) {
      auraEl.className = `study-flow-dial-aura ${status.mode === 'work' ? 'is-work' : 'is-break'} ${status.state === 'running' ? 'is-pulsing' : ''}`;
    }

    const statsEl = this.containerEl.querySelector('.study-flow-dial-stats-sub');
    if (statsEl) {
      statsEl.setText(`${status.completedSessionsToday} completadas hoy`);
    }

    // Streak dots
    const streakRow = this.containerEl.querySelector('.study-flow-streak-dots');
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

    // Hero button
    const heroBtn = this.containerEl.querySelector('.study-flow-hero-play-btn');
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
    const progressCircle = this.containerEl.querySelector('.study-flow-dial-progress') as SVGCircleElement | null;
    if (progressCircle) {
      const offset = CIRCUMFERENCE * (1 - status.progressPercent / 100);
      progressCircle.setAttribute('stroke-dashoffset', String(offset));
      progressCircle.setAttribute(
        'class',
        `study-flow-dial-progress ${status.mode === 'work' ? 'is-work' : 'is-break'}`
      );
    }
  }

  // ===================== HABITS TAB =====================
  private async renderHabitsTab(container: HTMLElement): Promise<void> {
    container.empty();
    const path = this.plugin.settings.habitsFilePath || 'Habits.md';
    this.habits = await loadHabitsFromFile(this.app, path);

    const card = container.createDiv({ cls: 'study-flow-card' });

    // Stats bar
    const completedCount = this.habits.filter((h) => h.completedToday).length;
    const statsBar = card.createDiv({ cls: 'study-flow-stats-bar' });
    statsBar.createSpan({
      text: `${completedCount}/${this.habits.length} completados hoy`,
      cls: 'study-flow-badge-stat is-pending',
    });

    // Add new habit bar
    const addSection = card.createDiv({ cls: 'study-flow-search-bar' });
    const addInput = addSection.createEl('input', {
      type: 'text',
      placeholder: 'Nuevo hábito (ej. 📚 Lectura)...',
      cls: 'study-flow-task-input',
    });
    const addBtn = addSection.createEl('button', { cls: 'mod-cta' });
    const aIcon = addBtn.createSpan();
    setIcon(aIcon, 'plus');
    addBtn.createSpan({ text: 'Añadir' });

    const handleAdd = async () => {
      const val = addInput.value.trim();
      if (!val) return;
      this.habits = await addHabitToFile(this.app, path, val);
      addInput.value = '';
      new Notice(`Hábito añadido: ${val}`);
      container.empty();
      await this.renderHabitsTab(container);
    };

    addBtn.addEventListener('click', handleAdd);
    addInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        handleAdd();
      }
    });

    // Habits List
    const listContainer = card.createDiv({ cls: 'study-flow-task-list-cards' });

    if (this.habits.length === 0) {
      const emptyState = listContainer.createDiv({ cls: 'study-flow-empty-state' });
      const emptyIcon = emptyState.createDiv({ cls: 'study-flow-empty-icon' });
      setIcon(emptyIcon, 'flame');
      emptyState.createEl('h4', { text: 'Sin hábitos activos' });
      emptyState.createEl('p', { text: 'Añade tu primer hábito diario arriba.' });
    } else {
      this.habits.forEach((habit) => {
        const hCard = listContainer.createDiv({
          cls: `study-flow-task-card study-flow-habit-card ${habit.completedToday ? 'is-done' : ''}`,
        });

        const cbWrapper = hCard.createDiv({ cls: 'study-flow-cb-wrapper' });
        const cb = cbWrapper.createEl('input', { type: 'checkbox' });
        cb.checked = habit.completedToday;

        cb.addEventListener('change', async () => {
          this.habits = await toggleHabitStatus(this.app, path, habit.id, cb.checked);
          new Notice(cb.checked ? `🔥 ¡Racha aumentada! Racha: ${habit.streak + 1}` : 'Hábito desmarcado');
          container.empty();
          await this.renderHabitsTab(container);
        });

        const textSpan = hCard.createEl('span', {
          text: habit.name,
          cls: `study-flow-task-text ${habit.completedToday ? 'is-strikethrough' : ''}`,
        });
        textSpan.addEventListener('click', () => {
          cb.checked = !cb.checked;
          cb.dispatchEvent(new Event('change'));
        });

        // Flame Streak Badge
        const streakBadge = hCard.createDiv({ cls: 'study-flow-streak-badge' });
        const fIcon = streakBadge.createSpan({ cls: 'study-flow-flame-icon' });
        setIcon(fIcon, 'flame');
        streakBadge.createSpan({ text: `${habit.streak} d` });

        // Delete button
        const delBtn = hCard.createEl('button', {
          cls: 'study-flow-icon-action-btn',
          attr: { 'aria-label': 'Eliminar hábito' },
        });
        setIcon(delBtn, 'trash-2');
        delBtn.addEventListener('click', async (e) => {
          e.stopPropagation();
          this.habits = await deleteHabitFromFile(this.app, path, habit.id);
          new Notice('Hábito eliminado');
          container.empty();
          await this.renderHabitsTab(container);
        });
      });
    }

    // Heatmap consistency visualization
    renderHabitHeatmap(container, this.habits);
  }

  // ===================== TASKS TAB =====================
  private async renderTasksTab(container: HTMLElement): Promise<void> {
    container.empty();
    await this.reloadTasks();

    const card = container.createDiv({ cls: 'study-flow-card' });

    // Stats bar
    const pendingCount = this.tasks.filter((t) => !t.completed && !t.isIdea).length;
    const ideasCount = this.tasks.filter((t) => !t.completed && t.isIdea).length;
    const completedCount = this.tasks.filter((t) => t.completed).length;

    const statsBar = card.createDiv({ cls: 'study-flow-stats-bar' });
    statsBar.createSpan({ text: `${pendingCount} pendientes`, cls: 'study-flow-badge-stat is-pending' });
    statsBar.createSpan({ text: `${ideasCount} ideas`, cls: 'study-flow-badge-stat is-idea' });
    statsBar.createSpan({ text: `${completedCount} completadas`, cls: 'study-flow-badge-stat is-completed' });

    // Quick Add Bar
    const addBar = card.createDiv({ cls: 'study-flow-search-bar' });
    const addInput = addBar.createEl('input', {
      type: 'text',
      placeholder: 'Nueva entrada rápida...',
      cls: 'study-flow-task-input',
    });

    let addType: 'task' | 'idea' = 'task';
    const typeSelect = addBar.createEl('select', { cls: 'study-flow-type-select' });
    typeSelect.createEl('option', { value: 'task', text: '📋 Tarea' });
    typeSelect.createEl('option', { value: 'idea', text: '💡 Idea' });

    let addPriority: TaskPriority = 'none';
    const prioritySelect = addBar.createEl('select', { cls: 'study-flow-priority-select' });
    prioritySelect.createEl('option', { value: 'none', text: 'Normal' });
    prioritySelect.createEl('option', { value: 'high', text: '⏫ Alta' });
    prioritySelect.createEl('option', { value: 'medium', text: '🔼 Media' });
    prioritySelect.createEl('option', { value: 'low', text: '🔽 Baja' });
    prioritySelect.addEventListener('change', () => {
      addPriority = prioritySelect.value as TaskPriority;
    });

    let addEstimate: number = 0;
    const estimateSelect = addBar.createEl('select', { cls: 'study-flow-estimate-select' });
    estimateSelect.createEl('option', { value: '0', text: '🍅 -' });
    estimateSelect.createEl('option', { value: '1', text: '🍅 1 (25m)' });
    estimateSelect.createEl('option', { value: '2', text: '🍅 2 (50m)' });
    estimateSelect.createEl('option', { value: '3', text: '🍅 3 (1h15m)' });
    estimateSelect.createEl('option', { value: '4', text: '🍅 4 (1h40m)' });
    estimateSelect.createEl('option', { value: '5', text: '🍅 5 (2h05m)' });
    estimateSelect.createEl('option', { value: '6', text: '🍅 6 (2h30m)' });
    estimateSelect.addEventListener('change', () => {
      addEstimate = parseInt(estimateSelect.value, 10) || 0;
    });

    typeSelect.addEventListener('change', () => {
      addType = typeSelect.value as 'task' | 'idea';
      prioritySelect.style.display = addType === 'idea' ? 'none' : '';
      estimateSelect.style.display = addType === 'idea' ? 'none' : '';
    });

    const addBtn = addBar.createEl('button', { cls: 'mod-cta' });
    const aIcon = addBtn.createSpan();
    setIcon(aIcon, 'plus');
    addBtn.createSpan({ text: 'Añadir' });

    const handleAdd = async () => {
      const val = addInput.value.trim();
      if (!val) return;

      const inboxPath = this.plugin.settings.inboxFilePath || 'StudyFlow/Inbox.md';
      const file = await getOrCreateFile(this.app, inboxPath, '# Inbox\n\n## Tareas\n\n## Ideas\n\n');
      const content = await this.app.vault.read(file);

      if (addType === 'idea') {
        const ideaLine = val.startsWith('💡') ? val : `💡 ${val}`;
        const updated = appendTaskToMarkdownSection(content, ideaLine, '## Ideas');
        await this.app.vault.modify(file, updated);
        new Notice('💡 Idea añadida a tu banco');
      } else {
        let finalText = addPriority !== 'none'
          ? formatTaskWithPriority(val, addPriority)
          : val;
        if (addEstimate > 0) {
          finalText = formatTaskWithPomodoroEstimate(finalText, addEstimate);
        }
        const updated = appendTaskToMarkdownSection(content, finalText, '## Tareas');
        await this.app.vault.modify(file, updated);
        new Notice('✓ Tarea añadida al Inbox');
      }

      addInput.value = '';
      prioritySelect.value = 'none';
      estimateSelect.value = '0';
      addPriority = 'none';
      addEstimate = 0;
      await this.renderTasksTab(container);
    };

    addBtn.addEventListener('click', handleAdd);
    addInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        handleAdd();
      }
    });

    // Segmented Filters Bar
    const filterRow = card.createDiv({ cls: 'study-flow-segmented-control' });
    const filters: Array<{ id: 'pending' | 'ideas' | 'completed' | 'all'; label: string; count: number }> = [
      { id: 'pending', label: 'Pendientes', count: pendingCount },
      { id: 'ideas', label: '💡 Ideas', count: ideasCount },
      { id: 'completed', label: 'Completadas', count: completedCount },
      { id: 'all', label: 'Todas', count: this.tasks.length },
    ];

    filters.forEach((f) => {
      const btn = filterRow.createEl('button', {
        cls: `study-flow-segmented-btn ${this.taskFilter === f.id ? 'is-active' : ''}`,
      });
      btn.createSpan({ text: f.label });
      btn.createSpan({ text: String(f.count), cls: 'study-flow-count-pill' });
      btn.addEventListener('click', async () => {
        this.taskFilter = f.id;
        container.empty();
        await this.renderTasksTab(container);
      });
    });

    // Task Cards List
    const listContainer = card.createDiv({ cls: 'study-flow-task-list-cards' });
    const displayed = this.tasks.filter((t) => {
      if (this.taskFilter === 'pending') return !t.completed && !t.isIdea;
      if (this.taskFilter === 'ideas') return !t.completed && t.isIdea;
      if (this.taskFilter === 'completed') return t.completed;
      return true;
    });

    if (displayed.length === 0) {
      const emptyState = listContainer.createDiv({ cls: 'study-flow-empty-state' });
      const emptyIcon = emptyState.createDiv({ cls: 'study-flow-empty-icon' });
      setIcon(emptyIcon, this.taskFilter === 'ideas' ? 'sparkles' : 'check-circle-2');
      emptyState.createEl('h4', {
        text: this.taskFilter === 'ideas'
          ? 'No hay ideas espontáneas guardadas'
          : (this.taskFilter === 'pending' ? '¡Todo al día!' : 'No hay tareas'),
      });
      emptyState.createEl('p', {
        text: this.taskFilter === 'ideas'
          ? 'Capturá tus ideas aquí para no perderlas sin saturar tu foco del día a día.'
          : (this.taskFilter === 'pending' ? 'No tienes tareas pendientes en tu Inbox.' : 'Añade una nueva tarea arriba.'),
      });
    } else {
      displayed.forEach((task) => {
        const itemCard = listContainer.createDiv({
          cls: `study-flow-task-card ${task.completed ? 'is-done' : ''}`,
        });

        const cbWrapper = itemCard.createDiv({ cls: 'study-flow-cb-wrapper' });
        const cb = cbWrapper.createEl('input', { type: 'checkbox' });
        cb.checked = task.completed;

        cb.addEventListener('change', async () => {
          await toggleTaskCompletionInFile(this.app, task, cb.checked);
          task.completed = cb.checked;
          new Notice(cb.checked ? '✓ Marcado como completado' : 'Desmarcado');
          container.empty();
          await this.renderTasksTab(container);
        });

        const textSpan = itemCard.createEl('span', {
          text: task.text,
          cls: `study-flow-task-text ${task.completed ? 'is-strikethrough' : ''}`,
        });
        textSpan.addEventListener('click', () => {
          cb.checked = !cb.checked;
          cb.dispatchEvent(new Event('change'));
        });

        if (task.isIdea) {
          itemCard.createSpan({ text: '💡 Idea', cls: 'study-flow-priority-badge is-idea' });

          const promoteBtn = itemCard.createEl('button', {
            cls: 'study-flow-promote-btn',
            attr: { 'aria-label': 'Promover a tarea accionable' },
          });
          const pIcon = promoteBtn.createSpan();
          setIcon(pIcon, 'arrow-up-right');
          promoteBtn.createSpan({ text: 'A Tarea' });
          promoteBtn.addEventListener('click', async (e) => {
            e.stopPropagation();
            await promoteIdeaToTaskInFile(this.app, task);
            new Notice(`✓ "${task.text}" promovida a tarea`);
            container.empty();
            await this.renderTasksTab(container);
          });
        } else {
          if (task.priority === 'high') {
            itemCard.createSpan({ text: '⏫ Alta', cls: 'study-flow-priority-badge is-high' });
          } else if (task.priority === 'medium') {
            itemCard.createSpan({ text: '🔼 Media', cls: 'study-flow-priority-badge is-medium' });
          } else if (task.priority === 'low') {
            itemCard.createSpan({ text: '🔽 Baja', cls: 'study-flow-priority-badge is-low' });
          }

          const estCount = task.estimatedPomodoros || 0;
          const compCount = task.completedPomodoros || 0;
          if (estCount > 0 || compCount > 0) {
            let badgeLabel = '';
            let badgeCls = 'study-flow-estimate-badge';
            if (compCount > 0 && estCount > 0) {
              badgeLabel = `🍅 ${compCount}/${estCount}`;
              if (compCount >= estCount) badgeCls += ' is-met';
            } else if (estCount > 0) {
              badgeLabel = `🍅 ${estCount}`;
            } else if (compCount > 0) {
              badgeLabel = `🍅 ${compCount}`;
            }
            itemCard.createSpan({ text: badgeLabel, cls: badgeCls });
          }

          if (task.dueDate) {
            const badgeText =
              task.daysRemaining !== undefined
                ? formatDeadlineHuman(task.daysRemaining, task.dueDate)
                : `📅 ${task.dueDate}`;
            let badgeCls = 'study-flow-deadline-badge';
            if (task.daysRemaining !== undefined) {
              if (task.daysRemaining < 0) badgeCls += ' is-overdue';
              else if (task.daysRemaining === 0) badgeCls += ' is-today';
              else if (task.daysRemaining <= 3) badgeCls += ' is-soon';
            }
            itemCard.createSpan({ text: badgeText, cls: badgeCls });
          }

          // Quick step: log +1 Pomodoro directly
          const addPomoBtn = itemCard.createEl('button', {
            cls: 'study-flow-icon-action-btn study-flow-pomo-step-btn',
            attr: { 'aria-label': 'Registrar pomodoro a esta tarea (+1 🍅)' },
          });
          addPomoBtn.createSpan({ text: '+🍅' });
          addPomoBtn.addEventListener('click', async (e) => {
            e.stopPropagation();
            const res = await incrementTaskPomodoroInFile(this.app, task);
            if (res) {
              new Notice(`🍅 Pomodoro registrado para "${task.text}"`);
              container.empty();
              await this.renderTasksTab(container);
            }
          });

          // Quick action: Link to Pomodoro
          const linkPomodoroBtn = itemCard.createEl('button', {
            cls: 'study-flow-icon-action-btn',
            attr: { 'aria-label': 'Enfocar con Pomodoro' },
          });
          setIcon(linkPomodoroBtn, 'timer');
          linkPomodoroBtn.addEventListener('click', async (e) => {
            e.stopPropagation();
            this.plugin.pomodoro.setActiveTask({
              id: task.id,
              text: task.text,
              sourceFile: task.sourceFile,
            });
            this.activeTab = 'pomodoro';
            this.containerEl.empty();
            await this.renderView();
          });
        }

        itemCard.createSpan({
          text: '#Inbox',
          cls: 'study-flow-source-chip',
        });

        const delBtn = itemCard.createEl('button', {
          cls: 'study-flow-icon-action-btn',
          attr: { 'aria-label': 'Eliminar entrada' },
        });
        setIcon(delBtn, 'trash-2');
        delBtn.addEventListener('click', async (e) => {
          e.stopPropagation();
          await deleteTaskFromFile(this.app, task);
          new Notice('Entrada eliminada');
          container.empty();
          await this.renderTasksTab(container);
        });
      });
    }
  }

  private async reloadTasks(): Promise<void> {
    this.tasks = [];
    const files = [this.plugin.settings.inboxFilePath || 'StudyFlow/Inbox.md'];
    for (const p of files) {
      const f = this.app.vault.getAbstractFileByPath(p);
      if (f instanceof TFile) {
        try {
          const content = await this.app.vault.read(f);
          this.tasks.push(...extractAllTasksFromContent(content, f.path));
        } catch (err) {
          console.error('Error reloading tasks:', err);
        }
      }
    }
  }

  // ===================== CALENDAR & TIME BLOCKING TAB =====================
  private async renderCalendarTab(container: HTMLElement): Promise<void> {
    container.empty();
    this.allDeadlines = await loadAllDeadlines(this.app, this.plugin.settings);

    const card = container.createDiv({ cls: 'study-flow-card study-flow-calendar-main-card' });

    // Top Navigation & Control Bar
    const topBar = card.createDiv({ cls: 'study-flow-calendar-top-bar' });

    // Left: Month/Week Navigation
    const navGroup = topBar.createDiv({ cls: 'study-flow-calendar-nav-group' });
    const prevBtn = navGroup.createEl('button', {
      cls: 'study-flow-header-icon-btn',
      attr: { 'aria-label': 'Anterior' },
    });
    setIcon(prevBtn, 'chevron-left');
    prevBtn.addEventListener('click', async () => {
      if (this.calendarViewMode === 'week') {
        const parts = this.selectedCalendarDate.split('-').map(Number);
        const d = new Date(parts[0], parts[1] - 1, parts[2]);
        d.setDate(d.getDate() - 7);
        this.calendarYear = d.getFullYear();
        this.calendarMonth = d.getMonth();
        this.selectedCalendarDate = formatDateKey(d);
      } else {
        if (this.calendarMonth === 0) {
          this.calendarMonth = 11;
          this.calendarYear -= 1;
        } else {
          this.calendarMonth -= 1;
        }
      }
      await this.renderCalendarTab(container);
    });

    navGroup.createEl('span', {
      cls: 'study-flow-calendar-month-title',
      text: formatMonthYearHeader(this.calendarYear, this.calendarMonth),
    });

    const nextBtn = navGroup.createEl('button', {
      cls: 'study-flow-header-icon-btn',
      attr: { 'aria-label': 'Siguiente' },
    });
    setIcon(nextBtn, 'chevron-right');
    nextBtn.addEventListener('click', async () => {
      if (this.calendarViewMode === 'week') {
        const parts = this.selectedCalendarDate.split('-').map(Number);
        const d = new Date(parts[0], parts[1] - 1, parts[2]);
        d.setDate(d.getDate() + 7);
        this.calendarYear = d.getFullYear();
        this.calendarMonth = d.getMonth();
        this.selectedCalendarDate = formatDateKey(d);
      } else {
        if (this.calendarMonth === 11) {
          this.calendarMonth = 0;
          this.calendarYear += 1;
        } else {
          this.calendarMonth += 1;
        }
      }
      await this.renderCalendarTab(container);
    });

    const todayBtn = navGroup.createEl('button', {
      cls: 'study-flow-icon-action-btn-styled study-flow-calendar-today-btn',
      text: 'Hoy',
    });
    todayBtn.addEventListener('click', async () => {
      const now = new Date();
      this.calendarYear = now.getFullYear();
      this.calendarMonth = now.getMonth();
      this.selectedCalendarDate = formatDateKey(now);
      await this.renderCalendarTab(container);
    });

    // Right: Segmented view toggles (Mes, Semana, Deadlines)
    const viewSwitcher = topBar.createDiv({ cls: 'study-flow-segmented-control' });
    const pendingDlCount = this.allDeadlines.filter((d) => !d.completed).length;
    const viewButtons = [
      { id: 'month' as const, label: 'Mes', icon: 'calendar' },
      { id: 'week' as const, label: 'Semana', icon: 'columns' },
      { id: 'deadlines' as const, label: `Deadlines (${pendingDlCount})`, icon: 'alert-circle' },
    ];

    viewButtons.forEach((v) => {
      const btn = viewSwitcher.createEl('button', {
        cls: `study-flow-segmented-btn ${this.calendarViewMode === v.id ? 'is-active' : ''}`,
      });
      const iconSpan = btn.createSpan();
      setIcon(iconSpan, v.icon);
      btn.createSpan({ text: v.label });
      btn.addEventListener('click', async () => {
        this.calendarViewMode = v.id;
        await this.renderCalendarTab(container);
      });
    });

    // Sub-view router
    if (this.calendarViewMode === 'month') {
      await this.renderCalendarMonthGrid(card, container);
      await this.renderDayDetailPanel(card, container);
    } else if (this.calendarViewMode === 'week') {
      await this.renderCalendarWeekView(card, container);
      await this.renderDayDetailPanel(card, container);
    } else if (this.calendarViewMode === 'deadlines') {
      await this.renderDeadlinesMasterHub(card, container);
    }
  }

  private async renderCalendarMonthGrid(card: HTMLElement, tabContainer: HTMLElement): Promise<void> {
    const gridWrapper = card.createDiv({ cls: 'study-flow-calendar-wrapper' });

    // Days of Week Header
    const headerRow = gridWrapper.createDiv({ cls: 'study-flow-calendar-header-row' });
    SHORT_DAY_NAMES_ES.forEach((dayName) => {
      headerRow.createDiv({ cls: 'study-flow-calendar-header-cell', text: dayName });
    });

    // Month Matrix
    const matrix = getCalendarMonthMatrix(this.calendarYear, this.calendarMonth);
    const grid = gridWrapper.createDiv({ cls: 'study-flow-calendar-grid' });

    matrix.forEach((cell) => {
      const cellEl = grid.createDiv({
        cls: `study-flow-calendar-cell ${cell.isCurrentMonth ? '' : 'is-other-month'} ${cell.isToday ? 'is-today' : ''} ${cell.dateStr === this.selectedCalendarDate ? 'is-selected' : ''}`,
      });

      const topRow = cellEl.createDiv({ cls: 'study-flow-calendar-cell-top' });
      topRow.createSpan({ text: String(cell.dayNumber), cls: 'study-flow-calendar-day-num' });

      // Badges
      const dayDeadlines = this.allDeadlines.filter((d) => d.dueDate === cell.dateStr && !d.completed);
      const dayBlocks = getTimeBlocksForDate(this.plugin.settings, cell.dateStr);

      const badgesWrap = cellEl.createDiv({ cls: 'study-flow-calendar-cell-badges' });

      if (dayDeadlines.length > 0) {
        const hasOverdue = dayDeadlines.some((d) => d.daysRemaining < 0);
        const hasToday = dayDeadlines.some((d) => d.daysRemaining === 0);
        let dCls = 'study-flow-cal-chip is-deadline';
        if (hasOverdue) dCls += ' is-overdue';
        else if (hasToday) dCls += ' is-today';
        badgesWrap.createSpan({
          text: `🚨 ${dayDeadlines.length}`,
          cls: dCls,
          attr: { title: `${dayDeadlines.length} entrega(s) pendiente(s)` },
        });
      }

      if (dayBlocks.length > 0) {
        badgesWrap.createSpan({
          text: `⏱️ ${dayBlocks.length}`,
          cls: 'study-flow-cal-chip is-block',
          attr: { title: `${dayBlocks.length} bloque(s) de estudio` },
        });
      }

      cellEl.addEventListener('click', async () => {
        this.selectedCalendarDate = cell.dateStr;
        if (!cell.isCurrentMonth) {
          this.calendarYear = cell.year;
          this.calendarMonth = cell.month;
        }
        await this.renderCalendarTab(tabContainer);
      });
    });
  }

  private async renderCalendarWeekView(card: HTMLElement, tabContainer: HTMLElement): Promise<void> {
    const weekWrapper = card.createDiv({ cls: 'study-flow-week-wrapper' });
    const parts = this.selectedCalendarDate.split('-').map(Number);
    const refDate = new Date(parts[0], parts[1] - 1, parts[2]);
    const weekDays = getWeekDays(refDate);

    const weekGrid = weekWrapper.createDiv({ cls: 'study-flow-week-grid' });

    weekDays.forEach((day) => {
      const isSelected = day.dateStr === this.selectedCalendarDate;
      const dayCard = weekGrid.createDiv({
        cls: `study-flow-week-day-card ${day.isToday ? 'is-today' : ''} ${isSelected ? 'is-selected' : ''}`,
      });

      const header = dayCard.createDiv({ cls: 'study-flow-week-day-header' });
      header.createSpan({ text: day.shortDay, cls: 'study-flow-week-day-name' });
      header.createSpan({ text: String(day.dayNumber), cls: 'study-flow-week-day-num' });

      // Badges
      const dayDeadlines = this.allDeadlines.filter((d) => d.dueDate === day.dateStr && !d.completed);
      const dayBlocks = getTimeBlocksForDate(this.plugin.settings, day.dateStr);

      const badgesRow = dayCard.createDiv({ cls: 'study-flow-week-badges-row' });
      if (dayDeadlines.length > 0) {
        badgesRow.createSpan({
          text: `🚨 ${dayDeadlines.length}`,
          cls: 'study-flow-cal-chip is-deadline',
        });
      }
      if (dayBlocks.length > 0) {
        badgesRow.createSpan({
          text: `⏱️ ${dayBlocks.length}`,
          cls: 'study-flow-cal-chip is-block',
        });
      }

      // Blocks list preview
      const previewList = dayCard.createDiv({ cls: 'study-flow-week-blocks-preview' });
      if (dayBlocks.length === 0 && dayDeadlines.length === 0) {
        previewList.createDiv({ text: 'Libre', cls: 'study-flow-week-empty-label' });
      } else {
        dayBlocks.slice(0, 3).forEach((b) => {
          previewList.createDiv({
            text: `${b.startTime} ${b.title}`,
            cls: `study-flow-week-mini-block ${b.completed ? 'is-completed' : ''}`,
          });
        });
        if (dayBlocks.length > 3) {
          previewList.createDiv({
            text: `+${dayBlocks.length - 3} más...`,
            cls: 'study-flow-week-more-label',
          });
        }
      }

      dayCard.addEventListener('click', async () => {
        this.selectedCalendarDate = day.dateStr;
        await this.renderCalendarTab(tabContainer);
      });
    });
  }

  private async renderDayDetailPanel(parentCard: HTMLElement, tabContainer: HTMLElement): Promise<void> {
    const detailPanel = parentCard.createDiv({ cls: 'study-flow-day-detail-panel' });

    // Panel Header
    const detailHeader = detailPanel.createDiv({ cls: 'study-flow-day-detail-header' });
    const titleWrap = detailHeader.createDiv({ cls: 'study-flow-day-detail-title-wrap' });
    const calIcon = titleWrap.createSpan({ cls: 'study-flow-section-icon' });
    setIcon(calIcon, 'calendar');
    titleWrap.createEl('h3', {
      text: formatLongDate(this.selectedCalendarDate),
      cls: 'study-flow-day-detail-title',
    });

    const headerActions = detailHeader.createDiv({ cls: 'study-flow-day-header-actions' });

    // Sync to Daily Note Button
    const syncDailyBtn = headerActions.createEl('button', {
      cls: 'study-flow-icon-action-btn-styled',
      attr: { 'aria-label': 'Sincronizar bloques con la Nota Diaria correspondiente' },
    });
    const syncIcon = syncDailyBtn.createSpan();
    setIcon(syncIcon, 'file-output');
    syncDailyBtn.createSpan({ text: 'Sincronizar Daily' });
    syncDailyBtn.addEventListener('click', async () => {
      const blocks = getTimeBlocksForDate(this.plugin.settings, this.selectedCalendarDate);
      if (blocks.length === 0) {
        new Notice('No hay bloques de tiempo para sincronizar en este día.');
        return;
      }
      const ok = await syncTimeBlocksToDailyNote(
        this.app,
        this.plugin.settings,
        this.selectedCalendarDate,
        blocks
      );
      if (ok) {
        new Notice(`✓ Bloques sincronizados en ${this.plugin.settings.dailyNotesFolder}/${this.selectedCalendarDate}.md`);
      } else {
        new Notice('Error al sincronizar bloques con la Daily Note.');
      }
    });

    // Open Daily Note Button
    const openDailyBtn = headerActions.createEl('button', {
      cls: 'study-flow-header-icon-btn',
      attr: { 'aria-label': 'Abrir Daily Note de este día' },
    });
    setIcon(openDailyBtn, 'file-text');
    openDailyBtn.addEventListener('click', async () => {
      const dailyPath = `${this.plugin.settings.dailyNotesFolder}/${this.selectedCalendarDate}.md`;
      const file = await getOrCreateFile(this.app, dailyPath, `# ${this.selectedCalendarDate}\n\n`);
      await this.app.workspace.getLeaf(false).openFile(file);
    });

    // Columns: Time Blocking & Deadlines
    const contentColumns = detailPanel.createDiv({ cls: 'study-flow-day-columns' });

    // === Column 1: Time Blocking ===
    const timeBlocksCol = contentColumns.createDiv({ cls: 'study-flow-day-column' });
    const tbHeader = timeBlocksCol.createDiv({ cls: 'study-flow-column-header' });
    const tbTitle = tbHeader.createDiv({ cls: 'study-flow-column-title' });
    const tbIcon = tbTitle.createSpan();
    setIcon(tbIcon, 'clock');
    tbTitle.createSpan({ text: 'Bloques de Tiempo' });

    const addBlockBtn = tbHeader.createEl('button', {
      cls: 'study-flow-icon-action-btn-styled',
      attr: { 'aria-label': 'Agregar nuevo bloque de estudio' },
    });
    const addBlockIcon = addBlockBtn.createSpan();
    setIcon(addBlockIcon, 'plus');
    addBlockBtn.createSpan({ text: 'Nuevo Bloque' });
    addBlockBtn.addEventListener('click', () => {
      this.isAddingTimeBlock = !this.isAddingTimeBlock;
      formWrapper.style.display = this.isAddingTimeBlock ? 'block' : 'none';
    });

    // Inline Add Block Form
    const formWrapper = timeBlocksCol.createDiv({
      cls: 'study-flow-block-create-form',
      attr: { style: this.isAddingTimeBlock ? 'display: block;' : 'display: none;' },
    });
    const formRow1 = formWrapper.createDiv({ cls: 'study-flow-form-row' });
    const startInput = formRow1.createEl('input', {
      type: 'text',
      cls: 'study-flow-time-input',
      value: '09:00',
      attr: { placeholder: '09:00' },
    });
    formRow1.createSpan({ text: '—', cls: 'study-flow-time-sep' });
    const endInput = formRow1.createEl('input', {
      type: 'text',
      cls: 'study-flow-time-input',
      value: '10:30',
      attr: { placeholder: '10:30' },
    });
    const titleInput = formRow1.createEl('input', {
      type: 'text',
      cls: 'study-flow-block-title-input',
      attr: { placeholder: 'Materia o título del bloque (ej: Álgebra)...' },
    });

    const formRow2 = formWrapper.createDiv({ cls: 'study-flow-form-row' });
    const noteInput = formRow2.createEl('input', {
      type: 'text',
      cls: 'study-flow-block-note-input',
      attr: { placeholder: 'Nota enlazada opcional (ej: [[Álgebra Cap 3]])...' },
    });
    const saveBlockBtn = formRow2.createEl('button', {
      cls: 'mod-cta study-flow-btn-sm',
      text: 'Guardar',
    });
    const cancelBlockBtn = formRow2.createEl('button', {
      cls: 'study-flow-btn-sm',
      text: 'Cancelar',
    });

    saveBlockBtn.addEventListener('click', async () => {
      const title = titleInput.value.trim();
      const startTime = startInput.value.trim();
      const endTime = endInput.value.trim();
      if (!title || !startTime || !endTime) {
        new Notice('Completá la hora de inicio, fin y el título');
        return;
      }
      const newBlock: CalendarTimeBlock = {
        id: String(Date.now()),
        date: this.selectedCalendarDate,
        startTime,
        endTime,
        title,
        linkedNote: noteInput.value.trim() || undefined,
        completed: false,
      };
      await saveTimeBlock(this.plugin, newBlock);
      this.isAddingTimeBlock = false;
      new Notice(`✓ Bloque "${title}" guardado`);
      await this.renderCalendarTab(tabContainer);
    });

    cancelBlockBtn.addEventListener('click', () => {
      this.isAddingTimeBlock = false;
      formWrapper.style.display = 'none';
    });

    // Time Blocks List
    const blocks = getTimeBlocksForDate(this.plugin.settings, this.selectedCalendarDate);
    const blocksListEl = timeBlocksCol.createDiv({ cls: 'study-flow-blocks-list' });

    if (blocks.length === 0) {
      blocksListEl.createDiv({
        cls: 'study-flow-empty-tasks',
        text: 'No hay bloques de tiempo para este día.',
      });
    } else {
      blocks.forEach((block) => {
        const blockCard = blocksListEl.createDiv({
          cls: `study-flow-timeblock-card ${block.completed ? 'is-completed' : ''}`,
        });

        // Checkbox
        const cb = blockCard.createEl('input', {
          type: 'checkbox',
          cls: 'study-flow-timeblock-cb',
        });
        cb.checked = !!block.completed;
        cb.addEventListener('change', async () => {
          await toggleTimeBlockCompletion(this.plugin, this.selectedCalendarDate, block.id, cb.checked);
          await this.renderCalendarTab(tabContainer);
        });

        // Time range badge
        const duration = calculateBlockDurationMinutes(block.startTime, block.endTime);
        const durText = duration > 0 ? ` (${duration}m)` : '';
        blockCard.createSpan({
          text: `${block.startTime} — ${block.endTime}${durText}`,
          cls: 'study-flow-timeblock-badge',
        });

        // Title
        blockCard.createSpan({
          text: block.title,
          cls: `study-flow-timeblock-title ${block.completed ? 'is-strikethrough' : ''}`,
        });

        // Linked Note
        if (block.linkedNote) {
          const noteBtn = blockCard.createEl('button', {
            cls: 'study-flow-timeblock-note-link',
            attr: { 'aria-label': 'Abrir nota vinculada' },
          });
          const noteIcon = noteBtn.createSpan();
          setIcon(noteIcon, 'file-text');
          noteBtn.createSpan({ text: block.linkedNote.replace(/[\[\]]/g, '').trim() });
          noteBtn.addEventListener('click', () => {
            const raw = block.linkedNote?.replace(/[\[\]]/g, '').trim();
            if (raw) this.app.workspace.openLinkText(raw, '', false);
          });
        }

        // Action: Pomodoro Focus
        const pomoBtn = blockCard.createEl('button', {
          cls: 'study-flow-icon-action-btn',
          attr: { 'aria-label': 'Enfocar este bloque con Pomodoro' },
        });
        setIcon(pomoBtn, 'timer');
        pomoBtn.addEventListener('click', async () => {
          this.plugin.pomodoro.setActiveTask({
            id: block.id,
            text: `${block.title} [${block.startTime} - ${block.endTime}]`,
            sourceFile: `${this.plugin.settings.dailyNotesFolder}/${this.selectedCalendarDate}.md`,
          });
          this.activeTab = 'pomodoro';
          await this.renderView();
        });

        // Action: Delete Block
        const delBtn = blockCard.createEl('button', {
          cls: 'study-flow-icon-action-btn',
          attr: { 'aria-label': 'Eliminar bloque' },
        });
        setIcon(delBtn, 'trash-2');
        delBtn.addEventListener('click', async () => {
          await deleteTimeBlock(this.plugin, this.selectedCalendarDate, block.id);
          new Notice('Bloque eliminado');
          await this.renderCalendarTab(tabContainer);
        });
      });
    }

    // === Column 2: Deadlines del Día ===
    const deadlinesCol = contentColumns.createDiv({ cls: 'study-flow-day-column' });
    const dlHeader = deadlinesCol.createDiv({ cls: 'study-flow-column-header' });
    const dlTitle = dlHeader.createDiv({ cls: 'study-flow-column-title' });
    const dlIcon = dlTitle.createSpan();
    setIcon(dlIcon, 'alert-circle');
    dlTitle.createSpan({ text: 'Deadlines del Día' });

    const addDlBtn = dlHeader.createEl('button', {
      cls: 'study-flow-icon-action-btn-styled',
      attr: { 'aria-label': 'Agregar deadline para este día' },
    });
    const addDlIcon = addDlBtn.createSpan();
    setIcon(addDlIcon, 'plus');
    addDlBtn.createSpan({ text: 'Nueva Entrega' });
    addDlBtn.addEventListener('click', () => {
      this.isAddingDeadline = !this.isAddingDeadline;
      dlFormWrapper.style.display = this.isAddingDeadline ? 'block' : 'none';
    });

    // Inline Add Deadline Form
    const dlFormWrapper = deadlinesCol.createDiv({
      cls: 'study-flow-block-create-form',
      attr: { style: this.isAddingDeadline ? 'display: block;' : 'display: none;' },
    });
    const dlRow1 = dlFormWrapper.createDiv({ cls: 'study-flow-form-row' });
    const dlTitleInput = dlRow1.createEl('input', {
      type: 'text',
      cls: 'study-flow-block-title-input',
      attr: { placeholder: 'Título de la entrega (ej: TP Final)...' },
    });
    const dlTimeInput = dlRow1.createEl('input', {
      type: 'text',
      cls: 'study-flow-time-input',
      attr: { placeholder: 'Hora (23:59)' },
    });

    const dlRow2 = dlFormWrapper.createDiv({ cls: 'study-flow-form-row' });
    const prioritySelect = dlRow2.createEl('select', { cls: 'study-flow-select-input' });
    const priorities: Array<{ val: TaskPriority; label: string }> = [
      { val: 'none', label: 'Sin prioridad' },
      { val: 'high', label: '⏫ Alta' },
      { val: 'medium', label: '🔼 Media' },
      { val: 'low', label: '🔽 Baja' },
    ];
    priorities.forEach((p) => {
      const opt = prioritySelect.createEl('option', { value: p.val, text: p.label });
      if (p.val === 'high') opt.selected = true;
    });

    const pomoInput = dlRow2.createEl('input', {
      type: 'number',
      cls: 'study-flow-number-input',
      attr: { placeholder: '🍅 Est.', min: '0', max: '20' },
    });

    const saveDlBtn = dlRow2.createEl('button', {
      cls: 'mod-cta study-flow-btn-sm',
      text: 'Crear Entrega',
    });
    const cancelDlBtn = dlRow2.createEl('button', {
      cls: 'study-flow-btn-sm',
      text: 'Cancelar',
    });

    saveDlBtn.addEventListener('click', async () => {
      const t = dlTitleInput.value.trim();
      if (!t) {
        new Notice('Ingresá el título de la entrega');
        return;
      }
      const timeVal = dlTimeInput.value.trim() || undefined;
      const prioVal = prioritySelect.value as TaskPriority;
      const pomoVal = pomoInput.value ? parseInt(pomoInput.value, 10) : undefined;

      const ok = await createDeadlineTask(
        this.app,
        this.plugin.settings,
        t,
        this.selectedCalendarDate,
        timeVal,
        prioVal,
        pomoVal
      );
      if (ok) {
        this.isAddingDeadline = false;
        new Notice(`✓ Deadline creada para ${this.selectedCalendarDate}`);
        await this.renderCalendarTab(tabContainer);
      }
    });

    cancelDlBtn.addEventListener('click', () => {
      this.isAddingDeadline = false;
      dlFormWrapper.style.display = 'none';
    });

    // List of day deadlines
    const dayDeadlines = this.allDeadlines.filter((d) => d.dueDate === this.selectedCalendarDate);
    const dlListEl = deadlinesCol.createDiv({ cls: 'study-flow-deadlines-list' });

    if (dayDeadlines.length === 0) {
      dlListEl.createDiv({
        cls: 'study-flow-empty-tasks',
        text: 'Sin entregas ni fechas límite para este día.',
      });
    } else {
      dayDeadlines.forEach((item) => {
        const itemCard = dlListEl.createDiv({
          cls: `study-flow-deadline-card ${item.completed ? 'is-completed' : ''}`,
        });

        const cb = itemCard.createEl('input', {
          type: 'checkbox',
          cls: 'study-flow-task-cb',
        });
        cb.checked = item.completed;
        cb.addEventListener('change', async () => {
          await toggleTaskCompletionInFile(this.app, item, cb.checked);
          await this.renderCalendarTab(tabContainer);
        });

        const textSpan = itemCard.createSpan({
          text: item.cleanTitle,
          cls: `study-flow-deadline-item-title ${item.completed ? 'is-strikethrough' : ''}`,
        });
        textSpan.addEventListener('click', () => {
          cb.checked = !cb.checked;
          cb.dispatchEvent(new Event('change'));
        });

        if (item.dueTime) {
          itemCard.createSpan({
            text: `⏰ ${item.dueTime}`,
            cls: 'study-flow-time-chip',
          });
        }

        const badgeText = formatDeadlineHuman(item.daysRemaining, item.dueDate);
        let badgeCls = 'study-flow-deadline-badge';
        if (item.daysRemaining < 0) badgeCls += ' is-overdue';
        else if (item.daysRemaining === 0) badgeCls += ' is-today';
        else if (item.daysRemaining <= 3) badgeCls += ' is-soon';
        itemCard.createSpan({ text: badgeText, cls: badgeCls });

        // Action: Pomodoro Focus
        const pomoBtn = itemCard.createEl('button', {
          cls: 'study-flow-icon-action-btn',
          attr: { 'aria-label': 'Enfocar con Pomodoro' },
        });
        setIcon(pomoBtn, 'timer');
        pomoBtn.addEventListener('click', async () => {
          this.plugin.pomodoro.setActiveTask({
            id: item.id,
            text: item.text,
            sourceFile: item.sourceFile,
          });
          this.activeTab = 'pomodoro';
          await this.renderView();
        });

        // Action: Delete
        const delBtn = itemCard.createEl('button', {
          cls: 'study-flow-icon-action-btn',
          attr: { 'aria-label': 'Eliminar entrega' },
        });
        setIcon(delBtn, 'trash-2');
        delBtn.addEventListener('click', async () => {
          await deleteTaskFromFile(this.app, item);
          new Notice('Entrega eliminada');
          await this.renderCalendarTab(tabContainer);
        });
      });
    }
  }

  private async renderDeadlinesMasterHub(card: HTMLElement, tabContainer: HTMLElement): Promise<void> {
    const hubWrapper = card.createDiv({ cls: 'study-flow-deadlines-hub' });

    // Header bar
    const hubHeader = hubWrapper.createDiv({ cls: 'study-flow-hub-header' });
    const hubTitle = hubHeader.createDiv({ cls: 'study-flow-hub-title' });
    const dlIcon = hubTitle.createSpan();
    setIcon(dlIcon, 'target');
    hubTitle.createEl('h3', { text: 'Centro de Deadlines & Fechas Límite' });

    const newDlBtn = hubHeader.createEl('button', {
      cls: 'mod-cta study-flow-btn-sm',
    });
    const plusIcon = newDlBtn.createSpan();
    setIcon(plusIcon, 'plus');
    newDlBtn.createSpan({ text: 'Nueva Entrega' });
    newDlBtn.addEventListener('click', () => {
      this.isAddingDeadline = !this.isAddingDeadline;
      formWrapper.style.display = this.isAddingDeadline ? 'block' : 'none';
    });

    // Inline form for master hub
    const formWrapper = hubWrapper.createDiv({
      cls: 'study-flow-block-create-form',
      attr: { style: this.isAddingDeadline ? 'display: block;' : 'display: none;' },
    });
    const r1 = formWrapper.createDiv({ cls: 'study-flow-form-row' });
    const titleIn = r1.createEl('input', {
      type: 'text',
      cls: 'study-flow-block-title-input',
      attr: { placeholder: 'Título de la entrega (ej: Entrega TP Redes)...' },
    });
    const dateIn = r1.createEl('input', {
      type: 'date',
      cls: 'study-flow-date-input',
      value: this.selectedCalendarDate,
    });
    const timeIn = r1.createEl('input', {
      type: 'text',
      cls: 'study-flow-time-input',
      attr: { placeholder: 'Hora (23:59)' },
    });

    const r2 = formWrapper.createDiv({ cls: 'study-flow-form-row' });
    const prioIn = r2.createEl('select', { cls: 'study-flow-select-input' });
    [
      { val: 'none', label: 'Sin prioridad' },
      { val: 'high', label: '⏫ Alta' },
      { val: 'medium', label: '🔼 Media' },
      { val: 'low', label: '🔽 Baja' },
    ].forEach((p) => {
      const opt = prioIn.createEl('option', { value: p.val, text: p.label });
      if (p.val === 'high') opt.selected = true;
    });

    const pomosIn = r2.createEl('input', {
      type: 'number',
      cls: 'study-flow-number-input',
      attr: { placeholder: '🍅 Est.', min: '0', max: '20' },
    });

    const saveHubDl = r2.createEl('button', {
      cls: 'mod-cta study-flow-btn-sm',
      text: 'Guardar Entrega',
    });
    const cancelHubDl = r2.createEl('button', {
      cls: 'study-flow-btn-sm',
      text: 'Cancelar',
    });

    saveHubDl.addEventListener('click', async () => {
      const t = titleIn.value.trim();
      const d = dateIn.value.trim();
      if (!t || !d) {
        new Notice('Ingresá el título y la fecha');
        return;
      }
      const ok = await createDeadlineTask(
        this.app,
        this.plugin.settings,
        t,
        d,
        timeIn.value.trim() || undefined,
        prioIn.value as TaskPriority,
        pomosIn.value ? parseInt(pomosIn.value, 10) : undefined
      );
      if (ok) {
        this.isAddingDeadline = false;
        new Notice(`✓ Deadline creada para ${d}`);
        await this.renderCalendarTab(tabContainer);
      }
    });

    cancelHubDl.addEventListener('click', () => {
      this.isAddingDeadline = false;
      formWrapper.style.display = 'none';
    });

    // Urgency Groups
    const overdue = this.allDeadlines.filter((d) => !d.completed && d.daysRemaining < 0);
    const dueToday = this.allDeadlines.filter((d) => !d.completed && d.daysRemaining === 0);
    const dueSoon = this.allDeadlines.filter((d) => !d.completed && d.daysRemaining > 0 && d.daysRemaining <= 7);
    const dueLater = this.allDeadlines.filter((d) => !d.completed && d.daysRemaining > 7);
    const completed = this.allDeadlines.filter((d) => d.completed);

    const groups = [
      { key: 'overdue', label: '🚨 Vencidas', items: overdue, cls: 'is-overdue-group' },
      { key: 'today', label: '⚠️ Vencen Hoy', items: dueToday, cls: 'is-today-group' },
      { key: 'soon', label: '📌 Próximos 7 Días', items: dueSoon, cls: 'is-soon-group' },
      { key: 'later', label: '🗓️ Más Adelante', items: dueLater, cls: 'is-later-group' },
      { key: 'completed', label: '✅ Entregadas & Completadas', items: completed, cls: 'is-completed-group' },
    ];

    if (this.allDeadlines.length === 0) {
      hubWrapper.createDiv({
        cls: 'study-flow-empty-tasks',
        text: 'No hay ninguna deadline registrada en el Inbox o notas diarias. Creá una usando el botón "+ Nueva Entrega" o agregando 📅 YYYY-MM-DD a tus tareas.',
      });
      return;
    }

    groups.forEach((grp) => {
      if (grp.items.length === 0) return;

      const groupSection = hubWrapper.createDiv({ cls: `study-flow-hub-group ${grp.cls}` });
      const grpHeader = groupSection.createDiv({ cls: 'study-flow-hub-group-header' });
      grpHeader.createSpan({ text: `${grp.label} (${grp.items.length})`, cls: 'study-flow-hub-group-title' });

      const listEl = groupSection.createDiv({ cls: 'study-flow-deadlines-hub-list' });
      grp.items.forEach((item) => {
        const itemCard = listEl.createDiv({
          cls: `study-flow-deadline-hub-card ${item.completed ? 'is-completed' : ''}`,
        });

        const cb = itemCard.createEl('input', {
          type: 'checkbox',
          cls: 'study-flow-task-cb',
        });
        cb.checked = item.completed;
        cb.addEventListener('change', async () => {
          await toggleTaskCompletionInFile(this.app, item, cb.checked);
          await this.renderCalendarTab(tabContainer);
        });

        const textSpan = itemCard.createSpan({
          text: item.cleanTitle,
          cls: `study-flow-deadline-item-title ${item.completed ? 'is-strikethrough' : ''}`,
        });
        textSpan.addEventListener('click', () => {
          cb.checked = !cb.checked;
          cb.dispatchEvent(new Event('change'));
        });

        const dText = formatDeadlineHuman(item.daysRemaining, item.dueDate);
        let badgeCls = 'study-flow-deadline-badge';
        if (item.daysRemaining < 0) badgeCls += ' is-overdue';
        else if (item.daysRemaining === 0) badgeCls += ' is-today';
        else if (item.daysRemaining <= 3) badgeCls += ' is-soon';
        itemCard.createSpan({ text: dText, cls: badgeCls });

        if (item.dueTime) {
          itemCard.createSpan({ text: `⏰ ${item.dueTime}`, cls: 'study-flow-time-chip' });
        }

        // Source note chip
        const srcFile = this.app.vault.getAbstractFileByPath(item.sourceFile);
        const srcName = srcFile instanceof TFile ? srcFile.basename : item.sourceFile;
        const srcChip = itemCard.createSpan({ text: `#${srcName}`, cls: 'study-flow-source-chip' });
        srcChip.addEventListener('click', () => {
          if (srcFile instanceof TFile) {
            this.app.workspace.getLeaf(false).openFile(srcFile);
          }
        });

        // Quick Focus
        const pomoBtn = itemCard.createEl('button', {
          cls: 'study-flow-icon-action-btn',
          attr: { 'aria-label': 'Enfocar con Pomodoro' },
        });
        setIcon(pomoBtn, 'timer');
        pomoBtn.addEventListener('click', async () => {
          this.plugin.pomodoro.setActiveTask({
            id: item.id,
            text: item.text,
            sourceFile: item.sourceFile,
          });
          this.activeTab = 'pomodoro';
          await this.renderView();
        });

        // Delete
        const delBtn = itemCard.createEl('button', {
          cls: 'study-flow-icon-action-btn',
          attr: { 'aria-label': 'Eliminar entrega' },
        });
        setIcon(delBtn, 'trash-2');
        delBtn.addEventListener('click', async () => {
          await deleteTaskFromFile(this.app, item);
          new Notice('Entrega eliminada');
          await this.renderCalendarTab(tabContainer);
        });
      });
    });
  }

  // ===================== PLANNER TAB =====================
  private async renderPlannerTab(container: HTMLElement): Promise<void> {
    container.empty();
    await this.reloadPlannerTasks();

    const card = container.createDiv({ cls: 'study-flow-card' });

    // Target selector chips
    const dateSelector = card.createDiv({ cls: 'study-flow-segmented-control' });
    const todayBtn = dateSelector.createEl('button', {
      cls: `study-flow-segmented-btn ${this.plannerDateOffset === 0 ? 'is-active' : ''}`,
    });
    const tIcon = todayBtn.createSpan();
    setIcon(tIcon, 'calendar');
    todayBtn.createSpan({ text: 'Nota de Hoy' });
    todayBtn.addEventListener('click', async () => {
      this.plannerDateOffset = 0;
      container.empty();
      await this.renderPlannerTab(container);
    });

    const tomorrowBtn = dateSelector.createEl('button', {
      cls: `study-flow-segmented-btn ${this.plannerDateOffset === 1 ? 'is-active' : ''}`,
    });
    const tmIcon = tomorrowBtn.createSpan();
    setIcon(tmIcon, 'calendar-plus');
    tomorrowBtn.createSpan({ text: 'Nota de Mañana' });
    tomorrowBtn.addEventListener('click', async () => {
      this.plannerDateOffset = 1;
      container.empty();
      await this.renderPlannerTab(container);
    });

    // Study Blocks Timeline section
    const blocksHeader = card.createDiv({ cls: 'study-flow-section-header' });
    const bTitle = blocksHeader.createEl('h4', { text: 'Bloques de Estudio' });
    const clockIcon = bTitle.createSpan({ cls: 'study-flow-section-icon' });
    setIcon(clockIcon, 'clock');

    const addBlockBtn = blocksHeader.createEl('button', { cls: 'study-flow-icon-action-btn-styled' });
    const plusIcon = addBlockBtn.createSpan();
    setIcon(plusIcon, 'plus');
    addBlockBtn.createSpan({ text: 'Bloque' });
    addBlockBtn.addEventListener('click', async () => {
      this.studyBlocks.push({
        id: String(Date.now()),
        startTime: '14:00',
        endTime: '15:30',
        title: 'Bloque Vespertino',
        linkedNote: '',
      });
      container.empty();
      await this.renderPlannerTab(container);
    });

    const blocksListEl = card.createDiv({ cls: 'study-flow-timeline-list' });
    this.studyBlocks.forEach((block, index) => {
      const row = blocksListEl.createDiv({ cls: 'study-flow-timeline-item' });

      const nodeDot = row.createDiv({ cls: 'study-flow-timeline-dot' });
      setIcon(nodeDot, 'calendar');

      const inputsWrap = row.createDiv({ cls: 'study-flow-timeline-content' });
      const timeWrap = inputsWrap.createDiv({ cls: 'study-flow-time-range-wrap' });

      const startInput = timeWrap.createEl('input', {
        type: 'text',
        value: block.startTime,
        cls: 'study-flow-time-input',
      });
      startInput.addEventListener('change', () => {
        block.startTime = startInput.value.trim();
        this.updatePlannerPreviewBox();
      });

      timeWrap.createSpan({ text: '—', cls: 'study-flow-time-sep' });

      const endInput = timeWrap.createEl('input', {
        type: 'text',
        value: block.endTime,
        cls: 'study-flow-time-input',
      });
      endInput.addEventListener('change', () => {
        block.endTime = endInput.value.trim();
        this.updatePlannerPreviewBox();
      });

      const titleInput = inputsWrap.createEl('input', {
        type: 'text',
        value: block.title,
        cls: 'study-flow-block-title-input',
        placeholder: 'Título o materia del bloque...',
      });
      titleInput.addEventListener('change', () => {
        block.title = titleInput.value.trim();
        this.updatePlannerPreviewBox();
      });

      const noteInput = inputsWrap.createEl('input', {
        type: 'text',
        value: block.linkedNote || '',
        cls: 'study-flow-block-note-input',
        placeholder: 'Material / [[Nota]]...',
      });
      noteInput.addEventListener('change', () => {
        block.linkedNote = noteInput.value.trim();
        this.updatePlannerPreviewBox();
      });

      if (block.linkedNote) {
        const openNoteBtn = inputsWrap.createEl('button', {
          cls: 'study-flow-icon-action-btn-styled study-flow-open-note-btn',
          attr: { 'aria-label': 'Abrir nota enlazada' },
        });
        const bookIcon = openNoteBtn.createSpan();
        setIcon(bookIcon, 'book-open');
        openNoteBtn.createSpan({ text: 'Abrir' });
        openNoteBtn.addEventListener('click', () => {
          const raw = block.linkedNote?.replace(/[\[\]]/g, '').trim();
          if (raw) {
            this.app.workspace.openLinkText(raw, '', false);
          }
        });
      }

      const removeBtn = row.createEl('button', {
        cls: 'study-flow-icon-action-btn',
        attr: { 'aria-label': 'Eliminar bloque' },
      });
      setIcon(removeBtn, 'trash-2');
      removeBtn.addEventListener('click', async () => {
        this.studyBlocks.splice(index, 1);
        container.empty();
        await this.renderPlannerTab(container);
      });
    });

    // Pending tasks selector
    card.createEl('div', {
      text: `Tareas prioritarias a incorporar (${this.pendingPlannerTasks.length}):`,
      cls: 'study-flow-preview-label',
      attr: { style: 'margin-top: 10px;' },
    });

    const taskListEl = card.createDiv({ cls: 'study-flow-task-list-cards', attr: { style: 'max-height: 160px;' } });
    if (this.pendingPlannerTasks.length === 0) {
      taskListEl.createDiv({ cls: 'study-flow-empty-tasks', text: 'No hay tareas pendientes en el Inbox.' });
    } else {
      this.pendingPlannerTasks.forEach((task) => {
        const itemCard = taskListEl.createDiv({ cls: 'study-flow-task-card' });
        const cbWrapper = itemCard.createDiv({ cls: 'study-flow-cb-wrapper' });
        const cb = cbWrapper.createEl('input', { type: 'checkbox' });
        cb.checked = this.selectedPlannerTaskIds.has(task.id);
        cb.addEventListener('change', () => {
          if (cb.checked) {
            this.selectedPlannerTaskIds.add(task.id);
          } else {
            this.selectedPlannerTaskIds.delete(task.id);
          }
          this.updatePlannerPreviewBox();
        });

        const label = itemCard.createEl('span', { text: task.text, cls: 'study-flow-task-text' });
        label.addEventListener('click', () => {
          cb.checked = !cb.checked;
          cb.dispatchEvent(new Event('change'));
        });

        if (task.priority === 'high') {
          itemCard.createSpan({ text: '⏫ Alta', cls: 'study-flow-priority-badge is-high' });
        } else if (task.priority === 'medium') {
          itemCard.createSpan({ text: '🔼 Media', cls: 'study-flow-priority-badge is-medium' });
        } else if (task.priority === 'low') {
          itemCard.createSpan({ text: '🔽 Baja', cls: 'study-flow-priority-badge is-low' });
        }
      });
    }

    // Template preview
    card.createEl('div', {
      text: 'Vista previa:',
      cls: 'study-flow-preview-label',
      attr: { style: 'margin-top: 10px;' },
    });
    const previewBox = card.createDiv({ cls: 'study-flow-preview-box' });
    previewBox.setText(this.buildPlannerTemplate());

    // Call to action button
    const actionsRow = card.createDiv({ cls: 'study-flow-modal-footer' });
    const applyBtn = actionsRow.createEl('button', {
      cls: 'mod-cta',
    });
    const appIcon = applyBtn.createSpan();
    setIcon(appIcon, 'file-input');
    applyBtn.createSpan({
      text: this.plannerDateOffset === 0 ? 'Aplicar a Nota de Hoy' : 'Generar Nota de Mañana',
    });
    applyBtn.addEventListener('click', async () => {
      await this.applyPlannerTemplate();
    });
  }

  private updatePlannerPreviewBox(): void {
    const box = this.containerEl.querySelector('.study-flow-preview-box');
    if (box) {
      box.setText(this.buildPlannerTemplate());
    }
  }

  private buildPlannerTemplate(): string {
    const blocksStr = this.studyBlocks
      .map((b) => {
        const noteSuffix = b.linkedNote?.trim()
          ? ` 📖 [[${b.linkedNote.replace(/[\[\]]/g, '').trim()}]]`
          : '';
        return `- [ ] ${b.startTime} - ${b.endTime} | ${b.title}${noteSuffix}`;
      })
      .join('\n');

    const selected = this.pendingPlannerTasks.filter((t) => this.selectedPlannerTaskIds.has(t.id));
    const tasksBlock =
      selected.length > 0
        ? selected.map((t) => `- [ ] ${t.text}`).join('\n')
        : '- [ ] (Sin tareas prioritarias seleccionadas)';

    return `## Bloques de Estudio
${blocksStr || '- [ ] 08:00 - 09:30 | \n- [ ] 10:00 - 11:30 | '}

## Tareas Prioritarias
${tasksBlock}`;
  }

  private async reloadPlannerTasks(): Promise<void> {
    this.pendingPlannerTasks = [];
    const inboxPath = this.plugin.settings.inboxFilePath || 'Inbox.md';
    const f = this.app.vault.getAbstractFileByPath(inboxPath);
    if (f instanceof TFile) {
      try {
        const content = await this.app.vault.read(f);
        this.pendingPlannerTasks.push(...extractPendingTasksFromContent(content, f.path));
      } catch (err) {
        console.error('Error reloading planner tasks:', err);
      }
    }
  }

  private async applyPlannerTemplate(): Promise<void> {
    try {
      const targetPath = getDailyNotePath(this.plugin.settings, this.plannerDateOffset);
      const template = `${this.buildPlannerTemplate()}\n`;

      const file = await getOrCreateFile(
        this.app,
        targetPath,
        `# ${targetPath.split('/').pop()?.replace('.md', '')}\n\n`
      );

      const existing = await this.app.vault.read(file);
      const finalContent = existing.trim().length === 0 ? template : `${existing.trimEnd()}\n\n${template}`;

      await this.app.vault.modify(file, finalContent);
      await this.app.workspace.getLeaf(false).openFile(file);
      new Notice(`Plan guardado en ${file.basename}`);
    } catch (err) {
      console.error('Error applying plan:', err);
      new Notice('Error al guardar el plan');
    }
  }

  // ===================== ANALYTICS TAB =====================
  private async renderAnalyticsTab(container: HTMLElement): Promise<void> {
    await renderAnalyticsDashboard(container, this.app, this.plugin, async () => {
      await this.renderView();
    });
  }
}
