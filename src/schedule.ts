import { type App, TFile, normalizePath } from 'obsidian';
import type { CalendarTimeBlock } from './calendar-utils.ts';
import type { Subject } from './settings-utils.ts';


export interface ScheduleItem {
  id: string;
  dayOfWeek: number; // 0=Sunday, 1=Monday, ..., 6=Saturday
  startTime: string; // HH:mm
  endTime: string; // HH:mm
  title: string;
  subject?: string;
  color?: string;
  linkedNote?: string;
}

export type ScheduleEntry = ScheduleItem;

interface ScheduleCacheEntry {
  mtime: number;
  contentHash?: string;
  items: ScheduleItem[];
}

const scheduleCache = new Map<string, ScheduleCacheEntry>();

export function clearScheduleCache(): void {
  scheduleCache.clear();
}

const DAY_NAMES_MAP: Record<string, number> = {
  // Spanish
  domingo: 0,
  dom: 0,
  lunes: 1,
  lun: 1,
  martes: 2,
  mar: 2,
  miercoles: 3,
  miércoles: 3,
  mie: 3,
  mié: 3,
  jueves: 4,
  jue: 4,
  viernes: 5,
  vie: 5,
  sabado: 6,
  sábado: 6,
  sab: 6,
  sáb: 6,

  // English
  sunday: 0,
  sun: 0,
  monday: 1,
  mon: 1,
  tuesday: 2,
  tue: 2,
  wednesday: 3,
  wed: 3,
  thursday: 4,
  thu: 4,
  friday: 5,
  fri: 5,
  saturday: 6,
  sat: 6,
};

/**
 * Parses markdown content of StudyFlow/Schedule.md into recurring schedule items.
 *
 * Supported format:
 * ## Lunes
 * - 08:00—10:00 Álgebra Lineal [subject:: Álgebra] [[Aula 101]]
 * - [ ] 14:00—16:00 Física Mecánica [subject:: Física]
 */
export function parseScheduleMarkdown(content: string): ScheduleItem[] {
  if (!content) return [];
  const lines = content.split(/\r?\n/);
  const items: ScheduleItem[] = [];

  let currentDay: number | null = null;
  let itemCounter = 0;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    // Check for day header e.g. "## Lunes" or "# Monday"
    const headerMatch = line.match(/^#{1,4}\s+(.+)$/);
    if (headerMatch) {
      const headerTitle = headerMatch[1].trim().toLowerCase();
      // Remove any emojis or accents
      const cleanHeader = headerTitle
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^\w\s]/g, '')
        .trim();

      if (cleanHeader in DAY_NAMES_MAP) {
        currentDay = DAY_NAMES_MAP[cleanHeader];
      } else {
        // Try matching words in header
        const words = cleanHeader.split(/\s+/);
        let foundDay: number | null = null;
        for (const w of words) {
          if (w in DAY_NAMES_MAP) {
            foundDay = DAY_NAMES_MAP[w];
            break;
          }
        }
        currentDay = foundDay;
      }
      continue;
    }

    if (currentDay === null) continue;

    // Parse schedule item line:
    // - [ ] 08:00—10:00 Title... OR - 08:00—10:00 Title...
    const itemMatch = line.match(
      /^-\s+(?:\[[ xX]?\]\s+)?(\d{1,2}:\d{2})\s*(?:—|–|-)\s*(\d{1,2}:\d{2})\s*(.*)$/
    );
    if (!itemMatch) continue;

    const startTime = itemMatch[1].padStart(5, '0');
    const endTime = itemMatch[2].padStart(5, '0');
    const rest = itemMatch[3].trim();

    let subject: string | undefined = undefined;
    let color: string | undefined = undefined;
    let linkedNote: string | undefined = undefined;

    const subMatch = rest.match(/\[subject::\s*([^\]]+)\]/i);
    if (subMatch) {
      subject = subMatch[1].trim();
    }

    const colorMatch = rest.match(/\[color::\s*([^\]]+)\]/i);
    if (colorMatch) {
      color = colorMatch[1].trim();
    }

    let cleanRest = rest
      .replace(/\[subject::\s*[^\]]+\]/gi, '')
      .replace(/\[color::\s*[^\]]+\]/gi, '')
      .trim();

    // Check pipe notation or trailing [[note]]
    const pipeIdx = cleanRest.indexOf('|');
    if (pipeIdx !== -1) {
      const notePart = cleanRest.substring(pipeIdx + 1).trim();
      if (notePart) linkedNote = notePart.replace(/[[\]]/g, '').trim();
      cleanRest = cleanRest.substring(0, pipeIdx).trim();
    } else {
      const linkMatch = cleanRest.match(/^(.*?)\s*\[\[([^\]]+)\]\]\s*$/);
      if (linkMatch) {
        cleanRest = linkMatch[1].trim();
        linkedNote = linkMatch[2].trim();
      }
    }

    const title = cleanRest || (linkedNote || 'Clase');
    itemCounter++;
    const id = `sched-${currentDay}-${startTime}-${endTime}-${itemCounter}`;

    items.push({
      id,
      dayOfWeek: currentDay,
      startTime,
      endTime,
      title,
      subject,
      color,
      linkedNote,
    });
  }

  return items;
}

