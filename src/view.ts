import { ItemView, Notice, WorkspaceLeaf, TFile } from 'obsidian';
import type StudyFlowPlugin from './main';
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

type ActiveTab = 'pomodoro' | 'tasks' | 'planner';

export class StudyFlowView extends ItemView {
  private plugin: StudyFlowPlugin;
  private activeTab: ActiveTab = 'pomodoro';
  private unsubscribePomodoro: (() => void) | null = null;

  // Tasks state
  private tasks: TaskRecord[] = [];
  private taskFilter: 'pending' | 'completed' | 'all' = 'pending';

  // Planner state
  private pendingPlannerTasks: PendingTaskItem[] = [];
  private selectedPlannerTaskIds: Set<string> = new Set();
  private plannerDateOffset: number = 0; // 0 for today, 1 for tomorrow

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

    // Subscribe to pomodoro updates
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

    // 1. Navigation Tab Bar
    const navBar = containerEl.createDiv({ cls: 'study-flow-nav-tabs' });

    const tabs: Array<{ id: ActiveTab; label: string; icon: string }> = [
      { id: 'pomodoro', label: 'Pomodoro', icon: '🍅' },
      { id: 'tasks', label: 'Tareas', icon: '📋' },
      { id: 'planner', label: 'Planificador', icon: '📅' },
    ];

    tabs.forEach((tab) => {
      const btn = navBar.createEl('button', {
        cls: `study-flow-nav-btn ${this.activeTab === tab.id ? 'is-active' : ''}`,
        text: `${tab.icon} ${tab.label}`,
      });
      btn.addEventListener('click', async () => {
        this.activeTab = tab.id;
        await this.renderView();
      });
    });

    // 2. Tab Content Container
    const contentBody = containerEl.createDiv({ cls: 'study-flow-tab-body' });

