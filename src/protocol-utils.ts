export type ProtocolAction =
  | 'start'
  | 'pause'
  | 'reset'
  | 'skip'
  | 'complete-task'
  | 'capture'
  | 'open'
  | 'unknown';

export interface ParsedProtocolParams {
  action: ProtocolAction;
  text?: string;
  task?: string;
  subject?: string;
  tab?: string;
  raw: Record<string, string>;
}

/**
 * Pure parser for Obsidian Protocol action parameters.
 * Supports:
 * - obsidian://study-flow?action=start&task=Tarea&subject=Matematicas
 * - obsidian://study-flow?action=pause
 * - obsidian://study-flow?action=reset
 * - obsidian://study-flow?action=skip
 * - obsidian://study-flow?action=complete-task
 * - obsidian://study-flow?action=capture&text=Comprar%20libros
 * - obsidian://study-flow?action=open&tab=calendar
 * - Also handles cmd/do/act aliases and shorthand query flags.
 */
export function parseProtocolAction(params: Record<string, string>): ParsedProtocolParams {
  let rawAction = '';

  if (params.action && params.action.toLowerCase() !== 'study-flow') {
    rawAction = params.action.toLowerCase().trim();
  } else if (params.cmd) {
    rawAction = params.cmd.toLowerCase().trim();
  } else if (params.do) {
    rawAction = params.do.toLowerCase().trim();
  } else if (params.act) {
    rawAction = params.act.toLowerCase().trim();
  }

  // Handle boolean flags like ?start or ?pause or text-only ?text=...
  if (!rawAction) {
    if ('start' in params) rawAction = 'start';
    else if ('pause' in params) rawAction = 'pause';
    else if ('reset' in params) rawAction = 'reset';
    else if ('skip' in params) rawAction = 'skip';
    else if ('complete-task' in params || 'complete' in params) rawAction = 'complete-task';
    else if ('open' in params) rawAction = 'open';
    else if ('capture' in params || 'text' in params) rawAction = 'capture';
  }

  let action: ProtocolAction = 'unknown';
  if (rawAction === 'start' || rawAction === 'play' || rawAction === 'run') {
    action = 'start';
  } else if (rawAction === 'pause' || rawAction === 'stop') {
    action = 'pause';
  } else if (rawAction === 'reset' || rawAction === 'restart') {
    action = 'reset';
  } else if (rawAction === 'skip' || rawAction === 'next') {
    action = 'skip';
  } else if (
    rawAction === 'complete-task' ||
    rawAction === 'complete_task' ||
    rawAction === 'complete' ||
    rawAction === 'finish-task'
  ) {
    action = 'complete-task';
  } else if (rawAction === 'open' || rawAction === 'tab' || rawAction === 'view' || rawAction === 'hub') {
    action = 'open';
  } else if (rawAction === 'capture' || rawAction === 'add' || rawAction === 'new' || params.text) {
    action = 'capture';
  }

  const decodeParam = (val?: string): string | undefined => {
    if (!val) return undefined;
    const trimmed = val.trim();
    if (!trimmed) return undefined;
    try {
      return decodeURIComponent(trimmed);
    } catch {
      return trimmed;
    }
  };

  const text = decodeParam(params.text);
  const task = decodeParam(params.task);
  const subject = decodeParam(params.subject);
  const tab = decodeParam(params.tab);

  return {
    action,
    text,
    task,
    subject,
    tab,
    raw: params,
  };
}