/**
 * Computes virtual calendar time blocks for a specific date from recurring schedule items.
 */
export function getVirtualBlocksForDate(
  scheduleItems: ScheduleItem[],
  dateStr: string,
  subjects: Subject[] = []
): CalendarTimeBlock[] {
  const parts = dateStr.split('-').map(Number);
  if (parts.length !== 3 || parts.some(isNaN)) return [];

  const date = new Date(parts[0], parts[1] - 1, parts[2]);
  const dow = date.getDay(); // 0=Sunday, 1=Monday, ...

  const matchingItems = scheduleItems.filter((item) => item.dayOfWeek === dow);

  return matchingItems.map((item) => {
    let subjectColor = item.color;
    if (!subjectColor && item.subject) {
      const matched = subjects.find(
        (s) =>
          s.name.toLowerCase() === item.subject!.toLowerCase() ||
          s.tag.toLowerCase().replace(/^#/, '') === item.subject!.toLowerCase().replace(/^#/, '')
      );
      if (matched?.color) {
        subjectColor = matched.color;
      }
    }

    return {
      id: `virtual-${item.id}-${dateStr}`,
      date: dateStr,
      startTime: item.startTime,
      endTime: item.endTime,
      title: item.title,
      linkedNote: item.linkedNote,
      completed: false,
      subject: item.subject,
      color: subjectColor,
      isVirtual: true,
      isRecurring: true,
      recurringDay: item.dayOfWeek,
    };
  });
}

/**
 * Reads and parses StudyFlow/Schedule.md from vault with in-memory caching by mtime / content.
 */
export async function loadScheduleItems(
  app: App,
  schedulePath: string = 'StudyFlow/Schedule.md'
): Promise<ScheduleItem[]> {
  const normalizedPath = normalizePath(schedulePath);
  try {
    const file = app.vault.getAbstractFileByPath(normalizedPath);
    if (file instanceof TFile) {
      const cached = scheduleCache.get(normalizedPath);
      const mtime = file.stat?.mtime;
      if (cached && mtime !== undefined && cached.mtime === mtime) {
        return cached.items;
      }

      const content = await app.vault.read(file);
      if (cached && cached.contentHash === content) {
        return cached.items;
      }

      const items = parseScheduleMarkdown(content);
      scheduleCache.set(normalizedPath, {
        mtime: mtime ?? 0,
        contentHash: content,
        items,
      });
      return items;
    }
    return [];
  } catch (err) {
    console.error(`Study Flow: Error cargando horario recurrente desde ${normalizedPath}`, err);
    return [];
  }
}


/**
 * Provides a localized starter template for StudyFlow/Schedule.md.
 */
export function getDefaultScheduleTemplate(lang: 'es' | 'en' = 'es'): string {
  if (lang === 'en') {
    return `# Class Schedule (Weekly Recurring)

## Monday
- 08:00—10:00 Linear Algebra [subject:: Math] [[Room 101]]
- 10:15—12:00 Physics I [subject:: Physics]

## Tuesday
- 09:00—11:00 Algorithms & Data Structures [subject:: Computer Science]

## Wednesday
- 08:00—10:00 Linear Algebra [subject:: Math]
- 14:00—16:00 Chemistry Lab [subject:: Chemistry]

## Thursday
- 09:00—11:00 Algorithms & Data Structures [subject:: Computer Science]

## Friday
- 10:00—12:00 Academic English [subject:: Languages]
`;
  }

  return `# Horario de Clases (Recurrencia Semanal)

## Lunes
- 08:00—10:00 Álgebra Lineal [subject:: Matemáticas] [[Aula 101]]
- 10:15—12:00 Física Mecánica [subject:: Física]

## Martes
- 09:00—11:00 Algoritmos y Estructuras de Datos [subject:: Informática]

## Miércoles
- 08:00—10:00 Álgebra Lineal [subject:: Matemáticas]
- 14:00—16:00 Laboratorio de Química [subject:: Química]

## Jueves
- 09:00—11:00 Algoritmos y Estructuras de Datos [subject:: Informática]

## Viernes
- 10:00—12:00 Inglés Académico [subject:: Idiomas]
`;
}
