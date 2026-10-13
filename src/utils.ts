import { App, normalizePath, TFile } from 'obsidian';
import type { StudyFlowSettings } from './settings';
import { formatDailyNoteFileName } from './markdown-utils';

export * from './markdown-utils';
export * from './calendar-utils';

/**
 * Ensures a directory path exists within the vault.
 */
export async function ensureFolderExists(app: App, folderPath: string): Promise<void> {
  const normalized = normalizePath(folderPath.trim());
  if (!normalized || normalized === '.' || normalized === '/') {
    return;
  }

  const parts = normalized.split('/');
  let current = '';

  for (const part of parts) {
    if (!part) continue;
    current = current ? `${current}/${part}` : part;
    const file = app.vault.getAbstractFileByPath(current);
    if (!file) {
      await app.vault.createFolder(current);
    }
  }
}

/**
 * Retrieves an existing TFile or creates a new one with initial content.
 */
export async function getOrCreateFile(
  app: App,
  filePath: string,
  defaultContent: string = ''
): Promise<TFile> {
  const normalized = normalizePath(filePath.trim());
  const existing = app.vault.getAbstractFileByPath(normalized);

  if (existing instanceof TFile) {
    return existing;
  }

  const lastSlashIndex = normalized.lastIndexOf('/');
  if (lastSlashIndex !== -1) {
    const folder = normalized.substring(0, lastSlashIndex);
    await ensureFolderExists(app, folder);
  }

  return await app.vault.create(normalized, defaultContent);
}

/**
 * Returns formatted daily note path based on settings and offset from today,
 * or an explicit date string (YYYY-MM-DD) / Date object.
 */
export function getDailyNotePath(
  settings: StudyFlowSettings,
  targetDateOrOffset: number | string | Date = 0
): string {
  const momentFn = (
    window as unknown as {
      moment?: (d?: unknown) => {
        add: (n: number, u: string) => { format: (f: string) => string };
        format: (f: string) => string;
      };
    }
  ).moment;
  let fileName: string;

  if (typeof momentFn === 'function') {
    if (typeof targetDateOrOffset === 'number') {
      const m = momentFn();
      const formatted =
        targetDateOrOffset !== 0
          ? m.add(targetDateOrOffset, 'days').format(settings.dailyNoteDateFormat)
          : m.format(settings.dailyNoteDateFormat);
      fileName = formatted.endsWith('.md') ? formatted : `${formatted}.md`;
    } else {
      let targetDate: Date;
      if (typeof targetDateOrOffset === 'string') {
        const clean = targetDateOrOffset.replace(/\.md$/, '').trim();
        const parts = clean.split('-').map(Number);
        targetDate =
          parts.length === 3 && !parts.some(isNaN)
            ? new Date(parts[0], parts[1] - 1, parts[2])
            : new Date(clean);
      } else {
        targetDate = targetDateOrOffset;
      }
      const formatted = momentFn(targetDate).format(settings.dailyNoteDateFormat);
      fileName = formatted.endsWith('.md') ? formatted : `${formatted}.md`;
    }
  } else {
    fileName = formatDailyNoteFileName(settings.dailyNoteDateFormat, targetDateOrOffset);
  }

  const folder = settings.dailyNotesFolder.trim();
  if (!folder) {
    return fileName;
  }
  return `${folder}/${fileName}`;
}

/**
 * Automatically migrates root Inbox.md and Habits.md to StudyFlow/ folder
 * to maintain clean vault organization.
 */
export async function migratePluginFilesToDedicatedFolder(
  app: App,
  settings: StudyFlowSettings
): Promise<void> {
  try {
    const rootInbox = app.vault.getAbstractFileByPath('Inbox.md');
    const targetInboxPath = settings.inboxFilePath || 'StudyFlow/Inbox.md';

    if (rootInbox instanceof TFile && (targetInboxPath === 'Inbox.md' || targetInboxPath === 'StudyFlow/Inbox.md')) {
      await ensureFolderExists(app, 'StudyFlow');
      const newPath = 'StudyFlow/Inbox.md';
      const existingInTarget = app.vault.getAbstractFileByPath(newPath);
      if (!existingInTarget) {
        await app.fileManager.renameFile(rootInbox, newPath);
        settings.inboxFilePath = newPath;
      }
    }

    const rootHabits = app.vault.getAbstractFileByPath('Habits.md');
    const targetHabitsPath = settings.habitsFilePath || 'StudyFlow/Habits.md';

    if (rootHabits instanceof TFile && (targetHabitsPath === 'Habits.md' || targetHabitsPath === 'StudyFlow/Habits.md')) {
      await ensureFolderExists(app, 'StudyFlow');
      const newPath = 'StudyFlow/Habits.md';
      const existingInTarget = app.vault.getAbstractFileByPath(newPath);
      if (!existingInTarget) {
        await app.fileManager.renameFile(rootHabits, newPath);
        settings.habitsFilePath = newPath;
      }
    }

    if (settings.inboxFilePath === 'Inbox.md') {
      settings.inboxFilePath = 'StudyFlow/Inbox.md';
    }
    if (settings.habitsFilePath === 'Habits.md') {
      settings.habitsFilePath = 'StudyFlow/Habits.md';
    }
  } catch (err) {
    console.error('Study Flow: Error migrando archivos a la carpeta dedicada StudyFlow', err);
  }
}

