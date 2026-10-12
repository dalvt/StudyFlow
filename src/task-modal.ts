import { App, Modal, Notice, setIcon } from 'obsidian';
import type StudyFlowPlugin from './main';
import {
  appendTaskToMarkdownSection,
  formatTaskWithDeadline,
  formatTaskWithPomodoroEstimate,
  formatTaskWithPriority,
  TaskPriority,
} from './markdown-utils';
import { getOrCreateFile } from './utils';

export class TaskCreateModal extends Modal {
  private plugin: StudyFlowPlugin;
  private knownSubjects: string[];
  private onCreated?: () => void | Promise<void>;
  private initialText: string;

  private taskTitle: string = '';
  private itemType: 'task' | 'idea' = 'task';
  private selectedSubject: string = '';
  private selectedDeadline: string = '';
  private pomodoroEstimate: number = 0;
  private selectedPriority: TaskPriority = 'none';

  constructor(
    app: App,
    plugin: StudyFlowPlugin,
    knownSubjects: string[] = [],
    onCreated?: () => void | Promise<void>,
    initialText: string = ''
  ) {
    super(app);
    this.plugin = plugin;
    this.knownSubjects = knownSubjects;
    this.onCreated = onCreated;
    this.initialText = initialText;
  }

  onOpen(): void {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.addClass('study-flow-cloud-modal');

    // 1. Header with Title on Left, Type Switch on Right
    const header = contentEl.createDiv({ cls: 'study-flow-cloud-modal-header' });
    const headerLeft = header.createDiv({ cls: 'study-flow-cloud-header-left' });
    const iconSpan = headerLeft.createSpan({ cls: 'study-flow-cloud-header-icon' });
    setIcon(iconSpan, 'sparkles');

    const titleCol = headerLeft.createDiv({ cls: 'study-flow-cloud-header-titles' });
    titleCol.createEl('h3', { text: 'Nueva Tarea Académica', cls: 'study-flow-cloud-modal-title' });
    titleCol.createEl('p', {
      text: 'Organizá tus metas de estudio, materia y plazos',
      cls: 'study-flow-cloud-modal-sub',
    });

    // Segmented Type Switch in Header
    const typeSwitch = header.createDiv({ cls: 'study-flow-cloud-type-segmented' });
    const taskBtn = typeSwitch.createEl('button', {
      cls: 'study-flow-cloud-type-btn is-active',
      text: '📋 Tarea',
    });
    const ideaBtn = typeSwitch.createEl('button', {
      cls: 'study-flow-cloud-type-btn',
      text: '💡 Idea',
    });

    // 2. Body
    const body = contentEl.createDiv({ cls: 'study-flow-cloud-modal-body' });

    // Main Title Input
    const titleInputWrap = body.createDiv({ cls: 'study-flow-cloud-title-wrap' });
    const titleInput = titleInputWrap.createEl('input', {
      type: 'text',
      cls: 'study-flow-cloud-title-input',
      placeholder: '¿Qué necesitás hacer o estudiar? (ej: Resolver guía de álgebra...)',
    });
    titleInput.value = this.initialText;
    titleInput.focus();

    // 3. Metadata 2x2 Grid (Balanced heights)
    const metaGrid = body.createDiv({ cls: 'study-flow-cloud-grid' });

    // Cell 1: Materia
    const subjectField = metaGrid.createDiv({ cls: 'study-flow-cloud-grid-cell' });
    subjectField.createEl('span', { text: '📚 Materia', cls: 'study-flow-cloud-label' });
    const subjectSelect = subjectField.createEl('select', { cls: 'study-flow-cloud-control' });
    subjectSelect.createEl('option', { value: '', text: '— Sin materia (Inbox) —' });

    this.knownSubjects.forEach((subj) => {
      const cleanSubj = subj.startsWith('#') ? subj : `#${subj}`;
      subjectSelect.createEl('option', { value: cleanSubj, text: cleanSubj });
    });
    subjectSelect.createEl('option', { value: '__custom__', text: '➕ Otra / nueva materia...' });

    const customSubjectInput = subjectField.createEl('input', {
      type: 'text',
      placeholder: 'Ingresá #materia...',
      cls: 'study-flow-cloud-control study-flow-cloud-custom-input',
    });
    customSubjectInput.style.display = 'none';

    subjectSelect.addEventListener('change', () => {
      if (subjectSelect.value === '__custom__') {
        subjectSelect.style.display = 'none';
        customSubjectInput.style.display = 'block';
        customSubjectInput.focus();
      } else {
        this.selectedSubject = subjectSelect.value;
      }
    });

    customSubjectInput.addEventListener('input', () => {
      this.selectedSubject = customSubjectInput.value.trim();
    });

    customSubjectInput.addEventListener('keydown', (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !customSubjectInput.value) {
        customSubjectInput.style.display = 'none';
        subjectSelect.style.display = 'block';
        subjectSelect.value = '';
        this.selectedSubject = '';
      }
    });

