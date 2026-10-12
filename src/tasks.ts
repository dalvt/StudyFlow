import { App, Modal, Notice, setIcon, Setting, TFile } from 'obsidian';
import type StudyFlowPlugin from './main';
import {
  appendTaskToMarkdownSection,
  formatTaskWithPomodoroEstimate,
  formatTaskWithPriority,
  getOrCreateFile,
  parseTaskPomodoroEstimate,
  parseTaskPriority,
  PendingTaskItem,
  TaskPriority,
} from './utils';

export interface TaskRecord extends PendingTaskItem {
  completed: boolean;
  statusChar: string;
  priority: TaskPriority;
  estimatedPomodoros?: number;
  completedPomodoros?: number;
}

export function compareTasksByPriority(a: TaskRecord, b: TaskRecord): number {
  const priorityWeight: Record<TaskPriority, number> = {
    high: 3,
    medium: 2,
    none: 1,
    low: 0,
  };
  if (a.completed !== b.completed) {
    return a.completed ? 1 : -1;
  }
  const diff = priorityWeight[b.priority] - priorityWeight[a.priority];
  if (diff !== 0) return diff;
  return a.text.localeCompare(b.text);
}

export function extractAllTasksFromContent(content: string, sourceFile: string): TaskRecord[] {
  const tasks: TaskRecord[] = [];
  const lines = content.split(/\r?\n/);
  let currentSection = '';

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const headerMatch = line.match(/^#{1,6}\s+(.*)$/);
    if (headerMatch) {
      currentSection = headerMatch[1].trim().toLowerCase();
    }

    const match = line.match(/^\s*-\s+\[(.)\]\s+(.*)$/);
    if (match) {
      const statusChar = match[1];
      const taskText = match[2].trim();
      const completed = statusChar.toLowerCase() === 'x';
      const { priority } = parseTaskPriority(taskText);
      const { estimated, completed: pomodoroCompleted } = parseTaskPomodoroEstimate(taskText);
      const isIdea = currentSection.includes('idea') || /#ideas?\b/i.test(taskText) || taskText.startsWith('💡');
      tasks.push({
        id: `${sourceFile}#L${i + 1}:${taskText}`,
        originalLine: line,
        text: taskText,
        sourceFile,
        completed,
        statusChar,
        priority,
        isIdea,
        estimatedPomodoros: estimated,
        completedPomodoros: pomodoroCompleted,
      });
    }
  }

  return tasks.sort(compareTasksByPriority);
}

export async function incrementTaskPomodoroInFile(
  app: App,
  task: { sourceFile: string; text: string }
): Promise<{ updatedText: string } | null> {
  const file = app.vault.getAbstractFileByPath(task.sourceFile);
  if (!(file instanceof TFile)) return null;

  const content = await app.vault.read(file);
  const lines = content.split(/\r?\n/);

  let targetIndex = -1;
  let currentLine = '';

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const match = line.match(/^(\s*-\s+\[.\]\s+)(.*)$/);
    if (match && (match[2].trim() === task.text || line.includes(task.text))) {
      targetIndex = i;
      currentLine = line;
      break;
    }
  }

  if (targetIndex === -1) return null;

  const match = currentLine.match(/^(\s*-\s+\[.\]\s+)(.*)$/);
  if (!match) return null;

  const prefix = match[1];
  const oldText = match[2].trim();

  const { estimated, completed } = parseTaskPomodoroEstimate(oldText);
  const newCompleted = (completed || 0) + 1;
  const newText = formatTaskWithPomodoroEstimate(oldText, estimated, newCompleted);

  lines[targetIndex] = `${prefix}${newText}`;
  await app.vault.modify(file, lines.join('\n'));

  return { updatedText: newText };
}

