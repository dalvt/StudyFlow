import type { App, TFile } from 'obsidian';
import type StudyFlowPlugin from './main.ts';
import { getLocalDateString } from './markdown-utils.ts';
import {
  isSpacedRepetitionTag,
  getSpacedRepetitionFrontmatter,
} from './conventions.ts';

export const SPACED_REPETITION_INTERVALS = [1, 3, 7, 14, 30] as const;
export type SpacedRating = 'facil' | 'dificil';

export interface SpacedRepetitionState {
  nextInterval: number;
  nextReviewDate: string; // YYYY-MM-DD
  lastReviewedDate: string; // YYYY-MM-DD
}

/**
 * Computes the next interval in days based on the 1-3-7-14-30 scale.
 * - 'facil' advances to the next interval (or stays at 30 if at max).
 * - 'dificil' resets to 1 day.
 */
export function getNextSpacedInterval(
  currentInterval: number | undefined,
  rating: SpacedRating
): number {
  if (rating === 'dificil') {
    return 1;
  }

  // Rating is 'facil'
  if (currentInterval === undefined || currentInterval === null || currentInterval < 1) {
    return 3;
  }

  if (currentInterval >= 30) {
    return 30;
  }

  const idx = (SPACED_REPETITION_INTERVALS as readonly number[]).indexOf(currentInterval);
  if (idx >= 0 && idx < SPACED_REPETITION_INTERVALS.length - 1) {
    return SPACED_REPETITION_INTERVALS[idx + 1];
  }

  // If interval is between steps, advance to the next step greater than currentInterval
  for (const interval of SPACED_REPETITION_INTERVALS) {
    if (interval > currentInterval) {
      return interval;
    }
  }

  return 30;
}

/**
 * Calculates next review date and state from a reference date.
 */
export function calculateNextRepetition(
  currentInterval: number | undefined,
  rating: SpacedRating,
  referenceDate: Date = new Date()
): SpacedRepetitionState {
  const nextInterval = getNextSpacedInterval(currentInterval, rating);
  const nextDate = new Date(
    referenceDate.getFullYear(),
    referenceDate.getMonth(),
    referenceDate.getDate() + nextInterval
  );

  return {
    nextInterval,
    nextReviewDate: getLocalDateString(nextDate),
    lastReviewedDate: getLocalDateString(referenceDate),
  };
}

/**
 * Checks if a note contains the spaced repetition tag (#repasar, #review, or custom).
 */
export function hasRepasarTag(
  tags?: string[],
  frontmatter?: Record<string, unknown> | null,
  customTag?: string
): boolean {
  if (tags && tags.length > 0) {
    for (const t of tags) {
      if (isSpacedRepetitionTag(t, customTag)) {
        return true;
      }
    }
  }

  if (frontmatter) {
    const fmTags = frontmatter.tags || frontmatter.tag;
    if (Array.isArray(fmTags)) {
      for (const t of fmTags) {
        if (isSpacedRepetitionTag(String(t), customTag)) {
          return true;
        }
      }
    } else if (typeof fmTags === 'string') {
      const parts = fmTags.split(/[\s,]+/);
      for (const part of parts) {
        if (isSpacedRepetitionTag(part, customTag)) {
          return true;
        }
      }
    }
  }

  return false;
}

/**
 * Checks if a note belongs in the spaced repetition queue.
 * Requires:
 * 1. Spaced repetition tag (#repasar, #review or custom)
 * 2. Next review date property formatted as YYYY-MM-DD
 */
export function isSpacedRepetitionNote(
  tags?: string[],
  frontmatter?: Record<string, unknown> | null,
  userConfig?: {
    tag?: string;
    nextKey?: string;
    intervalKey?: string;
    reviewedKey?: string;
  }
): boolean {
  if (!hasRepasarTag(tags, frontmatter, userConfig?.tag)) {
    return false;
  }

  const { nextReviewDate } = getSpacedRepetitionFrontmatter(frontmatter, userConfig);
  return nextReviewDate !== null;
}

export interface SpacedNoteData {
  path: string;
  title: string;
  repasarSiguiente: string;
  interval: number;
}

