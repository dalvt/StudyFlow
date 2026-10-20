import { App, Modal, Notice, Setting, setIcon } from 'obsidian';
import type StudyFlowPlugin from './main.ts';
import type { Subject } from './settings-utils.ts';
import { normalizeTag } from './subject-analytics.ts';
import { t } from './i18n/index.ts';

const PRESET_COLORS = [
  '#4f46e5', // Indigo
  '#2563eb', // Blue
  '#0284c7', // Sky
  '#0d9488', // Teal
  '#10b981', // Emerald
  '#16a34a', // Green
  '#d97706', // Amber
  '#ea580c', // Orange
  '#dc2626', // Red
  '#db2777', // Pink
  '#9333ea', // Purple
  '#7c3aed', // Violet
];

export class SubjectEditModal extends Modal {
  private plugin: StudyFlowPlugin;
  private subject: Subject | null;
  private onSave: (subject: Subject) => Promise<void> | void;

  private name: string = '';
  private tag: string = '';
  private color: string = '#4f46e5';
  private weeklyGoalHours: number = 5;
  private previousActiveElement: HTMLElement | null = null;

  constructor(
    app: App,
    plugin: StudyFlowPlugin,
    subject: Subject | null,
    onSave: (subject: Subject) => Promise<void> | void
  ) {
    super(app);
    this.plugin = plugin;
    this.subject = subject;
    this.onSave = onSave;

    if (subject) {
      this.name = subject.name;
      this.tag = subject.tag;
      this.color = subject.color || '#4f46e5';
      this.weeklyGoalHours = subject.weeklyGoalHours ?? 5;
    }
  }

