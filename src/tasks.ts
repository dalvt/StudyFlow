import { App, Modal, Notice, setIcon, Setting, TFile } from 'obsidian';
import type StudyFlowPlugin from './main';
import {
  appendTaskToMarkdownSection,
  calculateDaysRemaining,
  formatDeadlineHuman,
  formatTaskWithDeadline,
  formatTaskWithPomodoroEstimate,
  formatTaskWithPriority,
  getOrCreateFile,
  parseTaskDeadline,
  parseTaskPomodoroEstimate,
  parseTaskPriority,
  PendingTaskItem,
  extractTagsFromText,
  TaskPriority,
} from './utils';

import {
  SubtaskItem,
  TaskRecord,
  TaskLocator,
  TaskMutationAction,
  TaskMutationOptions,
  TaskMutationResult,
  compareTasksByPriority,
  extractAllTasksFromContent,
  computeLineHash,
  locateTaskLineIndex,
  mutateTaskLineInContent,
} from './markdown-utils';

export type {
  SubtaskItem,
  TaskRecord,
  TaskLocator,
  TaskMutationAction,
  TaskMutationOptions,
  TaskMutationResult,
};
export {
  compareTasksByPriority,
  extractAllTasksFromContent,
  computeLineHash,
  locateTaskLineIndex,
  mutateTaskLineInContent,
};

/**
 * Unified task mutation function using Obsidian's vault.process() with a robust locator:
 * 1. Checks line position + hash
 * 2. Falls back to unique exact match
 * 3. Aborts with a Notice if ambiguous (> 1 match) or not found
 */
import { t } from './i18n/index.ts';

export async function mutateTaskLine(
  app: App,
  locator: TaskLocator,
  options: TaskMutationOptions
): Promise<TaskMutationResult> {
  const file = app.vault.getAbstractFileByPath(locator.sourceFile);
  if (!(file instanceof TFile)) {
    new Notice(t('tasks.fileNotFound', { file: locator.sourceFile }));
    return { updatedContent: '', success: false, error: 'not_found' };
  }

  let mutationResult: TaskMutationResult = { updatedContent: '', success: false };
  await app.vault.process(file, (content) => {
    mutationResult = mutateTaskLineInContent(content, locator, options);
    if (!mutationResult.success) {
      if (mutationResult.error === 'ambiguous') {
        new Notice(t('tasks.ambiguityNotice'));
      } else if (mutationResult.error === 'not_found') {
        new Notice(t('tasks.taskNotFoundNotice'));
      }
      return content;
    }
    return mutationResult.updatedContent;
  });

  return mutationResult;
}

export async function incrementTaskPomodoroInFile(
  app: App,
  task: TaskLocator | { sourceFile: string; text: string }
): Promise<{ updatedText: string } | null> {
  const res = await mutateTaskLine(app, task as TaskLocator, { action: 'increment' });
  return res.success && res.updatedText ? { updatedText: res.updatedText } : null;
}

export async function decrementTaskPomodoroInFile(
  app: App,
  task: TaskLocator | { sourceFile: string; text: string }
): Promise<{ updatedText: string } | null> {
  const res = await mutateTaskLine(app, task as TaskLocator, { action: 'decrement' });
  return res.success && res.updatedText ? { updatedText: res.updatedText } : null;
}

export async function promoteIdeaToTaskInFile(
  app: App,
  task: TaskRecord | TaskLocator,
  tasksSectionHeader?: string
): Promise<boolean> {
  const priority = ('priority' in task && task.priority) ? task.priority : 'none';
  const res = await mutateTaskLine(app, task as TaskLocator, {
    action: 'promote',
    priority,
    tasksSectionHeader,
  });
  return res.success;
}

export async function toggleTaskCompletionInFile(
  app: App,
  task: TaskLocator | { sourceFile: string; text: string },
  newCompleted?: boolean
): Promise<boolean> {
  const res = await mutateTaskLine(app, task as TaskLocator, {
    action: 'toggle',
    completed: newCompleted,
  });
  return res.success;
}

export async function updateTaskTextInFile(
  app: App,
  task: TaskLocator | { sourceFile: string; text: string },
  newText: string
): Promise<boolean> {
  const res = await mutateTaskLine(app, task as TaskLocator, { action: 'update', newText });
  return res.success;
}