/**
 * Filters notes due for review on or before the target date.
 */
export function filterDueSpacedNotes<T extends { repasarSiguiente: string }>(
  notes: T[],
  targetDateStr: string = getLocalDateString(new Date())
): T[] {
  return notes.filter((n) => n.repasarSiguiente <= targetDateStr);
}

export interface SpacedRepetitionNoteItem {
  file: TFile;
  path: string;
  title: string;
  repasarSiguiente: string;
  interval: number;
  isDueToday: boolean;
  daysOverdue: number;
}

interface CachedSpacedNote {
  mtime: number;
  item: {
    path: string;
    title: string;
    repasarSiguiente: string;
    interval: number;
  } | null;
}

const spacedNoteCache = new Map<string, CachedSpacedNote>();

export function clearSpacedRepetitionCache(): void {
  spacedNoteCache.clear();
}

/**
 * Scans vault markdown files and returns all spaced repetition notes due today or earlier.
 * Uses in-memory caching keyed by file path and mtime to avoid synchronous re-scanning.
 */
export async function getSpacedRepetitionQueue(
  app: App,
  targetDateStr: string = getLocalDateString(new Date()),
  plugin?: StudyFlowPlugin
): Promise<SpacedRepetitionNoteItem[]> {
  const files = app.vault.getMarkdownFiles();
  const queue: SpacedRepetitionNoteItem[] = [];

  const userConfig = plugin?.settings ? {
    tag: plugin.settings.spacedRepetitionTag,
    nextKey: plugin.settings.spacedRepetitionNextKey,
    intervalKey: plugin.settings.spacedRepetitionIntervalKey,
    reviewedKey: plugin.settings.spacedRepetitionReviewedKey,
  } : undefined;

  for (const file of files) {
    const mtime = file.stat?.mtime;
    let cached = spacedNoteCache.get(file.path);

    if (!cached || mtime === undefined || cached.mtime !== mtime) {
      const cache = app.metadataCache.getFileCache(file);
      if (!cache) continue;

      const tags: string[] = [];
      if (cache.tags) {
        for (const t of cache.tags) {
          tags.push(t.tag);
        }
      }

      const fm = cache.frontmatter;
      if (!isSpacedRepetitionNote(tags, fm, userConfig)) {
        spacedNoteCache.set(file.path, { mtime: mtime ?? 0, item: null });
        continue;
      }

      const { nextReviewDate, interval } = getSpacedRepetitionFrontmatter(fm, userConfig);
      const nextDate = nextReviewDate || '';
      const item = {
        path: file.path,
        title: file.basename,
        repasarSiguiente: nextDate,
        interval,
      };
      spacedNoteCache.set(file.path, { mtime: mtime ?? 0, item });
      cached = spacedNoteCache.get(file.path);
    }

    if (!cached || !cached.item) continue;

    const { repasarSiguiente, interval } = cached.item;
    const isDue = repasarSiguiente <= targetDateStr;

    // Calculate days overdue
    const targetTime = new Date(`${targetDateStr}T00:00:00`).getTime();
    const nextTime = new Date(`${repasarSiguiente}T00:00:00`).getTime();
    const daysOverdue = Math.max(0, Math.floor((targetTime - nextTime) / (24 * 60 * 60 * 1000)));

    queue.push({
      file,
      path: file.path,
      title: file.basename,
      repasarSiguiente,
      interval,
      isDueToday: isDue,
      daysOverdue,
    });
  }

  // Sort: due notes first (most overdue first), then by next date, then by title
  queue.sort((a, b) => {
    if (a.isDueToday !== b.isDueToday) {
      return a.isDueToday ? -1 : 1;
    }
    if (a.daysOverdue !== b.daysOverdue) {
      return b.daysOverdue - a.daysOverdue;
    }
    if (a.repasarSiguiente !== b.repasarSiguiente) {
      return a.repasarSiguiente.localeCompare(b.repasarSiguiente);
    }
    return a.title.localeCompare(b.title);
  });

  return queue;
}

/**
 * Alias for getSpacedRepetitionQueue
 */
export const getNotesForReview = getSpacedRepetitionQueue;

