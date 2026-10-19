export type SupportedConventionLanguage = 'es' | 'en';

export const DEFAULT_TASKS_HEADER_ES = '## Tareas';
export const DEFAULT_TASKS_HEADER_EN = '## Tasks';

export const DEFAULT_ICEBOX_HEADER_ES = '## Icebox';
export const DEFAULT_ICEBOX_HEADER_EN = '## Icebox';

export const DEFAULT_TIME_BLOCKS_HEADER_ES = '## Bloques de Tiempo';
export const DEFAULT_TIME_BLOCKS_HEADER_EN = '## Time Blocks';

export const DEFAULT_SPACED_TAG_ES = '#repasar';
export const DEFAULT_SPACED_TAG_EN = '#review';

export const DEFAULT_SPACED_NEXT_KEY_ES = 'repasar_siguiente';
export const DEFAULT_SPACED_NEXT_KEY_EN = 'review_next';

export const DEFAULT_SPACED_INTERVAL_KEY_ES = 'repasar_intervalo';
export const DEFAULT_SPACED_INTERVAL_KEY_EN = 'review_interval';

export const DEFAULT_SPACED_REVIEWED_KEY_ES = 'repasar_revisado';
export const DEFAULT_SPACED_REVIEWED_KEY_EN = 'review_last';

export interface ConventionsConfig {
  tasksSectionHeader: string;
  iceboxSectionHeader: string;
  timeBlocksSectionHeader: string;
  spacedRepetitionTag: string;
  spacedRepetitionNextKey: string;
  spacedRepetitionIntervalKey: string;
  spacedRepetitionReviewedKey: string;
}

export function getDefaultConventions(lang: SupportedConventionLanguage = 'es'): ConventionsConfig {
  if (lang === 'en') {
    return {
      tasksSectionHeader: DEFAULT_TASKS_HEADER_EN,
      iceboxSectionHeader: DEFAULT_ICEBOX_HEADER_EN,
      timeBlocksSectionHeader: DEFAULT_TIME_BLOCKS_HEADER_EN,
      spacedRepetitionTag: DEFAULT_SPACED_TAG_EN,
      spacedRepetitionNextKey: DEFAULT_SPACED_NEXT_KEY_EN,
      spacedRepetitionIntervalKey: DEFAULT_SPACED_INTERVAL_KEY_EN,
      spacedRepetitionReviewedKey: DEFAULT_SPACED_REVIEWED_KEY_EN,
    };
  }

  return {
    tasksSectionHeader: DEFAULT_TASKS_HEADER_ES,
    iceboxSectionHeader: DEFAULT_ICEBOX_HEADER_ES,
    timeBlocksSectionHeader: DEFAULT_TIME_BLOCKS_HEADER_ES,
    spacedRepetitionTag: DEFAULT_SPACED_TAG_ES,
    spacedRepetitionNextKey: DEFAULT_SPACED_NEXT_KEY_ES,
    spacedRepetitionIntervalKey: DEFAULT_SPACED_INTERVAL_KEY_ES,
    spacedRepetitionReviewedKey: DEFAULT_SPACED_REVIEWED_KEY_ES,
  };
}

/**
 * Normalizes a header string by removing markdown heading hashes and lowercasing.
 */
