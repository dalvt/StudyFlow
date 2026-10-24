import test from 'node:test';
import assert from 'node:assert/strict';
import { TFile } from 'obsidian';
import { parseProtocolAction } from '../src/protocol-utils.ts';
import { handleStudyFlowProtocol } from '../src/protocol-handler.ts';

test('parseProtocolAction: parses action=start', () => {
  const res = parseProtocolAction({ action: 'start' });
  assert.strictEqual(res.action, 'start');
});

test('parseProtocolAction: parses action=pause', () => {
  const res = parseProtocolAction({ action: 'pause' });
  assert.strictEqual(res.action, 'pause');
});

test('parseProtocolAction: parses action=capture with URL encoded text', () => {
  const res = parseProtocolAction({ action: 'capture', text: 'Estudiar%20Historia%20cap%204' });
  assert.strictEqual(res.action, 'capture');
  assert.strictEqual(res.text, 'Estudiar Historia cap 4');
});

test('parseProtocolAction: parses text-only query as capture', () => {
  const res = parseProtocolAction({ text: 'Repasar formulas' });
  assert.strictEqual(res.action, 'capture');
  assert.strictEqual(res.text, 'Repasar formulas');
});

test('parseProtocolAction: handles aliases cmd=play and do=pause', () => {
  assert.strictEqual(parseProtocolAction({ cmd: 'play' }).action, 'start');
  assert.strictEqual(parseProtocolAction({ do: 'stop' }).action, 'pause');
});

test('parseProtocolAction: parses action=previous and aliases prev/back', () => {
  assert.strictEqual(parseProtocolAction({ action: 'previous' }).action, 'previous');
  assert.strictEqual(parseProtocolAction({ action: 'prev' }).action, 'previous');
  assert.strictEqual(parseProtocolAction({ action: 'back' }).action, 'previous');
  assert.strictEqual(parseProtocolAction({ previous: '' }).action, 'previous');
  assert.strictEqual(parseProtocolAction({ prev: '' }).action, 'previous');
});

test('parseProtocolAction: handles unknown actions safely', () => {
  const res = parseProtocolAction({ action: 'nonexistent' });
  assert.strictEqual(res.action, 'unknown');
});

test('handleStudyFlowProtocol: action=start creates task in Inbox.md if not present and sets active task', async () => {
  const inboxPath = 'StudyFlow/Inbox.md';
  const inboxFile = new TFile(inboxPath);
  inboxFile.content = '# Inbox\n\n## Tareas\n\n## Icebox\n\n';

  let activeTaskSet = null;
  let timerStarted = false;

  const app = {
    vault: {
      getAbstractFileByPath: (p) => (p === inboxPath ? inboxFile : null),
      create: async (p, content) => {
        inboxFile.content = content;
        return inboxFile;
      },
      read: async (f) => f.content,
      process: async (f, fn) => {
        f.content = fn(f.content);
        return f.content;
      },
    },
  };

  const plugin = {
    app,
    settings: {
      inboxFilePath: inboxPath,
      tasksSectionHeader: '## Tareas',
      iceboxSectionHeader: '## Icebox',
    },
    pomodoro: {
      getStatus: () => ({ state: 'idle' }),
      setActiveTask: async (task) => {
        activeTaskSet = task;
      },
      start: async () => {
        timerStarted = true;
      },
    },
  };

  await handleStudyFlowProtocol(plugin, { action: 'start', task: 'Comprar libro de cálculo' });

  assert.ok(
    inboxFile.content.includes('- [ ] Comprar libro de cálculo'),
    'Task must be appended to Inbox.md under ## Tareas'
  );
  assert.strictEqual(activeTaskSet?.text, 'Comprar libro de cálculo');
  assert.strictEqual(timerStarted, true);
});

test('handleStudyFlowProtocol: action=complete-task delegates to completeActiveTask and handles success cleanly', async () => {
  let completedCalled = false;
  let activeTask = { text: 'Mi Tarea Activa', id: 'task-1' };

  const plugin = {
    app: { vault: {} },
    settings: {},
    pomodoro: {
      getActiveTask: () => activeTask,
      completeActiveTask: async () => {
        completedCalled = true;
        activeTask = null;
        return true;
      },
    },
  };

  await handleStudyFlowProtocol(plugin, { action: 'complete-task' });
  assert.strictEqual(completedCalled, true, 'completeActiveTask must be called');
});
