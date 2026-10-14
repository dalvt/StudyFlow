import type { App, TFile } from 'obsidian';
import type StudyFlowPlugin from './main';
import { parseTimeBlocksFromMarkdown } from './calendar-utils.ts';

export interface IcsTimeBlockItem {
  id?: string;
  date: string; // YYYY-MM-DD
  startTime: string; // HH:mm
  endTime: string; // HH:mm
  title: string;
  linkedNote?: string;
  completed?: boolean;
}

export interface IcsDeadlineItem {
  id?: string;
  text: string;
  dueDate: string; // YYYY-MM-DD
  dueTime?: string; // HH:mm
  priority?: string;
  sourceFile?: string;
  completed?: boolean;
}

function formatIcsDateTime(dateStr: string, timeStr: string): string {
  const cleanDate = dateStr.replace(/-/g, '');
  const cleanTime = timeStr.replace(/:/g, '');
  return `${cleanDate}T${cleanTime.padEnd(4, '0')}00`;
}

function formatIcsDate(dateStr: string): string {
  return dateStr.replace(/-/g, '');
}

function getNextDateIcs(dateStr: string): string {
  const [year, month, day] = dateStr.split('-').map(Number);
  const d = new Date(year, month - 1, day + 1);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${y}${m}${dd}`;
}

export function formatIcsStamp(d: Date = new Date()): string {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  const h = String(d.getUTCHours()).padStart(2, '0');
  const min = String(d.getUTCMinutes()).padStart(2, '0');
  const s = String(d.getUTCSeconds()).padStart(2, '0');
  return `${y}${m}${day}T${h}${min}${s}Z`;
}

export function escapeIcsText(str: string): string {
  if (!str) return '';
  return str
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\r?\n/g, '\\n');
}

export function createStableIcsUid(prefix: string, raw: string): string {
  const slug = raw
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\w\s-]/g, '')
    .trim()
    .replace(/[\s_-]+/g, '-')
    .slice(0, 80);
  return `study-flow-${prefix}-${slug || 'event'}@studyflow`;
}

/**
 * Pure generator: constructs an RFC 5545 iCalendar string
 * from time blocks and deadlines with deterministic, stable UIDs.
 */
export function buildIcsCalendar(params: {
  blocks: IcsTimeBlockItem[];
  deadlines: IcsDeadlineItem[];
  calendarName?: string;
  now?: Date;
}): string {
  const now = params.now || new Date();
  const stamp = formatIcsStamp(now);
  const calName = escapeIcsText(params.calendarName || 'Study Flow');

  const lines: string[] = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Study Flow Assistant//ES',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    `X-WR-CALNAME:${calName}`,
  ];

  // 1. Time Blocks
  for (const block of params.blocks) {
    if (!block.date || !block.startTime || !block.endTime) continue;
    const uid = block.id && block.id.startsWith('study-flow-')
      ? `${block.id}@studyflow`
      : createStableIcsUid('block', `${block.date}-${block.startTime}-${block.endTime}-${block.title}`);
    const dtStart = formatIcsDateTime(block.date, block.startTime);
    const dtEnd = formatIcsDateTime(block.date, block.endTime);
    const summary = escapeIcsText(block.title || 'Bloque de Estudio');
    let desc = block.linkedNote ? `Nota: [[${block.linkedNote}]]` : 'Bloque de tiempo Study Flow';
    if (block.completed) {
      desc += ' (Completado)';
    }

    lines.push(
      'BEGIN:VEVENT',
      `UID:${uid}`,
      `DTSTAMP:${stamp}`,
      `DTSTART:${dtStart}`,
      `DTEND:${dtEnd}`,
      `SUMMARY:${summary}`,
      `DESCRIPTION:${escapeIcsText(desc)}`,
      block.completed ? 'STATUS:COMPLETED' : 'STATUS:CONFIRMED',
      'END:VEVENT'
    );
  }

  // 2. Deadlines / Entregas
  for (const dl of params.deadlines) {
    if (!dl.dueDate) continue;
    const uid = dl.id && dl.id.startsWith('dl-')
      ? `study-flow-${dl.id}@studyflow`
      : createStableIcsUid('deadline', `${dl.sourceFile || ''}-${dl.text}-${dl.dueDate}`);

    const summary = escapeIcsText(dl.text || 'Entrega pendiente');
    let desc = `Fecha límite: ${dl.dueDate}`;
    if (dl.priority && dl.priority !== 'none') {
      desc += ` | Prioridad: ${dl.priority}`;
    }
    if (dl.sourceFile) {
      desc += ` | Archivo: ${dl.sourceFile}`;
    }

    lines.push('BEGIN:VEVENT', `UID:${uid}`, `DTSTAMP:${stamp}`);

    if (dl.dueTime && /^\d{2}:\d{2}$/.test(dl.dueTime)) {
      const dtStart = formatIcsDateTime(dl.dueDate, dl.dueTime);
      const [h, m] = dl.dueTime.split(':').map(Number);
      const endM = (m + 30) % 60;
      const endH = h + Math.floor((m + 30) / 60);
      const endHStr = String(Math.min(23, endH)).padStart(2, '0');
      const endMStr = String(endM).padStart(2, '0');
      const dtEnd = formatIcsDateTime(dl.dueDate, `${endHStr}:${endMStr}`);
      lines.push(`DTSTART:${dtStart}`, `DTEND:${dtEnd}`);
    } else {
      const dtStart = formatIcsDate(dl.dueDate);
      const dtEnd = getNextDateIcs(dl.dueDate);
      lines.push(`DTSTART;VALUE=DATE:${dtStart}`, `DTEND;VALUE=DATE:${dtEnd}`);
    }

    lines.push(
      `SUMMARY:${summary}`,
      `DESCRIPTION:${escapeIcsText(desc)}`,
      dl.completed ? 'STATUS:COMPLETED' : 'STATUS:CONFIRMED',
      'END:VEVENT'
    );
  }

  lines.push('END:VCALENDAR', '');
  return lines.join('\r\n');
}

/**
 * Obsidian command handler: gathers all time blocks and deadlines across vault
 * and writes to StudyFlow/study-flow.ics.
 */
export async function exportStudyFlowIcsFile(
  app: App,
  plugin: StudyFlowPlugin,
  outputPath: string = 'StudyFlow/study-flow.ics'
): Promise<string> {
  // 1. Deadlines
  let deadlines: IcsDeadlineItem[] = [];
  if (plugin.taskIndex) {
    const rawDeadlines = plugin.taskIndex.getAllDeadlines();
    deadlines = rawDeadlines.map((dl) => ({
      id: dl.id,
      text: dl.text,
      dueDate: dl.dueDate,
      dueTime: dl.dueTime,
      priority: dl.priority,
      sourceFile: dl.sourceFile,
      completed: dl.completed,
    }));
  }

  // 2. Time Blocks
  const blocks: IcsTimeBlockItem[] = [];
  const dailyFolder = plugin.settings.dailyNotesFolder || '';
  const markdownFiles = app.vault.getMarkdownFiles();

  for (const file of markdownFiles) {
    if (dailyFolder && !file.path.startsWith(dailyFolder)) {
      continue;
    }
    const content = await app.vault.read(file);
    const match = file.basename.match(/\d{4}-\d{2}-\d{2}/);
    const dateStr = match ? match[0] : file.basename;
    const fileBlocks = parseTimeBlocksFromMarkdown(
      content,
      dateStr,
      plugin.settings.timeBlocksSectionHeader
    );
    if (fileBlocks.length > 0) {
      blocks.push(...fileBlocks);
    }
  }

  // Also include any blocks in plugin.settings.calendarBlocks
  if (plugin.settings.calendarBlocks) {
    for (const [dateStr, dateBlocks] of Object.entries(plugin.settings.calendarBlocks)) {
      for (const b of dateBlocks) {
        if (
          !blocks.some(
            (existing) =>
              existing.date === b.date &&
              existing.startTime === b.startTime &&
              existing.title === b.title
          )
        ) {
          blocks.push(b);
        }
      }
    }
  }

  const icsContent = buildIcsCalendar({
    blocks,
    deadlines,
    calendarName: 'Study Flow',
  });

  const folder = outputPath.substring(0, outputPath.lastIndexOf('/'));
  if (folder) {
    const folderExists = app.vault.getAbstractFileByPath(folder);
    if (!folderExists) {
      await app.vault.createFolder(folder).catch(() => {});
    }
  }

  const existingFile = app.vault.getAbstractFileByPath(outputPath);
  if (existingFile && 'stat' in existingFile) {
    await app.vault.modify(existingFile as TFile, icsContent);
  } else {
    await app.vault.create(outputPath, icsContent);
  }

  return outputPath;
}
