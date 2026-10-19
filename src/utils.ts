import { App, normalizePath, TFile, moment } from 'obsidian';
import type { StudyFlowSettings } from './settings.ts';
import { formatDailyNoteFileName } from './markdown-utils.ts';

export * from './markdown-utils.ts';
export * from './calendar-utils.ts';


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
    if (!file && typeof app.vault.createFolder === 'function') {
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
  let fileName = '';

  if (typeof moment === 'function') {
    let formatted = '';
    if (typeof targetDateOrOffset === 'number') {
      const m = (moment as any)();
      formatted =
        targetDateOrOffset !== 0
          ? m.add(targetDateOrOffset, 'days').format(settings.dailyNoteDateFormat)
          : m.format(settings.dailyNoteDateFormat);
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
      formatted = (moment as any)(targetDate).format(settings.dailyNoteDateFormat);
    }
    if (formatted) {
      fileName = formatted.endsWith('.md') ? formatted : `${formatted}.md`;
    }
  }
  if (!fileName) {
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

    if (rootInbox instanceof TFile && targetInboxPath === 'Inbox.md') {
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

    if (rootHabits instanceof TFile && targetHabitsPath === 'Habits.md') {
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

    // 3. Migrate root Daily folder to StudyFlow/Daily only if settings explicitly target 'Daily'
    const rootDaily = app.vault.getAbstractFileByPath('Daily');
    const targetDailyPath = settings.dailyNotesFolder || 'StudyFlow/Daily';

    if (
      rootDaily &&
      !(rootDaily instanceof TFile) &&
      'children' in (rootDaily as any) &&
      targetDailyPath === 'Daily'
    ) {
      await ensureFolderExists(app, 'StudyFlow');
      const newFolderPath = 'StudyFlow/Daily';
      const existingInTarget = app.vault.getAbstractFileByPath(newFolderPath);

      if (!existingInTarget) {
        if (app.fileManager && typeof app.fileManager.renameFile === 'function') {
          await app.fileManager.renameFile(rootDaily as any, newFolderPath);
          settings.dailyNotesFolder = newFolderPath;
        }
      } else if ('children' in (existingInTarget as any)) {
        const children = [...(rootDaily as any).children];
        for (const child of children) {
          const destPath = `${newFolderPath}/${child.name}`;
          if (!app.vault.getAbstractFileByPath(destPath) && app.fileManager?.renameFile) {
            await app.fileManager.renameFile(child, destPath);
          }
        }
        if ((rootDaily as any).children.length === 0 && app.vault.delete) {
          await app.vault.delete(rootDaily as any);
        }
        settings.dailyNotesFolder = newFolderPath;
      }
    }

    if (settings.dailyNotesFolder === 'Daily') {
      settings.dailyNotesFolder = 'StudyFlow/Daily';
    }
  } catch (err) {
    console.error('Study Flow: Error migrando archivos a la carpeta dedicada StudyFlow', err);
  }
}

