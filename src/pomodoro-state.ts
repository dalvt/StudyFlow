import { getLocalDateString } from './markdown-utils.ts';

import type { Subject } from './settings-utils.ts';

export type PomodoroState = 'idle' | 'running' | 'paused';
export type PomodoroMode = 'work' | 'break';

export interface ActivePomodoroTask {
  id: string;
  text: string;
  sourceFile: string;
  isTimeBlock?: boolean;
  isHabit?: boolean;
  originalLine?: string;
  lineNumber?: number;
  lineHash?: string;
}

export interface PersistedPomodoroState {
  mode: PomodoroMode;
  state: PomodoroState;
  endTime: number; // unix timestamp in ms (future if running, 0 if idle/paused; or start timestamp if isCountUp)
  remainingSeconds: number;
  totalDurationSeconds: number;
  isLongBreak?: boolean;
  isCountUp?: boolean;
  activeTask: ActivePomodoroTask | null;
  activeSubject?: Subject | null;
}

export interface PomodoroMachineConfig {
  workDurationMin: number;
  breakDurationMin: number;
  longBreakDurationMin: number;
  longBreakInterval: number;
  autoStartNextPhase: boolean;
}

export interface PomodoroStateSnapshot {
  state: PomodoroState;
  mode: PomodoroMode;
  isLongBreak: boolean;
  isCountUp?: boolean;
  remainingSeconds: number;
  totalDurationSeconds: number;
  endTime: number;
  activeTask: ActivePomodoroTask | null;
  activeSubject?: Subject | null;
}

export interface InterruptedSessionCheckResult {
  isInterrupted: boolean;
  elapsedSeconds: number;
  elapsedMinutes: number;
}

export interface CycleTransitionResult {
  nextState: PomodoroState;
  nextMode: PomodoroMode;
  isLongBreak: boolean;
  totalDurationSeconds: number;
  remainingSeconds: number;
  endTime: number;
  activeTask: ActivePomodoroTask | null;
  transitionType: 'work_completed' | 'break_completed';
}

export interface RestoreResult {
  restored: PomodoroStateSnapshot;
  completedSessionOnRestore: boolean;
  completedMode?: PomodoroMode;
}

/**
 * Calculates completed sessions today, derived from focusHistory and filtering out interrupted sessions.
 * Resets automatically across midnight because referenceDate date string changes.
 */
export function countCompletedSessionsToday(
  history: Array<{ date: string; interrupted?: boolean }> | null | undefined,
  referenceDate: Date = new Date()
): number {
  if (!history || !Array.isArray(history)) return 0;
  const todayStr = getLocalDateString(referenceDate);
  return history.filter((s) => s && s.date === todayStr && !s.interrupted).length;
}

/**
 * Checks whether long break should trigger after N completed pomodoros.
 */
export function shouldTriggerLongBreak(
  completedSessionsToday: number,
  interval: number
): boolean {
  if (interval <= 0 || completedSessionsToday <= 0) return false;
  return completedSessionsToday % interval === 0;
}

/**
 * Calculates the current cycle streak within the long break interval.
 */
export function calculateCycleStreak(
  completedSessionsToday: number,
  interval: number
): number {
  const safeInterval = interval > 0 ? interval : 4;
  return completedSessionsToday % safeInterval;
}

/**
 * Evaluates whether an unfinished session qualifies as an interrupted session (>= 5 minutes).
 */
export function checkSessionInterrupted(
  mode: PomodoroMode,
  state: PomodoroState,
  totalDurationSeconds: number,
  remainingSeconds: number,
  minSecondsForInterruption: number = 300 // 5 minutes
): InterruptedSessionCheckResult {
  if (mode !== 'work' || (state !== 'running' && state !== 'paused')) {
    return { isInterrupted: false, elapsedSeconds: 0, elapsedMinutes: 0 };
  }

  const safeRemaining = Math.max(0, remainingSeconds);
  const elapsedSeconds = Math.max(0, totalDurationSeconds - safeRemaining);

  if (elapsedSeconds >= minSecondsForInterruption) {
    const elapsedMinutes = Math.max(1, Math.round(elapsedSeconds / 60));
    return { isInterrupted: true, elapsedSeconds, elapsedMinutes };
  }

  return { isInterrupted: false, elapsedSeconds, elapsedMinutes: 0 };
}

/**
 * Handles transition at the completion of a cycle.
 */
