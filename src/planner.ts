import { App, Modal, Notice, setIcon, Setting, TFile } from 'obsidian';
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
    { id: '1', startTime: '08:00', endTime: '09:30', title: 'Bloque Matutino: Estudio Intenso' },
    { id: '2', startTime: '10:00', endTime: '11:30', title: 'Bloque Práctico: Ejercicios' },
  ];

  constructor(app: App, plugin: StudyFlowPlugin) {
    super(app);
    this.plugin = plugin;
  }

  async onOpen(): Promise<void> {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.addClass('study-flow-modal', 'study-flow-planner-modal');

    const loadingEl = contentEl.createEl('div', { cls: 'study-flow-empty-tasks', text: 'Cargando pendientes...' });
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

    // Modal Header
    const header = contentEl.createDiv({ cls: 'study-flow-modal-header' });
    const title = header.createEl('h2', { text: 'Planificar el Día Siguiente' });
    const iconSpan = title.createSpan({ cls: 'study-flow-header-icon' });
    setIcon(iconSpan, 'calendar-check');

    contentEl.createEl('p', {
      text: 'Organiza tus bloques de tiempo y selecciona las tareas pendientes que priorizarás mañana.',
      cls: 'study-flow-modal-desc',
    });

    const container = contentEl.createDiv({ cls: 'study-flow-planner-container' });

    // Section 1: Study Blocks Timeline
    const blocksSection = container.createDiv({ cls: 'study-flow-section-card' });
    const blocksHeader = blocksSection.createDiv({ cls: 'study-flow-section-header' });
    const blocksTitle = blocksHeader.createEl('h3', { text: 'Bloques de Estudio' });
    const bIcon = blocksTitle.createSpan({ cls: 'study-flow-section-icon' });
    setIcon(bIcon, 'clock');

    const addBlockBtn = blocksHeader.createEl('button', { cls: 'study-flow-icon-action-btn-styled' });
    const addIcon = addBlockBtn.createSpan();
    setIcon(addIcon, 'plus');
    addBlockBtn.createSpan({ text: 'Añadir Bloque' });
    addBlockBtn.addEventListener('click', () => {
      this.studyBlocks.push({
        id: String(Date.now()),
        startTime: '14:00',
        endTime: '15:30',
        title: 'Bloque Vespertino',
      });
      this.renderModalContent();
    });

    const blocksListEl = blocksSection.createDiv({ cls: 'study-flow-timeline-list' });
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
        this.updatePreview();
      });

      timeWrap.createSpan({ text: '—', cls: 'study-flow-time-sep' });

      const endInput = timeWrap.createEl('input', {
        type: 'text',
        value: block.endTime,
        cls: 'study-flow-time-input',
      });
      endInput.addEventListener('change', () => {
        block.endTime = endInput.value.trim();
        this.updatePreview();
      });

      const titleInput = inputsWrap.createEl('input', {
        type: 'text',
        value: block.title,
        cls: 'study-flow-block-title-input',
        placeholder: 'Título o materia del bloque...',
      });
      titleInput.addEventListener('change', () => {
        block.title = titleInput.value.trim();
        this.updatePreview();
      });

      const removeBtn = row.createEl('button', {
        cls: 'study-flow-icon-action-btn',
        attr: { 'aria-label': 'Eliminar bloque' },
      });
      setIcon(removeBtn, 'trash-2');
      removeBtn.addEventListener('click', () => {
        this.studyBlocks.splice(index, 1);
        this.renderModalContent();
      });
    });

    // Section 2: Priority Tasks Selection
    const tasksSection = container.createDiv({ cls: 'study-flow-section-card' });
    const tasksHeader = tasksSection.createDiv({ cls: 'study-flow-section-header' });
    const tasksTitle = tasksHeader.createEl('h3', {
      text: `Tareas Pendientes (${this.pendingTasks.length})`,
    });
    const tIcon = tasksTitle.createSpan({ cls: 'study-flow-section-icon' });
    setIcon(tIcon, 'check-circle');

    if (this.pendingTasks.length > 0) {
      const bulkActions = tasksHeader.createDiv({ cls: 'study-flow-bulk-actions' });
      const selectAllBtn = bulkActions.createEl('button', { text: 'Todas', cls: 'study-flow-mini-btn' });
      selectAllBtn.addEventListener('click', () => {
        this.pendingTasks.forEach((t) => this.selectedTaskIds.add(t.id));
        this.renderModalContent();
      });

      const deselectAllBtn = bulkActions.createEl('button', { text: 'Ninguna', cls: 'study-flow-mini-btn' });
      deselectAllBtn.addEventListener('click', () => {
        this.selectedTaskIds.clear();
        this.renderModalContent();
      });
    }

    const taskListEl = tasksSection.createDiv({ cls: 'study-flow-task-list-cards' });
    this.populateTaskList(taskListEl);

    // Option: Mark migrated
    new Setting(tasksSection)
      .setName('Marcar como migradas en origen')
      .setDesc('Convierte [ ] a [>] en la nota original para mantener trazabilidad.')
      .addToggle((toggle) =>
        toggle.setValue(this.markMigratedInSource).onChange((val) => {
          this.markMigratedInSource = val;
        })
      );

    // Section 3: Live Preview
    const previewSection = container.createDiv({ cls: 'study-flow-section-card' });
    previewSection.createEl('h3', { text: 'Vista Previa del Archivo' });
    const previewBox = previewSection.createDiv({ cls: 'study-flow-preview-box' });
    previewBox.setText(this.generateTemplateString());

    // Action buttons
    const btnRow = contentEl.createDiv({ cls: 'study-flow-modal-footer' });
    const cancelBtn = btnRow.createEl('button', { text: 'Cancelar' });
    cancelBtn.addEventListener('click', () => this.close());

    const submitBtn = btnRow.createEl('button', { cls: 'mod-cta' });
    const genIcon = submitBtn.createSpan();
    setIcon(genIcon, 'calendar-plus');
    submitBtn.createSpan({ text: 'Generar Plan de Mañana' });
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
      const itemEl = container.createDiv({ cls: 'study-flow-task-card' });
      const cbWrapper = itemEl.createDiv({ cls: 'study-flow-cb-wrapper' });
      const checkbox = cbWrapper.createEl('input', { type: 'checkbox' });
      checkbox.checked = this.selectedTaskIds.has(task.id);

      checkbox.addEventListener('change', () => {
        if (checkbox.checked) {
          this.selectedTaskIds.add(task.id);
        } else {
          this.selectedTaskIds.delete(task.id);
        }
        this.updatePreview();
      });

      const label = itemEl.createEl('span', { text: task.text, cls: 'study-flow-task-text' });
      label.addEventListener('click', () => {
        checkbox.checked = !checkbox.checked;
        checkbox.dispatchEvent(new Event('change'));
      });

      itemEl.createSpan({
        text: task.sourceFile.endsWith('.md')
          ? task.sourceFile.substring(0, task.sourceFile.length - 3)
          : task.sourceFile,
        cls: 'study-flow-source-chip',
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
