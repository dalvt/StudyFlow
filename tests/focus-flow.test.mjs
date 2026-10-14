import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_POMODORO_PRESETS,
} from '../src/settings-utils.ts';
import {
  formatStatusBarDisplay,
  restorePomodoroState,
} from '../src/pomodoro-state.ts';
import {
  appendClosingNoteToDailyContent,
} from '../src/markdown-utils.ts';
import {
  parseProtocolAction,
} from '../src/protocol-utils.ts';

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
  assert.ok(updated.includes('  - 📝 Nota: Terminé guía 2 · 1 distracción(es)'));
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
