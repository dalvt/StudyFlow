import { isTimeBlocksSection } from './conventions.ts';

export interface CalendarDayCell {
  dateStr: string; // YYYY-MM-DD
  dayNumber: number;
  month: number; // 0-11
  year: number;
  isCurrentMonth: boolean;
  isToday: boolean;
}

export const MONTH_NAMES_ES = [
  'Enero',
  'Febrero',
  'Marzo',
  'Abril',
  'Mayo',
  'Junio',
  'Julio',
  'Agosto',
  'Septiembre',
  'Octubre',
  'Noviembre',
  'Diciembre',
];

export const MONTH_NAMES_EN = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

export const DAY_NAMES_ES = [
  'Domingo',
  'Lunes',
  'Martes',
  'Miércoles',
  'Jueves',
  'Viernes',
  'Sábado',
];

export const DAY_NAMES_EN = [
  'Sunday',
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
];

export const SHORT_DAY_NAMES_ES = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];
export const SHORT_DAY_NAMES_SUN_FIRST_ES = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
export const SHORT_DAY_NAMES_EN = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
export const SHORT_DAY_NAMES_SUN_FIRST_EN = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

/**
 * Returns YYYY-MM-DD representation of a local Date.
 */
export function formatDateKey(d: Date): string {
  const yyyy = String(d.getFullYear());
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

/**
 * Formats "Mes Año" / "Month Year" header string (defaults to Spanish).
 */
export function formatMonthYearHeader(year: number, month: number, lang: 'es' | 'en' = 'es'): string {
  const names = lang === 'en' ? MONTH_NAMES_EN : MONTH_NAMES_ES;
  const mName = names[month] || '';
  return `${mName} ${year}`;
}

/**
 * Formats full human date (defaults to Spanish, e.g. "Lunes 12 de Octubre, 2026").
 */
export function formatLongDate(dateStr: string, lang: 'es' | 'en' = 'es'): string {
  const parts = dateStr.split('-').map(Number);
  if (parts.length !== 3 || parts.some(isNaN)) return dateStr;
  const d = new Date(parts[0], parts[1] - 1, parts[2]);
  if (lang === 'en') {
    const dayName = DAY_NAMES_EN[d.getDay()] || '';
    const monthName = MONTH_NAMES_EN[d.getMonth()] || '';
    return `${dayName}, ${monthName} ${d.getDate()}, ${d.getFullYear()}`;
  }
  const dayName = DAY_NAMES_ES[d.getDay()] || '';
  const monthName = MONTH_NAMES_ES[d.getMonth()] || '';
  return `${dayName} ${d.getDate()} de ${monthName}, ${d.getFullYear()}`;
}

/**
 * Computes calendar grid cells for a given month and year starting on Monday or Sunday.
 */
export function getCalendarMonthMatrix(
  year: number,
  month: number,
  referenceDate: Date = new Date(),
  weekStartDay: 'monday' | 'sunday' = 'monday'
): CalendarDayCell[] {
  const todayStr = formatDateKey(referenceDate);

  // First day of target month
  const firstDay = new Date(year, month, 1);
  // Total days in target month
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  // Convert getDay() (0=Sun..6=Sat) to chosen week start
  const startDayOfWeek = weekStartDay === 'sunday'
    ? firstDay.getDay()
    : (firstDay.getDay() + 6) % 7;

  const cells: CalendarDayCell[] = [];

  // Previous month padding
  const daysInPrevMonth = new Date(year, month, 0).getDate();
  for (let i = startDayOfWeek - 1; i >= 0; i--) {
    const prevDayNum = daysInPrevMonth - i;
    const prevDate = new Date(year, month - 1, prevDayNum);
    const dateStr = formatDateKey(prevDate);
    cells.push({
      dateStr,
      dayNumber: prevDayNum,
      month: prevDate.getMonth(),
      year: prevDate.getFullYear(),
      isCurrentMonth: false,
      isToday: dateStr === todayStr,
    });
  }

  // Current month days
  for (let d = 1; d <= daysInMonth; d++) {
    const currDate = new Date(year, month, d);
    const dateStr = formatDateKey(currDate);
    cells.push({
      dateStr,
      dayNumber: d,
      month,
      year,
      isCurrentMonth: true,
      isToday: dateStr === todayStr,
    });
  }

  // Next month padding to complete rows of 7
  const remaining = (7 - (cells.length % 7)) % 7;
  for (let i = 1; i <= remaining; i++) {
    const nextDate = new Date(year, month + 1, i);
    const dateStr = formatDateKey(nextDate);
    cells.push({
      dateStr,
      dayNumber: i,
      month: nextDate.getMonth(),
      year: nextDate.getFullYear(),
      isCurrentMonth: false,
      isToday: dateStr === todayStr,
    });
  }

  return cells;
}

/**
 * Computes the 7 days of the current week containing referenceDate (Monday to Sunday, or Sunday to Saturday).
 */
export function getWeekDays(
  referenceDate: Date = new Date(),
  weekStartDay: 'monday' | 'sunday' = 'monday',
  lang: 'es' | 'en' = 'es'
): Array<{ dateStr: string; dayNumber: number; shortDay: string; isToday: boolean }> {
  const todayStr = formatDateKey(new Date());
  const dayOfWeek = weekStartDay === 'sunday'
    ? referenceDate.getDay()
    : (referenceDate.getDay() + 6) % 7;

  // Start of week
  const startDay = new Date(referenceDate);
  startDay.setDate(referenceDate.getDate() - dayOfWeek);

  const shortNames = weekStartDay === 'sunday'
    ? (lang === 'en' ? SHORT_DAY_NAMES_SUN_FIRST_EN : SHORT_DAY_NAMES_SUN_FIRST_ES)
    : (lang === 'en' ? SHORT_DAY_NAMES_EN : SHORT_DAY_NAMES_ES);

  const days: Array<{ dateStr: string; dayNumber: number; shortDay: string; isToday: boolean }> = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(startDay);
    d.setDate(startDay.getDate() + i);
    const dateStr = formatDateKey(d);
    days.push({
      dateStr,
      dayNumber: d.getDate(),
      shortDay: shortNames[i],
      isToday: dateStr === todayStr,
    });
  }

  return days;
}

