import test from 'node:test';
import assert from 'node:assert/strict';
import { TFile } from 'obsidian';
import {
  DEFAULT_POMODORO_PRESETS,
} from '../src/settings-utils.ts';
import {
  formatStatusBarDisplay,
  restorePomodoroState,
} from '../src/pomodoro-state.ts';
import {
  appendClosingNoteToDailyContent,
  getLocalDateString,
  locateTaskLineIndex,
  mutateTaskLineInContent,
} from '../src/markdown-utils.ts';
import {
  parseProtocolAction,
} from '../src/protocol-utils.ts';
import { PomodoroManager as Pomodoro } from '../src/pomodoro.ts';

// 1. Presets Logic Tests
test('Pomodoro presets: DEFAULT_POMODORO_PRESETS contains 25/5, 50/10, and 90/20 defaults', () => {
  assert.strictEqual(DEFAULT_POMODORO_PRESETS.length, 3);

  const p25 = DEFAULT_POMODORO_PRESETS.find((p) => p.workMinutes === 25);
  assert.ok(p25, 'Preset 25m exists');
  assert.strictEqual(p25.breakMinutes, 5);
  assert.strictEqual(Boolean(p25.isCustom), false);

  const p50 = DEFAULT_POMODORO_PRESETS.find((p) => p.workMinutes === 50);
  assert.ok(p50, 'Preset 50m exists');
  assert.strictEqual(p50.breakMinutes, 10);

  const p90 = DEFAULT_POMODORO_PRESETS.find((p) => p.workMinutes === 90);
  assert.ok(p90, 'Preset 90m exists');
  assert.strictEqual(p90.breakMinutes, 20);
});

test('Pomodoro presets: custom preset structure allows name, work and break durations', () => {
  const custom = {
    id: 'custom-123',
    name: 'Lectura intensa',
    workMinutes: 45,
    breakMinutes: 15,
    isCustom: true,
  };

  assert.strictEqual(custom.isCustom, true);
  assert.strictEqual(custom.workMinutes, 45);
  assert.strictEqual(custom.breakMinutes, 15);
  assert.strictEqual(custom.name, 'Lectura intensa');
});

// 2. Count-Up Mode Logic Tests
test('Count-Up mode: formatStatusBarDisplay formats elapsed time in flow mode', () => {
  const displayRunning = formatStatusBarDisplay(
    'work',
    '02:05',
    false,
    'running',
    undefined,
    true
  );
  assert.strictEqual(displayRunning, '🍅 02:05 ↑');

  const displayPaused = formatStatusBarDisplay(
    'work',
    '01:00',
    false,
    'paused',
    undefined,
    true
  );
  assert.strictEqual(displayPaused, '🍅 01:00 ↑ ⏸');
});

test('Count-Up mode: restorePomodoroState computes elapsed seconds from start timestamp without completing', () => {
  const startTime = 1000000;
  const now = startTime + 180000; // 3 minutes elapsed

  const persisted = {
    mode: 'work',
    state: 'running',
    endTime: startTime,
    remainingSeconds: 0,
    totalDurationSeconds: 0,
    isLongBreak: false,
    isCountUp: true,
    activeTask: null,
  };

  const config = {
    workDurationMin: 25,
    breakDurationMin: 5,
    longBreakDurationMin: 15,
    longBreakInterval: 4,
    autoStartNextPhase: false,
  };

  const { restored, completedSessionOnRestore } = restorePomodoroState(persisted, config, 0, now);

  assert.strictEqual(completedSessionOnRestore, false, 'Count up should never auto-complete on restore');
  assert.strictEqual(restored.isCountUp, true);
  assert.strictEqual(restored.remainingSeconds, 180, 'Elapsed seconds correctly calculated from start timestamp');
  assert.strictEqual(restored.state, 'running');
});

test('Count-Up mode: restorePomodoroState preserves paused state with remainingSeconds', () => {
  const persisted = {
    mode: 'work',
    state: 'paused',
    endTime: 0,
    remainingSeconds: 450,
    totalDurationSeconds: 0,
    isLongBreak: false,
    isCountUp: true,
    activeTask: null,
  };

  const config = {
    workDurationMin: 25,
    breakDurationMin: 5,
    longBreakDurationMin: 15,
    longBreakInterval: 4,
    autoStartNextPhase: false,
  };

  const { restored, completedSessionOnRestore } = restorePomodoroState(persisted, config, 0, 2000000);

  assert.strictEqual(completedSessionOnRestore, false);
  assert.strictEqual(restored.state, 'paused');
  assert.strictEqual(restored.remainingSeconds, 450);
  assert.strictEqual(restored.isCountUp, true);
});

