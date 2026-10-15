import { App, Modal, Setting, setIcon } from 'obsidian';
import type StudyFlowPlugin from './main';
import type { ActivePomodoroTask } from './pomodoro-state';
import type { FocusSessionRecord } from './analytics';
import { getDailyNotePath, getOrCreateFile, getLocalDateString } from './utils';
import { appendClosingNoteToDailyContent } from './markdown-utils';
import { updateFocusSessionInFile } from './storage-migration';
import { t } from './i18n/index.ts';

export class PomodoroClosingReviewModal extends Modal {
  private plugin: StudyFlowPlugin;
  private task: ActivePomodoroTask | null;
  private sessionRecord: FocusSessionRecord | null;
  private isCompleted: boolean = true;
  private accomplishedNote: string = '';
  private distractions: number = 0;
  private previousActiveElement: HTMLElement | null = null;

  constructor(
    app: App,
    plugin: StudyFlowPlugin,
    task: ActivePomodoroTask | null = null,
    sessionRecord: FocusSessionRecord | null = null
  ) {
    super(app);
    this.plugin = plugin;
    this.task = task;
    this.sessionRecord = sessionRecord;
  }

  onOpen(): void {
    this.previousActiveElement = document.activeElement as HTMLElement | null;
    const { contentEl } = this;
    contentEl.empty();
    contentEl.addClass('study-flow-modal', 'study-flow-task-check-modal');

    // Header
    const header = contentEl.createDiv({ cls: 'study-flow-modal-header' });
    const title = header.createEl('h2', { text: t('pomodoroReview.title') });
    const iconSpan = title.createSpan({ cls: 'study-flow-header-icon' });
    setIcon(iconSpan, 'check-circle');

    // If active task exists, show task banner and completion toggle
    if (this.task) {
      const isHabit = Boolean(this.task.id && this.task.id.startsWith('habit-'));
      const taskBanner = contentEl.createDiv({
        cls: `study-flow-active-task-banner ${isHabit ? 'study-flow-active-habit-banner' : ''}`,
      });
      const targetIcon = taskBanner.createSpan({ cls: 'study-flow-task-target-icon' });
      setIcon(targetIcon, isHabit ? 'flame' : 'target');
      const textWrap = taskBanner.createDiv({ cls: 'study-flow-task-banner-text' });
      textWrap.createSpan({
        text: isHabit ? t('pomodoro.habitLabel') : t('pomodoroCheck.taskLabel'),
        cls: 'study-flow-task-banner-label',
      });
      textWrap.createSpan({ text: this.task.text, cls: 'study-flow-task-banner-name' });

      new Setting(contentEl)
        .setName(t('pomodoroReview.taskCompleted'))
        .setDesc(t('pomodoroCheck.markCompletedDesc'))
        .addToggle((toggle) =>
          toggle.setValue(this.isCompleted).onChange((val) => {
            this.isCompleted = val;
          })
        );
    }

    // "¿Qué avanzaste?" (One-line progress summary)
    new Setting(contentEl)
      .setName(t('pomodoroReview.whatDidYouAccomplish'))
      .setDesc(t('pomodoroCheck.closingNoteDesc'))
      .addText((text) => {
        text
          .setPlaceholder(t('pomodoroReview.whatDidYouAccomplishPlaceholder'))
          .setValue(this.accomplishedNote)
          .onChange((val) => {
            this.accomplishedNote = val;
          });
        text.inputEl.addClass('study-flow-input-full');
      });

    // Distraction Counter Stepper
    const distractionSetting = new Setting(contentEl)
      .setName(t('pomodoroReview.distractionsCount'))
      .setDesc(t('pomodoroReview.distractionsDesc'));

    distractionSetting.addButton((btn) => {
      btn
        .setButtonText('−')
        .setClass('study-flow-stepper-btn')
        .setTooltip(t('pomodoroReview.decrease'))
        .onClick(() => {
          if (this.distractions > 0) {
            this.distractions--;
            countSpan.setText(String(this.distractions));
          }
        });
    });

    const countSpan = distractionSetting.controlEl.createSpan({
      text: String(this.distractions),
      cls: 'study-flow-counter-display',
    });

    distractionSetting.addButton((btn) => {
      btn
        .setButtonText('+')
        .setClass('study-flow-stepper-btn')
        .setTooltip(t('pomodoroReview.increase'))
        .onClick(() => {
          this.distractions++;
          countSpan.setText(String(this.distractions));
        });
    });

    // Action buttons
    const actionsRow = contentEl.createDiv({ cls: 'study-flow-modal-footer' });

    const cancelBtn = actionsRow.createEl('button', {
      text: t('pomodoroReview.skip'),
      cls: 'study-flow-btn-secondary',
    });
    cancelBtn.addEventListener('click', () => {
      this.close();
    });

    const saveBtn = actionsRow.createEl('button', {
      text: t('pomodoroReview.save'),
      cls: 'mod-cta',
    });
    saveBtn.addEventListener('click', async () => {
      await this.handleSubmit();
      this.close();
    });
  }

  private async handleSubmit(): Promise<void> {
    try {
      if (this.task && this.isCompleted) {
        await this.plugin.pomodoro.completeActiveTask();
      }

      const trimmedNote = this.accomplishedNote.trim();
      const hasDistractions = this.distractions > 0;

      // Update session record in memory and in Sessions.jsonl
      if (this.sessionRecord && (trimmedNote || hasDistractions)) {
        if (trimmedNote) {
          this.sessionRecord.notes = trimmedNote;
        }
        if (hasDistractions) {
          this.sessionRecord.distractions = this.distractions;
        }
        await updateFocusSessionInFile(this.app, this.sessionRecord);
      }

      // Append to daily note if enabled
      if (this.plugin.settings.logPomodoroToDailyNote && (trimmedNote || hasDistractions)) {
        const notePart = trimmedNote;
        const distPart = hasDistractions ? `${this.distractions} distracción(es)` : '';
        const combined = notePart && distPart ? `${notePart} · ${distPart}` : notePart || distPart;

        const now = new Date();
        const dailyPath = getDailyNotePath(this.plugin.settings, 0);
        const file = await getOrCreateFile(this.app, dailyPath, `# ${getLocalDateString(now)}\n\n`);

        await this.app.vault.process(file, (content) => {
          return appendClosingNoteToDailyContent(content, this.task?.text || '', combined);
        });
      }
    } catch (err) {
      console.error('Study Flow Assistant: Error procesando cierre de sesión de pomodoro', err);
    }
  }

  onClose(): void {
    const { contentEl } = this;
    contentEl.empty();
    if (this.previousActiveElement && typeof this.previousActiveElement.focus === 'function') {
      this.previousActiveElement.focus();
    }
  }
}

export const PomodoroTaskCheckModal = PomodoroClosingReviewModal;