/**
 * Calculates duration in minutes between HH:mm and HH:mm.
 */
export function calculateBlockDurationMinutes(startTime: string, endTime: string): number {
  const [sh, sm] = startTime.split(':').map(Number);
  const [eh, em] = endTime.split(':').map(Number);
  if (isNaN(sh) || isNaN(sm) || isNaN(eh) || isNaN(em)) return 0;
  const startMins = sh * 60 + sm;
  const endMins = eh * 60 + em;
  return Math.max(0, endMins - startMins);
}

export interface CalendarTimeBlock {
  id: string;
  date: string; // YYYY-MM-DD
  startTime: string; // HH:mm
  endTime: string; // HH:mm
  title: string;
  linkedNote?: string;
  completed?: boolean;
  subject?: string;
  color?: string;
  isVirtual?: boolean;
  isRecurring?: boolean;
  recurringDay?: number;
}

/**
 * Formats a single time block into markdown checklist item.
 * Format: - [ ] HH:mm—HH:mm Título [subject:: ...] [color:: ...] [[nota]]
 */
export function formatTimeBlockLine(block: {
  startTime: string;
  endTime: string;
  title: string;
  completed?: boolean;
  linkedNote?: string;
  subject?: string;
  color?: string;
}): string {
  const check = block.completed ? 'x' : ' ';
  const cleanTitle = block.title.trim();
  const cleanNote = block.linkedNote ? block.linkedNote.replace(/[\[\]]/g, '').trim() : '';
  let line = `- [${check}] ${block.startTime}—${block.endTime} ${cleanTitle}`;
  if (block.subject) {
    line += ` [subject:: ${block.subject.trim()}]`;
  }
  if (block.color) {
    line += ` [color:: ${block.color.trim()}]`;
  }
  if (cleanNote) {
    line += ` [[${cleanNote}]]`;
  }
  return line;
}

