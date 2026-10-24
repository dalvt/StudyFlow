import { type App, Notice } from 'obsidian';
import type StudyFlowPlugin from './main';
import type { ActiveTab } from './ui/types.ts';
import { getOrCreateFile } from './utils.ts';
import {
  appendTaskToMarkdownSection,
  extractAllTasksFromContent,
} from './markdown-utils.ts';
import { TaskCreateModal } from './task-modal.ts';
import { t } from './i18n/index.ts';
import {
  parseProtocolAction,
  type ProtocolAction,
  type ParsedProtocolParams,
} from './protocol-utils.ts';

export { parseProtocolAction, type ProtocolAction, type ParsedProtocolParams };

/**
 * Appends a task to the Inbox via quick capture without opening the UI modal.
 */
export async function quickCaptureTaskText(
  app: App,
  plugin: StudyFlowPlugin,
  text: string
): Promise<void> {
  const inboxPath = plugin.settings.inboxFilePath || 'StudyFlow/Inbox.md';
  const tasksHeader = plugin.settings.tasksSectionHeader || '## Tareas';
  const iceboxHeader = plugin.settings.iceboxSectionHeader || '## Icebox';

  const defaultContent = `# Inbox\n\n${tasksHeader}\n\n${iceboxHeader}\n\n`;
  const file = await getOrCreateFile(app, inboxPath, defaultContent);

  await app.vault.process(file, (content) => {
    return appendTaskToMarkdownSection(content, text, tasksHeader);
  });

  if (plugin.taskIndex) {
    void plugin.taskIndex.indexFile(file);
  }
}

/**
 * Handles incoming Obsidian Protocol actions for 'study-flow'.
 */
export async function handleStudyFlowProtocol(
  plugin: StudyFlowPlugin,
  params: Record<string, string>
): Promise<void> {
  const parsed = parseProtocolAction(params);

  switch (parsed.action) {
    case 'start': {
      if (parsed.task) {
        const inboxPath = plugin.settings.inboxFilePath || 'StudyFlow/Inbox.md';
        const tasksHeader = plugin.settings.tasksSectionHeader || '## Tareas';
        const iceboxHeader = plugin.settings.iceboxSectionHeader || '## Icebox';

        const defaultContent = `# Inbox\n\n${tasksHeader}\n\n${iceboxHeader}\n\n`;
        const file = await getOrCreateFile(plugin.app, inboxPath, defaultContent);

        const content = await plugin.app.vault.read(file);
        const existingTasks = extractAllTasksFromContent(content, inboxPath);
        const taskExists = existingTasks.some(
          (t) => t.text.trim().toLowerCase() === parsed.task!.trim().toLowerCase()
        );

        if (!taskExists) {
          await plugin.app.vault.process(file, (c) => {
            return appendTaskToMarkdownSection(c, parsed.task!, tasksHeader);
          });
          if (plugin.taskIndex) {
            void plugin.taskIndex.indexFile(file);
          }
        }

        await plugin.pomodoro.setActiveTask({
          id: `protocol#${parsed.task}`,
          text: parsed.task,
          sourceFile: inboxPath,
        });
      }

      if (parsed.subject) {
        const needle = parsed.subject.toLowerCase().replace(/^#/, '');
        const sub = (plugin.settings.subjects || []).find(
          (s) => s.name.toLowerCase() === needle || s.tag.toLowerCase().replace(/^#/, '') === needle
        );
        if (sub) {
          await plugin.pomodoro.setActiveSubject(sub);
        }
      }

      if (plugin.pomodoro.getStatus().state === 'running') {
        new Notice(t('protocol.timerAlreadyRunning'));
      } else {
        await plugin.pomodoro.start();
        new Notice(t('protocol.timerStartedNotice'));
      }
      break;
    }
    case 'pause': {
      if (plugin.pomodoro.getStatus().state === 'running') {
        await plugin.pomodoro.pause();
        new Notice(t('protocol.timerPausedNotice'));
      } else {
        new Notice(t('protocol.timerNotRunning'));
      }
      break;
    }
    case 'reset': {
      await plugin.pomodoro.reset();
      new Notice(t('protocol.timerResetNotice'));
      break;
    }
    case 'skip': {
      await plugin.pomodoro.skipCycle();
      new Notice(t('protocol.timerSkippedNotice'));
      break;
    }
    case 'previous': {
      await plugin.pomodoro.previousCycle();
      new Notice(t('protocol.timerPreviousNotice'));
      break;
    }
    case 'complete-task': {
      const activeTask = plugin.pomodoro.getActiveTask();
      if (activeTask) {
        const completed = await plugin.pomodoro.completeActiveTask();
        if (!completed) {
          new Notice(t('pomodoro.taskCompleteError'));
        }
      } else {
        new Notice(t('protocol.noActiveTaskNotice'));
      }
      break;
    }
    case 'open': {
      const validTabs: ActiveTab[] = ['today', 'pomodoro', 'calendar', 'tasks', 'habits', 'analytics'];
      const targetTab = (parsed.tab && validTabs.includes(parsed.tab.toLowerCase() as ActiveTab))
        ? (parsed.tab.toLowerCase() as ActiveTab)
        : 'today';
      await plugin.activateView(true, targetTab);
      new Notice(t('protocol.tabOpenedNotice', { tab: targetTab }));
      break;
    }
    case 'capture': {
      if (parsed.text) {
        await quickCaptureTaskText(plugin.app, plugin, parsed.text);
        new Notice(t('protocol.taskCapturedNotice', { text: parsed.text }));
      } else {
        new TaskCreateModal(plugin.app, plugin).open();
      }
      break;
    }

    default: {
      console.warn('Study Flow Protocol: Acción no reconocida', params);
      new Notice(t('protocol.unknownActionNotice'));
      break;
    }
  }
}