// 3. Focus Session Serialization & Review Tests
test('Session serialization: FocusSessionRecord supports optional notes and distractions in JSONL', () => {
  const session = {
    id: 'sess-001',
    date: '2026-10-13',
    timestamp: 1760390000000,
    durationMinutes: 50,
    interrupted: false,
    taskTitle: 'Desarrollar algoritmo de grafos',
    subject: 'Algoritmos',
    notes: 'Implementé Dijkstra y agregué tests unitarios',
    distractions: 2,
  };

  const jsonLine = JSON.stringify(session);
  const parsed = JSON.parse(jsonLine);

  assert.strictEqual(parsed.id, session.id);
  assert.strictEqual(parsed.durationMinutes, 50);
  assert.strictEqual(parsed.notes, 'Implementé Dijkstra y agregué tests unitarios');
  assert.strictEqual(parsed.distractions, 2);

  // Backward compatibility: legacy session without notes or distractions
  const legacySession = {
    id: 'sess-legacy',
    date: '2026-10-12',
    timestamp: 1760300000000,
    durationMinutes: 25,
    interrupted: false,
  };
  const parsedLegacy = JSON.parse(JSON.stringify(legacySession));
  assert.strictEqual(parsedLegacy.notes, undefined);
  assert.strictEqual(parsedLegacy.distractions, undefined);
});

test('Daily note logging: appendClosingNoteToDailyContent appends progress note and distractions', () => {
  const initialContent = `# 2026-10-13\n\n## Pomodoro\n- 🍅 14:30 · Algoritmos\n`;
  const taskText = 'Algoritmos';
  const reflection = 'Terminé guía 2 · 1 distracción(es)';

  const updated = appendClosingNoteToDailyContent(initialContent, taskText, reflection);
  assert.ok(updated.includes('Terminé guía 2 · 1 distracción(es)'));
  assert.ok(updated.includes('- 🍅 14:30 · Algoritmos'));
});

// 4. Protocol Parser URI Tests
test('Protocol parsing: start action accepts task and subject parameters', () => {
  const params = {
    action: 'start',
    task: 'Terminar%20ejercicios%20de%20f%C3%ADsica',
    subject: 'F%C3%ADsica',
  };
  const parsed = parseProtocolAction(params);

  assert.strictEqual(parsed.action, 'start');
  assert.strictEqual(parsed.task, 'Terminar ejercicios de física');
  assert.strictEqual(parsed.subject, 'Física');
});

test('Protocol parsing: parses reset, skip, and complete-task actions and aliases', () => {
  assert.strictEqual(parseProtocolAction({ action: 'reset' }).action, 'reset');
  assert.strictEqual(parseProtocolAction({ action: 'restart' }).action, 'reset');
  assert.strictEqual(parseProtocolAction({ action: 'skip' }).action, 'skip');
  assert.strictEqual(parseProtocolAction({ action: 'next' }).action, 'skip');
  assert.strictEqual(parseProtocolAction({ action: 'complete-task' }).action, 'complete-task');
  assert.strictEqual(parseProtocolAction({ action: 'complete' }).action, 'complete-task');
});

test('Protocol parsing: parses open action with tab parameter', () => {
  const res = parseProtocolAction({ action: 'open', tab: 'calendar' });
  assert.strictEqual(res.action, 'open');
  assert.strictEqual(res.tab, 'calendar');

  const resAlias = parseProtocolAction({ cmd: 'hub', tab: 'habits' });
  assert.strictEqual(resAlias.action, 'open');
  assert.strictEqual(resAlias.tab, 'habits');
});

