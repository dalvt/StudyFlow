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
  notes?: string;
  distractions?: number;
}

export type PomodoroSoundType = 'bell' | 'soft' | 'click' | 'silent';

export interface PomodoroPreset {
  id: string;
  name: string;
  workMinutes: number;
  breakMinutes: number;
  isCustom?: boolean;
}

export const DEFAULT_POMODORO_PRESETS: PomodoroPreset[] = [
  { id: '25-5', name: '25 / 5', workMinutes: 25, breakMinutes: 5 },
  { id: '50-10', name: '50 / 10', workMinutes: 50, breakMinutes: 10 },
  { id: '90-20', name: '90 / 20', workMinutes: 90, breakMinutes: 20 },
];

export interface Subject {
  id: string;
  name: string;
  tag: string;
  color: string;
  weeklyGoalHours: number;
}

export interface TodayTabSectionsConfig {
  showNowNext: boolean;
  showTodayTasks: boolean;
  showHabits: boolean;
  showSpacedRepetition: boolean;
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
  pomodoroPresets: PomodoroPreset[];
  pomodoroSound: PomodoroSoundType;
  enableSessionClosingReview: boolean;
  enableBreakTips: boolean;
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
  timeBlocksSectionHeader: string;
  spacedRepetitionTag: string;
  spacedRepetitionNextKey: string;
  spacedRepetitionIntervalKey: string;
  spacedRepetitionReviewedKey: string;
  taskIncludedFolders: string[];
  taskExcludedFolders: string[];
  weekStartDay: 'monday' | 'sunday';
  language: 'es' | 'en' | 'auto';
  subjects: Subject[];
  todaySections?: TodayTabSectionsConfig;
  calendarStartHour: number;
  calendarEndHour: number;
  scheduleFilePath: string;
  /** @deprecated Moved to StudyFlow/Sessions.jsonl */
  focusHistory?: FocusSessionRecord[];
  /** @deprecated Moved to Daily Notes "## Bloques de Tiempo" */
  calendarBlocks?: Record<string, CalendarTimeBlock[]>;
}

import { t } from './i18n/index.ts';
import {
  DEFAULT_TASKS_HEADER_ES,
  DEFAULT_ICEBOX_HEADER_ES,
  DEFAULT_TIME_BLOCKS_HEADER_ES,
  DEFAULT_SPACED_TAG_ES,
  DEFAULT_SPACED_NEXT_KEY_ES,
  DEFAULT_SPACED_INTERVAL_KEY_ES,
  DEFAULT_SPACED_REVIEWED_KEY_ES,
  getDefaultConventions,
  type SupportedConventionLanguage,
} from './conventions.ts';

export const DEFAULT_SETTINGS: StudyFlowSettings = {
  schemaVersion: 2,
  pomodoroWorkDuration: 25,
  pomodoroBreakDuration: 5,
  pomodoroLongBreakDuration: 15,
  pomodoroLongBreakInterval: 4,
  autoStartNextPhase: false,
  enableSystemNotifications: false,
  persistedPomodoro: null,
  pomodoroPresets: [...DEFAULT_POMODORO_PRESETS],
  pomodoroSound: 'bell',
  enableSessionClosingReview: true,
  enableBreakTips: true,
  dailyNotesFolder: 'StudyFlow/Daily',
  dailyNoteDateFormat: 'YYYY-MM-DD',
  inboxFilePath: 'StudyFlow/Inbox.md',
  habitsFilePath: 'StudyFlow/Habits.md',
  scheduleFilePath: 'StudyFlow/Schedule.md',
  logPomodoroToDailyNote: true,
  enableChimeSound: true,
  chimeVolume: 0.7,
  autoZenMode: false,
  tasksSectionHeader: DEFAULT_TASKS_HEADER_ES,
  iceboxSectionHeader: DEFAULT_ICEBOX_HEADER_ES,
  timeBlocksSectionHeader: DEFAULT_TIME_BLOCKS_HEADER_ES,
  spacedRepetitionTag: DEFAULT_SPACED_TAG_ES,
  spacedRepetitionNextKey: DEFAULT_SPACED_NEXT_KEY_ES,
  spacedRepetitionIntervalKey: DEFAULT_SPACED_INTERVAL_KEY_ES,
  spacedRepetitionReviewedKey: DEFAULT_SPACED_REVIEWED_KEY_ES,
  taskIncludedFolders: [],
  taskExcludedFolders: ['Templates', 'templates'],
  weekStartDay: 'monday',
  language: 'auto',
  subjects: [],
  calendarStartHour: 7,
  calendarEndHour: 22,
  todaySections: {
    showNowNext: true,
    showTodayTasks: true,
    showHabits: true,
    showSpacedRepetition: true,
  },
};


export function cloneDefaultSettings(lang?: SupportedConventionLanguage): StudyFlowSettings {
  const base = JSON.parse(JSON.stringify(DEFAULT_SETTINGS)) as StudyFlowSettings;
  if (lang) {
    const conv = getDefaultConventions(lang);
    Object.assign(base, conv);
  }
  return base;
}

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
  if (typeof raw === 'object') {
    return { valid: false, error: t('settings.validationNumber', { name }) };
  }
  const str = typeof raw === 'string' ? raw.trim() : (typeof raw === 'number' || typeof raw === 'boolean' ? String(raw).trim() : '');
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
