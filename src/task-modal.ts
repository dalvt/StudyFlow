import { App, Modal, Notice, setIcon, TFile } from 'obsidian';
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
  private customSubject: string = '';
  private selectedDeadline: string = '';
  private pomodoroEstimate: number = 0;
  private selectedPriority: TaskPriority = 'none';
  private targetDestination: 'inbox' | 'activeNote' = 'inbox';

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

    // Header
    const header = contentEl.createDiv({ cls: 'study-flow-cloud-modal-header' });
    const headerLeft = header.createDiv({ cls: 'study-flow-cloud-header-left' });
    const iconSpan = headerLeft.createSpan({ cls: 'study-flow-cloud-header-icon' });
    setIcon(iconSpan, 'sparkles');
    const titleCol = headerLeft.createDiv();
    titleCol.createEl('h3', { text: 'Nueva Tarea Académica', cls: 'study-flow-cloud-modal-title' });
    titleCol.createEl('p', {
      text: 'Configurá los detalles de estudio, materia y plazos',
      cls: 'study-flow-cloud-modal-sub',
    });

    // Body Form
    const body = contentEl.createDiv({ cls: 'study-flow-cloud-modal-body' });

    // 1. Title Input
    const titleSection = body.createDiv({ cls: 'study-flow-cloud-field' });
    titleSection.createEl('label', { text: '¿Qué necesitás hacer o estudiar?', cls: 'study-flow-cloud-label' });
    const titleInput = titleSection.createEl('input', {
      type: 'text',
      cls: 'study-flow-cloud-input study-flow-cloud-input-title',
      placeholder: 'Ej: Resolver guía práctica de matrices, repasar teoría...',
    });
    titleInput.value = this.initialText;
    titleInput.focus();

    // 2. Type Selector (Task vs Idea)
    const typeSection = body.createDiv({ cls: 'study-flow-cloud-field' });
    typeSection.createEl('label', { text: 'Tipo de entrada', cls: 'study-flow-cloud-label' });
    const typePills = typeSection.createDiv({ cls: 'study-flow-cloud-pills' });

    const taskPill = typePills.createEl('button', {
      cls: 'study-flow-cloud-pill-btn is-active',
      text: '📋 Tarea ejecutable',
    });
    const ideaPill = typePills.createEl('button', {
      cls: 'study-flow-cloud-pill-btn',
      text: '💡 Idea espontánea',
    });

    // 3. Grid for Academic Metadata (Subject, Deadline, Estimate, Priority)
    const metaGrid = body.createDiv({ cls: 'study-flow-cloud-grid' });

    // Subject / Materia
    const subjectField = metaGrid.createDiv({ cls: 'study-flow-cloud-field' });
    subjectField.createEl('label', { text: '📚 Materia', cls: 'study-flow-cloud-label' });
    const subjectRow = subjectField.createDiv({ cls: 'study-flow-cloud-row' });
    const subjectSelect = subjectRow.createEl('select', { cls: 'study-flow-cloud-select' });
    subjectSelect.createEl('option', { value: '', text: '— Sin materia (Inbox general) —' });

    this.knownSubjects.forEach((subj) => {
      const cleanSubj = subj.startsWith('#') ? subj : `#${subj}`;
      subjectSelect.createEl('option', { value: cleanSubj, text: cleanSubj });
    });
    subjectSelect.createEl('option', { value: '__custom__', text: '➕ Otra materia / nuevo tag...' });

    const customSubjectInput = subjectRow.createEl('input', {
      type: 'text',
      placeholder: '#materia',
      cls: 'study-flow-cloud-input study-flow-cloud-custom-subject',
    });
    customSubjectInput.style.display = 'none';

    subjectSelect.addEventListener('change', () => {
      if (subjectSelect.value === '__custom__') {
        customSubjectInput.style.display = 'inline-block';
        customSubjectInput.focus();
        this.selectedSubject = customSubjectInput.value.trim();
      } else {
        customSubjectInput.style.display = 'none';
        this.selectedSubject = subjectSelect.value;
      }
    });

    customSubjectInput.addEventListener('input', () => {
      this.selectedSubject = customSubjectInput.value.trim();
    });

    // Deadline / Fecha Límite
    const deadlineField = metaGrid.createDiv({ cls: 'study-flow-cloud-field' });
    deadlineField.createEl('label', { text: '📅 Fecha límite (Deadline)', cls: 'study-flow-cloud-label' });
    const deadlineInput = deadlineField.createEl('input', {
      type: 'date',
      cls: 'study-flow-cloud-input',
    });
    deadlineInput.addEventListener('change', () => {
      this.selectedDeadline = deadlineInput.value;
    });

    // Pomodoro Estimate Stepper
    const estimateField = metaGrid.createDiv({ cls: 'study-flow-cloud-field' });
    estimateField.createEl('label', { text: '🍅 Estimación Pomodoro', cls: 'study-flow-cloud-label' });
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
        estimateDisplay.setText(`🍅 ${this.pomodoroEstimate} (~${mins} min)`);
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

    // Priority Selector
    const priorityField = metaGrid.createDiv({ cls: 'study-flow-cloud-field' });
    priorityField.createEl('label', { text: '⚡ Prioridad', cls: 'study-flow-cloud-label' });
    const priorityRow = priorityField.createDiv({ cls: 'study-flow-cloud-pills' });

    const priorities: Array<{ id: TaskPriority; label: string }> = [
      { id: 'none', label: 'Normal' },
      { id: 'low', label: '🔽 Baja' },
      { id: 'medium', label: '🔼 Media' },
      { id: 'high', label: '⏫ Alta' },
    ];

    const priorityBtns: HTMLButtonElement[] = [];
    priorities.forEach((p) => {
      const btn = priorityRow.createEl('button', {
        cls: `study-flow-cloud-pill-btn ${this.selectedPriority === p.id ? 'is-active' : ''}`,
        text: p.label,
      });
      btn.addEventListener('click', () => {
        this.selectedPriority = p.id;
        priorityBtns.forEach((b) => b.removeClass('is-active'));
        btn.addClass('is-active');
      });
      priorityBtns.push(btn);
    });

    // Toggle Task vs Idea fields
    const syncItemType = (type: 'task' | 'idea') => {
      this.itemType = type;
      if (type === 'idea') {
        taskPill.removeClass('is-active');
        ideaPill.addClass('is-active');
        estimateField.style.display = 'none';
        deadlineField.style.display = 'none';
        priorityField.style.display = 'none';
      } else {
        ideaPill.removeClass('is-active');
        taskPill.addClass('is-active');
        estimateField.style.display = '';
        deadlineField.style.display = '';
        priorityField.style.display = '';
      }
    };

    taskPill.addEventListener('click', () => syncItemType('task'));
    ideaPill.addEventListener('click', () => syncItemType('idea'));

    // Footer
    const footer = contentEl.createDiv({ cls: 'study-flow-cloud-modal-footer' });
    const hint = footer.createEl('span', {
      text: '↵ Enter para guardar • Esc para cerrar',
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