    // Cell 2: Fecha Límite (Deadline)
    const deadlineField = metaGrid.createDiv({ cls: 'study-flow-cloud-grid-cell' });
    deadlineField.createEl('span', { text: '📅 Fecha límite', cls: 'study-flow-cloud-label' });
    const deadlineInput = deadlineField.createEl('input', {
      type: 'date',
      cls: 'study-flow-cloud-control',
    });
    deadlineInput.addEventListener('change', () => {
      this.selectedDeadline = deadlineInput.value;
    });

    // Cell 3: Estimación Pomodoro
    const estimateField = metaGrid.createDiv({ cls: 'study-flow-cloud-grid-cell' });
    estimateField.createEl('span', { text: '🍅 Estimación Pomodoro', cls: 'study-flow-cloud-label' });
    const stepperRow = estimateField.createDiv({ cls: 'study-flow-cloud-stepper' });
    const minusBtn = stepperRow.createEl('button', { text: '−', cls: 'study-flow-stepper-btn' });
    const estimateDisplay = stepperRow.createSpan({ text: 'Sin estimar', cls: 'study-flow-stepper-val' });
    const plusBtn = stepperRow.createEl('button', { text: '+', cls: 'study-flow-stepper-btn' });

    const updateEstimateDisplay = () => {
      if (this.pomodoroEstimate === 0) {
        estimateDisplay.setText('Sin estimar');
        estimateDisplay.removeClass('is-active');
      } else {
        const mins = this.pomodoroEstimate * (this.plugin.settings.pomodoroWorkDuration || 25);
        estimateDisplay.setText(`🍅 ${this.pomodoroEstimate} (${mins}m)`);
        estimateDisplay.addClass('is-active');
      }
    };

    minusBtn.addEventListener('click', () => {
      if (this.pomodoroEstimate > 0) {
        this.pomodoroEstimate--;
        updateEstimateDisplay();
      }
    });

    plusBtn.addEventListener('click', () => {
      if (this.pomodoroEstimate < 12) {
        this.pomodoroEstimate++;
        updateEstimateDisplay();
      }
    });

    // Cell 4: Prioridad (Segmented row with NO wrapping)
    const priorityField = metaGrid.createDiv({ cls: 'study-flow-cloud-grid-cell' });
    priorityField.createEl('span', { text: '⚡ Prioridad', cls: 'study-flow-cloud-label' });
    const prioritySegment = priorityField.createDiv({ cls: 'study-flow-cloud-priority-segment' });

    const priorities: Array<{ id: TaskPriority; label: string; icon: string }> = [
      { id: 'none', label: 'Normal', icon: '' },
      { id: 'low', label: 'Baja', icon: '🔽' },
      { id: 'medium', label: 'Media', icon: '🔼' },
      { id: 'high', label: 'Alta', icon: '⏫' },
    ];

    const priorityBtns: HTMLButtonElement[] = [];
    priorities.forEach((p) => {
      const btn = prioritySegment.createEl('button', {
        cls: `study-flow-priority-btn ${this.selectedPriority === p.id ? 'is-active' : ''}`,
      });
      if (p.icon) {
        btn.createSpan({ text: p.icon, cls: 'study-flow-prio-icon' });
      }
      btn.createSpan({ text: p.label });
      btn.addEventListener('click', () => {
        this.selectedPriority = p.id;
        priorityBtns.forEach((b) => b.removeClass('is-active'));
        btn.addClass('is-active');
      });
      priorityBtns.push(btn);
    });

