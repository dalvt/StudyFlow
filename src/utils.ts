import { App, normalizePath, TFile } from 'obsidian';
import type { StudyFlowSettings } from './settings';
import { formatDailyNoteFileName } from './markdown-utils';

export * from './markdown-utils';

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
 * Returns formatted daily note path based on settings and offset from today.
 * e.g. offsetDays = 0 for today, 1 for tomorrow.
 */
export function getDailyNotePath(
  settings: StudyFlowSettings,
  offsetDays: number = 0
): string {
  const momentFn = (window as unknown as { moment?: (d?: Date) => { add: (n: number, u: string) => { format: (f: string) => string }; format: (f: string) => string } }).moment;
  let fileName: string;

  if (typeof momentFn === 'function') {
    const m = momentFn();
    const formatted = offsetDays !== 0
      ? m.add(offsetDays, 'days').format(settings.dailyNoteDateFormat)
      : m.format(settings.dailyNoteDateFormat);
    fileName = formatted.endsWith('.md') ? formatted : `${formatted}.md`;
  } else {
    fileName = formatDailyNoteFileName(settings.dailyNoteDateFormat, offsetDays);
  }

  const folder = settings.dailyNotesFolder.trim();
  if (!folder) {
    return fileName;
  }
  return `${folder}/${fileName}`;
}
