import type { FocusSessionRecord } from './analytics';
import type { CalendarTimeBlock } from './calendar-utils';

export const SCHEMA_VERSION = 2;
export const SESSIONS_FILE_PATH = 'StudyFlow/Sessions.jsonl';

/**
 * Parses a JSONL string into an array of FocusSessionRecord.
 * Tolerates empty lines and skips malformed JSON entries safely.
 */
export function parseSessionsFromJsonl(content: string): FocusSessionRecord[] {
  if (!content) return [];
  const lines = content.split(/\r?\n/);
  const sessions: FocusSessionRecord[] = [];

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    try {
      const parsed = JSON.parse(trimmed) as FocusSessionRecord;
      if (parsed && typeof parsed === 'object' && parsed.id && typeof parsed.timestamp === 'number') {
        sessions.push(parsed);
      }
    } catch {
      // Ignore unparseable lines to prevent data corruption cascades
    }
  }

  return sessions;
}

/**
 * Serializes an array of FocusSessionRecord into a JSONL formatted string.
 */
export function formatSessionsToJsonl(sessions: FocusSessionRecord[]): string {
  if (!sessions || sessions.length === 0) return '';
  return sessions.map((s) => JSON.stringify(s)).join('\n') + '\n';
}

/**
 * Determines if raw loaded data requires a storage migration to schemaVersion 3.
 */
export function needsMigration(rawData: Record<string, any> | null | undefined): boolean {
  if (!rawData || typeof rawData !== 'object' || Object.keys(rawData).length === 0) {
    return false;
  }
  const currentVersion = rawData.schemaVersion !== undefined ? Number(rawData.schemaVersion) : 1;
  return currentVersion < SCHEMA_VERSION;
}

/**
 * Pure helper to extract legacy data and clean settings object for schemaVersion 3.
 */
export function prepareMigrationData(rawData: Record<string, any>): {
  calendarBlocks: Record<string, CalendarTimeBlock[]>;
  sessions: FocusSessionRecord[];
  cleanedSettings: Record<string, any>;
} {
  const calendarBlocks = (rawData.calendarBlocks && typeof rawData.calendarBlocks === 'object'
    ? rawData.calendarBlocks
    : {}) as Record<string, CalendarTimeBlock[]>;

  const sessions = (Array.isArray(rawData.focusHistory)
    ? rawData.focusHistory
    : []) as FocusSessionRecord[];

  const cleanedSettings = Object.assign({}, rawData);
  delete cleanedSettings.calendarBlocks;
  delete cleanedSettings.focusHistory;
  cleanedSettings.schemaVersion = SCHEMA_VERSION;

  return {
    calendarBlocks,
    sessions,
    cleanedSettings,
  };
}
