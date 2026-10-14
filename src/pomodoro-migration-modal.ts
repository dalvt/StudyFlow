import { App, Modal, Notice } from 'obsidian';
import { t } from './i18n/index.ts';
import {
  FilePomodoroMigrationPreview,
  applyPomodoroLogMigrations,
} from './storage-migration.ts';

export class PomodoroLogMigrationModal extends Modal {
  private previews: FilePomodoroMigrationPreview[];
  private onComplete?: (migratedCount: number) => void;

  constructor(
    app: App,
    previews: FilePomodoroMigrationPreview[],
    onComplete?: (migratedCount: number) => void
  ) {
    super(app);
    this.previews = previews;
    this.onComplete = onComplete;
  }

  onOpen(): void {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.addClass('study-flow-modal');

    contentEl.createEl('h2', { text: t('migration.modalTitle') });

    const totalChanges = this.previews.reduce((acc, p) => acc + p.changes.length, 0);

    if (this.previews.length === 0) {
      contentEl.createEl('p', {
        text: t('migration.noLogsToMigrate'),
        cls: 'study-flow-migration-empty',
      });

      const footer = contentEl.createDiv({ cls: 'study-flow-modal-footer' });
      const closeBtn = footer.createEl('button', {
        text: t('common.close'),
        cls: 'study-flow-btn-secondary',
      });
      closeBtn.addEventListener('click', () => this.close());
      return;
    }

    contentEl.createEl('p', {
      text: t('migration.modalDesc', {
        files: this.previews.length,
        changes: totalChanges,
      }),
    });

    const previewContainer = contentEl.createDiv({
      cls: 'study-flow-migration-preview-list',
    });

    for (const item of this.previews) {
      const fileCard = previewContainer.createDiv({
        cls: 'study-flow-migration-file-group',
      });

      fileCard.createEl('div', {
        text: `📄 ${item.path} (${item.changes.length})`,
        cls: 'study-flow-migration-file-title',
      });

      const changesList = fileCard.createDiv({
        cls: 'study-flow-migration-changes-container',
      });

      for (const change of item.changes) {
        const row = changesList.createDiv({
          cls: 'study-flow-migration-diff-row',
        });

        row.createDiv({
          text: `- ${change.oldLine.trim()}`,
          cls: 'study-flow-migration-diff-old',
        });

        row.createDiv({
          text: `➔ ${change.newLine.trim()}`,
          cls: 'study-flow-migration-diff-new',
        });
      }
    }

    const footer = contentEl.createDiv({ cls: 'study-flow-modal-footer' });

    const cancelBtn = footer.createEl('button', {
      text: t('common.cancel'),
      cls: 'study-flow-btn-secondary',
    });
    cancelBtn.addEventListener('click', () => this.close());

    const applyBtn = footer.createEl('button', {
      text: t('migration.applyBtn'),
      cls: 'mod-cta',
    });
    applyBtn.addEventListener('click', async () => {
      applyBtn.disabled = true;
      try {
        const count = await applyPomodoroLogMigrations(this.app, this.previews);
        new Notice(t('migration.successNotice', { count }));
        if (this.onComplete) {
          this.onComplete(count);
        }
        this.close();
      } catch (err) {
        console.error('Study Flow: Error aplicando migración de Pomodoro', err);
        new Notice(t('migration.errorNotice'));
        applyBtn.disabled = false;
      }
    });
  }

  onClose(): void {
    this.contentEl.empty();
  }
}