  onOpen(): void {
    this.previousActiveElement = document.activeElement as HTMLElement | null;
    const { contentEl } = this;
    contentEl.empty();
    contentEl.addClass('study-flow-modal', 'study-flow-subject-modal');

    // Header
    const header = contentEl.createDiv({ cls: 'study-flow-modal-header' });
    const titleText = this.subject ? t('subjects.editModalTitle') : t('subjects.newModalTitle');
    const title = header.createEl('h2', { text: titleText });
    const iconSpan = title.createSpan({ cls: 'study-flow-header-icon' });
    setIcon(iconSpan, 'book-open');

    // Form fields
    new Setting(contentEl)
      .setName(t('subjects.nameLabel'))
      .setDesc(t('subjects.nameDesc'))
      .addText((text) => {
        text
          .setPlaceholder(t('subjects.namePlaceholder'))
          .setValue(this.name)
          .onChange((val) => {
            this.name = val;
          });
      });

    new Setting(contentEl)
      .setName(t('subjects.tagLabel'))
      .setDesc(t('subjects.tagDesc'))
      .addText((text) => {
        text
          .setPlaceholder(t('subjects.tagPlaceholder'))
          .setValue(this.tag)
          .onChange((val) => {
            this.tag = val;
          });
      });

    // Color picker row
    const colorSetting = new Setting(contentEl)
      .setName(t('subjects.colorLabel'))
      .setDesc(t('subjects.colorDesc'));

    const colorContainer = colorSetting.controlEl.createDiv({ cls: 'study-flow-color-picker-container' });
    const colorInput = colorContainer.createEl('input', {
      type: 'color',
      cls: 'study-flow-color-input',
      value: this.color,
    });
    colorInput.addEventListener('input', () => {
      this.color = colorInput.value;
    });

    const palette = colorContainer.createDiv({ cls: 'study-flow-preset-palette' });
    PRESET_COLORS.forEach((c) => {
      const swatch = palette.createDiv({
        cls: `study-flow-color-swatch ${c === this.color ? 'is-active' : ''}`,
      });
      swatch.style.backgroundColor = c;
      swatch.addEventListener('click', () => {
        this.color = c;
        colorInput.value = c;
        palette.querySelectorAll('.study-flow-color-swatch').forEach((s) => s.removeClass('is-active'));
        swatch.addClass('is-active');
      });
    });

    // Weekly goal hours
    new Setting(contentEl)
      .setName(t('subjects.goalHoursLabel'))
      .setDesc(t('subjects.goalHoursDesc'))
      .addText((text) => {
        text
          .setPlaceholder(t('subjects.goalHoursPlaceholder'))
          .setValue(String(this.weeklyGoalHours))
          .onChange((val) => {
            const num = parseFloat(val);
            if (!isNaN(num) && num >= 0) {
              this.weeklyGoalHours = num;
            }
          });
        text.inputEl.type = 'number';
        text.inputEl.min = '0';
        text.inputEl.step = '0.5';
      });

    // Footer actions
    const footer = contentEl.createDiv({ cls: 'study-flow-modal-footer' });
    const cancelBtn = footer.createEl('button', { text: t('common.cancel') });
    cancelBtn.addEventListener('click', () => this.close());

    const saveBtn = footer.createEl('button', { text: t('common.save'), cls: 'mod-cta' });
    saveBtn.addEventListener('click', () => {
      void (async () => {
        const cleanName = this.name.trim();
        if (!cleanName) {
          new Notice(t('subjects.validationNameRequired'));
          return;
        }
        const normTag = normalizeTag(this.tag);
        if (!normTag || normTag === '#') {
          new Notice(t('subjects.validationTagRequired'));
          return;
        }

        const id = this.subject ? this.subject.id : `sub-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
        const savedSubject: Subject = {
          id,
          name: cleanName,
          tag: normTag,
          color: this.color || '#4f46e5',
          weeklyGoalHours: Math.max(0, this.weeklyGoalHours || 0),
        };

        await this.onSave(savedSubject);
        this.close();
      })();
    });
  }

  onClose(): void {
    const { contentEl } = this;
    contentEl.empty();
    if (this.previousActiveElement && typeof this.previousActiveElement.focus === 'function') {
      this.previousActiveElement.focus();
    }
  }
}

export class SubjectSelectModal extends Modal {
  private plugin: StudyFlowPlugin;
  private onSelect: (subject: Subject | null) => Promise<void> | void;
  private previousActiveElement: HTMLElement | null = null;

  constructor(
    app: App,
    plugin: StudyFlowPlugin,
    onSelect: (subject: Subject | null) => Promise<void> | void
  ) {
    super(app);
    this.plugin = plugin;
    this.onSelect = onSelect;
  }

  onOpen(): void {
    this.previousActiveElement = document.activeElement as HTMLElement | null;
    const { contentEl } = this;
    contentEl.empty();
    contentEl.addClass('study-flow-modal', 'study-flow-subject-select-modal');

    // Header
    const header = contentEl.createDiv({ cls: 'study-flow-modal-header' });
    const title = header.createEl('h2', { text: t('subjects.selectModalTitle') });
    const iconSpan = title.createSpan({ cls: 'study-flow-header-icon' });
    setIcon(iconSpan, 'target');

    contentEl.createEl('p', {
      text: t('subjects.selectModalDesc'),
      cls: 'study-flow-modal-subtitle',
    });

    const listContainer = contentEl.createDiv({ cls: 'study-flow-subject-select-list' });

    const subjects = this.plugin.settings.subjects || [];

    // Subjects options
    subjects.forEach((sub) => {
      const itemBtn = listContainer.createEl('button', {
        cls: 'study-flow-subject-select-item',
      });
      const colorDot = itemBtn.createSpan({ cls: 'study-flow-subject-color-dot' });
      colorDot.style.backgroundColor = sub.color || '#4f46e5';

      const textWrap = itemBtn.createDiv({ cls: 'study-flow-subject-item-text' });
      textWrap.createSpan({ text: sub.name, cls: 'study-flow-subject-item-name' });
      textWrap.createSpan({ text: sub.tag, cls: 'study-flow-subject-item-tag' });

      if (sub.weeklyGoalHours > 0) {
        itemBtn.createSpan({
          text: t('subjects.goalBadge', { hours: String(sub.weeklyGoalHours) }),
          cls: 'study-flow-subject-item-goal',
        });
      }

      itemBtn.addEventListener('click', () => {
        void (async () => {
          this.close();
          await this.onSelect(sub);
        })();
      });
    });

    // "Sin materia" option
    const noSubjectBtn = listContainer.createEl('button', {
      cls: 'study-flow-subject-select-item is-none',
    });
    const noIcon = noSubjectBtn.createSpan({ cls: 'study-flow-subject-color-dot is-none' });
    setIcon(noIcon, 'minus');
    noSubjectBtn.createSpan({ text: t('subjects.noSubjectOption'), cls: 'study-flow-subject-item-name' });
    noSubjectBtn.addEventListener('click', () => {
      void (async () => {
        this.close();
        await this.onSelect(null);
      })();
    });

    // "+ Añadir materia" option
    const addSubjectBtn = listContainer.createEl('button', {
      cls: 'study-flow-subject-select-item is-add',
    });
    const addIcon = addSubjectBtn.createSpan({ cls: 'study-flow-subject-color-dot is-add' });
    setIcon(addIcon, 'plus');
    addSubjectBtn.createSpan({ text: `+ ${t('subjects.addSubjectBtn')}`, cls: 'study-flow-subject-item-name' });
    addSubjectBtn.addEventListener('click', () => {
      this.close();
      new SubjectEditModal(this.app, this.plugin, null, async (newSub) => {
        if (!this.plugin.settings.subjects) {
          this.plugin.settings.subjects = [];
        }
        this.plugin.settings.subjects.push(newSub);
        await this.plugin.saveSettings();
        await this.onSelect(newSub);
      }).open();
    });

    // Footer
    const footer = contentEl.createDiv({ cls: 'study-flow-modal-footer' });
    const cancelBtn = footer.createEl('button', { text: t('common.cancel') });
    cancelBtn.addEventListener('click', () => this.close());
  }

  onClose(): void {
    const { contentEl } = this;
    contentEl.empty();
    if (this.previousActiveElement && typeof this.previousActiveElement.focus === 'function') {
      this.previousActiveElement.focus();
    }
  }
}