// 5. Pomodoro Task Completion & Task Locating Tests
test('Pomodoro completeActiveTask: task with wikilink completes as a task and not a time block', async () => {
  const filePath = 'StudyFlow/Daily/2026-10-19.md';
  const dailyFile = new TFile(filePath);
  dailyFile.content = `# 2026-10-19\n\n## Tareas\n- [ ] Leer [[Capítulo 1]]\n`;

  const app = {
    vault: {
      getAbstractFileByPath: (p) => (p === filePath ? dailyFile : null),
      read: async (f) => f.content,
      process: async (f, fn) => {
        f.content = fn(f.content);
        return f.content;
      },
      getName: () => 'vault-test',
    },
  };

  const plugin = {
    app,
    settings: {
      dailyNotesFolder: 'StudyFlow/Daily',
      habitsFilePath: 'StudyFlow/Habits.md',
    },
    focusSessions: [],
    saveSettings: async () => {},
  };

  const pomodoro = new Pomodoro(plugin);
  await pomodoro.setActiveTask({
    id: 'task-wikilink-1',
    text: 'Leer [[Capítulo 1]]',
    sourceFile: filePath,
  });

  assert.ok(pomodoro.getActiveTask(), 'Task should be active');
  await pomodoro.completeActiveTask();

  // Must be marked as completed task in the markdown file
  assert.ok(dailyFile.content.includes('- [x] Leer [[Capítulo 1]]'), 'Task with wikilink should complete cleanly in markdown');
  assert.strictEqual(pomodoro.getActiveTask(), null, 'Active task should be cleared after completion');
});

test('locateTaskLineIndex: falls back to locator.text when locator.originalLine is unindented but markdown line is indented', () => {
  const lines = [
    '# 2026-10-19',
    '',
    '## Tareas',
    '- [ ] Tarea padre',
    '  - [ ] Subtarea anidada',
    '    - [ ] Nivel 3 anidado',
  ];

  // Locator provides unindented originalLine (e.g. from standard task item formatting)
  const locator = {
    sourceFile: 'Daily/2026-10-19.md',
    originalLine: '- [ ] Subtarea anidada',
    text: 'Subtarea anidada',
  };

  const res = locateTaskLineIndex(lines, locator);
  assert.strictEqual(res.status, 'unique_match');
  assert.strictEqual(res.index, 4);

  // Deeply indented task
  const resDeep = locateTaskLineIndex(lines, {
    sourceFile: 'Daily/2026-10-19.md',
    originalLine: '- [ ] Nivel 3 anidado',
    text: 'Nivel 3 anidado',
  });
  assert.strictEqual(resDeep.status, 'unique_match');
  assert.strictEqual(resDeep.index, 5);
});

test('Pomodoro completeActiveTask: indented subtask completes cleanly preserving indentation', async () => {
  const filePath = 'StudyFlow/Daily/2026-10-19.md';
  const dailyFile = new TFile(filePath);
  dailyFile.content = `# 2026-10-19\n\n## Tareas\n- [ ] Tarea padre\n  - [ ] Subtarea de prueba [[Apuntes]]\n`;

  const app = {
    vault: {
      getAbstractFileByPath: (p) => (p === filePath ? dailyFile : null),
      read: async (f) => f.content,
      process: async (f, fn) => {
        f.content = fn(f.content);
        return f.content;
      },
      getName: () => 'vault-test',
    },
  };

  const plugin = {
    app,
    settings: {
      dailyNotesFolder: 'StudyFlow/Daily',
      habitsFilePath: 'StudyFlow/Habits.md',
    },
    focusSessions: [],
    saveSettings: async () => {},
  };

  const pomodoro = new Pomodoro(plugin);
  await pomodoro.setActiveTask({
    id: 'task-sub-1',
    text: 'Subtarea de prueba [[Apuntes]]',
    originalLine: '- [ ] Subtarea de prueba [[Apuntes]]',
    sourceFile: filePath,
  });

  await pomodoro.completeActiveTask();

  assert.ok(
    dailyFile.content.includes('  - [x] Subtarea de prueba [[Apuntes]]'),
    'Indented subtask must be checked while preserving leading 2-space indentation'
  );
  assert.strictEqual(pomodoro.getActiveTask(), null);
});

test('Pomodoro completeActiveTask: returns false and keeps activeTask when task is not found in file', async () => {
  const filePath = 'StudyFlow/Daily/2026-10-19.md';
  const dailyFile = new TFile(filePath);
  dailyFile.content = `# 2026-10-19\n\n## Tareas\n- [ ] Otra tarea distinta\n`;

  const app = {
    vault: {
      getAbstractFileByPath: (p) => (p === filePath ? dailyFile : null),
      read: async (f) => f.content,
      process: async (f, fn) => {
        f.content = fn(f.content);
        return f.content;
      },
      getName: () => 'vault-test',
    },
  };

  const plugin = {
    app,
    settings: {
      dailyNotesFolder: 'StudyFlow/Daily',
    },
    focusSessions: [],
    saveSettings: async () => {},
  };

  const pomodoro = new Pomodoro(plugin);
  await pomodoro.setActiveTask({
    id: 'task-inexistente',
    text: 'Tarea que no existe en el archivo',
    sourceFile: filePath,
  });

  const completed = await pomodoro.completeActiveTask();
  assert.strictEqual(completed, false, 'completeActiveTask must return false when line is not found');
  assert.ok(pomodoro.getActiveTask() !== null, 'Active task must not be cleared when completion failed');
});

