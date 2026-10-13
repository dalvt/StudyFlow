import { App, Modal, Setting, setIcon } from 'obsidian';
import type StudyFlowPlugin from './main';
import type { ActivePomodoroTask } from './pomodoro-state';
import { getDailyNotePath, getOrCreateFile, getLocalDateString } from './utils';
import { appendClosingNoteToDailyContent } from './markdown-utils';
import { t } from './i18n/index.ts';

export class PomodoroTaskCheckModal extends Modal {
  private plugin: StudyFlowPlugin;
  private task: ActivePomodoroTask;
  private isCompleted: boolean = true;
  private closingNote: string = '';

  constructor(app: App, plugin: StudyFlowPlugin, task: ActivePomodoroTask) {
    super(app);
    this.plugin = plugin;
    this.task = task;
  }

  onOpen(): void {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.addClass('study-flow-modal', 'study-flow-task-check-modal');

    // Header
    const header = contentEl.createDiv({ cls: 'study-flow-modal-header' });
    const title = header.createEl('h2', { text: t('pomodoroCheck.title') });
    const iconSpan = title.createSpan({ cls: 'study-flow-header-icon' });
    setIcon(iconSpan, 'check-circle');

    // Task info banner
    const taskBanner = contentEl.createDiv({ cls: 'study-flow-active-task-banner' });
    const targetIcon = taskBanner.createSpan({ cls: 'study-flow-task-target-icon' });
    setIcon(targetIcon, 'target');
    const textWrap = taskBanner.createDiv({ cls: 'study-flow-task-banner-text' });
    textWrap.createSpan({ text: t('pomodoroCheck.taskLabel'), cls: 'study-flow-task-banner-label' });
    textWrap.createSpan({ text: this.task.text, cls: 'study-flow-task-banner-name' });

    // Completed toggle
    new Setting(contentEl)
      .setName(t('pomodoroCheck.markCompletedName'))
      .setDesc(t('pomodoroCheck.markCompletedDesc'))
      .addToggle((toggle) =>
        toggle.setValue(this.isCompleted).onChange((val) => {
          this.isCompleted = val;
        })
      );

    // Closing note
    new Setting(contentEl)
      .setName(t('pomodoroCheck.closingNoteName'))
      .setDesc(t('pomodoroCheck.closingNoteDesc'))
      .addTextArea((text) => {
        text
          .setPlaceholder(t('pomodoroCheck.closingNotePlaceholder'))
          .setValue(this.closingNote)
          .onChange((val) => {
            this.closingNote = val;
          });
        text.inputEl.rows = 3;
        text.inputEl.addClass('study-flow-full-textarea');
      });

    // Action buttons
    const actionsRow = contentEl.createDiv({ cls: 'study-flow-modal-footer' });

    const cancelBtn = actionsRow.createEl('button', {
      text: t('pomodoroCheck.skip'),
      cls: 'study-flow-btn-secondary',
    });
    cancelBtn.addEventListener('click', () => {
      this.close();
    });

    const saveBtn = actionsRow.createEl('button', {
      text: t('common.save'),
      cls: 'mod-cta',
    });
    saveBtn.addEventListener('click', async () => {
      await this.handleSubmit();
      this.close();
    });
  }

  private async handleSubmit(): Promise<void> {
    try {
      if (this.isCompleted) {
        await this.plugin.pomodoro.completeActiveTask();
      }

      const trimmedNote = this.closingNote.trim();
      if (trimmedNote) {
        const now = new Date();
        const dailyPath = getDailyNotePath(this.plugin.settings, 0);
        const file = await getOrCreateFile(this.app, dailyPath, `# ${getLocalDateString(now)}\n\n`);

        await this.app.vault.process(file, (content) => {
          return appendClosingNoteToDailyContent(content, this.task.text, trimmedNote);
        });
      }
    } catch (err) {
      console.error('Study Flow Assistant: Error procesando cierre de tarea pomodoro', err);
    }
  }

  onClose(): void {
    const { contentEl } = this;
    contentEl.empty();
  }
}
