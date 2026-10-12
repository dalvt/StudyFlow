import { App, Modal, Notice, Setting, TFile } from 'obsidian';
import type StudyFlowPlugin from './main';
import {
  appendTaskToMarkdownSection,
  getOrCreateFile,
  PendingTaskItem,
} from './utils';

export interface TaskRecord extends PendingTaskItem {
  completed: boolean;
  statusChar: string; // ' ' for pending, 'x' for completed, '>' for migrated, etc.
}

/**
 * Reads all markdown checkboxes from content (both [ ] and [x] etc.)
 */
export function extractAllTasksFromContent(content: string, sourceFile: string): TaskRecord[] {
  const tasks: TaskRecord[] = [];
  const lines = content.split(/\r?\n/);

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const match = line.match(/^\s*-\s+\[(.)\]\s+(.*)$/);
    if (match) {
      const statusChar = match[1];
      const taskText = match[2].trim();
      const completed = statusChar.toLowerCase() === 'x';
      tasks.push({
        id: `${sourceFile}#L${i + 1}:${taskText}`,
        originalLine: line,
        text: taskText,
        sourceFile,
        completed,
        statusChar,
      });
    }
  }

  return tasks;
}

/**
 * Toggles the completion status of a task in its markdown file.
 */
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

/**
 * Deletes a task line from its markdown file.
 */
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
  private targetDestination: 'inbox' | 'activeNote' = 'inbox';

  constructor(app: App, plugin: StudyFlowPlugin) {
    super(app);
    this.plugin = plugin;
  }

  onOpen(): void {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.addClass('study-flow-modal');

    contentEl.createEl('h2', { text: 'Capturar tarea rápida' });
    contentEl.createEl('p', {
      text: 'Ingresa una nueva tarea para registrarla con formato - [ ] en la sección ## Tareas.',
      cls: 'study-flow-modal-desc',
    });

    const activeFile = this.app.workspace.getActiveFile();
    const canUseActiveFile = activeFile !== null && activeFile.extension === 'md';

    new Setting(contentEl)
      .setName('Destino')
      .setDesc('Selecciona dónde registrar la tarea')
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

    const inputContainer = contentEl.createDiv();
    const inputEl = inputContainer.createEl('input', {
      type: 'text',
      cls: 'study-flow-task-input',
      placeholder: 'Escribe tu tarea y presiona Enter...',
    });

    inputEl.focus();

    inputEl.addEventListener('keydown', async (evt: KeyboardEvent) => {
      if (evt.key === 'Enter') {
        evt.preventDefault();
        this.taskText = inputEl.value.trim();
        await this.submitTask();
      }
    });

    const btnContainer = contentEl.createDiv({ cls: 'study-flow-button-row' });
    const cancelBtn = btnContainer.createEl('button', { text: 'Cancelar' });
    cancelBtn.addEventListener('click', () => this.close());

    const submitBtn = btnContainer.createEl('button', {
      text: 'Guardar Tarea',
      cls: 'mod-cta',
    });
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
      new Notice('Por favor ingresa el texto de la tarea');
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
        const inboxPath = this.plugin.settings.inboxFilePath || 'Inbox.md';
        targetFile = await getOrCreateFile(this.app, inboxPath, '# Inbox\n\n## Tareas\n\n');
        targetName = targetFile.basename;
      }

      const content = await this.app.vault.read(targetFile);
      const updated = appendTaskToMarkdownSection(content, this.taskText, '## Tareas');
      await this.app.vault.modify(targetFile, updated);

      new Notice(`Tarea agregada a ${targetName}`);
      this.close();
    } catch (err) {
      console.error('Study Flow Assistant: Error capturando tarea', err);
      new Notice('Error al guardar la tarea en el archivo');
    }
  }
}

/**
 * Dedicated visual interface modal for task management
 */
export class TasksManagerModal extends Modal {
  private plugin: StudyFlowPlugin;
  private tasks: TaskRecord[] = [];
  private filter: 'all' | 'pending' | 'completed' = 'pending';

  constructor(app: App, plugin: StudyFlowPlugin) {
    super(app);
    this.plugin = plugin;
  }

  async onOpen(): Promise<void> {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.addClass('study-flow-modal', 'study-flow-tasks-modal');

    contentEl.createEl('h2', { text: 'Gestor de Tareas & Inbox' });
    contentEl.createEl('p', {
      text: 'Visualiza, marca y gestiona las tareas de tu Inbox y notas en tiempo real.',
      cls: 'study-flow-modal-desc',
    });

    await this.refreshTasks();
    this.renderUI();
  }