test('Pomodoro completeActiveTask: completes time block started from TodayTab format cleanly', async () => {
  const filePath = 'StudyFlow/Daily/2026-10-19.md';
  const dailyFile = new TFile(filePath);
  dailyFile.content = `# 2026-10-19\n\n## Bloques de Tiempo\n- [ ] 09:00—10:30 Matemáticas Discretas\n`;

  const app = {
    vault: {
      getAbstractFileByPath: (p) => (p === filePath ? dailyFile : null),
      read: async (f) => f.content,
      process: async (f, fn) => {
        f.content = fn(f.content);
        return f.content;
      },
      getName: () => 'vault-test',
    },
  };

  const plugin = {
    app,
    settings: {
      dailyNotesFolder: 'StudyFlow/Daily',
      timeBlocksSectionHeader: '## Bloques de Tiempo',
    },
    focusSessions: [],
    saveSettings: async () => {},
  };

  const pomodoro = new Pomodoro(plugin);

  // Formato generado por TodayTab / CalendarGrid: block.id sin duplicar prefijo y texto con horario
  const blockId = 'block-2026-10-19-09:00-10:30-0';
  await pomodoro.setActiveTask({
    id: blockId,
    text: 'Matemáticas Discretas [09:00 - 10:30]',
    sourceFile: filePath,
    isTimeBlock: true,
  });

  const completed = await pomodoro.completeActiveTask();
  assert.strictEqual(completed, true, 'completeActiveTask should return true for valid time block');
  assert.strictEqual(pomodoro.getActiveTask(), null, 'Active task should be cleared on success');
  assert.ok(dailyFile.content.includes('- [x] 09:00—10:30 Matemáticas Discretas'), 'Time block checkbox should be toggled to [x]');
});

test('Pomodoro onCycleComplete: safely handles Notification throwing TypeError on Android WebView', async () => {
  const filePath = 'StudyFlow/Daily/2026-10-19.md';
  const dailyFile = new TFile(filePath);
  dailyFile.content = `# 2026-10-19\n\n## Tareas\n- [ ] Estudiar para el examen 🍅 1/3\n`;

  const app = {
    vault: {
      getAbstractFileByPath: (p) => (p === filePath ? dailyFile : null),
      read: async (f) => f.content,
      create: async (p, content) => {
        const file = new TFile(p);
        file.content = content;
        return file;
      },
      process: async (f, fn) => {
        f.content = fn(f.content || '');
        return f.content;
      },
      getName: () => 'vault-test',
    },
    workspace: {
      trigger: () => {},
    },
    saveLocalStorage: () => {},
  };

  const plugin = {
    app,
    settings: {
      dailyNotesFolder: 'StudyFlow/Daily',
      habitsFilePath: 'StudyFlow/Habits.md',
      enableSystemNotifications: true,
      enableChimeSound: false,
      enableBreakTips: false,
      pomodoroWorkDuration: 25,
      pomodoroBreakDuration: 5,
      pomodoroLongBreakDuration: 15,
      pomodoroLongBreakInterval: 4,
      autoStartNextPhase: false,
      logPomodoroToDailyNote: false,
      enableSessionClosingReview: false,
    },
    focusSessions: [],
    saveSettings: async () => {},
  };

  const originalNotification = globalThis.Notification;
  const originalDocument = globalThis.document;

  try {
    globalThis.document = {
      hasFocus: () => false,
    };

    // Simulate Android WebView where new Notification(...) throws Illegal constructor
    function FakeIllegalNotification() {
      throw new TypeError('Illegal constructor');
    }
    FakeIllegalNotification.permission = 'granted';
    globalThis.Notification = FakeIllegalNotification;

    const pomodoro = new Pomodoro(plugin);
    await pomodoro.setActiveTask({
      id: 'task-test-notif',
      text: 'Estudiar para el examen 🍅 1/3',
      originalLine: '- [ ] Estudiar para el examen 🍅 1/3',
      sourceFile: filePath,
    });

    await pomodoro.onCycleComplete();

    // Verification 1: Task pomodoro count was incremented despite Notification error
    assert.ok(
      dailyFile.content.includes('- [ ] Estudiar para el examen 🍅 2/3'),
      'Task pomodoro count must be incremented to 2'
    );

    // Verification 2: Session was saved to plugin.focusSessions
    assert.strictEqual(plugin.focusSessions.length, 1, 'Focus session must be recorded');
    assert.strictEqual(plugin.focusSessions[0].durationMinutes, 25);

    // Verification 3: Mode transitioned to break
    assert.strictEqual(pomodoro.mode, 'break', 'Pomodoro mode must transition to break');
  } finally {
    globalThis.Notification = originalNotification;
    globalThis.document = originalDocument;
  }
});

