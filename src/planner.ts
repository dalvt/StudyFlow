import { App, Modal, Notice, Setting, TFile } from 'obsidian';
import type StudyFlowPlugin from './main';
import {
  extractPendingTasksFromContent,
  getDailyNotePath,
  getOrCreateFile,
  PendingTaskItem,
} from './utils';

export class NextDayPlannerModal extends Modal {
  private plugin: StudyFlowPlugin;
  private pendingTasks: PendingTaskItem[] = [];
  private selectedTaskIds: Set<string> = new Set();
  private markMigratedInSource: boolean = false;

  constructor(app: App, plugin: StudyFlowPlugin) {
    super(app);
    this.plugin = plugin;
  }

  async onOpen(): Promise<void> {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.addClass('study-flow-modal');

    contentEl.createEl('h2', { text: 'Planificar el día siguiente' });
    contentEl.createEl('p', {
      text: 'Revisa las tareas pendientes de hoy y del Inbox para planificar tu jornada de mañana.',
      cls: 'study-flow-modal-desc',
    });

    const loadingEl = contentEl.createEl('div', { text: 'Buscando tareas pendientes...' });

    await this.loadTasks();
    loadingEl.remove();

    this.renderModalContent();
  }

  private async loadTasks(): Promise<void> {
    this.pendingTasks = [];
    this.selectedTaskIds.clear();

    // 1. Check Today's Daily Note
    const todayPath = getDailyNotePath(this.plugin.settings, 0);
    const todayFile = this.app.vault.getAbstractFileByPath(todayPath);
    if (todayFile instanceof TFile) {
      try {
        const content = await this.app.vault.read(todayFile);
        const tasks = extractPendingTasksFromContent(content, todayFile.path);
        this.pendingTasks.push(...tasks);
      } catch (err) {
        console.error('Error leyendo nota diaria de hoy:', err);
      }
    }

    // 2. Check Inbox.md
    const inboxPath = this.plugin.settings.inboxFilePath || 'Inbox.md';
    const inboxFile = this.app.vault.getAbstractFileByPath(inboxPath);
    if (inboxFile instanceof TFile && inboxFile.path !== todayPath) {
      try {
        const content = await this.app.vault.read(inboxFile);
        const tasks = extractPendingTasksFromContent(content, inboxFile.path);
        this.pendingTasks.push(...tasks);
      } catch (err) {
        console.error('Error leyendo Inbox:', err);
      }
    }
  }

  private renderModalContent(): void {
    const { contentEl } = this;

    const container = contentEl.createDiv({ cls: 'study-flow-planner-container' });

    // Section header with bulk toggle buttons
    const tasksHeader = container.createDiv({
      attr: { style: 'display: flex; justify-content: space-between; align-items: center;' },
    });
    tasksHeader.createEl('h3', {
      text: `Tareas pendientes encontradas (${this.pendingTasks.length})`,
      attr: { style: 'margin: 0;' },
    });

    if (this.pendingTasks.length > 0) {
      const bulkActions = tasksHeader.createDiv({ attr: { style: 'display: flex; gap: 8px;' } });
      const selectAllBtn = bulkActions.createEl('button', { text: 'Todas' });
      selectAllBtn.addEventListener('click', () => {
        this.pendingTasks.forEach((t) => this.selectedTaskIds.add(t.id));
        this.refreshTaskList();
      });

      const deselectAllBtn = bulkActions.createEl('button', { text: 'Ninguna' });
      deselectAllBtn.addEventListener('click', () => {
        this.selectedTaskIds.clear();
        this.refreshTaskList();
      });
    }

    // Task list container
    const taskListEl = container.createDiv({ cls: 'study-flow-task-list' });
    this.populateTaskList(taskListEl);

    // Options
    new Setting(container)
      .setName('Marcar como migradas en origen')
      .setDesc('Marca las tareas seleccionadas como [>] en el archivo original.')
      .addToggle((toggle) =>
        toggle.setValue(this.markMigratedInSource).onChange((val) => {
          this.markMigratedInSource = val;
        })
      );

    // Preview
    const previewSection = container.createDiv({ cls: 'study-flow-preview-section' });
    previewSection.createDiv({
      text: 'Vista previa de la plantilla para mañana:',
      cls: 'study-flow-preview-label',
    });
    const previewBox = previewSection.createDiv({ cls: 'study-flow-preview-box' });
    this.updatePreviewBox(previewBox);

    // Button row
    const btnRow = contentEl.createDiv({ cls: 'study-flow-button-row' });
    const cancelBtn = btnRow.createEl('button', { text: 'Cancelar' });
    cancelBtn.addEventListener('click', () => this.close());

    const submitBtn = btnRow.createEl('button', {
      text: 'Generar Plan de Mañana',
      cls: 'mod-cta',
    });
    submitBtn.addEventListener('click', async () => {
      await this.generateTomorrowPlan();
    });
  }

  private refreshTaskList(): void {
    const listEl = this.contentEl.querySelector('.study-flow-task-list') as HTMLElement | null;
    if (listEl) {
      listEl.empty();
      this.populateTaskList(listEl);
    }
    const previewBox = this.contentEl.querySelector('.study-flow-preview-box') as HTMLElement | null;
    if (previewBox) {
      this.updatePreviewBox(previewBox);
    }
  }