export async function promoteIdeaToTaskInFile(app: App, task: TaskRecord): Promise<boolean> {
  const file = app.vault.getAbstractFileByPath(task.sourceFile);
  if (!(file instanceof TFile)) return false;

  const content = await app.vault.read(file);
  const lines = content.split(/\r?\n/);

  let foundIndex = -1;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const match = line.match(/^\s*-\s+\[.\]\s+(.*)$/);
    if (match && match[1].trim() === task.text) {
      foundIndex = i;
      break;
    }
  }

  if (foundIndex === -1) return false;
  lines.splice(foundIndex, 1);
  const withoutIdea = lines.join('\n');

  // Strip idea markers and keep clean task title with standard priority
  let cleanTitle = task.text.replace(/#ideas?\b/gi, '').replace(/^💡\s*/, '').trim();
  cleanTitle = formatTaskWithPriority(cleanTitle, task.priority !== 'none' ? task.priority : 'none');

  const updatedContent = appendTaskToMarkdownSection(withoutIdea, cleanTitle, '## Tareas');
  await app.vault.modify(file, updatedContent);
  return true;
}

export async function toggleTaskCompletionInFile(
  app: App,
  task: TaskRecord,
  newCompleted: boolean
): Promise<boolean> {
  const file = app.vault.getAbstractFileByPath(task.sourceFile);
  if (!(file instanceof TFile)) return false;

  const content = await app.vault.read(file);
  const lines = content.split(/\r?\n/);
  const targetChar = newCompleted ? 'x' : ' ';

  let found = false;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const match = line.match(/^(\s*-\s+\[)(.)(\]\s+)(.*)$/);
    if (match && match[4].trim() === task.text) {
      lines[i] = `${match[1]}${targetChar}${match[3]}${match[4]}`;
      found = true;
      break;
    }
  }

  if (found) {
    await app.vault.modify(file, lines.join('\n'));
    return true;
  }
  return false;
}

export async function deleteTaskFromFile(app: App, task: TaskRecord): Promise<boolean> {
  const file = app.vault.getAbstractFileByPath(task.sourceFile);
  if (!(file instanceof TFile)) return false;

  const content = await app.vault.read(file);
  const lines = content.split(/\r?\n/);

  let foundIndex = -1;
  for (let i = 0; i < lines.length; i++) {
    const match = lines[i].match(/^\s*-\s+\[.\]\s+(.*)$/);
    if (match && match[1].trim() === task.text) {
      foundIndex = i;
      break;
    }
  }

  if (foundIndex !== -1) {
    lines.splice(foundIndex, 1);
    await app.vault.modify(file, lines.join('\n'));
    return true;
  }
  return false;
}

export class QuickCaptureModal extends Modal {
  private plugin: StudyFlowPlugin;
  private taskText: string = '';
  private itemType: 'task' | 'idea' = 'task';
  private targetDestination: 'inbox' | 'activeNote' = 'inbox';
  private selectedPriority: TaskPriority = 'none';
  private selectedEstimate: number = 0;

  constructor(app: App, plugin: StudyFlowPlugin) {
    super(app);
    this.plugin = plugin;
  }

