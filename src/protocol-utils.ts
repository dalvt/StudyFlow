export type ProtocolAction = 'start' | 'pause' | 'capture' | 'unknown';

export interface ParsedProtocolParams {
  action: ProtocolAction;
  text?: string;
  raw: Record<string, string>;
}

/**
 * Pure parser for Obsidian Protocol action parameters.
 * Supports:
 * - obsidian://study-flow?action=start
 * - obsidian://study-flow?action=pause
 * - obsidian://study-flow?action=capture&text=Comprar%20libros
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
    else if ('capture' in params || 'text' in params) rawAction = 'capture';
  }

  let action: ProtocolAction = 'unknown';
  if (rawAction === 'start' || rawAction === 'play' || rawAction === 'run') {
    action = 'start';
  } else if (rawAction === 'pause' || rawAction === 'stop') {
    action = 'pause';
  } else if (rawAction === 'capture' || rawAction === 'add' || rawAction === 'new' || params.text) {
    action = 'capture';
  }

  let text = params.text ? params.text.trim() : undefined;
  if (text) {
    try {
      text = decodeURIComponent(text);
    } catch {
      // Keep raw if already decoded or malformed URI
    }
  }

  return {
    action,
    text,
    raw: params,
  };
}
