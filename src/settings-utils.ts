import type { CalendarTimeBlock } from './calendar-utils';
export type { CalendarTimeBlock };

export interface FocusSessionRecord {
  id: string;
  timestamp: number;
  date: string; // YYYY-MM-DD
  durationMinutes: number;
  taskText?: string;
  tags: string[];
  interrupted?: boolean;
}

export interface Subject {
  id: string;
  name: string;
  tag: string;
  color: string;
  weeklyGoalHours: number;
}

export interface StudyFlowSettings {
  schemaVersion: number;
  pomodoroWorkDuration: number;
  pomodoroBreakDuration: number;
  pomodoroLongBreakDuration: number;
  pomodoroLongBreakInterval: number;
  autoStartNextPhase: boolean;
  enableSystemNotifications: boolean;
  persistedPomodoro?: import('./pomodoro-state').PersistedPomodoroState | null;
  dailyNotesFolder: string;
  dailyNoteDateFormat: string;
  inboxFilePath: string;
  habitsFilePath: string;
  logPomodoroToDailyNote: boolean;
  enableChimeSound: boolean;
  chimeVolume: number;
  autoZenMode: boolean;
  tasksSectionHeader: string;
  iceboxSectionHeader: string;
  taskIncludedFolders: string[];
  taskExcludedFolders: string[];
  weekStartDay: 'monday' | 'sunday';
  language: 'es' | 'en' | 'auto';
  subjects: Subject[];
  weeklyReviewsFolder: string;
  weeklyReviewTemplate: string;
  /** @deprecated Moved to StudyFlow/Sessions.jsonl */
  focusHistory?: FocusSessionRecord[];
  /** @deprecated Moved to Daily Notes "## Bloques de Tiempo" */
  calendarBlocks?: Record<string, CalendarTimeBlock[]>;
}

import { t } from './i18n/index.ts';
import { DEFAULT_WEEKLY_REVIEW_TEMPLATE } from './weekly-review.ts';
export { DEFAULT_WEEKLY_REVIEW_TEMPLATE };

export const DEFAULT_SETTINGS: StudyFlowSettings = {
  schemaVersion: 2,
  pomodoroWorkDuration: 25,
  pomodoroBreakDuration: 5,
  pomodoroLongBreakDuration: 15,
  pomodoroLongBreakInterval: 4,
  autoStartNextPhase: false,
  enableSystemNotifications: false,
  persistedPomodoro: null,
  dailyNotesFolder: 'Daily',
  dailyNoteDateFormat: 'YYYY-MM-DD',
  inboxFilePath: 'StudyFlow/Inbox.md',
  habitsFilePath: 'StudyFlow/Habits.md',
  logPomodoroToDailyNote: true,
  enableChimeSound: true,
  chimeVolume: 0.7,
  autoZenMode: false,
  tasksSectionHeader: '## Tareas',
  iceboxSectionHeader: '## Icebox',
  taskIncludedFolders: [],
  taskExcludedFolders: ['Templates', 'templates'],
  weekStartDay: 'monday',
  language: 'auto',
  subjects: [],
  weeklyReviewsFolder: 'StudyFlow/Reviews',
  weeklyReviewTemplate: DEFAULT_WEEKLY_REVIEW_TEMPLATE,
};

export interface SettingValidationResult {
  valid: boolean;
  value?: number;
  error?: string;
}

export function validateSettingNumber(
  raw: unknown,
  min: number,
  max: number,
  fieldName?: string
): SettingValidationResult {
  const name = fieldName || t('settings.validationDefaultField');
  if (raw === undefined || raw === null) {
    return { valid: false, error: t('settings.validationEmpty', { name }) };
  }
  const str = String(raw).trim();
  if (str === '') {
    return { valid: false, error: t('settings.validationEmpty', { name }) };
  }
  const num = Number(str);
  if (isNaN(num)) {
    return { valid: false, error: t('settings.validationNumber', { name }) };
  }
  if (!Number.isInteger(num)) {
    return { valid: false, error: t('settings.validationInteger', { name }) };
  }
  if (num < min || num > max) {
    return { valid: false, error: t('settings.validationRange', { name, min, max }) };
  }
  return { valid: true, value: num };
}
