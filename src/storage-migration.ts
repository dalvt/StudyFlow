import { App, Notice, normalizePath, TFile } from 'obsidian';
import type StudyFlowPlugin from './main';
import type { FocusSessionRecord } from './analytics';
import { syncBlocksToMarkdown } from './markdown-utils.ts';
import { getDailyNotePath, getOrCreateFile } from './utils.ts';
import { t } from './i18n/index.ts';
import {
  SCHEMA_VERSION,
  SESSIONS_FILE_PATH,
  needsMigration,
  prepareMigrationData,
  parseSessionsFromJsonl,
  formatSessionsToJsonl,
} from './migration-utils.ts';
import {
  parsePomodoroLogLine,
  formatPomodoroLogLine,
} from './conventions.ts';

export * from './migration-utils.ts';

/**
 * Reads all sessions directly from the JSONL file in the vault.
 */
export async function loadFocusSessionsFromFile(
  app: App,
  filePath: string = SESSIONS_FILE_PATH
): Promise<FocusSessionRecord[]> {
  const normalized = normalizePath(filePath);
  const file = app.vault.getAbstractFileByPath(normalized);
  if (file instanceof TFile) {
    try {
      const content = await app.vault.read(file);
      return parseSessionsFromJsonl(content);
    } catch (err) {
      console.error('Study Flow: Error leyendo sesiones desde Sessions.jsonl', err);
    }
  }

  return [];
}

/**
 * Appends a new focus session record directly to Sessions.jsonl using vault.process.
 */
export async function appendFocusSessionToFile(
  app: App,
  session: FocusSessionRecord,
  filePath: string = SESSIONS_FILE_PATH
): Promise<void> {
  const normalized = normalizePath(filePath);
  const file = await getOrCreateFile(app, normalized, '');
  const line = JSON.stringify(session) + '\n';

  await app.vault.process(file, (content) => {
    return content.length === 0 || content.endsWith('\n')
      ? content + line
      : content + '\n' + line;
  });
}

/**
 * Updates an existing focus session record in Sessions.jsonl using vault.process.
 */
export async function updateFocusSessionInFile(
  app: App,
  session: FocusSessionRecord,
  filePath: string = SESSIONS_FILE_PATH
): Promise<void> {
  const normalized = normalizePath(filePath);
  const file = await getOrCreateFile(app, normalized, '');
  await app.vault.process(file, (content) => {
    const lines = content.split(/\r?\n/);
    let found = false;
    for (let i = 0; i < lines.length; i++) {
      const trimmed = lines[i].trim();
      if (!trimmed) continue;
      try {
        const parsed = JSON.parse(trimmed);
        if (parsed && parsed.id === session.id) {
          lines[i] = JSON.stringify(session);
          found = true;
          break;
        }
      } catch {}
    }
    if (!found) {
      lines.push(JSON.stringify(session));
    }
    return lines.filter(Boolean).join('\n') + '\n';
  });
}

/**
 * Executes one-time storage migration at plugin startup.
 * 1. Checks if schemaVersion < 2.
 * 2. Backs up data.json to data.json.bak.
 * 3. Migrates calendarBlocks to daily notes under ## Bloques de Tiempo.
 * 4. Migrates focusHistory to StudyFlow/Sessions.jsonl (no 1000 limit).
 * 5. Marks schemaVersion = 2 and removes legacy keys from data.json.
 */