    // Sync Type Switch
    const syncItemType = (type: 'task' | 'idea') => {
      this.itemType = type;
      if (type === 'idea') {
        taskBtn.removeClass('is-active');
        ideaBtn.addClass('is-active');
        deadlineField.style.display = 'none';
        estimateField.style.display = 'none';
        priorityField.style.display = 'none';
        metaGrid.addClass('is-idea-mode');
      } else {
        ideaBtn.removeClass('is-active');
        taskBtn.addClass('is-active');
        deadlineField.style.display = '';
        estimateField.style.display = '';
        priorityField.style.display = '';
        metaGrid.removeClass('is-idea-mode');
      }
    };

    taskBtn.addEventListener('click', () => syncItemType('task'));
    ideaBtn.addEventListener('click', () => syncItemType('idea'));

    // 4. Footer
    const footer = contentEl.createDiv({ cls: 'study-flow-cloud-modal-footer' });
    const hint = footer.createEl('span', {
      text: '↵ Guardar  •  Esc Cancelar',
      cls: 'study-flow-shortcut-hint',
    });

    const btnRow = footer.createDiv({ cls: 'study-flow-cloud-footer-actions' });
    const cancelBtn = btnRow.createEl('button', { text: 'Cancelar', cls: 'study-flow-cloud-cancel-btn' });
    cancelBtn.addEventListener('click', () => this.close());

    const submitBtn = btnRow.createEl('button', { cls: 'mod-cta study-flow-cloud-submit-btn' });
    const sIcon = submitBtn.createSpan();
    setIcon(sIcon, 'plus');
    submitBtn.createSpan({ text: 'Añadir Tarea' });

    const doSubmit = async () => {
      const text = titleInput.value.trim();
      if (!text) {
        new Notice('Ingresá una descripción o título para la tarea');
        titleInput.focus();
        return;
      }
      this.taskTitle = text;
      await this.saveAndClose();
    };

    submitBtn.addEventListener('click', doSubmit);

    titleInput.addEventListener('keydown', (e: KeyboardEvent) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        doSubmit();
      }
    });
  }

  onClose(): void {
    const { contentEl } = this;
    contentEl.empty();
  }

  private async saveAndClose(): Promise<void> {
    try {
      const inboxPath = this.plugin.settings.inboxFilePath || 'StudyFlow/Inbox.md';
      const file = await getOrCreateFile(this.app, inboxPath, '# Inbox\n\n## Tareas\n\n## Ideas\n\n');
      const content = await this.app.vault.read(file);

      let finalLine = this.taskTitle;

      // Append Subject if provided
      if (this.selectedSubject) {
        const tag = this.selectedSubject.startsWith('#') ? this.selectedSubject : `#${this.selectedSubject}`;
        if (!finalLine.includes(tag)) {
          finalLine = `${finalLine} ${tag}`;
        }
      }

      if (this.itemType === 'idea') {
        const ideaLine = finalLine.startsWith('💡') ? finalLine : `💡 ${finalLine}`;
        const updated = appendTaskToMarkdownSection(content, ideaLine, '## Ideas');
        await this.app.vault.modify(file, updated);
        new Notice(`💡 Idea guardada en Inbox`);
      } else {
        if (this.selectedPriority !== 'none') {
          finalLine = formatTaskWithPriority(finalLine, this.selectedPriority);
        }
        if (this.pomodoroEstimate > 0) {
          finalLine = formatTaskWithPomodoroEstimate(finalLine, this.pomodoroEstimate);
        }
        if (this.selectedDeadline) {
          finalLine = formatTaskWithDeadline(finalLine, this.selectedDeadline);
        }

        const updated = appendTaskToMarkdownSection(content, finalLine, '## Tareas');
        await this.app.vault.modify(file, updated);
        new Notice(`✓ Tarea añadida exitosamente`);
      }

      if (this.onCreated) {
        await this.onCreated();
      }

      this.close();
    } catch (err) {
      new Notice('Error al guardar la tarea en el archivo Markdown');
    }
  }
}