export function normalizeHeaderTitle(header: string): string {
  return header.replace(/^#+\s*/, '').trim().toLowerCase();
}

/**
 * Checks if a heading title matches the tasks section in either language or custom setting.
 */
export function isTasksSection(headingTitle: string, userConfiguredHeader?: string): boolean {
  const norm = normalizeHeaderTitle(headingTitle);
  if (userConfiguredHeader && norm === normalizeHeaderTitle(userConfiguredHeader)) {
    return true;
  }
  return norm === 'tareas' || norm === 'tasks';
}

/**
 * Checks if a heading title matches the icebox section in either language or custom setting.
 */
export function isIceboxSectionHeader(headingTitle: string, userConfiguredHeader?: string): boolean {
  const norm = normalizeHeaderTitle(headingTitle);
  if (userConfiguredHeader && norm === normalizeHeaderTitle(userConfiguredHeader)) {
    return true;
  }
  return norm === 'icebox' || norm === 'ideas';
}

/**
 * Checks if a heading title matches the time blocks section in either language or custom setting.
 */
export function isTimeBlocksSection(headingTitle: string, userConfiguredHeader?: string): boolean {
  const norm = normalizeHeaderTitle(headingTitle);
  if (userConfiguredHeader && norm === normalizeHeaderTitle(userConfiguredHeader)) {
    return true;
  }
  return norm === 'bloques de tiempo' || norm === 'time blocks';
}

/**
 * Formats a Pomodoro log line in the new bullet format:
 * - 🍅 HH:mm · task · subject
 */
export function formatPomodoroLogLine(
  timeStr: string,
  taskText?: string,
  subjectNameOrTag?: string
): string {
  const parts: string[] = [timeStr.trim()];
  const cleanTask = taskText ? taskText.trim() : '';
  const cleanSubject = subjectNameOrTag ? subjectNameOrTag.trim() : '';

  if (cleanTask) {
    parts.push(cleanTask);
  }
  if (cleanSubject && cleanSubject !== cleanTask) {
    parts.push(cleanSubject);
  }

  return `- 🍅 ${parts.join(' · ')}`;
}

export interface ParsedPomodoroLog {
  time: string; // HH:mm
  taskText?: string;
  subject?: string;
  isOldFormat: boolean;
}

/**
 * Regular expressions for matching pomodoro log lines.
 *
 * New format:
 *   - 🍅 14:00 · Tarea · Materia
 *   - 🍅 14:00 · Tarea
 *   - 🍅 14:00
 *
 * Old formats:
 *   - [x] Pomodoro completado a las 14:00 — *Tarea*
 *   - [x] Pomodoro completed at 14:00 — *Task*
 *   - [x] Pomodoro completado (a las 14:00)?
 *   - [x] Pomodoro completed (at 14:00)?
 */
export const NEW_POMODORO_LOG_REGEX = /^[-*]\s+🍅\s+(\d{1,2}:\d{2})(?:\s*·\s*(.*?))?$/;
export const OLD_POMODORO_LOG_REGEX = /^[-*]\s+\[x\]\s+Pomodoro\s+(?:completado|completed)(?:\s+(?:a las|at)\s+(\d{1,2}:\d{2}))?(?:\s*—\s*\*?(.*?)\*?)?$/i;

/**
 * Detects whether a markdown line is a pomodoro log entry (old or new format).
 */
export function isPomodoroLogLine(line: string): boolean {
  const trimmed = line.trim();
  if (trimmed.startsWith('- 🍅') || trimmed.startsWith('* 🍅')) {
    return NEW_POMODORO_LOG_REGEX.test(trimmed);
  }
  if (/^[-*]\s+\[[xX]\]\s+Pomodoro\s+(?:completado|completed)/i.test(trimmed)) {
    return true;
  }
  return false;
}

/**
 * Parses a pomodoro log line in either new bullet or old checkbox format.
 */
export function parsePomodoroLogLine(line: string): ParsedPomodoroLog | null {
  const trimmed = line.trim();

  // Try new format
  const newMatch = trimmed.match(NEW_POMODORO_LOG_REGEX);
  if (newMatch) {
    const time = newMatch[1];
    const rest = newMatch[2] ? newMatch[2].trim() : '';
    if (!rest) {
      return { time, isOldFormat: false };
    }
    const parts = rest.split(/\s*·\s*/);
    const taskText = parts[0] || undefined;
    const subject = parts.length > 1 ? parts.slice(1).join(' · ') : undefined;
    return { time, taskText, subject, isOldFormat: false };
  }

  // Try old checkbox format
  const oldMatch = trimmed.match(OLD_POMODORO_LOG_REGEX);
  if (oldMatch) {
    const time = oldMatch[1] || '12:00';
    let rawTask = (oldMatch[2] || '').trim();
    if (rawTask.endsWith('*')) {
      rawTask = rawTask.replace(/^\*+|\*+$/g, '').trim();
    }
    return {
      time,
      taskText: rawTask || undefined,
      isOldFormat: true,
    };
  }

  return null;
}

/**
 * Normalizes a tag string by ensuring a leading `#` and converting to lowercase.
 */
export function normalizeTag(tag: string): string {
  const clean = tag.trim().replace(/^#+/, '');
  return clean ? `#${clean.toLowerCase()}` : '';
}

/**
 * Checks whether a tag matches the spaced repetition tag in ES, EN, or custom config.
 */
export function isSpacedRepetitionTag(tag: string, userConfiguredTag?: string): boolean {
  const norm = normalizeTag(tag);
  if (!norm) return false;

  if (userConfiguredTag) {
    const userNorm = normalizeTag(userConfiguredTag);
    if (norm === userNorm || norm.startsWith(`${userNorm}/`)) {
      return true;
    }
  }

  return (
    norm === '#repasar' ||
    norm.startsWith('#repasar/') ||
    norm === '#review' ||
    norm.startsWith('#review/')
  );
}

/**
 * Retrieves the spaced repetition metadata from frontmatter, checking user-configured
 * property names first and falling back to standard ES/EN conventions.
 */
export function getSpacedRepetitionFrontmatter(
  frontmatter: Record<string, any> | null | undefined,
  userConfig?: {
    nextKey?: string;
    intervalKey?: string;
    reviewedKey?: string;
  }
): {
  nextReviewDate: string | null;
  interval: number;
  lastReviewedDate: string | null;
} {
  if (!frontmatter) {
    return { nextReviewDate: null, interval: 1, lastReviewedDate: null };
  }

  // Next review date keys in order of precedence:
  const nextKeys = [
    userConfig?.nextKey,
    DEFAULT_SPACED_NEXT_KEY_ES,
    DEFAULT_SPACED_NEXT_KEY_EN,
  ].filter((k): k is string => Boolean(k));

  let nextReviewDate: string | null = null;
  for (const k of nextKeys) {
    if (frontmatter[k] !== undefined && frontmatter[k] !== null) {
      const val = String(frontmatter[k]).trim();
      if (/^\d{4}-\d{2}-\d{2}$/.test(val)) {
        nextReviewDate = val;
        break;
      }
    }
  }

  // Interval keys:
  const intervalKeys = [
    userConfig?.intervalKey,
    DEFAULT_SPACED_INTERVAL_KEY_ES,
    DEFAULT_SPACED_INTERVAL_KEY_EN,
  ].filter((k): k is string => Boolean(k));

  let interval = 1;
  for (const k of intervalKeys) {
    if (typeof frontmatter[k] === 'number') {
      interval = frontmatter[k];
      break;
    } else if (frontmatter[k] !== undefined && frontmatter[k] !== null) {
      const parsed = Number(frontmatter[k]);
      if (!isNaN(parsed) && parsed > 0) {
        interval = parsed;
        break;
      }
    }
  }

  // Last reviewed date keys:
  const reviewedKeys = [
    userConfig?.reviewedKey,
    DEFAULT_SPACED_REVIEWED_KEY_ES,
    DEFAULT_SPACED_REVIEWED_KEY_EN,
  ].filter((k): k is string => Boolean(k));

  let lastReviewedDate: string | null = null;
  for (const k of reviewedKeys) {
    if (frontmatter[k] !== undefined && frontmatter[k] !== null) {
      const val = String(frontmatter[k]).trim();
      if (/^\d{4}-\d{2}-\d{2}$/.test(val)) {
        lastReviewedDate = val;
        break;
      }
    }
  }

  return { nextReviewDate, interval, lastReviewedDate };
}

