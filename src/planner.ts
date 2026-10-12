import { App, Modal, Notice, Setting, TFile } from 'obsidian';
import type StudyFlowPlugin from './main';
import {
  extractPendingTasksFromContent,
  getDailyNotePath,
  getOrCreateFile,
  PendingTaskItem,
} from './utils';

export interface StudyBlock {
  id: string;
  startTime: string;
  endTime: string;
  title: string;
}

export class NextDayPlannerModal extends Modal {
  private plugin: StudyFlowPlugin;
  private pendingTasks: PendingTaskItem[] = [];
  private selectedTaskIds: Set<string> = new Set();
  private markMigratedInSource: boolean = false;
  private studyBlocks: StudyBlock[] = [
    { id: '1', startTime: '08:00', endTime: '09:30', title: 'Bloque de Estudio 1' },
    { id: '2', startTime: '10:00', endTime: '11:30', title: 'Bloque de Estudio 2' },
  ];

  constructor(app: App, plugin: StudyFlowPlugin) {
    super(app);
    this.plugin = plugin;
  }

  async onOpen(): Promise<void> {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.addClass('study-flow-modal', 'study-flow-planner-modal');

    contentEl.createEl('h2', { text: 'Planificador del día siguiente' });
    contentEl.createEl('p', {
      text: 'Revisa tareas pendientes, organiza tus bloques de tiempo y prepara tu jornada.',
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
    contentEl.empty();

    contentEl.createEl('h2', { text: 'Planificador del día siguiente' });

    const container = contentEl.createDiv({ cls: 'study-flow-planner-container' });

    // Section 1: Study Blocks Editor
    const blocksSection = container.createDiv({ cls: 'study-flow-blocks-section' });
    const blocksHeader = blocksSection.createDiv({
      attr: { style: 'display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;' },
    });
    blocksHeader.createEl('h3', { text: 'Bloques de Estudio', attr: { style: 'margin: 0;' } });

    const addBlockBtn = blocksHeader.createEl('button', { text: '+ Añadir Bloque' });
    addBlockBtn.addEventListener('click', () => {
      this.studyBlocks.push({
        id: String(Date.now()),
        startTime: '14:00',
        endTime: '15:30',
        title: 'Nuevo Bloque',
      });
      this.renderModalContent();
    });

    const blocksListEl = blocksSection.createDiv({ cls: 'study-flow-blocks-list' });
    this.studyBlocks.forEach((block, index) => {
      const row = blocksListEl.createDiv({ cls: 'study-flow-block-row' });

      const startInput = row.createEl('input', {
        type: 'text',
        value: block.startTime,
        cls: 'study-flow-time-input',
      });
      startInput.addEventListener('change', () => {
        block.startTime = startInput.value.trim();
        this.updatePreview();
      });

      row.createSpan({ text: '—' });

      const endInput = row.createEl('input', {
        type: 'text',
        value: block.endTime,
        cls: 'study-flow-time-input',
      });
      endInput.addEventListener('change', () => {
        block.endTime = endInput.value.trim();
        this.updatePreview();
      });

      const titleInput = row.createEl('input', {
        type: 'text',
        value: block.title,
        cls: 'study-flow-block-title-input',
      });
      titleInput.addEventListener('change', () => {
        block.title = titleInput.value.trim();
        this.updatePreview();
      });

      const removeBtn = row.createEl('button', { text: '✕', cls: 'study-flow-delete-btn' });
      removeBtn.addEventListener('click', () => {
        this.studyBlocks.splice(index, 1);
        this.renderModalContent();
      });
    });

    // Section 2: Tasks Selection
    const tasksHeader = container.createDiv({
      attr: { style: 'display: flex; justify-content: space-between; align-items: center; margin-top: 12px;' },
    });
    tasksHeader.createEl('h3', {
      text: `Tareas pendientes (${this.pendingTasks.length})`,
      attr: { style: 'margin: 0;' },
    });

    if (this.pendingTasks.length > 0) {
      const bulkActions = tasksHeader.createDiv({ attr: { style: 'display: flex; gap: 8px;' } });
      const selectAllBtn = bulkActions.createEl('button', { text: 'Todas' });
      selectAllBtn.addEventListener('click', () => {
        this.pendingTasks.forEach((t) => this.selectedTaskIds.add(t.id));
        this.renderModalContent();
      });

      const deselectAllBtn = bulkActions.createEl('button', { text: 'Ninguna' });
      deselectAllBtn.addEventListener('click', () => {
        this.selectedTaskIds.clear();
        this.renderModalContent();
      });
    }

    const taskListEl = container.createDiv({ cls: 'study-flow-task-list' });
    this.populateTaskList(taskListEl);

    // Option: Mark migrated
    new Setting(container)
      .setName('Marcar como migradas en origen')
      .setDesc('Marca las tareas seleccionadas como [>] en el archivo original.')
      .addToggle((toggle) =>
        toggle.setValue(this.markMigratedInSource).onChange((val) => {
          this.markMigratedInSource = val;
        })
      );

    // Section 3: Live Preview
    const previewSection = container.createDiv({ cls: 'study-flow-preview-section' });
    previewSection.createDiv({
      text: 'Vista previa de la plantilla generada:',
      cls: 'study-flow-preview-label',
    });
    const previewBox = previewSection.createDiv({ cls: 'study-flow-preview-box' });
    previewBox.setText(this.generateTemplateString());

    // Action buttons
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

  private updatePreview(): void {
    const previewBox = this.contentEl.querySelector('.study-flow-preview-box') as HTMLElement | null;
    if (previewBox) {
      previewBox.setText(this.generateTemplateString());
    }
  }

  private generateTemplateString(): string {
    const blocksStr = this.studyBlocks
      .map((b) => `- [ ] ${b.startTime} - ${b.endTime} | ${b.title}`)
      .join('\n');

    const selected = this.pendingTasks.filter((t) => this.selectedTaskIds.has(t.id));
    const tasksBlock =
      selected.length > 0
        ? selected.map((t) => `- [ ] ${t.text}`).join('\n')
        : '- [ ] (Sin tareas prioritarias seleccionadas)';

    return `## Bloques de Estudio
${blocksStr || '- [ ] 08:00 - 09:30 | \n- [ ] 10:00 - 11:30 | '}

## Tareas Prioritarias
${tasksBlock}`;
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
        this.updatePreview();
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

  private async generateTomorrowPlan(): Promise<void> {
    try {
      const tomorrowPath = getDailyNotePath(this.plugin.settings, 1);
      const selected = this.pendingTasks.filter((t) => this.selectedTaskIds.has(t.id));
      const plannerTemplate = `${this.generateTemplateString()}\n`;

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
        finalContent = `${existingContent.trimEnd()}\n\n${plannerTemplate}`;
      }

      await this.app.vault.modify(tomorrowFile, finalContent);

      if (this.markMigratedInSource && selected.length > 0) {
        await this.markTasksAsMigrated(selected);
      }

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
