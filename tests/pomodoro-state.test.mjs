import test from 'node:test';
import assert from 'node:assert/strict';
import {
  countCompletedSessionsToday,
  shouldTriggerLongBreak,
  calculateCycleStreak,
  checkSessionInterrupted,
  completePomodoroCycle,
  restorePomodoroState,
  shouldSendSystemNotification,
  formatStatusBarDisplay,
  getPreviousCycleState,
  getNextCycleState,
} from '../src/pomodoro-state.ts';

test('countCompletedSessionsToday calculates completed sessions for today excluding interrupted ones', () => {
  const refDate = new Date('2026-10-12T14:30:00');
  const history = [
    { date: '2026-10-12', interrupted: false },
    { date: '2026-10-12', interrupted: undefined },
    { date: '2026-10-12', interrupted: true }, // Interrupted! should not count
    { date: '2026-10-11', interrupted: false }, // Yesterday
    { date: '2026-10-13', interrupted: false }, // Tomorrow
  ];

  const count = countCompletedSessionsToday(history, refDate);
  assert.equal(count, 2);
});

test('countCompletedSessionsToday handles empty and null history safely', () => {
  const refDate = new Date('2026-10-12T14:30:00');
  assert.equal(countCompletedSessionsToday([], refDate), 0);
  assert.equal(countCompletedSessionsToday(null, refDate), 0);
  assert.equal(countCompletedSessionsToday(undefined, refDate), 0);
});

test('countCompletedSessionsToday resets automatically across midnight', () => {
  const history = [
    { date: '2026-10-12', interrupted: false },
    { date: '2026-10-12', interrupted: false },
  ];

  const beforeMidnight = new Date('2026-10-12T23:59:50');
  const afterMidnight = new Date('2026-10-13T00:00:10');

  assert.equal(countCompletedSessionsToday(history, beforeMidnight), 2);
  assert.equal(countCompletedSessionsToday(history, afterMidnight), 0);
});

test('shouldTriggerLongBreak triggers only on multiples of N when count > 0', () => {
  const interval = 4;

  assert.equal(shouldTriggerLongBreak(0, interval), false);
  assert.equal(shouldTriggerLongBreak(1, interval), false);
  assert.equal(shouldTriggerLongBreak(2, interval), false);
  assert.equal(shouldTriggerLongBreak(3, interval), false);
  assert.equal(shouldTriggerLongBreak(4, interval), true);
  assert.equal(shouldTriggerLongBreak(7, interval), false);
  assert.equal(shouldTriggerLongBreak(8, interval), true);
  assert.equal(shouldTriggerLongBreak(12, interval), true);

  // Custom interval of 3
  assert.equal(shouldTriggerLongBreak(3, 3), true);
  assert.equal(shouldTriggerLongBreak(4, 3), false);

  // Invalid interval
  assert.equal(shouldTriggerLongBreak(4, 0), false);
  assert.equal(shouldTriggerLongBreak(4, -1), false);
});

test('calculateCycleStreak returns modulo of interval', () => {
  assert.equal(calculateCycleStreak(0, 4), 0);
  assert.equal(calculateCycleStreak(1, 4), 1);
  assert.equal(calculateCycleStreak(2, 4), 2);
  assert.equal(calculateCycleStreak(3, 4), 3);
  assert.equal(calculateCycleStreak(4, 4), 0);
  assert.equal(calculateCycleStreak(5, 4), 1);
});

test('checkSessionInterrupted returns false for non-work mode or idle state', () => {
  // Break mode should not register as interrupted work
  const res1 = checkSessionInterrupted('break', 'running', 300, 100);
  assert.equal(res1.isInterrupted, false);

  // Idle state
  const res2 = checkSessionInterrupted('work', 'idle', 1500, 1500);
  assert.equal(res2.isInterrupted, false);
});

test('checkSessionInterrupted flags sessions with >= 5 minutes elapsed', () => {
  const totalSec = 25 * 60; // 1500 sec

  // 4 min 50 sec elapsed (290 sec) -> not interrupted
  const res1 = checkSessionInterrupted('work', 'running', totalSec, 1500 - 290);
  assert.equal(res1.isInterrupted, false);
  assert.equal(res1.elapsedMinutes, 0);

  // Exactly 5 min elapsed (300 sec) -> interrupted!
  const res2 = checkSessionInterrupted('work', 'running', totalSec, 1500 - 300);
  assert.equal(res2.isInterrupted, true);
  assert.equal(res2.elapsedSeconds, 300);
  assert.equal(res2.elapsedMinutes, 5);

  // 12 min 30 sec elapsed while paused -> interrupted!
  const res3 = checkSessionInterrupted('work', 'paused', totalSec, 1500 - 750);
  assert.equal(res3.isInterrupted, true);
  assert.equal(res3.elapsedSeconds, 750);
  assert.equal(res3.elapsedMinutes, 13);
});

