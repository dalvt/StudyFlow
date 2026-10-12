import { ItemView, Notice, setIcon, WorkspaceLeaf, TFile } from 'obsidian';
import type StudyFlowPlugin from './main';
import {
  addHabitToFile,
  deleteHabitFromFile,
  HabitItem,
  loadHabitsFromFile,
  toggleHabitStatus,
} from './habits';
import {
  deleteTaskFromFile,
  extractAllTasksFromContent,
  TaskRecord,
  toggleTaskCompletionInFile,
} from './tasks';
import {
  appendTaskToMarkdownSection,
  extractPendingTasksFromContent,
  getDailyNotePath,
  getOrCreateFile,
  PendingTaskItem,
} from './utils';

export const VIEW_TYPE_STUDY_FLOW = 'study-flow-view';

type ActiveTab = 'pomodoro' | 'tasks' | 'habits' | 'planner';

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
  private taskFilter: 'pending' | 'completed' | 'all' = 'pending';

  // Habits state
  private habits: HabitItem[] = [];

  // Planner state
  private pendingPlannerTasks: PendingTaskItem[] = [];
  private selectedPlannerTaskIds: Set<string> = new Set();
  private plannerDateOffset: number = 0; // 0 for today, 1 for tomorrow
  private studyBlocks: Array<{ id: string; startTime: string; endTime: string; title: string }> = [
    { id: '1', startTime: '08:00', endTime: '09:30', title: 'Bloque Matutino' },
    { id: '2', startTime: '10:00', endTime: '11:30', title: 'Bloque Práctico' },
  ];

  constructor(leaf: WorkspaceLeaf, plugin: StudyFlowPlugin) {
    super(leaf);
    this.plugin = plugin;
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

    // Navigation Tab Bar with 4 tabs
    const navBar = rootWrapper.createDiv({ cls: 'study-flow-segmented-nav' });

    const tabs: Array<{ id: ActiveTab; label: string; icon: string }> = [
      { id: 'pomodoro', label: 'Pomodoro', icon: 'timer' },
      { id: 'tasks', label: 'Tareas', icon: 'check-square' },
      { id: 'habits', label: 'Hábitos', icon: 'flame' },
      { id: 'planner', label: 'Plan', icon: 'calendar-days' },
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
    } else if (this.activeTab === 'planner') {
      await this.renderPlannerTab(contentBody);
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
      this.pendingInboxTasks = extractPendingTasksFromContent(content, file.path);
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
  }

  // ===================== TASKS TAB =====================
  private async renderTasksTab(container: HTMLElement): Promise<void> {
    container.empty();
    await this.reloadTasks();

    const card = container.createDiv({ cls: 'study-flow-card' });

    // Stats bar
    const pendingCount = this.tasks.filter((t) => !t.completed).length;
    const completedCount = this.tasks.filter((t) => t.completed).length;
    const statsBar = card.createDiv({ cls: 'study-flow-stats-bar' });
    statsBar.createSpan({ text: `${pendingCount} pendientes`, cls: 'study-flow-badge-stat is-pending' });
    statsBar.createSpan({ text: `${completedCount} completadas`, cls: 'study-flow-badge-stat is-completed' });

    // Quick Add Bar
    const addBar = card.createDiv({ cls: 'study-flow-search-bar' });
    const addInput = addBar.createEl('input', {
      type: 'text',
      placeholder: 'Escribe una tarea...',
      cls: 'study-flow-task-input',
    });
    const addBtn = addBar.createEl('button', { cls: 'mod-cta' });
    const aIcon = addBtn.createSpan();
    setIcon(aIcon, 'plus');
    addBtn.createSpan({ text: 'Añadir' });

    const handleAdd = async () => {
      const val = addInput.value.trim();
      if (!val) return;
      const inboxPath = this.plugin.settings.inboxFilePath || 'Inbox.md';
      const file = await getOrCreateFile(this.app, inboxPath, '# Inbox\n\n## Tareas\n\n');
      const content = await this.app.vault.read(file);
      const updated = appendTaskToMarkdownSection(content, val, '## Tareas');
      await this.app.vault.modify(file, updated);
      addInput.value = '';
      new Notice('Tarea añadida al Inbox');
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
    const filters: Array<{ id: 'pending' | 'completed' | 'all'; label: string; count: number }> = [
      { id: 'pending', label: 'Pendientes', count: pendingCount },
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
      if (this.taskFilter === 'pending') return !t.completed;
      if (this.taskFilter === 'completed') return t.completed;
      return true;
    });

    if (displayed.length === 0) {
      const emptyState = listContainer.createDiv({ cls: 'study-flow-empty-state' });
      const emptyIcon = emptyState.createDiv({ cls: 'study-flow-empty-icon' });
      setIcon(emptyIcon, 'check-circle-2');
      emptyState.createEl('h4', {
        text: this.taskFilter === 'pending' ? '¡Todo al día!' : 'No hay tareas',
      });
      emptyState.createEl('p', {
        text: this.taskFilter === 'pending'
          ? 'No tienes tareas pendientes en tu Inbox.'
          : 'Añade una nueva tarea arriba.',
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
          new Notice(cb.checked ? '✓ Tarea completada' : 'Tarea desmarcada');
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

        itemCard.createSpan({
          text: '#Inbox',
          cls: 'study-flow-source-chip',
        });

        const delBtn = itemCard.createEl('button', {
          cls: 'study-flow-icon-action-btn',
          attr: { 'aria-label': 'Eliminar tarea' },
        });
        setIcon(delBtn, 'trash-2');
        delBtn.addEventListener('click', async (e) => {
          e.stopPropagation();
          await deleteTaskFromFile(this.app, task);
          new Notice('Tarea eliminada');
          container.empty();
          await this.renderTasksTab(container);
        });
      });
    }
  }

  private async reloadTasks(): Promise<void> {
    this.tasks = [];
    const files = [this.plugin.settings.inboxFilePath || 'Inbox.md'];
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
      });
      titleInput.addEventListener('change', () => {
        block.title = titleInput.value.trim();
        this.updatePlannerPreviewBox();
      });

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
      .map((b) => `- [ ] ${b.startTime} - ${b.endTime} | ${b.title}`)
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
}
