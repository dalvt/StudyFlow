import { App, Modal, Notice, setIcon } from 'obsidian';
import type StudyFlowPlugin from './main';
import {
  appendIceboxItemToMarkdownSection,
  appendTaskToMarkdownSection,
  formatTaskWithDeadline,
  formatTaskWithPomodoroEstimate,
  formatTaskWithPriority,
  type TaskPriority,
} from './markdown-utils.ts';
import { getOrCreateFile } from './utils.ts';
import { normalizeTag } from './subject-analytics.ts';
import { t } from './i18n/index.ts';

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
  private previousActiveElement: HTMLElement | null = null;

  constructor(
    app: App,
    plugin: StudyFlowPlugin,
    knownSubjects: string[] = [],
    onCreated?: () => void | Promise<void>,
    initialText: string = ''
  ) {
    super(app);
    this.plugin = plugin;
    if (knownSubjects.length > 0) {
      this.knownSubjects = knownSubjects;
    } else {
      const configuredTags = (plugin.settings?.subjects || []).map((s) => s.tag);
      const taskTags = (plugin.taskIndex?.getAllTasks() || [])
        .flatMap((t) => t.tags || [])
        .filter((tag) => tag && !['#idea', '#icebox', '#alta', '#media', '#baja'].includes(tag.toLowerCase()));
      this.knownSubjects = Array.from(new Set([...configuredTags, ...taskTags]));
    }
    this.onCreated = onCreated;
    this.initialText = initialText;
  }


  onOpen(): void {
    this.previousActiveElement = document.activeElement as HTMLElement | null;
    this.modalEl.addClass('study-flow-cloud-modal-container');
    const { contentEl } = this;
    contentEl.empty();
    contentEl.addClass('study-flow-cloud-modal');

    // 1. Header with Title on Left, Type Switch on Right
    const header = contentEl.createDiv({ cls: 'study-flow-cloud-modal-header' });
    const headerLeft = header.createDiv({ cls: 'study-flow-cloud-header-left' });
    const iconSpan = headerLeft.createSpan({ cls: 'study-flow-cloud-header-icon' });
    setIcon(iconSpan, 'sparkles');

    const titleCol = headerLeft.createDiv({ cls: 'study-flow-cloud-header-titles' });
    titleCol.createEl('h3', { text: t('tasks.cloudModalTitle'), cls: 'study-flow-cloud-modal-title' });
    titleCol.createEl('p', {
      text: t('tasks.cloudModalSub'),
      cls: 'study-flow-cloud-modal-sub',
    });

    // Segmented Type Switch in Header
    const typeSwitch = header.createDiv({ cls: 'study-flow-cloud-type-segmented' });
    const taskBtn = typeSwitch.createEl('button', {
      cls: 'study-flow-cloud-type-btn is-active',
      attr: { 'aria-label': t('tasks.typeTaskAria') },
    });
    const taskBtnIcon = taskBtn.createSpan({ cls: 'study-flow-btn-icon' });
    setIcon(taskBtnIcon, 'check-square');
    taskBtn.createSpan({ text: t('tasks.typeTask') });

    const ideaBtn = typeSwitch.createEl('button', {
      cls: 'study-flow-cloud-type-btn',
      attr: { 'aria-label': t('tasks.typeIceboxAria') },
    });
    const ideaBtnIcon = ideaBtn.createSpan({ cls: 'study-flow-btn-icon' });
    setIcon(ideaBtnIcon, 'archive');
    ideaBtn.createSpan({ text: t('tasks.typeIcebox') });

    // 2. Body
    const body = contentEl.createDiv({ cls: 'study-flow-cloud-modal-body' });

    // Main Title Input
    const titleInputWrap = body.createDiv({ cls: 'study-flow-cloud-title-wrap' });
    const titleInput = titleInputWrap.createEl('input', {
      type: 'text',
      cls: 'study-flow-cloud-title-input',
      placeholder: t('tasks.cloudTitlePlaceholder'),
    });
    titleInput.value = this.initialText;
    titleInput.focus();

    // 3. Metadata 2x2 Grid (Balanced heights)
    const metaGrid = body.createDiv({ cls: 'study-flow-cloud-grid' });

    // Cell 1: Materia
    const subjectField = metaGrid.createDiv({ cls: 'study-flow-cloud-grid-cell' });
    subjectField.createSpan({ text: t('tasks.subjectLabel'), cls: 'study-flow-cloud-label' });
    const subjectSelect = subjectField.createEl('select', { cls: 'study-flow-cloud-control dropdown' });
    subjectSelect.createEl('option', { value: '', text: t('tasks.subjectNoneOption') });

    this.knownSubjects.forEach((subj) => {
      const cleanSubj = subj.startsWith('#') ? subj : `#${subj}`;
      subjectSelect.createEl('option', { value: cleanSubj, text: cleanSubj });
    });
    subjectSelect.createEl('option', { value: '__custom__', text: t('tasks.subjectCustomOption') });

    const customSubjectInput = subjectField.createEl('input', {
      type: 'text',
      placeholder: t('tasks.customSubjectPlaceholder'),
      cls: 'study-flow-cloud-control study-flow-cloud-custom-input is-hidden',
    });

    subjectSelect.addEventListener('change', () => {
      if (subjectSelect.value === '__custom__') {
        subjectSelect.addClass('is-hidden');
        customSubjectInput.removeClass('is-hidden');
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
        customSubjectInput.addClass('is-hidden');
        subjectSelect.removeClass('is-hidden');
        subjectSelect.value = '';
        this.selectedSubject = '';
      }
    });

    // Cell 2: Fecha Límite (Deadline)
    const deadlineField = metaGrid.createDiv({ cls: 'study-flow-cloud-grid-cell' });
    const dlLabel = deadlineField.createSpan({ cls: 'study-flow-cloud-label' });
    const dlIcon = dlLabel.createSpan({ cls: 'study-flow-label-icon' });
    setIcon(dlIcon, 'calendar');
    dlLabel.createSpan({ text: t('tasks.deadlineLabel') });
    const deadlineInput = deadlineField.createEl('input', {
      type: 'date',
      cls: 'study-flow-cloud-control',
      attr: { 'aria-label': t('tasks.deadlineAria') },
    });
    deadlineInput.addEventListener('change', () => {
      this.selectedDeadline = deadlineInput.value;
    });

    // Cell 3: Estimación Pomodoro
    const estimateField = metaGrid.createDiv({ cls: 'study-flow-cloud-grid-cell' });
    const estLabel = estimateField.createSpan({ cls: 'study-flow-cloud-label' });
    const estIcon = estLabel.createSpan({ cls: 'study-flow-label-icon' });
    setIcon(estIcon, 'timer');
    estLabel.createSpan({ text: t('tasks.estimateLabel') });
    const stepperRow = estimateField.createDiv({ cls: 'study-flow-cloud-stepper' });
    const minusBtn = stepperRow.createEl('button', {
      text: '−',
      cls: 'study-flow-stepper-btn',
      attr: { 'aria-label': t('tasks.decreasePomodoros') },
    });
    const estimateDisplay = stepperRow.createSpan({ text: t('tasks.unestimated'), cls: 'study-flow-stepper-val' });
    const plusBtn = stepperRow.createEl('button', {
      text: '+',
      cls: 'study-flow-stepper-btn',
      attr: { 'aria-label': t('tasks.increasePomodoros') },
    });

    const updateEstimateDisplay = () => {
      if (this.pomodoroEstimate === 0) {
        estimateDisplay.empty();
        estimateDisplay.setText(t('tasks.unestimated'));
        estimateDisplay.removeClass('is-active');
      } else {
        const mins = this.pomodoroEstimate * (this.plugin.settings.pomodoroWorkDuration || 25);
        estimateDisplay.empty();
        const iconSpan = estimateDisplay.createSpan();
        setIcon(iconSpan, 'timer');
        estimateDisplay.createSpan({ text: ` ${this.pomodoroEstimate} (${mins}m)` });
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
    const prioLabel = priorityField.createSpan({ cls: 'study-flow-cloud-label' });
    const prioIcon = prioLabel.createSpan({ cls: 'study-flow-label-icon' });
    setIcon(prioIcon, 'zap');
    prioLabel.createSpan({ text: t('tasks.priorityLabel') });
    const prioritySegment = priorityField.createDiv({ cls: 'study-flow-cloud-priority-segment' });

    const priorities: Array<{ id: TaskPriority; label: string; icon: string }> = [
      { id: 'none', label: t('priority.none'), icon: '' },
      { id: 'low', label: t('priority.low'), icon: 'chevron-down' },
      { id: 'medium', label: t('priority.medium'), icon: 'chevron-up' },
      { id: 'high', label: t('priority.high'), icon: 'chevrons-up' },
    ];

    const priorityBtns: HTMLButtonElement[] = [];
    priorities.forEach((p) => {
      const btn = prioritySegment.createEl('button', {
        cls: `study-flow-priority-btn ${this.selectedPriority === p.id ? 'is-active' : ''}`,
        attr: { 'aria-label': t('tasks.priorityAria', { label: p.label }) },
      });
      if (p.icon) {
        const pIcon = btn.createSpan({ cls: 'study-flow-prio-icon' });
        setIcon(pIcon, p.icon);
      }
      btn.createSpan({ text: ` ${p.label}` });
      btn.addEventListener('click', () => {
        this.selectedPriority = p.id;
        priorityBtns.forEach((b) => b.removeClass('is-active'));
        btn.addClass('is-active');
      });
      priorityBtns.push(btn);
    });

    // 4. Footer
    const footer = contentEl.createDiv({ cls: 'study-flow-cloud-modal-footer' });
    footer.createSpan({
      text: t('tasks.cloudShortcutHint'),
      cls: 'study-flow-shortcut-hint',
    });

    const btnRow = footer.createDiv({ cls: 'study-flow-cloud-footer-actions' });
    const cancelBtn = btnRow.createEl('button', { text: t('common.cancel'), cls: 'study-flow-cloud-cancel-btn' });
    cancelBtn.addEventListener('click', () => this.close());

    const submitBtn = btnRow.createEl('button', { cls: 'mod-cta study-flow-cloud-submit-btn' });
    const sIcon = submitBtn.createSpan();
    setIcon(sIcon, 'plus');
    const submitTextSpan = submitBtn.createSpan({ text: t('tasks.addTaskBtn') });

    // Sync Type Switch
    const syncItemType = (type: 'task' | 'idea') => {
      this.itemType = type;
      const isIdea = type === 'idea';
      taskBtn.toggleClass('is-active', !isIdea);
      ideaBtn.toggleClass('is-active', isIdea);
      deadlineField.toggleClass('is-hidden', isIdea);
      estimateField.toggleClass('is-hidden', isIdea);
      priorityField.toggleClass('is-hidden', isIdea);
      metaGrid.toggleClass('is-idea-mode', isIdea);
      titleInput.placeholder = isIdea
        ? t('tasks.cloudIdeaPlaceholder')
        : t('tasks.cloudTitlePlaceholder');
      submitTextSpan.setText(isIdea ? t('tasks.saveInIceboxBtn') : t('tasks.addTaskBtn'));
    };

    taskBtn.addEventListener('click', () => syncItemType('task'));
    ideaBtn.addEventListener('click', () => syncItemType('idea'));

    const doSubmit = async () => {
      const text = titleInput.value.trim();
      if (!text) {
        new Notice(t('tasks.enterTitleNotice'));
        titleInput.focus();
        return;
      }
      this.taskTitle = text;
      await this.saveAndClose();
    };

    submitBtn.addEventListener('click', () => {
      void doSubmit();
    });

    titleInput.addEventListener('keydown', (e: KeyboardEvent) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        void doSubmit();
      }
    });
  }

  onClose(): void {
    this.modalEl.removeClass('study-flow-cloud-modal-container');
    const { contentEl } = this;
    contentEl.empty();
    if (this.previousActiveElement && typeof this.previousActiveElement.focus === 'function') {
      this.previousActiveElement.focus();
    }
  }

  private async saveAndClose(): Promise<void> {
    try {
      const inboxPath = this.plugin.settings.inboxFilePath || 'StudyFlow/Inbox.md';
      let finalLine = this.taskTitle;

      // Append Subject if provided
      if (this.selectedSubject) {
        const tag = normalizeTag(this.selectedSubject);
        if (tag && !finalLine.includes(tag)) {
          finalLine = `${finalLine} ${tag}`;
        }
      }

      const tasksH = this.plugin.settings.tasksSectionHeader || '## Tareas';
      const iceboxH = this.plugin.settings.iceboxSectionHeader || '## Icebox';

      const file = await getOrCreateFile(this.app, inboxPath, `# Inbox\n\n${tasksH}\n\n${iceboxH}\n\n`);

      if (this.itemType === 'idea') {
        const iceboxLine = finalLine.startsWith('🧊') ? finalLine : `🧊 ${finalLine}`;
        await this.app.vault.process(file, (content) => {
          return appendIceboxItemToMarkdownSection(content, iceboxLine, iceboxH);
        });
        new Notice(t('tasks.savedInIceboxNotice'));
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

        await this.app.vault.process(file, (content) => {
          return appendTaskToMarkdownSection(content, finalLine, tasksH);
        });
        new Notice(t('tasks.taskAddedNotice'));
      }

      if (this.onCreated) {
        await this.onCreated();
      }

      this.close();
    } catch {
      new Notice(t('tasks.saveMarkdownError'));
    }
  }
}