  onOpen(): void {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.addClass('study-flow-modal', 'study-flow-quick-capture');

    const header = contentEl.createDiv({ cls: 'study-flow-modal-header' });
    const title = header.createEl('h2', { text: 'Captura Rápida' });
    const iconSpan = title.createSpan({ cls: 'study-flow-header-icon' });
    setIcon(iconSpan, 'zap');

    const activeFile = this.app.workspace.getActiveFile();
    const canUseActiveFile = activeFile !== null && activeFile.extension === 'md';

    let prioritySetting: Setting | null = null;
    let estimateSetting: Setting | null = null;

    new Setting(contentEl)
      .setName('Tipo de entrada')
      .setDesc('Diferenciá entre trabajo ejecutable e ideas espontáneas')
      .addDropdown((drop) => {
        drop.addOption('task', '📋 Tarea accionable');
        drop.addOption('idea', '💡 Idea espontánea (Backlog)');
        drop.setValue('task');
        drop.onChange((val) => {
          this.itemType = val as 'task' | 'idea';
          if (prioritySetting) {
            prioritySetting.settingEl.style.display = this.itemType === 'idea' ? 'none' : '';
          }
          if (estimateSetting) {
            estimateSetting.settingEl.style.display = this.itemType === 'idea' ? 'none' : '';
          }
        });
      });

    new Setting(contentEl)
      .setName('Guardar en')
      .setDesc('Ubicación donde se registrará la entrada')
      .addDropdown((drop) => {
        drop.addOption('inbox', `Inbox (${this.plugin.settings.inboxFilePath})`);
        if (canUseActiveFile && activeFile) {
          drop.addOption('activeNote', `Nota activa (${activeFile.basename})`);
        }
        drop.setValue('inbox');
        drop.onChange((val) => {
          this.targetDestination = val as 'inbox' | 'activeNote';
        });
      });

    prioritySetting = new Setting(contentEl)
      .setName('Prioridad')
      .setDesc('Nivel de urgencia o impacto')
      .addDropdown((drop) => {
        drop.addOption('none', 'Normal / Sin prioridad');
        drop.addOption('high', '⏫ Alta (Urgente / Impacto)');
        drop.addOption('medium', '🔼 Media');
        drop.addOption('low', '🔽 Baja');
        drop.setValue('none');
        drop.onChange((val) => {
          this.selectedPriority = val as TaskPriority;
        });
      });

    estimateSetting = new Setting(contentEl)
      .setName('Estimación (Pomodoros)')
      .setDesc('Bloques de estudio previstos (ej. 🍅 2 = 50m)')
      .addDropdown((drop) => {
        drop.addOption('0', 'Sin estimar');
        drop.addOption('1', '🍅 1 pomodoro (~25m)');
        drop.addOption('2', '🍅 2 pomodoros (~50m)');
        drop.addOption('3', '🍅 3 pomodoros (~1h 15m)');
        drop.addOption('4', '🍅 4 pomodoros (~1h 40m)');
        drop.addOption('5', '🍅 5 pomodoros (~2h 05m)');
        drop.addOption('6', '🍅 6 pomodoros (~2h 30m)');
        drop.setValue(String(this.selectedEstimate));
        drop.onChange((val) => {
          this.selectedEstimate = parseInt(val, 10) || 0;
        });
      });

    const inputWrap = contentEl.createDiv({ cls: 'study-flow-input-wrap' });
    const inputEl = inputWrap.createEl('input', {
      type: 'text',
      cls: 'study-flow-task-input study-flow-input-lg',
      placeholder: '¿Qué necesitas registrar? (Presiona Enter para guardar)...',
    });

    inputEl.focus();

    inputEl.addEventListener('keydown', async (evt: KeyboardEvent) => {
      if (evt.key === 'Enter') {
        evt.preventDefault();
        this.taskText = inputEl.value.trim();
        await this.submitTask();
      }
    });

    const footer = contentEl.createDiv({ cls: 'study-flow-modal-footer' });
    footer.createEl('span', {
      text: '↵ Enter para confirmar • Esc para cancelar',
      cls: 'study-flow-shortcut-hint',
    });

    const cancelBtn = footer.createEl('button', { text: 'Cancelar' });
    cancelBtn.addEventListener('click', () => this.close());

    const submitBtn = footer.createEl('button', {
      cls: 'mod-cta',
    });
    const subIcon = submitBtn.createSpan();
    setIcon(subIcon, 'plus');
    submitBtn.createSpan({ text: 'Añadir' });
    submitBtn.addEventListener('click', async () => {
      this.taskText = inputEl.value.trim();
      await this.submitTask();
    });
  }

  onClose(): void {
    const { contentEl } = this;
    contentEl.empty();
  }

  private async submitTask(): Promise<void> {
    if (!this.taskText) {
      new Notice('Ingresa el texto para guardar');
      return;
    }

    try {
      let targetFile: TFile | null = null;
      let targetName = '';

      if (this.targetDestination === 'activeNote') {
        targetFile = this.app.workspace.getActiveFile();
        if (targetFile) {
          targetName = targetFile.basename;
        }
      }

      if (!targetFile) {
        const inboxPath = this.plugin.settings.inboxFilePath || 'StudyFlow/Inbox.md';
        targetFile = await getOrCreateFile(this.app, inboxPath, '# Inbox\n\n## Tareas\n\n## Ideas\n\n');
        targetName = targetFile.basename;
      }

      const content = await this.app.vault.read(targetFile);

      if (this.itemType === 'idea') {
        const ideaLine = this.taskText.startsWith('💡') ? this.taskText : `💡 ${this.taskText}`;
        const updated = appendTaskToMarkdownSection(content, ideaLine, '## Ideas');
        await this.app.vault.modify(targetFile, updated);
        new Notice(`💡 Idea guardada en ${targetName}`);
      } else {
        let finalText = this.selectedPriority !== 'none'
          ? formatTaskWithPriority(this.taskText, this.selectedPriority)
          : this.taskText;
        if (this.selectedEstimate > 0) {
          finalText = formatTaskWithPomodoroEstimate(finalText, this.selectedEstimate);
        }
        const updated = appendTaskToMarkdownSection(content, finalText, '## Tareas');
        await this.app.vault.modify(targetFile, updated);
        new Notice(`✓ Tarea agregada a ${targetName}`);
      }

      this.close();
    } catch (err) {
      new Notice('Error al guardar');
    }
  }
}