export async function toggleSubtaskInFile(
  app: App,
  sourceFileOrLocator: string | TaskLocator,
  subtaskText?: string,
  newCompleted?: boolean
): Promise<boolean> {
  const locator: TaskLocator = typeof sourceFileOrLocator === 'string'
    ? { sourceFile: sourceFileOrLocator, text: subtaskText }
    : sourceFileOrLocator;
  const res = await mutateTaskLine(app, locator, {
    action: 'subtask',
    subtaskAction: 'toggle',
    subtaskText: locator.text || subtaskText,
    completed: newCompleted,
  });
  return res.success;
}

export async function addSubtaskToFile(
  app: App,
  task: TaskLocator | { sourceFile: string; text: string },
  subtaskText: string
): Promise<boolean> {
  const res = await mutateTaskLine(app, task as TaskLocator, {
    action: 'subtask',
    subtaskAction: 'add',
    subtaskText,
  });
  return res.success;
}

export async function deleteTaskFromFile(
  app: App,
  task: TaskLocator | { sourceFile: string; text: string }
): Promise<boolean> {
  const res = await mutateTaskLine(app, task as TaskLocator, { action: 'delete' });
  return res.success;
}

export class QuickCaptureModal extends Modal {
  private plugin: StudyFlowPlugin;
  private taskText: string = '';
  private itemType: 'task' | 'idea' = 'task';
  private targetDestination: 'inbox' | 'activeNote' = 'inbox';
  private selectedPriority: TaskPriority = 'none';
  private selectedEstimate: number = 0;
  private selectedDeadline: string = '';

  constructor(app: App, plugin: StudyFlowPlugin) {
    super(app);
    this.plugin = plugin;
  }

  onOpen(): void {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.addClass('study-flow-modal', 'study-flow-quick-capture');

    const header = contentEl.createDiv({ cls: 'study-flow-modal-header' });
    const title = header.createEl('h2', { text: t('tasks.quickCaptureTitle') });
    const iconSpan = title.createSpan({ cls: 'study-flow-header-icon' });
    setIcon(iconSpan, 'zap');

    const activeFile = this.app.workspace.getActiveFile();
    const canUseActiveFile = activeFile !== null && activeFile.extension === 'md';

    let prioritySetting: Setting | null = null;
    let estimateSetting: Setting | null = null;
    let deadlineSetting: Setting | null = null;

    new Setting(contentEl)
      .setName(t('tasks.entryTypeName'))
      .setDesc(t('tasks.entryTypeDesc'))
      .addDropdown((drop) => {
        drop.addOption('task', t('tasks.actionableTask'));
        drop.addOption('idea', t('tasks.spontaneousIdea'));
        drop.setValue('task');
        drop.onChange((val) => {
          this.itemType = val as 'task' | 'idea';
          if (prioritySetting) {
            prioritySetting.settingEl.style.display = this.itemType === 'idea' ? 'none' : '';
          }
          if (estimateSetting) {
            estimateSetting.settingEl.style.display = this.itemType === 'idea' ? 'none' : '';
          }
          if (deadlineSetting) {
            deadlineSetting.settingEl.style.display = this.itemType === 'idea' ? 'none' : '';
          }
        });
      });

    new Setting(contentEl)
      .setName(t('tasks.saveInName'))
      .setDesc(t('tasks.saveInDesc'))
      .addDropdown((drop) => {
        drop.addOption('inbox', t('tasks.inboxOption', { path: this.plugin.settings.inboxFilePath }));
        if (canUseActiveFile && activeFile) {
          drop.addOption('activeNote', t('tasks.activeNoteOption', { name: activeFile.basename }));
        }
        drop.setValue('inbox');
        drop.onChange((val) => {
          this.targetDestination = val as 'inbox' | 'activeNote';
        });
      });

    prioritySetting = new Setting(contentEl)
      .setName(t('tasks.priorityName'))
      .setDesc(t('tasks.priorityDesc'))
      .addDropdown((drop) => {
        drop.addOption('none', t('priority.none'));
        drop.addOption('high', t('priority.highUrgent'));
        drop.addOption('medium', t('priority.medium'));
        drop.addOption('low', t('priority.low'));
        drop.setValue('none');
        drop.onChange((val) => {
          this.selectedPriority = val as TaskPriority;
        });
      });

    estimateSetting = new Setting(contentEl)
      .setName(t('tasks.estimateName'))
      .setDesc(t('tasks.estimateDesc'))
      .addDropdown((drop) => {
        drop.addOption('0', t('tasks.unestimated'));
        drop.addOption('1', t('tasks.onePomodoro'));
        drop.addOption('2', t('tasks.twoPomodoros'));
        drop.addOption('3', t('tasks.threePomodoros'));
        drop.addOption('4', t('tasks.fourPomodoros'));
        drop.addOption('5', t('tasks.fivePomodoros'));
        drop.addOption('6', t('tasks.sixPomodoros'));
        drop.setValue(String(this.selectedEstimate));
        drop.onChange((val) => {
          this.selectedEstimate = parseInt(val, 10) || 0;
        });
      });

    deadlineSetting = new Setting(contentEl)
      .setName(t('tasks.deadlineName'))
      .setDesc(t('tasks.deadlineDesc'))
      .addText((text) => {
        text.inputEl.type = 'date';
        text.onChange((val) => {
          this.selectedDeadline = val.trim();
        });
      });

    const inputWrap = contentEl.createDiv({ cls: 'study-flow-input-wrap' });
    const inputEl = inputWrap.createEl('input', {
      type: 'text',
      cls: 'study-flow-task-input study-flow-input-lg',
      placeholder: t('tasks.quickCapturePlaceholder'),
    });

    inputEl.focus();

    inputEl.addEventListener('keydown', async (evt: KeyboardEvent) => {
      if (evt.key === 'Enter') {
        evt.preventDefault();
        this.taskText = inputEl.value.trim();
        await this.submitTask();
      }
    });

    const footer = contentEl.createDiv({ cls: 'study-flow-modal-footer' });
    footer.createEl('span', {
      text: t('tasks.quickCaptureShortcutHint'),
      cls: 'study-flow-shortcut-hint',
    });

    const cancelBtn = footer.createEl('button', { text: t('common.cancel') });
    cancelBtn.addEventListener('click', () => this.close());

    const submitBtn = footer.createEl('button', {
      cls: 'mod-cta',
    });
    const subIcon = submitBtn.createSpan();
    setIcon(subIcon, 'plus');
    submitBtn.createSpan({ text: t('common.add') });
    submitBtn.addEventListener('click', async () => {
      this.taskText = inputEl.value.trim();
      await this.submitTask();
    });
  }