/**
 * Parses a single line representing a calendar time block.
 * Recognizes formats:
 * - [ ] HH:mm—HH:mm Título [[nota]]
 * - [x] HH:mm—HH:mm Título [subject:: Álgebra]
 * Tolerates variations: em-dash, en-dash, hyphen, spaces, pipe separators.
 */
export function parseTimeBlockLine(
  line: string,
  dateStr: string = '',
  index: number = 0
): CalendarTimeBlock | null {
  const trimmed = line.trim();
  const match = trimmed.match(
    /^-\s+\[([ xX])\]\s+(\d{1,2}:\d{2})\s*(?:—|–|-)\s*(\d{1,2}:\d{2})\s*(.*)$/
  );
  if (!match) return null;

  const completed = match[1].toLowerCase() === 'x';
  const startTime = match[2].padStart(5, '0');
  const endTime = match[3].padStart(5, '0');
  const rest = match[4].trim();

  let subject: string | undefined = undefined;
  let color: string | undefined = undefined;

  const subjectMatch = rest.match(/\[subject::\s*([^\]]+)\]/i);
  if (subjectMatch) {
    subject = subjectMatch[1].trim();
  }

  const colorMatch = rest.match(/\[color::\s*([^\]]+)\]/i);
  if (colorMatch) {
    color = colorMatch[1].trim();
  }

  const inlineCleanRest = rest
    .replace(/\[subject::\s*[^\]]+\]/gi, '')
    .replace(/\[color::\s*[^\]]+\]/gi, '')
    .trim();

  let title = inlineCleanRest;
  let linkedNote: string | undefined = undefined;

  // Check for pipe separator e.g. "Title | [[Note]]" or "Title | Note"
  const pipeIndex = inlineCleanRest.indexOf('|');
  if (pipeIndex !== -1) {
    title = inlineCleanRest.substring(0, pipeIndex).trim();
    const notePart = inlineCleanRest.substring(pipeIndex + 1).trim();
    if (notePart) {
      linkedNote = notePart.replace(/[\[\]]/g, '').trim();
    }
  } else {
    // Check for trailing [[Note]]
    const linkMatch = inlineCleanRest.match(/^(.*?)\s*\[\[([^\]]+)\]\]\s*$/);
    if (linkMatch) {
      title = linkMatch[1].trim();
      linkedNote = linkMatch[2].trim();
    }
  }

  if (!title && linkedNote) {
    title = linkedNote;
  }

  const id = `block-${dateStr || 'd'}-${startTime}-${endTime}-${index}`;

  return {
    id,
    date: dateStr,
    startTime,
    endTime,
    title,
    linkedNote: linkedNote || undefined,
    completed,
    subject,
    color,
  };
}

/**
 * Parses all time blocks located under the "## Bloques de Tiempo" section in markdown.
 */
export function parseTimeBlocksFromMarkdown(
  content: string,
  dateStr: string = '',
  customHeader?: string
): CalendarTimeBlock[] {
  if (!content) return [];
  const lines = content.split(/\r?\n/);
  const headerIndex = lines.findIndex((l) => isTimeBlocksSection(l, customHeader));
  if (headerIndex === -1) return [];

  const blocks: CalendarTimeBlock[] = [];
  let blockIndex = 0;

  for (let i = headerIndex + 1; i < lines.length; i++) {
    const line = lines[i];
    // Stop at the next header
    if (/^#{1,6}\s+/.test(line)) {
      break;
    }
    const parsed = parseTimeBlockLine(line, dateStr, blockIndex);
    if (parsed) {
      blocks.push(parsed);
      blockIndex++;
    }
  }

  return blocks;
}

/**
 * Converts "HH:mm" into minutes since 00:00.
 */
export function timeStringToMinutes(timeStr: string): number {
  if (!timeStr) return 0;
  const parts = timeStr.trim().split(':').map(Number);
  if (parts.length < 2 || isNaN(parts[0]) || isNaN(parts[1])) return 0;
  return parts[0] * 60 + parts[1];
}

/**
 * Checks if two time intervals overlap.
 * Strictly overlapping intervals: max(startA, startB) < min(endA, endB).
 * Adjacent intervals (e.g. 09:00-10:00 and 10:00-11:00) do NOT overlap.
 */