/**
 * Reviews a spaced repetition note, updating its frontmatter with new interval and next date.
 */
export async function reviewSpacedNote(
  app: App,
  file: TFile,
  rating: SpacedRating,
  referenceDate: Date = new Date(),
  plugin?: StudyFlowPlugin
): Promise<SpacedRepetitionState> {
  const userConfig = plugin?.settings ? {
    tag: plugin.settings.spacedRepetitionTag,
    nextKey: plugin.settings.spacedRepetitionNextKey,
    intervalKey: plugin.settings.spacedRepetitionIntervalKey,
    reviewedKey: plugin.settings.spacedRepetitionReviewedKey,
  } : undefined;

  const cache = app.metadataCache.getFileCache(file);
  const { interval: currentInterval } = getSpacedRepetitionFrontmatter(cache?.frontmatter, userConfig);

  const nextState = calculateNextRepetition(currentInterval, rating, referenceDate);

  const nextKey = plugin?.settings?.spacedRepetitionNextKey || 'repasar_siguiente';
  const intervalKey = plugin?.settings?.spacedRepetitionIntervalKey || 'repasar_intervalo';
  const reviewedKey = plugin?.settings?.spacedRepetitionReviewedKey || 'repasar_revisado';
  const tagToEnsure = (plugin?.settings?.spacedRepetitionTag || '#repasar').replace(/^#+/, '');

  interface FrontmatterRecord {
    [key: string]: unknown;
    tags?: unknown;
    tag?: unknown;
  }

  await app.fileManager.processFrontMatter(file, (fm: FrontmatterRecord) => {
    fm[nextKey] = nextState.nextReviewDate;
    fm[intervalKey] = nextState.nextInterval;
    fm[reviewedKey] = nextState.lastReviewedDate;

    // Ensure tag is in frontmatter tags if not already present
    const tags = fm.tags || fm.tag;
    if (!tags) {
      fm.tags = [tagToEnsure];
    } else if (Array.isArray(tags)) {
      if (!tags.some((t: unknown) => typeof t === 'string' && isSpacedRepetitionTag(t, plugin?.settings?.spacedRepetitionTag))) {
        tags.push(tagToEnsure);
      }
    } else if (typeof tags === 'string') {
      if (!tags.split(/[\s,]+/).some((t: string) => isSpacedRepetitionTag(t, plugin?.settings?.spacedRepetitionTag))) {
        fm.tags = `${tags} ${tagToEnsure}`;
      }
    }
  });

  spacedNoteCache.delete(file.path);
  return nextState;
}

/**
 * Initializes spaced repetition on a file with today as next review date and interval 1.
 */
export async function initSpacedRepetitionForFile(
  app: App,
  file: TFile,
  initialDateStr: string = getLocalDateString(new Date()),
  plugin?: StudyFlowPlugin
): Promise<void> {
  const nextKey = plugin?.settings?.spacedRepetitionNextKey || 'repasar_siguiente';
  const intervalKey = plugin?.settings?.spacedRepetitionIntervalKey || 'repasar_intervalo';
  const tagToEnsure = (plugin?.settings?.spacedRepetitionTag || '#repasar').replace(/^#+/, '');

  interface FrontmatterRecord {
    [key: string]: unknown;
    tags?: unknown;
    tag?: unknown;
  }

  await app.fileManager.processFrontMatter(file, (fm: FrontmatterRecord) => {
    fm[nextKey] = initialDateStr;
    fm[intervalKey] = 1;

    const tags = fm.tags || fm.tag;
    if (!tags) {
      fm.tags = [tagToEnsure];
    } else if (Array.isArray(tags)) {
      if (!tags.some((t: unknown) => typeof t === 'string' && isSpacedRepetitionTag(t, plugin?.settings?.spacedRepetitionTag))) {
        tags.push(tagToEnsure);
      }
    } else if (typeof tags === 'string') {
      if (!tags.split(/[\s,]+/).some((t: string) => isSpacedRepetitionTag(t, plugin?.settings?.spacedRepetitionTag))) {
        fm.tags = `${tags} ${tagToEnsure}`;
      }
    }
  });

  spacedNoteCache.delete(file.path);
}