export function completePomodoroCycle(
  current: {
    mode: PomodoroMode;
    totalDurationSeconds: number;
    activeTask: ActivePomodoroTask | null;
  },
  config: PomodoroMachineConfig,
  completedCountAfterWork: number,
  nowMs: number = Date.now()
): CycleTransitionResult {
  if (current.mode === 'work') {
    const isLong = shouldTriggerLongBreak(completedCountAfterWork, config.longBreakInterval);
    const durationMin = isLong ? config.longBreakDurationMin : config.breakDurationMin;
    const durationSec = Math.max(1, durationMin) * 60;
    const nextState: PomodoroState = config.autoStartNextPhase ? 'running' : 'idle';
    const endTime = nextState === 'running' ? nowMs + durationSec * 1000 : 0;

    return {
      nextState,
      nextMode: 'break',
      isLongBreak: isLong,
      totalDurationSeconds: durationSec,
      remainingSeconds: durationSec,
      endTime,
      activeTask: current.activeTask,
      transitionType: 'work_completed',
    };
  } else {
    const durationSec = Math.max(1, config.workDurationMin) * 60;
    const nextState: PomodoroState = config.autoStartNextPhase ? 'running' : 'idle';
    const endTime = nextState === 'running' ? nowMs + durationSec * 1000 : 0;

    return {
      nextState,
      nextMode: 'work',
      isLongBreak: false,
      totalDurationSeconds: durationSec,
      remainingSeconds: durationSec,
      endTime,
      activeTask: current.activeTask,
      transitionType: 'break_completed',
    };
  }
}

/**
 * Restores pomodoro state from persisted data.
 * If endTime has already passed, marks session completed once and transitions to next idle phase.
 */
export function restorePomodoroState(
  persisted: PersistedPomodoroState | null | undefined,
  config: PomodoroMachineConfig,
  completedSessionsToday: number,
  nowMs: number = Date.now()
): RestoreResult {
  if (!persisted) {
    const totalSec = Math.max(1, config.workDurationMin) * 60;
    return {
      restored: {
        state: 'idle',
        mode: 'work',
        isLongBreak: false,
        totalDurationSeconds: totalSec,
        remainingSeconds: totalSec,
        endTime: 0,
        activeTask: null,
      },
      completedSessionOnRestore: false,
    };
  }

  if (persisted.isCountUp) {
    if (persisted.state === 'running') {
      const elapsedSeconds =
        persisted.endTime > 0
          ? Math.max(0, Math.floor((nowMs - persisted.endTime) / 1000))
          : persisted.remainingSeconds || 0;
      return {
        restored: {
          state: 'running',
          mode: 'work',
          isLongBreak: false,
          isCountUp: true,
          totalDurationSeconds: 0,
          remainingSeconds: elapsedSeconds,
          endTime: persisted.endTime,
          activeTask: persisted.activeTask,
          activeSubject: persisted.activeSubject || null,
        },
        completedSessionOnRestore: false,
      };
    }
    if (persisted.state === 'paused') {
      return {
        restored: {
          state: 'paused',
          mode: 'work',
          isLongBreak: false,
          isCountUp: true,
          totalDurationSeconds: 0,
          remainingSeconds: Math.max(0, persisted.remainingSeconds || 0),
          endTime: 0,
          activeTask: persisted.activeTask,
          activeSubject: persisted.activeSubject || null,
        },
        completedSessionOnRestore: false,
      };
    }
    return {
      restored: {
        state: 'idle',
        mode: 'work',
        isLongBreak: false,
        isCountUp: true,
        totalDurationSeconds: 0,
        remainingSeconds: 0,
        endTime: 0,
        activeTask: persisted.activeTask,
        activeSubject: persisted.activeSubject || null,
      },
      completedSessionOnRestore: false,
    };
  }

  if (persisted.state === 'running') {
    if (persisted.endTime > 0 && nowMs >= persisted.endTime) {
      // End time already passed while Obsidian was closed/unloaded
      const completedMode = persisted.mode;
      const countAfter = completedMode === 'work' ? completedSessionsToday + 1 : completedSessionsToday;
      // Complete once and transition to next phase in idle state
      const nonAutoConfig: PomodoroMachineConfig = { ...config, autoStartNextPhase: false };
      const transitioned = completePomodoroCycle(
        {
          mode: persisted.mode,
          totalDurationSeconds: persisted.totalDurationSeconds,
          activeTask: persisted.activeTask,
        },
        nonAutoConfig,
        countAfter,
        nowMs
      );

      return {
        restored: {
          state: 'idle',
          mode: transitioned.nextMode,
          isLongBreak: transitioned.isLongBreak,
          totalDurationSeconds: transitioned.totalDurationSeconds,
          remainingSeconds: transitioned.remainingSeconds,
          endTime: 0,
          activeTask: persisted.activeTask,
          activeSubject: persisted.activeSubject || null,
        },
        completedSessionOnRestore: true,
        completedMode,
      };
    } else {
      // Still running
      const remainingSeconds = Math.max(1, Math.ceil((persisted.endTime - nowMs) / 1000));
      return {
        restored: {
          state: 'running',
          mode: persisted.mode,
          isLongBreak: persisted.isLongBreak || false,
          totalDurationSeconds: persisted.totalDurationSeconds || remainingSeconds,
          remainingSeconds,
          endTime: persisted.endTime,
          activeTask: persisted.activeTask,
          activeSubject: persisted.activeSubject || null,
        },
        completedSessionOnRestore: false,
      };
    }
  }

  if (persisted.state === 'paused') {
    const totalSec = persisted.totalDurationSeconds || persisted.remainingSeconds;
    return {
      restored: {
        state: 'paused',
        mode: persisted.mode,
        isLongBreak: persisted.isLongBreak || false,
        totalDurationSeconds: totalSec,
        remainingSeconds: Math.max(0, persisted.remainingSeconds),
        endTime: 0,
        activeTask: persisted.activeTask,
        activeSubject: persisted.activeSubject || null,
      },
      completedSessionOnRestore: false,
    };
  }

  // Idle state
  const defaultDuration =
    persisted.mode === 'work'
      ? config.workDurationMin * 60
      : (persisted.isLongBreak ? config.longBreakDurationMin : config.breakDurationMin) * 60;
  const totalSec = persisted.totalDurationSeconds || defaultDuration;

  return {
    restored: {
      state: 'idle',
      mode: persisted.mode,
      isLongBreak: persisted.isLongBreak || false,
      totalDurationSeconds: totalSec,
      remainingSeconds: persisted.remainingSeconds || totalSec,
      endTime: 0,
      activeTask: persisted.activeTask,
      activeSubject: persisted.activeSubject || null,
    },
    completedSessionOnRestore: false,
  };
}