export async function runStartupMigration(plugin: StudyFlowPlugin): Promise<boolean> {
  const rawData = (await plugin.loadData()) || {};
  if (!needsMigration(rawData)) {
    return false;
  }

  // 1. Create backup of data.json to data.json.bak
  try {
    const pluginDir = plugin.manifest.dir
      ? normalizePath(plugin.manifest.dir)
      : normalizePath(`${plugin.app.vault.configDir}/plugins/${plugin.manifest.id}`);
    const dataJsonPath = normalizePath(`${pluginDir}/data.json`);
    const backupJsonPath = normalizePath(`${pluginDir}/data.json.bak`);

    if (await plugin.app.vault.adapter.exists(dataJsonPath)) {
      const originalJson = await plugin.app.vault.adapter.read(dataJsonPath);
      await plugin.app.vault.adapter.write(backupJsonPath, originalJson);
    }
  } catch (backupErr) {
    console.error('Study Flow: Error creando copia de seguridad data.json.bak', backupErr);
  }

  const { calendarBlocks, sessions } = prepareMigrationData(rawData);

  // 2. Migrate calendarBlocks to daily notes
  for (const [dateStr, blocks] of Object.entries(calendarBlocks)) {
    if (!Array.isArray(blocks) || blocks.length === 0) continue;
    try {
      const dailyPath = getDailyNotePath(plugin.settings, dateStr);
      const file = await getOrCreateFile(plugin.app, dailyPath, `# ${dateStr}\n\n`);
      await plugin.app.vault.process(file, (content) => {
        return syncBlocksToMarkdown(content, blocks);
      });
    } catch (cbErr) {
      console.error(`Study Flow: Error migrando calendarBlocks para ${dateStr}`, cbErr);
    }
  }

  // 3. Migrate focusHistory to StudyFlow/Sessions.jsonl (no 1000 limit)
  if (Array.isArray(sessions) && sessions.length > 0) {
    try {
      const sessionsFile = await getOrCreateFile(plugin.app, SESSIONS_FILE_PATH, '');
      await plugin.app.vault.process(sessionsFile, (content) => {
        const existing = parseSessionsFromJsonl(content);
        const existingIds = new Set(existing.map((s) => s.id));
        const toAdd = sessions.filter((s) => s && s.id && !existingIds.has(s.id));
        if (toAdd.length === 0) return content;
        const newLines = toAdd.map((s) => JSON.stringify(s)).join('\n') + '\n';
        return content.length === 0 || content.endsWith('\n')
          ? content + newLines
          : content + '\n' + newLines;
      });
    } catch (sessErr) {
      console.error('Study Flow: Error migrando sesiones a Sessions.jsonl', sessErr);
    }
  }

  // 4. Update settings, mark schemaVersion and remove legacy keys from data.json
  delete (plugin.settings as any).calendarBlocks;
  delete (plugin.settings as any).focusHistory;
  plugin.settings.schemaVersion = SCHEMA_VERSION;
  await plugin.saveSettings();

  new Notice(t('migration.completedNotice'));
  return true;
}

import { extractTagsFromText } from './analytics.ts';
import type { StudyFlowSettings } from './settings.ts';

/**
 * Scans daily notes for past pomodoro logs and imports them into StudyFlow/Sessions.jsonl.
 */
export async function syncHistoricalSessionsFromVault(
  app: App,
  settings: StudyFlowSettings,
  plugin?: { focusSessions: FocusSessionRecord[] }
): Promise<number> {
  const files = app.vault.getMarkdownFiles();
  const existingSessions = await loadFocusSessionsFromFile(app);

  const existingKeys = new Set(
    existingSessions.map((s) => `${s.date}_${(s.taskText || '').trim()}_${s.durationMinutes}`)
  );
  let addedCount = 0;

  for (const file of files) {
    const dateMatch = file.basename.match(/^(\d{4}-\d{2}-\d{2})$/);
    if (!dateMatch) continue;
    const fileDate = dateMatch[1];

    try {
      const content = await app.vault.read(file);
      const lines = content.split(/\r?\n/);

      for (const line of lines) {
        const parsed = parsePomodoroLogLine(line);
        if (!parsed) continue;

        const timeStr = parsed.time || '12:00';
        const taskText = (parsed.taskText || '').trim();
        const duration = settings.pomodoroWorkDuration || 25;
        const key = `${fileDate}_${taskText}_${duration}`;

        if (!existingKeys.has(key)) {
          existingKeys.add(key);
          const [hh, mm] = timeStr.split(':').map(Number);
          const dateObj = new Date(`${fileDate}T${String(hh || 12).padStart(2, '0')}:${String(mm || 0).padStart(2, '0')}:00`);
          const timestamp = isNaN(dateObj.getTime()) ? new Date(fileDate).getTime() : dateObj.getTime();

          const newSession: FocusSessionRecord = {
            id: `imported-${timestamp}-${Math.random().toString(36).slice(2, 6)}`,
            timestamp,
            date: fileDate,
            durationMinutes: duration,
            taskText,
            tags: extractTagsFromText(taskText),
          };

          await appendFocusSessionToFile(app, newSession);
          existingSessions.push(newSession);
          addedCount++;
        }
      }
    } catch (err) {
      console.error(`Error leyendo nota diaria para sincronizar métricas: ${file.path}`, err);
    }
  }

  if (plugin) {
    plugin.focusSessions = existingSessions.sort((a, b) => a.timestamp - b.timestamp);
  }

  return addedCount;
}
