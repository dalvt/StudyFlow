import { App, Notice, TFile } from 'obsidian';

import {
  type SubtaskItem,
  type TaskRecord,
  type TaskLocator,
  type TaskMutationAction,
  type TaskMutationOptions,
  type TaskMutationResult,
  compareTasksByPriority,
  extractAllTasksFromContent,
  computeLineHash,
  locateTaskLineIndex,
  mutateTaskLineInContent,
} from './markdown-utils.ts';

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
  const res = await mutateTaskLine(app, task, { action: 'increment' });
  return res.success && res.updatedText ? { updatedText: res.updatedText } : null;
}

export async function decrementTaskPomodoroInFile(
  app: App,
  task: TaskLocator | { sourceFile: string; text: string }
): Promise<{ updatedText: string } | null> {
  const res = await mutateTaskLine(app, task, { action: 'decrement' });
  return res.success && res.updatedText ? { updatedText: res.updatedText } : null;
}

export async function promoteIdeaToTaskInFile(
  app: App,
  task: TaskRecord | TaskLocator,
  tasksSectionHeader?: string
): Promise<boolean> {
  const priority = ('priority' in task && task.priority) ? task.priority : 'none';
  const res = await mutateTaskLine(app, task, {
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
  const res = await mutateTaskLine(app, task, {
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
  const res = await mutateTaskLine(app, task, { action: 'update', newText });
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
  const res = await mutateTaskLine(app, task, {
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
  const res = await mutateTaskLine(app, task, { action: 'delete' });
  return res.success;
}

