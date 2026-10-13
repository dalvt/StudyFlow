import type { App, TFile } from 'obsidian';
import { getLocalDateString } from './markdown-utils.ts';
import { normalizeTag } from './subject-analytics.ts';

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

  const idx = SPACED_REPETITION_INTERVALS.indexOf(currentInterval as any);
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
 * Checks if a note contains the #repasar tag (in tags list or frontmatter).
 */
export function hasRepasarTag(tags?: string[], frontmatter?: Record<string, any> | null): boolean {
  if (tags && tags.length > 0) {
    for (const t of tags) {
      const norm = normalizeTag(t);
      if (norm === '#repasar' || norm.startsWith('#repasar/')) {
        return true;
      }
    }
  }

  if (frontmatter) {
    const fmTags = frontmatter.tags || frontmatter.tag;
    if (Array.isArray(fmTags)) {
      for (const t of fmTags) {
        const norm = normalizeTag(String(t));
        if (norm === '#repasar' || norm.startsWith('#repasar/')) {
          return true;
        }
      }
    } else if (typeof fmTags === 'string') {
      const parts = fmTags.split(/[\s,]+/);
      for (const part of parts) {
        const norm = normalizeTag(part);
        if (norm === '#repasar' || norm.startsWith('#repasar/')) {
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
 * 1. #repasar tag
 * 2. repasar_siguiente property in frontmatter formatted as YYYY-MM-DD
 */
export function isSpacedRepetitionNote(
  tags?: string[],
  frontmatter?: Record<string, any> | null
): boolean {
  if (!hasRepasarTag(tags, frontmatter)) {
    return false;
  }

  if (!frontmatter || !frontmatter.repasar_siguiente) {
    return false;
  }

  const dateStr = String(frontmatter.repasar_siguiente).trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(dateStr);
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

/**
 * Scans vault markdown files and returns all spaced repetition notes due today or earlier.
 */
export async function getSpacedRepetitionQueue(
  app: App,
  targetDateStr: string = getLocalDateString(new Date())
): Promise<SpacedRepetitionNoteItem[]> {
  const files = app.vault.getMarkdownFiles();
  const queue: SpacedRepetitionNoteItem[] = [];

  for (const file of files) {
    const cache = app.metadataCache.getFileCache(file);
    if (!cache) continue;

    const tags: string[] = [];
    if (cache.tags) {
      for (const t of cache.tags) {
        tags.push(t.tag);
      }
    }

    const fm = cache.frontmatter;
    if (!isSpacedRepetitionNote(tags, fm)) {
      continue;
    }

    const nextDate = String(fm!.repasar_siguiente).trim();
    const interval = typeof fm!.repasar_intervalo === 'number' ? fm!.repasar_intervalo : 1;
    const isDue = nextDate <= targetDateStr;

    // Calculate days overdue
    const targetTime = new Date(`${targetDateStr}T00:00:00`).getTime();
    const nextTime = new Date(`${nextDate}T00:00:00`).getTime();
    const daysOverdue = Math.max(0, Math.floor((targetTime - nextTime) / (24 * 60 * 60 * 1000)));

    queue.push({
      file,
      path: file.path,
      title: file.basename,
      repasarSiguiente: nextDate,
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
 * Reviews a spaced repetition note, updating its frontmatter with new interval and next date.
 */
export async function reviewSpacedNote(
  app: App,
  file: TFile,
  rating: SpacedRating,
  referenceDate: Date = new Date()
): Promise<SpacedRepetitionState> {
  const cache = app.metadataCache.getFileCache(file);
  const currentInterval =
    cache?.frontmatter && typeof cache.frontmatter.repasar_intervalo === 'number'
      ? cache.frontmatter.repasar_intervalo
      : 1;

  const nextState = calculateNextRepetition(currentInterval, rating, referenceDate);

  await app.fileManager.processFrontMatter(file, (fm) => {
    fm.repasar_siguiente = nextState.nextReviewDate;
    fm.repasar_intervalo = nextState.nextInterval;
    fm.repasar_revisado = nextState.lastReviewedDate;

    // Ensure #repasar is in tags if not already present in file
    const tags = fm.tags || fm.tag;
    if (!tags) {
      fm.tags = ['repasar'];
    } else if (Array.isArray(tags)) {
      if (!tags.some((t: string) => normalizeTag(t) === '#repasar')) {
        tags.push('repasar');
      }
    } else if (typeof tags === 'string') {
      if (!tags.includes('repasar')) {
        fm.tags = `${tags} repasar`;
      }
    }
  });

  return nextState;
}

/**
 * Initializes spaced repetition on a file with today as next review date and interval 1.
 */
export async function initSpacedRepetitionForFile(
  app: App,
  file: TFile,
  initialDateStr: string = getLocalDateString(new Date())
): Promise<void> {
  await app.fileManager.processFrontMatter(file, (fm) => {
    fm.repasar_siguiente = initialDateStr;
    fm.repasar_intervalo = 1;

    const tags = fm.tags || fm.tag;
    if (!tags) {
      fm.tags = ['repasar'];
    } else if (Array.isArray(tags)) {
      if (!tags.some((t: string) => normalizeTag(t) === '#repasar')) {
        tags.push('repasar');
      }
    } else if (typeof tags === 'string') {
      if (!tags.includes('repasar')) {
        fm.tags = `${tags} repasar`;
      }
    }
  });
}