/**
 * Pure check for whether system notification should be dispatched.
 */
export function shouldSendSystemNotification(
  enableNotifications: boolean,
  isWindowFocused: boolean
): boolean {
  return Boolean(enableNotifications && !isWindowFocused);
}

/**
 * Formats the Pomodoro status bar display label without brackets.
 * Format: `🍅 24:59` (or with paused indicator / task tag).
 */
export function formatStatusBarDisplay(
  mode: PomodoroMode,
  formattedTime: string,
  isLongBreak: boolean = false,
  state: PomodoroState = 'idle',
  activeTaskText?: string,
  isCountUp: boolean = false
): string {
  const icon = mode === 'work' ? '🍅' : (isLongBreak ? '🌴' : '☕');
  const countUpIndicator = isCountUp ? ' ↑' : '';
  const taskTag = activeTaskText ? ` [${activeTaskText.slice(0, 10)}...]` : '';
  const pauseSuffix = state === 'paused' ? ' ⏸' : '';
  return `${icon} ${formattedTime}${countUpIndicator}${pauseSuffix}${taskTag}`;
}

/**
 * Calculates the previous cycle mode and duration when user steps backwards (←).
 */
export function getPreviousCycleState(
  currentMode: PomodoroMode,
  completedSessionsToday: number,
  config: {
    workDurationMin: number;
    breakDurationMin: number;
    longBreakDurationMin: number;
    longBreakInterval: number;
  }
): {
  mode: PomodoroMode;
  isLongBreak: boolean;
  totalDurationSeconds: number;
} {
  if (currentMode === 'break') {
    return {
      mode: 'work',
      isLongBreak: false,
      totalDurationSeconds: Math.max(1, config.workDurationMin) * 60,
    };
  } else {
    const isLong = shouldTriggerLongBreak(completedSessionsToday, config.longBreakInterval);
    const durationMin = isLong ? config.longBreakDurationMin : config.breakDurationMin;
    return {
      mode: 'break',
      isLongBreak: isLong,
      totalDurationSeconds: Math.max(1, durationMin) * 60,
    };
  }
}

/**
 * Calculates the next cycle mode and duration when user skips forward (→).
 */
export function getNextCycleState(
  currentMode: PomodoroMode,
  completedSessionsToday: number,
  config: {
    workDurationMin: number;
    breakDurationMin: number;
    longBreakDurationMin: number;
    longBreakInterval: number;
  }
): {
  mode: PomodoroMode;
  isLongBreak: boolean;
  totalDurationSeconds: number;
} {
  if (currentMode === 'work') {
    const isLong = shouldTriggerLongBreak(completedSessionsToday, config.longBreakInterval);
    const durationMin = isLong ? config.longBreakDurationMin : config.breakDurationMin;
    return {
      mode: 'break',
      isLongBreak: isLong,
      totalDurationSeconds: Math.max(1, durationMin) * 60,
    };
  } else {
    return {
      mode: 'work',
      isLongBreak: false,
      totalDurationSeconds: Math.max(1, config.workDurationMin) * 60,
    };
  }
}