  private populateTaskList(container: HTMLElement): void {
    if (this.pendingTasks.length === 0) {
      container.createDiv({
        cls: 'study-flow-empty-tasks',
        text: 'No hay tareas pendientes en la nota diaria ni en el Inbox.',
      });
      return;
    }

    this.pendingTasks.forEach((task) => {
      const itemEl = container.createDiv({ cls: 'study-flow-task-item' });
      const checkbox = itemEl.createEl('input', { type: 'checkbox' });
      checkbox.checked = this.selectedTaskIds.has(task.id);

      checkbox.addEventListener('change', () => {
        if (checkbox.checked) {
          this.selectedTaskIds.add(task.id);
        } else {
          this.selectedTaskIds.delete(task.id);
        }
        const previewBox = this.contentEl.querySelector(
          '.study-flow-preview-box'
        ) as HTMLElement | null;
        if (previewBox) {
          this.updatePreviewBox(previewBox);
        }
      });

      const label = itemEl.createEl('label', { text: task.text });
      label.addEventListener('click', () => {
        checkbox.checked = !checkbox.checked;
        checkbox.dispatchEvent(new Event('change'));
      });

      const sourceBadge = itemEl.createEl('span', {
        text: task.sourceFile.endsWith('.md')
          ? task.sourceFile.substring(0, task.sourceFile.length - 3)
          : task.sourceFile,
        attr: {
          style:
            'font-size: var(--font-ui-smaller); color: var(--text-faint); margin-left: auto; padding-left: 8px;',
        },
      });
    });
  }

  private updatePreviewBox(previewBox: HTMLElement): void {
    const selected = this.pendingTasks.filter((t) => this.selectedTaskIds.has(t.id));
    const tasksBlock =
      selected.length > 0
        ? selected.map((t) => `- [ ] ${t.text}`).join('\n')
        : '- [ ] (Sin tareas prioritarias seleccionadas)';

    const preview = `## Bloques de Estudio
- [ ] 08:00 - 09:30 | 
- [ ] 10:00 - 11:30 | 

## Tareas Prioritarias
${tasksBlock}`;

    previewBox.setText(preview);
  }

  private async generateTomorrowPlan(): Promise<void> {
    try {
      const tomorrowPath = getDailyNotePath(this.plugin.settings, 1);
      const selected = this.pendingTasks.filter((t) => this.selectedTaskIds.has(t.id));

      const tasksBlock =
        selected.length > 0
          ? selected.map((t) => `- [ ] ${t.text}`).join('\n')
          : '- [ ] ';

      const plannerTemplate = `## Bloques de Estudio
- [ ] 08:00 - 09:30 | 
- [ ] 10:00 - 11:30 | 

## Tareas Prioritarias
${tasksBlock}
`;

      const tomorrowFile = await getOrCreateFile(
        this.app,
        tomorrowPath,
        `# ${tomorrowPath.split('/').pop()?.replace('.md', '')}\n\n`
      );

      const existingContent = await this.app.vault.read(tomorrowFile);

      let finalContent: string;
      if (existingContent.trim().length === 0) {
        finalContent = plannerTemplate;
      } else {
        // Append cleanly to existing file
        finalContent = `${existingContent.trimEnd()}\n\n${plannerTemplate}`;
      }

      await this.app.vault.modify(tomorrowFile, finalContent);

      // If requested, mark selected tasks as migrated in origin files
      if (this.markMigratedInSource && selected.length > 0) {
        await this.markTasksAsMigrated(selected);
      }

      // Open tomorrow's note in active leaf
      await this.app.workspace.getLeaf(false).openFile(tomorrowFile);

      new Notice(`Plan generado en ${tomorrowFile.basename}`);
      this.close();
    } catch (err) {
      console.error('Study Flow Assistant: Error generando plan de mañana', err);
      new Notice('Error al generar la nota para mañana');
    }
  }

  private async markTasksAsMigrated(selected: PendingTaskItem[]): Promise<void> {
    const tasksByFile = new Map<string, PendingTaskItem[]>();
    for (const task of selected) {
      const fileTasks = tasksByFile.get(task.sourceFile) || [];
      fileTasks.push(task);
      tasksByFile.set(task.sourceFile, fileTasks);
    }

    for (const [filePath, tasks] of tasksByFile.entries()) {
      const file = this.app.vault.getAbstractFileByPath(filePath);
      if (file instanceof TFile) {
        let content = await this.app.vault.read(file);
        for (const task of tasks) {
          // Replace '- [ ] task' with '- [>] task'
          const escapedText = task.text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
          const regex = new RegExp(`^(\\s*)-\\s+\\[\\s\\]\\s+${escapedText}`, 'm');
          content = content.replace(regex, `$1- [>] ${task.text}`);
        }
        await this.app.vault.modify(file, content);
      }
    }
  }

  onClose(): void {
    const { contentEl } = this;
    contentEl.empty();
  }
}