export function doBlocksOverlap(
  a: { startTime: string; endTime: string },
  b: { startTime: string; endTime: string }
): boolean {
  const startA = timeStringToMinutes(a.startTime);
  const endA = timeStringToMinutes(a.endTime);
  const startB = timeStringToMinutes(b.startTime);
  const endB = timeStringToMinutes(b.endTime);

  if (startA >= endA || startB >= endB) {
    return false;
  }

  return Math.max(startA, startB) < Math.min(endA, endB);
}

/**
 * Returns any blocks in existingBlocks that overlap with the candidate block.
 * When editing, excludes candidate from comparison if candidate.id matches.
 */
export function findOverlappingBlocks<
  T extends { startTime: string; endTime: string; id?: string; title?: string }
>(
  existingBlocks: T[],
  candidate: { startTime: string; endTime: string; id?: string }
): T[] {
  return existingBlocks.filter((b) => {
    if (candidate.id && b.id && candidate.id === b.id) {
      return false;
    }
    return doBlocksOverlap(b, candidate);
  });
}

/**
 * Snaps minutes to the nearest 15-minute interval.
 */
export function snapTo15Minutes(minutes: number): number {
  return Math.round(minutes / 15) * 15;
}

/**
 * Converts minutes since 00:00 to "HH:mm".
 */
export function minutesToTimeString(minutes: number): string {
  const clamped = Math.max(0, Math.min(24 * 60 - 1, minutes));
  const h = Math.floor(clamped / 60);
  const m = clamped % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

export interface BlockLayout {
  block: CalendarTimeBlock;
  startMin: number;
  endMin: number;
  colIndex: number;
  totalCols: number;
  hasOverlap: boolean;
}

/**
 * Computes side-by-side columns and overlap status for a list of time blocks.
 */
export function computeBlockLayouts(blocks: CalendarTimeBlock[]): BlockLayout[] {
  if (blocks.length === 0) return [];

  const parsed = blocks.map((b) => ({
    block: b,
    startMin: timeStringToMinutes(b.startTime),
    endMin: Math.max(timeStringToMinutes(b.startTime) + 15, timeStringToMinutes(b.endTime)),
  }));

  // Sort by start time, then longer duration first
  parsed.sort((a, b) => a.startMin - b.startMin || (b.endMin - b.startMin) - (a.endMin - a.startMin));

  // Partition into connected overlap clusters
  const clusters: Array<typeof parsed> = [];
  let currentCluster: typeof parsed = [];
  let clusterMaxEnd = -1;

  for (const item of parsed) {
    if (currentCluster.length === 0) {
      currentCluster.push(item);
      clusterMaxEnd = item.endMin;
    } else if (item.startMin < clusterMaxEnd) {
      // Overlaps with current cluster
      currentCluster.push(item);
      clusterMaxEnd = Math.max(clusterMaxEnd, item.endMin);
    } else {
      clusters.push(currentCluster);
      currentCluster = [item];
      clusterMaxEnd = item.endMin;
    }
  }
  if (currentCluster.length > 0) {
    clusters.push(currentCluster);
  }

  const results: BlockLayout[] = [];

  for (const cluster of clusters) {
    const colEnds: number[] = [];
    const clusterLayouts: Array<{ item: (typeof parsed)[0]; colIndex: number }> = [];

    for (const item of cluster) {
      let assignedCol = -1;
      for (let c = 0; c < colEnds.length; c++) {
        if (colEnds[c] <= item.startMin) {
          assignedCol = c;
          colEnds[c] = item.endMin;
          break;
        }
      }
      if (assignedCol === -1) {
        assignedCol = colEnds.length;
        colEnds.push(item.endMin);
      }
      clusterLayouts.push({ item, colIndex: assignedCol });
    }

    const totalCols = colEnds.length;
    const hasOverlap = totalCols > 1;

    for (const cl of clusterLayouts) {
      results.push({
        block: cl.item.block,
        startMin: cl.item.startMin,
        endMin: cl.item.endMin,
        colIndex: cl.colIndex,
        totalCols,
        hasOverlap,
      });
    }
  }

  return results;
}

