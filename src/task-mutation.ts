import {
  type TaskPriority,
  type TaskLocator,
  computeLineHash,
  getCleanTaskDisplayTitle,
  parseTaskCompletionDate,
  formatTaskWithCompletionDate,
  parseTaskRecurrence,
  parseTaskDeadline,
  parseTaskScheduledDate,
  parseTaskStartDate,
  calculateNextRecurrenceDate,
  formatTaskWithDeadline,
  formatTaskWithScheduledDate,
  formatTaskWithStartDate,
  parseTaskPomodoroEstimate,
  formatTaskWithPomodoroEstimate,
  formatTaskWithPriority,
} from './task-parser.ts';
import { getDefaultConventions } from './conventions.ts';
import { getEffectiveLanguage } from './i18n/index.ts';
import { getLocalDateString } from './date-utils.ts';

export function appendTaskToMarkdownSection(
  fileContent: string,
  taskText: string,
  sectionHeader?: string
): string {
  const targetHeader = sectionHeader || getDefaultConventions(getEffectiveLanguage()).tasksSectionHeader;
  const taskLine = `- [ ] ${taskText.trim()}`;
  const lines = fileContent.split(/\r?\n/);

  // Find target section header (case-insensitive search for header title)
  const headerClean = targetHeader.replace(/^#+\s*/, '').trim().toLowerCase();
  let headerIndex = -1;
  let headerLevel = 2;

  for (let i = 0; i < lines.length; i++) {
    const match = lines[i].match(/^(#{1,6})\s+(.*)$/);
    if (match) {
      const level = match[1].length;
      const title = match[2].trim().toLowerCase();
      if (title === headerClean) {
        headerIndex = i;
        headerLevel = level;
        break;
      }
    }
  }

  if (headerIndex === -1) {
    // Header does not exist: append at the end
    const trimmed = fileContent.trimEnd();
    if (trimmed.length === 0) {
      return `${sectionHeader}\n${taskLine}\n`;
    }
    return `${trimmed}\n\n${sectionHeader}\n${taskLine}\n`;
  }

  // Header found: locate end of section (next header with level <= headerLevel, or EOF)
  let insertIndex = lines.length;
  for (let i = headerIndex + 1; i < lines.length; i++) {
    const match = lines[i].match(/^(#{1,6})\s+/);
    if (match && match[1].length <= headerLevel) {
      insertIndex = i;
      break;
    }
  }

  // Insert before insertIndex
  let targetIndex = insertIndex;
  while (targetIndex > headerIndex + 1 && lines[targetIndex - 1].trim() === '') {
    targetIndex--;
  }

  lines.splice(targetIndex, 0, taskLine);
  return lines.join('\n');
}

/**
 * Pure Markdown helper:
 * Appends a passive bullet item to ## Icebox (default) without adding task checkbox syntax.
 */
export function appendIceboxItemToMarkdownSection(
  fileContent: string,
  itemText: string,
  sectionHeader: string = '## Icebox'
): string {
  const cleanItem = itemText.trim().replace(/^[-*]\s+/, '');
  const bulletLine = `- ${cleanItem}`;
  const lines = fileContent.split(/\r?\n/);

  const headerClean = sectionHeader.replace(/^#+\s*/, '').trim().toLowerCase();
  let headerIndex = -1;
  let headerLevel = 2;

  for (let i = 0; i < lines.length; i++) {
    const match = lines[i].match(/^(#{1,6})\s+(.*)$/);
    if (match) {
      const level = match[1].length;
      const title = match[2].trim().toLowerCase();
      if (title === headerClean || (headerClean === 'icebox' && title === 'ideas')) {
        headerIndex = i;
        headerLevel = level;
        break;
      }
    }
  }

  if (headerIndex === -1) {
    const trimmed = fileContent.trimEnd();
    if (trimmed.length === 0) {
      return `${sectionHeader}\n${bulletLine}\n`;
    }
    return `${trimmed}\n\n${sectionHeader}\n${bulletLine}\n`;
  }

  let insertIndex = lines.length;
  for (let i = headerIndex + 1; i < lines.length; i++) {
    const match = lines[i].match(/^(#{1,6})\s+/);
    if (match && match[1].length <= headerLevel) {
      insertIndex = i;
      break;
    }
  }

  let targetIndex = insertIndex;
  while (targetIndex > headerIndex + 1 && lines[targetIndex - 1].trim() === '') {
    targetIndex--;
  }

  lines.splice(targetIndex, 0, bulletLine);
  return lines.join('\n');
}

export const appendTaskToSection = appendTaskToMarkdownSection;

export type TaskMutationAction =
  | 'toggle'
  | 'update'
  | 'delete'
  | 'increment'
  | 'decrement'
  | 'subtask'
  | 'promote';

export interface TaskMutationOptions {
  action: TaskMutationAction;
  completed?: boolean;
  newText?: string;
  subtaskText?: string;
  subtaskAction?: 'add' | 'toggle';
  priority?: TaskPriority;
  tasksSectionHeader?: string;
  iceboxSectionHeader?: string;
}

export interface TaskMutationResult {
  updatedContent: string;
  success: boolean;
  error?: 'ambiguous' | 'not_found' | 'no_op' | 'invalid_action';
  errorMessage?: string;
  updatedText?: string;
}

export interface LocateResult {
  index: number;
  status: 'exact_position' | 'unique_match' | 'ambiguous' | 'not_found';
  matchingIndices: number[];
}

/**
 * Robust locator for task lines within file content:
 * 1. Checks if the line at locator.lineNumber matches locator.lineHash / originalLine.
 * 2. If it does not match, scans content for unique exact matches.
 * 3. If multiple exact matches are found, returns ambiguous.
 * 4. If no matches, returns not_found.
 */
export function locateTaskLineIndex(lines: string[], locator: TaskLocator): LocateResult {
  // 1. Verify exact position if lineNumber is provided (1-indexed)
  if (
    typeof locator.lineNumber === 'number' &&
    locator.lineNumber >= 1 &&
    locator.lineNumber <= lines.length
  ) {
    const candidateIdx = locator.lineNumber - 1;
    const candidateLine = lines[candidateIdx];

    let matchesPosition = false;
    if (locator.lineHash) {
      matchesPosition = computeLineHash(candidateLine) === locator.lineHash;
    } else if (locator.originalLine !== undefined) {
      matchesPosition = candidateLine === locator.originalLine;
      if (!matchesPosition) {
        const match = candidateLine.match(/^(\s*-\s+(?:\[.\]\s+)?)(.*)$/);
        if (match) {
          const rawTarget = locator.text || locator.originalLine;
          const cleanTarget = rawTarget.replace(/^\s*-\s*\[.\]\s*/, '').trim();
          const lineTitle = match[2].trim();
          const cleanLineTitle = lineTitle.replace(/^[💡🧊]\s*/u, '').trim();
          const cleanLocatorText = cleanTarget.replace(/^[💡🧊]\s*/u, '').trim();
          matchesPosition =
            lineTitle === cleanTarget ||
            cleanLineTitle === cleanLocatorText ||
            getCleanTaskDisplayTitle(cleanLineTitle) === getCleanTaskDisplayTitle(cleanLocatorText);
        }
      }
    } else if (locator.text) {
      const match = candidateLine.match(/^(\s*-\s+(?:\[.\]\s+)?)(.*)$/);
      if (match) {
        const lineTitle = match[2].trim();
        const cleanLineTitle = lineTitle.replace(/^[💡🧊]\s*/u, '').trim();
        const cleanLocatorText = locator.text.trim().replace(/^[💡🧊]\s*/u, '').trim();
        matchesPosition =
          lineTitle === locator.text.trim() ||
          cleanLineTitle === cleanLocatorText ||
          getCleanTaskDisplayTitle(cleanLineTitle) === getCleanTaskDisplayTitle(cleanLocatorText);
      }
    }

    if (matchesPosition) {
      return { index: candidateIdx, status: 'exact_position', matchingIndices: [candidateIdx] };
    }
  }

  // 2. Exact position did not match. Search entire file for exact match.
  const matchingIndices: number[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    let isMatch = false;

    if (locator.lineHash) {
      if (computeLineHash(line) === locator.lineHash) {
        if (locator.originalLine !== undefined) {
          isMatch = (line === locator.originalLine);
        } else {
          isMatch = true;
        }
      }
    } else if (locator.originalLine !== undefined) {
      isMatch = (line === locator.originalLine);
    } else if (locator.text) {
      const match = line.match(/^(\s*-\s+(?:\[.\]\s+)?)(.*)$/);
      if (match) {
        const lineTitle = match[2].trim();
        const cleanLineTitle = lineTitle.replace(/^[💡🧊]\s*/u, '').trim();
        const cleanLocatorText = locator.text.trim().replace(/^[💡🧊]\s*/u, '').trim();
        isMatch =
          lineTitle === locator.text.trim() ||
          cleanLineTitle === cleanLocatorText ||
          getCleanTaskDisplayTitle(cleanLineTitle) === getCleanTaskDisplayTitle(cleanLocatorText);
      }
    }

    if (isMatch) {
      matchingIndices.push(i);
    }
  }

  // 3. Fallback: If locator.originalLine is provided but fails to match any line
  // (which happens if the task in markdown is indented like `  - [ ] Task`),
  // fall back to matching by locator.text (strip `- [ ] ` prefix and match trimmed text).
  if (matchingIndices.length === 0 && locator.originalLine !== undefined) {
    const rawTarget = locator.text || locator.originalLine;
    const cleanTarget = rawTarget.replace(/^\s*-\s*\[.\]\s*/, '').trim();

    if (cleanTarget) {
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        const match = line.match(/^(\s*-\s+(?:\[.\]\s+)?)(.*)$/);
        if (match) {
          const lineTitle = match[2].trim();
          const cleanLineTitle = lineTitle.replace(/^[💡🧊]\s*/u, '').trim();
          const cleanLocatorText = cleanTarget.replace(/^[💡🧊]\s*/u, '').trim();
          if (
            lineTitle === cleanTarget ||
            cleanLineTitle === cleanLocatorText ||
            getCleanTaskDisplayTitle(cleanLineTitle) === getCleanTaskDisplayTitle(cleanLocatorText)
          ) {
            matchingIndices.push(i);
          }
        }
      }
    }
  }

  if (matchingIndices.length === 1) {
    return { index: matchingIndices[0], status: 'unique_match', matchingIndices };
  }
  if (matchingIndices.length > 1) {
    return { index: -1, status: 'ambiguous', matchingIndices };
  }
  return { index: -1, status: 'not_found', matchingIndices: [] };
}

/**
 * Unified pure function to mutate a task line inside markdown content.
 */
export function mutateTaskLineInContent(
  content: string,
  locator: TaskLocator,
  options: TaskMutationOptions
): TaskMutationResult {
  const lines = content.split(/\r?\n/);
  const locateRes = locateTaskLineIndex(lines, locator);

  const isEn = getEffectiveLanguage() === 'en';

  if (locateRes.status === 'ambiguous') {
    return {
      updatedContent: content,
      success: false,
      error: 'ambiguous',
      errorMessage: isEn
        ? `Ambiguity: found ${locateRes.matchingIndices.length} identical tasks and the line changed.`
        : `Ambigüedad: se encontraron ${locateRes.matchingIndices.length} tareas idénticas y la línea cambió.`,
    };
  }

  if (locateRes.status === 'not_found' || locateRes.index === -1) {
    return {
      updatedContent: content,
      success: false,
      error: 'not_found',
      errorMessage: isEn
        ? 'Specified task not found in file.'
        : 'No se encontró la tarea especificada en el archivo.',
    };
  }

  const targetIndex = locateRes.index;
  const targetLine = lines[targetIndex];

  switch (options.action) {
    case 'toggle': {
      const match = targetLine.match(/^(\s*-\s+\[)(.)(\]\s+)(.*)$/);
      if (match) {
        const indentAndDash = match[1];
        const currentStatus = match[2];
        const bracketAndSpace = match[3];
        const lineBody = match[4];

        const isCurrentlyCompleted = currentStatus.toLowerCase() === 'x';
        const willBeCompleted = options.completed !== undefined
          ? options.completed
          : !isCurrentlyCompleted;

        const newChar = willBeCompleted ? 'x' : ' ';
        let newLineBody = lineBody;
        const todayStr = getLocalDateString(new Date());

        if (willBeCompleted) {
          const { completedDate } = parseTaskCompletionDate(newLineBody);
          if (!completedDate) {
            newLineBody = formatTaskWithCompletionDate(newLineBody, todayStr);
          }
        } else {
          const { cleanTitle } = parseTaskCompletionDate(newLineBody);
          newLineBody = cleanTitle;
        }

        lines[targetIndex] = `${indentAndDash}${newChar}${bracketAndSpace}${newLineBody}`;

        // If completing a recurring task, clone next occurrence uncompleted
        if (willBeCompleted) {
          const { recurrence } = parseTaskRecurrence(lineBody);
          if (recurrence) {
            let nextLineBody = parseTaskCompletionDate(lineBody).cleanTitle;
            const { dueDate, dueTime } = parseTaskDeadline(nextLineBody);
            const { scheduledDate } = parseTaskScheduledDate(nextLineBody);
            const { startDate } = parseTaskStartDate(nextLineBody);

            if (dueDate) {
              const nextDue = calculateNextRecurrenceDate(dueDate, recurrence);
              nextLineBody = formatTaskWithDeadline(nextLineBody, nextDue, dueTime);
            }
            if (scheduledDate) {
              const nextSched = calculateNextRecurrenceDate(scheduledDate, recurrence);
              nextLineBody = formatTaskWithScheduledDate(nextLineBody, nextSched);
            }
            if (startDate) {
              const nextStart = calculateNextRecurrenceDate(startDate, recurrence);
              nextLineBody = formatTaskWithStartDate(nextLineBody, nextStart);
            }
            if (!dueDate && !scheduledDate && !startDate) {
              const nextDue = calculateNextRecurrenceDate(todayStr, recurrence);
              nextLineBody = formatTaskWithDeadline(nextLineBody, nextDue);
            }

            const nextTaskLine = `${indentAndDash} ${bracketAndSpace}${nextLineBody}`;
            lines.splice(targetIndex + 1, 0, nextTaskLine);
          }
        }

        return { updatedContent: lines.join('\n'), success: true };
      }
      const bulletMatch = targetLine.match(/^(\s*-\s+)(.*)$/);
      if (bulletMatch) {
        const willBeCompleted = options.completed !== undefined ? options.completed : true;
        const newChar = willBeCompleted ? 'x' : ' ';
        let itemBody = bulletMatch[2];
        if (willBeCompleted) {
          const todayStr = getLocalDateString(new Date());
          const { completedDate } = parseTaskCompletionDate(itemBody);
          if (!completedDate) {
            itemBody = formatTaskWithCompletionDate(itemBody, todayStr);
          }
        }
        lines[targetIndex] = `${bulletMatch[1]}[${newChar}] ${itemBody}`;
        return { updatedContent: lines.join('\n'), success: true };
      }
      return {
        updatedContent: content,
        success: false,
        error: 'no_op',
        errorMessage: isEn ? 'Line is not a list item.' : 'La línea no es un elemento de lista.',
      };
    }

    case 'update': {
      const newText = (options.newText !== undefined ? options.newText : '').trim();
      const match = targetLine.match(/^(\s*-\s+(?:\[.\]\s+)?)(.*)$/);
      if (match) {
        lines[targetIndex] = `${match[1]}${newText}`;
        return { updatedContent: lines.join('\n'), success: true, updatedText: newText };
      }
      return {
        updatedContent: content,
        success: false,
        error: 'no_op',
        errorMessage: isEn ? 'Could not update line text.' : 'No se pudo actualizar el texto de la línea.',
      };
    }

    case 'delete': {
      let count = 1;
      while (targetIndex + count < lines.length && /^(\s{2,}|\t+)-\s+\[.\]/.test(lines[targetIndex + count])) {
        count++;
      }
      lines.splice(targetIndex, count);
      return { updatedContent: lines.join('\n'), success: true };
    }

    case 'increment': {
      const match = targetLine.match(/^(\s*-\s+\[.\]\s+)(.*)$/);
      if (!match) return { updatedContent: content, success: false, error: 'no_op' };
      const prefix = match[1];
      const oldText = match[2].trim();
      const { estimated, completed } = parseTaskPomodoroEstimate(oldText);
      const newCompleted = (completed || 0) + 1;
      const newText = formatTaskWithPomodoroEstimate(oldText, estimated, newCompleted);
      lines[targetIndex] = `${prefix}${newText}`;
      return { updatedContent: lines.join('\n'), success: true, updatedText: newText };
    }

    case 'decrement': {
      const match = targetLine.match(/^(\s*-\s+\[.\]\s+)(.*)$/);
      if (!match) return { updatedContent: content, success: false, error: 'no_op' };
      const prefix = match[1];
      const oldText = match[2].trim();
      const { estimated, completed } = parseTaskPomodoroEstimate(oldText);
      if (!completed || completed <= 0) {
        return {
          updatedContent: content,
          success: false,
          error: 'no_op',
          errorMessage: isEn ? 'No pomodoros to decrement.' : 'No hay pomodoros para decrementar.',
        };
      }
      const newCompleted = Math.max(0, completed - 1);
      const newText = formatTaskWithPomodoroEstimate(oldText, estimated, newCompleted);
      lines[targetIndex] = `${prefix}${newText}`;
      return { updatedContent: lines.join('\n'), success: true, updatedText: newText };
    }

    case 'subtask': {
      if (options.subtaskAction === 'toggle') {
        if (options.subtaskText) {
          let subIdx = targetIndex + 1;
          let foundSub = -1;
          while (subIdx < lines.length && /^(\s{2,}|\t+)-\s+\[.\]/.test(lines[subIdx])) {
            const subMatch = lines[subIdx].match(/^(\s+-\s+\[)(.)(\]\s+)(.*)$/);
            if (subMatch && subMatch[4].trim() === options.subtaskText.trim()) {
              foundSub = subIdx;
              break;
            }
            subIdx++;
          }
          if (foundSub !== -1) {
            const m = lines[foundSub].match(/^(\s+-\s+\[)(.)(\]\s+)(.*)$/)!;
            const targetChar = options.completed !== undefined
              ? (options.completed ? 'x' : ' ')
              : (m[2].toLowerCase() === 'x' ? ' ' : 'x');
            lines[foundSub] = `${m[1]}${targetChar}${m[3]}${m[4]}`;
            return { updatedContent: lines.join('\n'), success: true };
          }
          return {
            updatedContent: content,
            success: false,
            error: 'not_found',
            errorMessage: isEn ? 'Subtask not found.' : 'Subtarea no encontrada.',
          };
        } else {
          // Target line itself is subtask
          const m = targetLine.match(/^(\s+-\s+\[)(.)(\]\s+)(.*)$/);
          if (m) {
            const targetChar = options.completed !== undefined
              ? (options.completed ? 'x' : ' ')
              : (m[2].toLowerCase() === 'x' ? ' ' : 'x');
            lines[targetIndex] = `${m[1]}${targetChar}${m[3]}${m[4]}`;
            return { updatedContent: lines.join('\n'), success: true };
          }
        }
      }

      // Default subtask action is add
      const subText = (options.subtaskText || '').trim();
      if (!subText) {
        return {
          updatedContent: content,
          success: false,
          error: 'no_op',
          errorMessage: isEn ? 'Empty subtask.' : 'Subtarea vacía.',
        };
      }
      let insertAt = targetIndex + 1;
      while (insertAt < lines.length && /^(\s{2,}|\t+)-\s+\[.\]/.test(lines[insertAt])) {
        insertAt++;
      }
      lines.splice(insertAt, 0, `  - [ ] ${subText}`);
      return { updatedContent: lines.join('\n'), success: true };
    }

    case 'promote': {
      const match = targetLine.match(/^(\s*-\s+(?:\[.\]\s+)?)(.*)$/);
      const itemText = match ? match[2].trim() : (locator.text || targetLine);
      lines.splice(targetIndex, 1);
      const withoutIdea = lines.join('\n');

      let cleanTitle = itemText.replace(/#(?:ideas?|icebox)\b/gi, '').replace(/^[💡🧊]\s*/u, '').trim();
      cleanTitle = formatTaskWithPriority(cleanTitle, options.priority !== 'none' && options.priority ? options.priority : 'none');
      const targetSection = options.tasksSectionHeader || getDefaultConventions(getEffectiveLanguage()).tasksSectionHeader;
      const updatedContent = appendTaskToMarkdownSection(withoutIdea, cleanTitle, targetSection);
      return { updatedContent, success: true, updatedText: cleanTitle };
    }

    default:
      return { updatedContent: content, success: false, error: 'invalid_action' };
  }
}

export function incrementTaskPomodoroInContent(
  content: string,
  taskLocatorOrText: TaskLocator | string
): { updatedContent: string; updatedText: string } | null {
  const locator: TaskLocator = typeof taskLocatorOrText === 'string'
    ? { sourceFile: '', text: taskLocatorOrText }
    : taskLocatorOrText;
  const res = mutateTaskLineInContent(content, locator, { action: 'increment' });
  if (res.success && res.updatedText) {
    return { updatedContent: res.updatedContent, updatedText: res.updatedText };
  }
  return null;
}

export function decrementTaskPomodoroInContent(
  content: string,
  taskLocatorOrText: TaskLocator | string
): { updatedContent: string; updatedText: string } | null {
  const locator: TaskLocator = typeof taskLocatorOrText === 'string'
    ? { sourceFile: '', text: taskLocatorOrText }
    : taskLocatorOrText;
  const res = mutateTaskLineInContent(content, locator, { action: 'decrement' });
  if (res.success && res.updatedText) {
    return { updatedContent: res.updatedContent, updatedText: res.updatedText };
  }
  return null;
}

export function promoteIdeaToTaskInContent(
  content: string,
  taskLocatorOrText: TaskLocator | string,
  priority: TaskPriority = 'none'
): { updatedContent: string; promoted: boolean } {
  const locator: TaskLocator = typeof taskLocatorOrText === 'string'
    ? { sourceFile: '', text: taskLocatorOrText }
    : taskLocatorOrText;
  const res = mutateTaskLineInContent(content, locator, { action: 'promote', priority });
  return { updatedContent: res.updatedContent, promoted: res.success };
}

export function toggleTaskCompletionInContent(
  content: string,
  taskLocatorOrText: TaskLocator | string,
  newCompleted?: boolean
): { updatedContent: string; found: boolean } {
  const locator: TaskLocator = typeof taskLocatorOrText === 'string'
    ? { sourceFile: '', text: taskLocatorOrText }
    : taskLocatorOrText;
  const res = mutateTaskLineInContent(content, locator, { action: 'toggle', completed: newCompleted });
  return { updatedContent: res.updatedContent, found: res.success };
}

export function updateTaskTextInContent(
  content: string,
  taskLocatorOrText: TaskLocator | string,
  newText: string
): { updatedContent: string; found: boolean } {
  const locator: TaskLocator = typeof taskLocatorOrText === 'string'
    ? { sourceFile: '', text: taskLocatorOrText }
    : taskLocatorOrText;
  const res = mutateTaskLineInContent(content, locator, { action: 'update', newText });
  return { updatedContent: res.updatedContent, found: res.success };
}

export function toggleSubtaskInContent(
  content: string,
  subtaskLocatorOrText: TaskLocator | string,
  newCompleted?: boolean
): { updatedContent: string; found: boolean } {
  const locator: TaskLocator = typeof subtaskLocatorOrText === 'string'
    ? { sourceFile: '', text: subtaskLocatorOrText }
    : subtaskLocatorOrText;
  const res = mutateTaskLineInContent(content, locator, {
    action: 'subtask',
    subtaskAction: 'toggle',
    completed: newCompleted,
  });
  return { updatedContent: res.updatedContent, found: res.success };
}

export function addSubtaskToContent(
  content: string,
  taskLocatorOrText: TaskLocator | string,
  subtaskText: string
): { updatedContent: string; added: boolean } {
  const locator: TaskLocator = typeof taskLocatorOrText === 'string'
    ? { sourceFile: '', text: taskLocatorOrText }
    : taskLocatorOrText;
  const res = mutateTaskLineInContent(content, locator, {
    action: 'subtask',
    subtaskAction: 'add',
    subtaskText,
  });
  return { updatedContent: res.updatedContent, added: res.success };
}

export function deleteTaskFromContent(
  content: string,
  taskLocatorOrText: TaskLocator | string
): { updatedContent: string; deleted: boolean } {
  const locator: TaskLocator = typeof taskLocatorOrText === 'string'
    ? { sourceFile: '', text: taskLocatorOrText }
    : taskLocatorOrText;
  const res = mutateTaskLineInContent(content, locator, { action: 'delete' });
  return { updatedContent: res.updatedContent, deleted: res.success };
}