    if (this.activeTab === 'pomodoro') {
      this.renderPomodoroTab(contentBody);
    } else if (this.activeTab === 'tasks') {
      await this.renderTasksTab(contentBody);
    } else if (this.activeTab === 'planner') {
      await this.renderPlannerTab(contentBody);
    }
  }

  // ===================== POMODORO TAB =====================
  private renderPomodoroTab(container: HTMLElement): void {
    const status = this.plugin.pomodoro.getStatus();

    const card = container.createDiv({ cls: 'study-flow-card' });

    // Header Pill
    const pill = card.createDiv({
      text: status.mode === 'work' ? '🍅 Sesión de Trabajo' : '☕ Descanso',
      cls: `study-flow-mode-pill ${status.mode === 'work' ? 'is-work' : 'is-break'}`,
    });

    // Big Clock
    card.createEl('div', {
      text: this.plugin.pomodoro.formatTime(status.remainingSeconds),
      cls: 'study-flow-big-clock',
    });

    // Progress Bar
    const track = card.createDiv({ cls: 'study-flow-progress-track' });
    const percent = Math.min(
      100,
      Math.max(0, ((status.totalDurationSeconds - status.remainingSeconds) / status.totalDurationSeconds) * 100)
    );
    track.createDiv({
      cls: 'study-flow-progress-fill',
      attr: { style: `width: ${percent}%;` },
    });

    // Stats
    card.createDiv({
      text: `Sesiones hoy: ${status.completedSessionsToday}`,
      cls: 'study-flow-session-counter',
    });

    // Main Controls
    const controls = card.createDiv({ cls: 'study-flow-pomodoro-controls' });
    const isRunning = status.state === 'running';

    const playBtn = controls.createEl('button', {
      text: isRunning ? '⏸ Pausar' : '▶ Iniciar',
      cls: isRunning ? 'mod-warning' : 'mod-cta',
    });
    playBtn.addEventListener('click', () => {
      this.plugin.pomodoro.toggleStartPause();
    });

    const resetBtn = controls.createEl('button', { text: '↺ Reiniciar' });
    resetBtn.addEventListener('click', () => {
      this.plugin.pomodoro.reset();
    });

    const skipBtn = controls.createEl('button', { text: '⏭ Saltar' });
    skipBtn.addEventListener('click', () => {
      this.plugin.pomodoro.skipCycle();
    });

    // Quick Time Modifiers
    const quickRow = card.createDiv({ cls: 'study-flow-adjust-row' });
    const add5Btn = quickRow.createEl('button', { text: '+5m' });
    add5Btn.addEventListener('click', () => this.plugin.pomodoro.addMinutes(5));

    const switchBtn = quickRow.createEl('button', {
      text: status.mode === 'work' ? 'Modo Descanso' : 'Modo Trabajo',
    });
    switchBtn.addEventListener('click', () => this.plugin.pomodoro.switchMode());
  }

  private updatePomodoroClock(): void {
    const status = this.plugin.pomodoro.getStatus();

    const clockEl = this.containerEl.querySelector('.study-flow-big-clock');
    if (clockEl) {
      clockEl.setText(this.plugin.pomodoro.formatTime(status.remainingSeconds));
    }

    const pillEl = this.containerEl.querySelector('.study-flow-mode-pill');
    if (pillEl) {
      pillEl.setText(status.mode === 'work' ? '🍅 Sesión de Trabajo' : '☕ Descanso');
      pillEl.className = `study-flow-mode-pill ${status.mode === 'work' ? 'is-work' : 'is-break'}`;
    }

    const fillEl = this.containerEl.querySelector('.study-flow-progress-fill') as HTMLElement | null;
    if (fillEl) {
      const percent = Math.min(
        100,
        Math.max(0, ((status.totalDurationSeconds - status.remainingSeconds) / status.totalDurationSeconds) * 100)
      );
      fillEl.style.width = `${percent}%`;
    }

    const counterEl = this.containerEl.querySelector('.study-flow-session-counter');
    if (counterEl) {
      counterEl.setText(`Sesiones hoy: ${status.completedSessionsToday}`);
    }

    const playBtn = this.containerEl.querySelector('.study-flow-pomodoro-controls button:first-child');
    if (playBtn) {
      const isRunning = status.state === 'running';
      playBtn.setText(isRunning ? '⏸ Pausar' : '▶ Iniciar');
      playBtn.className = isRunning ? 'mod-warning' : 'mod-cta';
    }
  }

  // ===================== TASKS TAB =====================
  private async renderTasksTab(container: HTMLElement): Promise<void> {
    await this.reloadTasks();

    const card = container.createDiv({ cls: 'study-flow-card' });
    card.createEl('h3', { text: 'Gestor de Tareas & Inbox', attr: { style: 'margin-top: 0;' } });

    // Quick Add Bar
    const addBar = card.createDiv({ cls: 'study-flow-add-task-bar' });
    const addInput = addBar.createEl('input', {
      type: 'text',
      placeholder: 'Escribe una tarea y presiona Enter...',
      cls: 'study-flow-task-input',
    });
    const addBtn = addBar.createEl('button', { text: '+ Añadir', cls: 'mod-cta' });

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

    // Filters Bar
    const filterRow = card.createDiv({ cls: 'study-flow-filter-row' });
    const filters: Array<{ id: 'pending' | 'completed' | 'all'; label: string }> = [
      { id: 'pending', label: `Pendientes (${this.tasks.filter((t) => !t.completed).length})` },
      { id: 'completed', label: `Completadas (${this.tasks.filter((t) => t.completed).length})` },
      { id: 'all', label: `Todas (${this.tasks.length})` },
    ];

    filters.forEach((f) => {
      const btn = filterRow.createEl('button', {
        text: f.label,
        cls: this.taskFilter === f.id ? 'mod-cta' : '',
      });
      btn.addEventListener('click', async () => {
        this.taskFilter = f.id;
        container.empty();
        await this.renderTasksTab(container);
      });
    });

    // Tasks List
    const listContainer = card.createDiv({ cls: 'study-flow-task-list-full' });
    const displayed = this.tasks.filter((t) => {
      if (this.taskFilter === 'pending') return !t.completed;
      if (this.taskFilter === 'completed') return t.completed;
      return true;
    });

    if (displayed.length === 0) {
      listContainer.createDiv({
        cls: 'study-flow-empty-tasks',
        text: 'No hay tareas en esta categoría.',
      });
    } else {
      displayed.forEach((task) => {
        const row = listContainer.createDiv({ cls: 'study-flow-task-row-interactive' });
        const cb = row.createEl('input', { type: 'checkbox' });
        cb.checked = task.completed;

        cb.addEventListener('change', async () => {
          await toggleTaskCompletionInFile(this.app, task, cb.checked);
          task.completed = cb.checked;
          new Notice(cb.checked ? 'Tarea completada' : 'Tarea pendiente');
          container.empty();
          await this.renderTasksTab(container);
        });

        row.createEl('span', {
          text: task.text,
          cls: task.completed ? 'is-completed' : '',
        });

        const delBtn = row.createEl('button', {
          text: '✕',
          cls: 'study-flow-delete-btn',
          attr: { 'aria-label': 'Eliminar tarea' },
        });
        delBtn.addEventListener('click', async () => {
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
    await this.reloadPlannerTasks();

    const card = container.createDiv({ cls: 'study-flow-card' });
    card.createEl('h3', { text: 'Planificador Diario', attr: { style: 'margin-top: 0;' } });

    // Target selector: Hoy o Mañana
    const dateSelector = card.createDiv({ cls: 'study-flow-filter-row' });
    const todayBtn = dateSelector.createEl('button', {
      text: 'Nota de Hoy',
      cls: this.plannerDateOffset === 0 ? 'mod-cta' : '',
    });
    todayBtn.addEventListener('click', async () => {
      this.plannerDateOffset = 0;
      container.empty();
      await this.renderPlannerTab(container);
    });

    const tomorrowBtn = dateSelector.createEl('button', {
      text: 'Nota de Mañana',
      cls: this.plannerDateOffset === 1 ? 'mod-cta' : '',
    });
    tomorrowBtn.addEventListener('click', async () => {
      this.plannerDateOffset = 1;
      container.empty();
      await this.renderPlannerTab(container);
    });

    // Pending tasks selection
    card.createEl('div', {
      text: `Tareas pendientes disponibles (${this.pendingPlannerTasks.length}):`,
      cls: 'study-flow-preview-label',
      attr: { style: 'margin-top: 10px;' },
    });

    const taskListEl = card.createDiv({ cls: 'study-flow-task-list', attr: { style: 'max-height: 180px;' } });
    if (this.pendingPlannerTasks.length === 0) {
      taskListEl.createDiv({ cls: 'study-flow-empty-tasks', text: 'No hay tareas pendientes en el Inbox.' });
    } else {
      this.pendingPlannerTasks.forEach((task) => {
        const row = taskListEl.createDiv({ cls: 'study-flow-task-item' });
        const cb = row.createEl('input', { type: 'checkbox' });
        cb.checked = this.selectedPlannerTaskIds.has(task.id);
        cb.addEventListener('change', () => {
          if (cb.checked) {
            this.selectedPlannerTaskIds.add(task.id);
          } else {
            this.selectedPlannerTaskIds.delete(task.id);
          }
          this.updatePlannerPreviewBox();
        });

        const label = row.createEl('label', { text: task.text });
        label.addEventListener('click', () => {
          cb.checked = !cb.checked;
          cb.dispatchEvent(new Event('change'));
        });
      });
    }

    // Template preview
    const previewLabel = card.createDiv({
      text: 'Vista previa a insertar:',
      cls: 'study-flow-preview-label',
      attr: { style: 'margin-top: 12px;' },
    });
    const previewBox = card.createDiv({ cls: 'study-flow-preview-box' });
    previewBox.setText(this.buildPlannerTemplate());

    // Generate / Apply button
    const actionsRow = card.createDiv({ cls: 'study-flow-button-row' });
    const applyBtn = actionsRow.createEl('button', {
      text: this.plannerDateOffset === 0 ? 'Aplicar a Nota de Hoy' : 'Generar Nota de Mañana',
      cls: 'mod-cta',
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
    const selected = this.pendingPlannerTasks.filter((t) => this.selectedPlannerTaskIds.has(t.id));
    const tasksBlock =
      selected.length > 0
        ? selected.map((t) => `- [ ] ${t.text}`).join('\n')
        : '- [ ] (Sin tareas prioritarias seleccionadas)';

    return `## Bloques de Estudio
- [ ] 08:00 - 09:30 | 
- [ ] 10:00 - 11:30 | 

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