  onClose(): void {
    const { contentEl } = this;
    contentEl.empty();
  }

  private async submitTask(): Promise<void> {
    if (!this.taskText) {
      new Notice(t('tasks.enterTextToSave'));
      return;
    }

    try {
      let targetFile: TFile | null = null;
      let targetName = '';

      if (this.targetDestination === 'activeNote') {
        targetFile = this.app.workspace.getActiveFile();
        if (targetFile) {
          targetName = targetFile.basename;
        }
      }

      const tasksH = this.plugin.settings.tasksSectionHeader || '## Tareas';
      const iceboxH = this.plugin.settings.iceboxSectionHeader || '## Icebox';

      if (!targetFile) {
        const inboxPath = this.plugin.settings.inboxFilePath || 'StudyFlow/Inbox.md';
        targetFile = await getOrCreateFile(this.app, inboxPath, `# Inbox\n\n${tasksH}\n\n${iceboxH}\n\n`);
        targetName = targetFile.basename;
      }

      if (this.itemType === 'idea') {
        const ideaLine = this.taskText.startsWith('💡') ? this.taskText : `💡 ${this.taskText}`;
        await this.app.vault.process(targetFile, (content) => {
          return appendTaskToMarkdownSection(content, ideaLine, iceboxH);
        });
        new Notice(t('tasks.ideaSavedIn', { target: targetName }));
      } else {
        let finalText = this.selectedPriority !== 'none'
          ? formatTaskWithPriority(this.taskText, this.selectedPriority)
          : this.taskText;
        if (this.selectedEstimate > 0) {
          finalText = formatTaskWithPomodoroEstimate(finalText, this.selectedEstimate);
        }
        if (this.selectedDeadline) {
          finalText = formatTaskWithDeadline(finalText, this.selectedDeadline);
        }
        await this.app.vault.process(targetFile, (content) => {
          return appendTaskToMarkdownSection(content, finalText, tasksH);
        });
        new Notice(t('tasks.taskAddedTo', { target: targetName }));
      }

      this.close();
    } catch (err) {
      new Notice(t('tasks.saveError'));
    }
  }
}