test('Pomodoro restoreState: operates with focusSessions loaded beforehand and transitions to long break when interval reached', async () => {
  const filePath = 'StudyFlow/Daily/2026-10-19.md';
  const dailyFile = new TFile(filePath);
  dailyFile.content = `# 2026-10-19\n\n## Tareas\n- [ ] Tarea en curso 🍅 3/4\n`;

  const localStorageStore = new Map();
  const app = {
    vault: {
      getAbstractFileByPath: (p) => (p === filePath ? dailyFile : null),
      read: async (f) => f.content,
      create: async (p, content) => {
        const file = new TFile(p);
        file.content = content;
        return file;
      },
      process: async (f, fn) => {
        f.content = fn(f.content || '');
        return f.content;
      },
      getName: () => 'vault-test',
    },
    workspace: {
      trigger: () => {},
    },
    loadLocalStorage: (key) => localStorageStore.get(key) || null,
    saveLocalStorage: (key, val) => {
      localStorageStore.set(key, val);
    },
  };

  const todayStr = getLocalDateString(new Date());
  const existingSessions = [
    { id: 's1', timestamp: Date.now() - 3600000 * 3, date: todayStr, durationMinutes: 25, taskText: 'T1', tags: [], interrupted: false },
    { id: 's2', timestamp: Date.now() - 3600000 * 2, date: todayStr, durationMinutes: 25, taskText: 'T2', tags: [], interrupted: false },
    { id: 's3', timestamp: Date.now() - 3600000 * 1, date: todayStr, durationMinutes: 25, taskText: 'T3', tags: [], interrupted: false },
  ];

  const plugin = {
    app,
    settings: {
      dailyNotesFolder: 'StudyFlow/Daily',
      habitsFilePath: 'StudyFlow/Habits.md',
      pomodoroWorkDuration: 25,
      pomodoroBreakDuration: 5,
      pomodoroLongBreakDuration: 15,
      pomodoroLongBreakInterval: 4,
      autoStartNextPhase: false,
      logPomodoroToDailyNote: false,
      enableSessionClosingReview: false,
    },
    focusSessions: [...existingSessions], // Loaded beforehand as done in onLayoutReady
    saveSettings: async () => {},
  };

  const pomodoro = new Pomodoro(plugin);

  // Store a work session that completed 5 minutes ago while Obsidian was closed
  const completedWorkStartTime = Date.now() - 30 * 60 * 1000;
  const storageKey = pomodoro.getLocalStorageKey();
  localStorageStore.set(storageKey, {
    mode: 'work',
    state: 'running',
    endTime: completedWorkStartTime + 25 * 60 * 1000,
    remainingSeconds: 0,
    totalDurationSeconds: 25 * 60,
    isLongBreak: false,
    isCountUp: false,
    activeTask: {
      id: 'task-restore-1',
      text: 'Tarea en curso 🍅 3/4',
      originalLine: '- [ ] Tarea en curso 🍅 3/4',
      sourceFile: filePath,
    },
  });

  await pomodoro.restoreState();

  // Since 3 sessions were already loaded, this 4th session hits longBreakInterval (4)
  assert.strictEqual(plugin.focusSessions.length, 4, 'Restored session must be appended to existing focusSessions');
  assert.strictEqual(pomodoro.mode, 'break');
  assert.strictEqual(pomodoro.isLongBreak, true, 'Must transition to long break because 4th session completed today');
});
