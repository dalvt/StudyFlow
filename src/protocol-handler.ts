import { type App, Notice } from 'obsidian';
import type StudyFlowPlugin from './main';
import { getOrCreateFile } from './utils';
import { appendTaskToMarkdownSection } from './markdown-utils';
import { QuickCaptureModal } from './tasks';
import { t } from './i18n/index.ts';
import {
  parseProtocolAction,
  type ProtocolAction,
  type ParsedProtocolParams,
} from './protocol-utils';

export { parseProtocolAction, ProtocolAction, ParsedProtocolParams };

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
    case 'capture': {
      if (parsed.text) {
        await quickCaptureTaskText(plugin.app, plugin, parsed.text);
        new Notice(t('protocol.taskCapturedNotice', { text: parsed.text }));
      } else {
        new QuickCaptureModal(plugin.app, plugin).open();
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