  private async refreshTasks(): Promise<void> {
    this.tasks = [];
    const filesToRead = [this.plugin.settings.inboxFilePath || 'Inbox.md'];

    for (const filePath of filesToRead) {
      const file = this.app.vault.getAbstractFileByPath(filePath);
      if (file instanceof TFile) {
        try {
          const content = await this.app.vault.read(file);
          const found = extractAllTasksFromContent(content, file.path);
          this.tasks.push(...found);
        } catch (err) {
          console.error('Error cargando tareas de:', filePath, err);
        }
      }
    }
  }

  private renderUI(): void {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.createEl('h2', { text: 'Gestor de Tareas & Inbox' });

    // Quick Add Input
    const addSection = contentEl.createDiv({ cls: 'study-flow-add-task-bar' });
    const addInput = addSection.createEl('input', {
      type: 'text',
      placeholder: 'Nueva tarea rápida... (Presiona Enter para añadir)',
      cls: 'study-flow-task-input',
    });
    const addBtn = addSection.createEl('button', {
      text: 'Añadir',
      cls: 'mod-cta',
    });

    const handleAdd = async () => {
      const text = addInput.value.trim();
      if (!text) return;
      const inboxPath = this.plugin.settings.inboxFilePath || 'Inbox.md';
      const file = await getOrCreateFile(this.app, inboxPath, '# Inbox\n\n## Tareas\n\n');
      const content = await this.app.vault.read(file);
      const updated = appendTaskToMarkdownSection(content, text, '## Tareas');
      await this.app.vault.modify(file, updated);
      addInput.value = '';
      new Notice('Tarea añadida a Inbox');
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

    // Filters Bar
    const filterRow = contentEl.createDiv({ cls: 'study-flow-filter-row' });
    const filters: Array<{ id: 'pending' | 'completed' | 'all'; label: string }> = [
      { id: 'pending', label: `Pendientes (${this.tasks.filter((t) => !t.completed).length})` },
      { id: 'completed', label: `Completadas (${this.tasks.filter((t) => t.completed).length})` },
      { id: 'all', label: `Todas (${this.tasks.length})` },
    ];

    filters.forEach((f) => {
      const fBtn = filterRow.createEl('button', {
        text: f.label,
        cls: this.filter === f.id ? 'mod-cta' : '',
      });
      fBtn.addEventListener('click', () => {
        this.filter = f.id;
        this.renderUI();
      });
    });

    // Tasks List Container
    const listContainer = contentEl.createDiv({ cls: 'study-flow-task-list-full' });
    const displayedTasks = this.tasks.filter((t) => {
      if (this.filter === 'pending') return !t.completed;
      if (this.filter === 'completed') return t.completed;
      return true;
    });

    if (displayedTasks.length === 0) {
      listContainer.createDiv({
        cls: 'study-flow-empty-tasks',
        text: 'No hay tareas en esta vista.',
      });
    } else {
      displayedTasks.forEach((task) => {
        const itemRow = listContainer.createDiv({ cls: 'study-flow-task-row-interactive' });

        const cb = itemRow.createEl('input', { type: 'checkbox' });
        cb.checked = task.completed;
        cb.addEventListener('change', async () => {
          await toggleTaskCompletionInFile(this.app, task, cb.checked);
          task.completed = cb.checked;
          new Notice(cb.checked ? 'Tarea completada' : 'Tarea desmarcada');
          await this.refreshTasks();
          this.renderUI();
        });

        const label = itemRow.createEl('span', {
          text: task.text,
          cls: task.completed ? 'is-completed' : '',
        });

        const delBtn = itemRow.createEl('button', {
          text: '🗑',
          cls: 'study-flow-delete-btn',
          attr: { 'aria-label': 'Eliminar tarea' },
        });
        delBtn.addEventListener('click', async () => {
          await deleteTaskFromFile(this.app, task);
          new Notice('Tarea eliminada');
          await this.refreshTasks();
          this.renderUI();
        });
      });
    }

    // Close button
    const footer = contentEl.createDiv({ cls: 'study-flow-button-row' });
    const closeBtn = footer.createEl('button', { text: 'Cerrar' });
    closeBtn.addEventListener('click', () => this.close());
  }

  onClose(): void {
    const { contentEl } = this;
    contentEl.empty();
  }
}