export class TasksManagerModal extends Modal {
  private plugin: StudyFlowPlugin;
  private tasks: TaskRecord[] = [];
  private filter: 'all' | 'pending' | 'ideas' | 'completed' = 'pending';
  private searchQuery: string = '';

  constructor(app: App, plugin: StudyFlowPlugin) {
    super(app);
    this.plugin = plugin;
  }

  async onOpen(): Promise<void> {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.addClass('study-flow-modal', 'study-flow-tasks-modal');

    await this.refreshTasks();
    this.renderUI();
  }

  private async refreshTasks(): Promise<void> {
    this.tasks = [];
    const filesToRead = [this.plugin.settings.inboxFilePath || 'StudyFlow/Inbox.md'];

    for (const filePath of filesToRead) {
      const file = this.app.vault.getAbstractFileByPath(filePath);
      if (file instanceof TFile) {
        try {
          const content = await this.app.vault.read(file);
          const found = extractAllTasksFromContent(content, file.path);
          this.tasks.push(...found);
        } catch (err) {
          console.error('Error cargando tareas:', filePath, err);
        }
      }
    }
  }

  private renderUI(): void {
    const { contentEl } = this;
    contentEl.empty();

    // Header
    const header = contentEl.createDiv({ cls: 'study-flow-modal-header' });
    const title = header.createEl('h2', { text: 'Gestor de Tareas & Inbox' });
    const iconSpan = title.createSpan({ cls: 'study-flow-header-icon' });
    setIcon(iconSpan, 'check-square');

    // Stats bar
    const pendingCount = this.tasks.filter((t) => !t.completed && !t.isIdea).length;
    const ideasCount = this.tasks.filter((t) => !t.completed && t.isIdea).length;
    const completedCount = this.tasks.filter((t) => t.completed).length;

    const statsBar = contentEl.createDiv({ cls: 'study-flow-stats-bar' });
    statsBar.createSpan({ text: `${pendingCount} pendientes`, cls: 'study-flow-badge-stat is-pending' });
    statsBar.createSpan({ text: `${ideasCount} ideas`, cls: 'study-flow-badge-stat is-idea' });
    statsBar.createSpan({ text: `${completedCount} completadas`, cls: 'study-flow-badge-stat is-completed' });

    // Quick Add Bar
    const addSection = contentEl.createDiv({ cls: 'study-flow-search-bar' });
    const addInput = addSection.createEl('input', {
      type: 'text',
      placeholder: 'Nueva entrada rápida... (Enter para añadir)',
      cls: 'study-flow-task-input',
    });

    let addType: 'task' | 'idea' = 'task';
    const typeSelect = addSection.createEl('select', { cls: 'study-flow-type-select' });
    typeSelect.createEl('option', { value: 'task', text: '📋 Tarea' });
    typeSelect.createEl('option', { value: 'idea', text: '💡 Idea' });

    let addPriority: TaskPriority = 'none';
    const prioritySelect = addSection.createEl('select', { cls: 'study-flow-priority-select' });
    prioritySelect.createEl('option', { value: 'none', text: 'Normal' });
    prioritySelect.createEl('option', { value: 'high', text: '⏫ Alta' });
    prioritySelect.createEl('option', { value: 'medium', text: '🔼 Media' });
    prioritySelect.createEl('option', { value: 'low', text: '🔽 Baja' });
    prioritySelect.addEventListener('change', () => {
      addPriority = prioritySelect.value as TaskPriority;
    });

    let addEstimate: number = 0;
    const estimateSelect = addSection.createEl('select', { cls: 'study-flow-estimate-select' });
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

    const addBtn = addSection.createEl('button', { cls: 'mod-cta' });
    const addIcon = addBtn.createSpan();
    setIcon(addIcon, 'plus');
    addBtn.createSpan({ text: 'Añadir' });

    const handleAdd = async () => {
      const text = addInput.value.trim();
      if (!text) return;

      const inboxPath = this.plugin.settings.inboxFilePath || 'StudyFlow/Inbox.md';
      const file = await getOrCreateFile(this.app, inboxPath, '# Inbox\n\n## Tareas\n\n## Ideas\n\n');
      const content = await this.app.vault.read(file);

      if (addType === 'idea') {
        const ideaLine = text.startsWith('💡') ? text : `💡 ${text}`;
        const updated = appendTaskToMarkdownSection(content, ideaLine, '## Ideas');
        await this.app.vault.modify(file, updated);
        new Notice('💡 Idea añadida a tu banco');
      } else {
        let finalText = addPriority !== 'none'
          ? formatTaskWithPriority(text, addPriority)
          : text;
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
      await this.refreshTasks();
      this.renderUI();
    };

    addBtn.addEventListener('click', handleAdd);
    addInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        handleAdd();
      }
    });

    // Filters and Search Bar
    const filterRow = contentEl.createDiv({ cls: 'study-flow-segmented-control' });
    const filters: Array<{ id: 'pending' | 'ideas' | 'completed' | 'all'; label: string; count: number }> = [
      { id: 'pending', label: 'Pendientes', count: pendingCount },
      { id: 'ideas', label: '💡 Ideas', count: ideasCount },
      { id: 'completed', label: 'Completadas', count: completedCount },
      { id: 'all', label: 'Todas', count: this.tasks.length },
    ];

    filters.forEach((f) => {
      const btn = filterRow.createEl('button', {
        cls: `study-flow-segmented-btn ${this.filter === f.id ? 'is-active' : ''}`,
      });
      btn.createSpan({ text: f.label });
      btn.createSpan({ text: String(f.count), cls: 'study-flow-count-pill' });
      btn.addEventListener('click', () => {
        this.filter = f.id;
        this.renderUI();
      });
    });

    // Tasks List Container
    const listContainer = contentEl.createDiv({ cls: 'study-flow-task-list-cards' });
    const displayedTasks = this.tasks.filter((t) => {
      if (this.filter === 'pending') return !t.completed && !t.isIdea;
      if (this.filter === 'ideas') return !t.completed && t.isIdea;
      if (this.filter === 'completed') return t.completed;
      return true;
    });

    if (displayedTasks.length === 0) {
      const emptyState = listContainer.createDiv({ cls: 'study-flow-empty-state' });
      const emptyIcon = emptyState.createDiv({ cls: 'study-flow-empty-icon' });
      setIcon(emptyIcon, this.filter === 'ideas' ? 'sparkles' : 'check-circle-2');
      emptyState.createEl('h4', {
        text: this.filter === 'ideas'
          ? 'No hay ideas espontáneas guardadas'
          : (this.filter === 'pending' ? '¡Todo al día!' : 'No hay tareas registradas'),
      });
      emptyState.createEl('p', {
        text: this.filter === 'ideas'
          ? 'Captura tus ideas aquí para no perderlas sin saturar tu lista de tareas activas.'
          : (this.filter === 'pending' ? 'No tienes tareas pendientes.' : 'Añade una tarea arriba para comenzar.'),
      });
    } else {
      displayedTasks.forEach((task) => {
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
          await this.refreshTasks();
          this.renderUI();
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
            await this.refreshTasks();
            this.renderUI();
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
              await this.refreshTasks();
              this.renderUI();
            }
          });
        }

        const fileBadge = itemCard.createSpan({
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
          await this.refreshTasks();
          this.renderUI();
        });
      });
    }

    // Modal Footer
    const footer = contentEl.createDiv({ cls: 'study-flow-modal-footer' });
    const closeBtn = footer.createEl('button', { text: 'Cerrar' });
    closeBtn.addEventListener('click', () => this.close());
  }

  onClose(): void {
    const { contentEl } = this;
    contentEl.empty();
  }
}