test('completePomodoroCycle transitions from work to short break', () => {
  const config = {
    workDurationMin: 25,
    breakDurationMin: 5,
    longBreakDurationMin: 15,
    longBreakInterval: 4,
    autoStartNextPhase: false,
  };

  const current = {
    mode: 'work',
    totalDurationSeconds: 1500,
    activeTask: { id: 't-1', text: 'Estudiar Historia', sourceFile: 'Inbox.md' },
  };

  // Completed 1 session (not long break)
  const result = completePomodoroCycle(current, config, 1, 100000);
  assert.equal(result.nextMode, 'break');
  assert.equal(result.isLongBreak, false);
  assert.equal(result.totalDurationSeconds, 5 * 60);
  assert.equal(result.remainingSeconds, 5 * 60);
  assert.equal(result.nextState, 'idle');
  assert.equal(result.endTime, 0);
  assert.equal(result.transitionType, 'work_completed');
  assert.deepEqual(result.activeTask, current.activeTask);
});

test('completePomodoroCycle transitions from work to long break when interval reached', () => {
  const config = {
    workDurationMin: 25,
    breakDurationMin: 5,
    longBreakDurationMin: 15,
    longBreakInterval: 4,
    autoStartNextPhase: false,
  };

  const current = {
    mode: 'work',
    totalDurationSeconds: 1500,
    activeTask: null,
  };

  // 4th completed session -> triggers long break!
  const result = completePomodoroCycle(current, config, 4, 100000);
  assert.equal(result.nextMode, 'break');
  assert.equal(result.isLongBreak, true);
  assert.equal(result.totalDurationSeconds, 15 * 60);
  assert.equal(result.remainingSeconds, 15 * 60);
  assert.equal(result.nextState, 'idle');
});

test('completePomodoroCycle auto-starts next phase when configured', () => {
  const config = {
    workDurationMin: 25,
    breakDurationMin: 5,
    longBreakDurationMin: 15,
    longBreakInterval: 4,
    autoStartNextPhase: true,
  };

  const current = {
    mode: 'break',
    totalDurationSeconds: 300,
    activeTask: null,
  };

  const nowMs = 1700000000000;
  const result = completePomodoroCycle(current, config, 4, nowMs);
  assert.equal(result.nextMode, 'work');
  assert.equal(result.nextState, 'running');
  assert.equal(result.totalDurationSeconds, 25 * 60);
  assert.equal(result.endTime, nowMs + 25 * 60 * 1000);
});

test('restorePomodoroState restores default idle state when no persisted state exists', () => {
  const config = {
    workDurationMin: 25,
    breakDurationMin: 5,
    longBreakDurationMin: 15,
    longBreakInterval: 4,
    autoStartNextPhase: false,
  };

  const result = restorePomodoroState(null, config, 0);
  assert.equal(result.restored.state, 'idle');
  assert.equal(result.restored.mode, 'work');
  assert.equal(result.restored.remainingSeconds, 25 * 60);
  assert.equal(result.completedSessionOnRestore, false);
});

test('restorePomodoroState resumes running timer if endTime is still in the future', () => {
  const config = {
    workDurationMin: 25,
    breakDurationMin: 5,
    longBreakDurationMin: 15,
    longBreakInterval: 4,
    autoStartNextPhase: false,
  };

  const nowMs = 1700000000000;
  const persisted = {
    mode: 'work',
    state: 'running',
    endTime: nowMs + 600 * 1000, // 10 minutes remaining
    remainingSeconds: 600,
    totalDurationSeconds: 1500,
    activeTask: { id: 'task-1', text: 'Resolver guía', sourceFile: 'Daily/2026-10-12.md' },
  };

  const result = restorePomodoroState(persisted, config, 0, nowMs);
  assert.equal(result.restored.state, 'running');
  assert.equal(result.restored.remainingSeconds, 600);
  assert.equal(result.completedSessionOnRestore, false);
  assert.equal(result.restored.activeTask?.text, 'Resolver guía');
});

test('restorePomodoroState completes session once if endTime already passed', () => {
  const config = {
    workDurationMin: 25,
    breakDurationMin: 5,
    longBreakDurationMin: 15,
    longBreakInterval: 4,
    autoStartNextPhase: false,
  };

  const nowMs = 1700000000000;
  const persisted = {
    mode: 'work',
    state: 'running',
    endTime: nowMs - 5000, // Ended 5 seconds ago!
    remainingSeconds: 10,
    totalDurationSeconds: 1500,
    activeTask: { id: 't1', text: 'Terminar informe', sourceFile: 'Inbox.md' },
  };

  const result = restorePomodoroState(persisted, config, 1, nowMs);
  // Session was completed once on restore
  assert.equal(result.completedSessionOnRestore, true);
  assert.equal(result.completedMode, 'work');
  // Next phase is break in idle state (not auto-running away)
  assert.equal(result.restored.mode, 'break');
  assert.equal(result.restored.state, 'idle');
  assert.equal(result.restored.remainingSeconds, 5 * 60);
  assert.equal(result.restored.endTime, 0);
  assert.equal(result.restored.activeTask?.text, 'Terminar informe');
});

test('restorePomodoroState restores paused state correctly', () => {
  const config = {
    workDurationMin: 25,
    breakDurationMin: 5,
    longBreakDurationMin: 15,
    longBreakInterval: 4,
    autoStartNextPhase: false,
  };

  const persisted = {
    mode: 'work',
    state: 'paused',
    endTime: 0,
    remainingSeconds: 420,
    totalDurationSeconds: 1500,
    activeTask: null,
  };

  const result = restorePomodoroState(persisted, config, 0);
  assert.equal(result.restored.state, 'paused');
  assert.equal(result.restored.mode, 'work');
  assert.equal(result.restored.remainingSeconds, 420);
  assert.equal(result.completedSessionOnRestore, false);
});

test('shouldSendSystemNotification triggers only when enabled and window is not focused', () => {
  assert.equal(shouldSendSystemNotification(true, false), true);
  assert.equal(shouldSendSystemNotification(true, true), false);
  assert.equal(shouldSendSystemNotification(false, false), false);
  assert.equal(shouldSendSystemNotification(false, true), false);
});

test('formatStatusBarDisplay formats status bar in "🍅 24:59" format without brackets', () => {
  // Idle or running work without task
  assert.equal(formatStatusBarDisplay('work', '24:59', false, 'running'), '🍅 24:59');
  assert.equal(formatStatusBarDisplay('work', '25:00', false, 'idle'), '🍅 25:00');

  // Short break and long break
  assert.equal(formatStatusBarDisplay('break', '05:00', false, 'running'), '☕ 05:00');
  assert.equal(formatStatusBarDisplay('break', '15:00', true, 'running'), '🌴 15:00');

  // Paused status
  assert.equal(formatStatusBarDisplay('work', '12:34', false, 'paused'), '🍅 12:34 ⏸');
  assert.equal(formatStatusBarDisplay('break', '03:10', false, 'paused'), '☕ 03:10 ⏸');

  // With active task
  assert.equal(
    formatStatusBarDisplay('work', '20:00', false, 'running', 'Estudiar matemáticas avanzadas'),
    '🍅 20:00 [Estudiar m...]'
  );

  // Paused with active task
  assert.equal(
    formatStatusBarDisplay('work', '18:22', false, 'paused', 'Repasar anatomía'),
    '🍅 18:22 ⏸ [Repasar an...]'
  );
});

test('getPreviousCycleState: steps back from break to work mode', () => {
  const config = {
    workDurationMin: 25,
    breakDurationMin: 5,
    longBreakDurationMin: 15,
    longBreakInterval: 4,
  };

  const prev = getPreviousCycleState('break', 2, config);
  assert.equal(prev.mode, 'work');
  assert.equal(prev.isLongBreak, false);
  assert.equal(prev.totalDurationSeconds, 25 * 60);
});

test('getPreviousCycleState: steps back from work to break (short or long break depending on interval)', () => {
  const config = {
    workDurationMin: 25,
    breakDurationMin: 5,
    longBreakDurationMin: 15,
    longBreakInterval: 4,
  };

  // 1 session completed today -> short break (5m)
  const prevShort = getPreviousCycleState('work', 1, config);
  assert.equal(prevShort.mode, 'break');
  assert.equal(prevShort.isLongBreak, false);
  assert.equal(prevShort.totalDurationSeconds, 5 * 60);

  // 4 sessions completed today -> long break (15m)
  const prevLong = getPreviousCycleState('work', 4, config);
  assert.equal(prevLong.mode, 'break');
  assert.equal(prevLong.isLongBreak, true);
  assert.equal(prevLong.totalDurationSeconds, 15 * 60);
});

test('getNextCycleState: skips forward between work and break modes', () => {
  const config = {
    workDurationMin: 25,
    breakDurationMin: 5,
    longBreakDurationMin: 15,
    longBreakInterval: 4,
  };

  // From break -> work
  const nextFromBreak = getNextCycleState('break', 2, config);
  assert.equal(nextFromBreak.mode, 'work');
  assert.equal(nextFromBreak.isLongBreak, false);
  assert.equal(nextFromBreak.totalDurationSeconds, 25 * 60);

  // From work -> break (short break when not on interval multiple)
  const nextShortBreak = getNextCycleState('work', 2, config);
  assert.equal(nextShortBreak.mode, 'break');
  assert.equal(nextShortBreak.isLongBreak, false);
  assert.equal(nextShortBreak.totalDurationSeconds, 5 * 60);

  // From work -> break (long break when on interval multiple)
  const nextLongBreak = getNextCycleState('work', 4, config);
  assert.equal(nextLongBreak.mode, 'break');
  assert.equal(nextLongBreak.isLongBreak, true);
  assert.equal(nextLongBreak.totalDurationSeconds, 15 * 60);
});
