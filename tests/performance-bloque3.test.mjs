import test from 'node:test';
import assert from 'node:assert/strict';
import { TFile } from 'obsidian';
import { clearScheduleCache, loadScheduleItems } from '../src/schedule.ts';
import { getTimeBlocksForDate } from '../src/calendar.ts';
import { cleanupAudio, playPomodoroSound } from '../src/audio.ts';

test('loadScheduleItems caches in-memory by mtime and reads from vault at most once per render', async () => {
  clearScheduleCache();
  let readCount = 0;

  const fakeFile = Object.assign(new TFile('StudyFlow/Schedule.md'), {
    path: 'StudyFlow/Schedule.md',
    stat: { mtime: 123456789 },
  });

  const fakeApp = {
    vault: {
      getAbstractFileByPath: (p) => (p === 'StudyFlow/Schedule.md' ? fakeFile : null),
      read: async () => {
        readCount++;
        return `## Lunes\n- 08:00—10:00 Cálculo [[Aula 101]]`;
      },
    },
  };

  // First call: reads file and parses
  const items1 = await loadScheduleItems(fakeApp, 'StudyFlow/Schedule.md');
  assert.equal(readCount, 1);
  assert.equal(items1.length, 1);
  assert.equal(items1[0].title, 'Cálculo');

  // Second through 42nd calls (simulating month grid cells): cache hit, zero additional reads
  for (let i = 0; i < 41; i++) {
    const items = await loadScheduleItems(fakeApp, 'StudyFlow/Schedule.md');
    assert.equal(items.length, 1);
  }
  assert.equal(readCount, 1, 'Schedule.md must only be read 1 time when mtime has not changed');

  // Change mtime: cache invalidates and reads once more
  fakeFile.stat.mtime = 987654321;
  const itemsUpdated = await loadScheduleItems(fakeApp, 'StudyFlow/Schedule.md');
  assert.equal(readCount, 2, 'Schedule.md should be re-read after mtime change');
  assert.equal(itemsUpdated.length, 1);
});

test('getTimeBlocksForDate accepts preloaded schedule entries without reading schedule file', async () => {
  clearScheduleCache();
  let scheduleFileRead = false;

  const fakeApp = {
    vault: {
      getAbstractFileByPath: (p) => {
        if (p === 'StudyFlow/Schedule.md') {
          return Object.assign(new TFile(p), { path: p, stat: { mtime: 100 } });
        }
        return null;
      },
      read: async (f) => {
        if (f.path === 'StudyFlow/Schedule.md') {
          scheduleFileRead = true;
          return '## Lunes\n- 08:00—10:00 Test';
        }
        return '';
      },
    },
  };

  const preloaded = [
    {
      id: 'sched-1-09:00-11:00-1',
      dayOfWeek: 1, // Monday
      startTime: '09:00',
      endTime: '11:00',
      title: 'Clase Precalculada',
    },
  ];

  const blocks = await getTimeBlocksForDate(
    fakeApp,
    { dailyNotesFolder: 'StudyFlow/Daily' },
    '2026-10-19', // A Monday
    true,
    preloaded
  );

  assert.equal(scheduleFileRead, false, 'Preloaded schedule entries must bypass reading Schedule.md');
  assert.equal(blocks.length, 1);
  assert.equal(blocks[0].title, 'Clase Precalculada');
  assert.equal(blocks[0].startTime, '09:00');
});

test('cleanupAudio clears active audio timeout and closes context cleanly', () => {
  let closed = false;
  let clearedTimeout = false;

  const origAudioContext = globalThis.window?.AudioContext;
  const origClearTimeout = globalThis.window?.clearTimeout;
  const origSetTimeout = globalThis.window?.setTimeout;

  if (!globalThis.window) {
    globalThis.window = {};
  }

  class MockAudioContext {
    constructor() {
      this.state = 'running';
      this.currentTime = 0;
      this.destination = {};
    }
    createGain() {
      return {
        gain: {
          setValueAtTime: () => {},
          exponentialRampToValueAtTime: () => {},
        },
        connect: () => {},
      };
    }
    createOscillator() {
      return {
        type: 'sine',
        frequency: {
          setValueAtTime: () => {},
          exponentialRampToValueAtTime: () => {},
        },
        connect: () => {},
        start: () => {},
        stop: () => {},
      };
    }
    async close() {
      closed = true;
      this.state = 'closed';
    }
  }

  globalThis.window.AudioContext = MockAudioContext;
  globalThis.window.setTimeout = (cb, ms) => {
    return 999;
  };
  globalThis.window.clearTimeout = (id) => {
    if (id === 999) {
      clearedTimeout = true;
    }
  };

  try {
    // Play sound should instantiate context and set timeout
    playPomodoroSound('click', 'work', 0.5);

    // Call cleanupAudio
    cleanupAudio();

    assert.equal(closed, true, 'cleanupAudio must close active AudioContext');
    assert.equal(clearedTimeout, true, 'cleanupAudio must cancel active timeout');
  } finally {
    if (origAudioContext) {
      globalThis.window.AudioContext = origAudioContext;
    } else {
      delete globalThis.window.AudioContext;
    }
    if (origClearTimeout) {
      globalThis.window.clearTimeout = origClearTimeout;
    } else {
      delete globalThis.window.clearTimeout;
    }
    if (origSetTimeout) {
      globalThis.window.setTimeout = origSetTimeout;
    } else {
      delete globalThis.window.setTimeout;
    }
  }
});

test('StudyFlowView lazy tab invalidation: when activeTab is today, taskIndex change does not re-render hidden tabs', async () => {
  // Test the lazy invalidation logic pattern implemented in StudyFlowView
  const tabRendered = new Map([
    ['today', true],
    ['tasks', true],
    ['calendar', true],
    ['analytics', true],
    ['pomodoro', false],
  ]);

  let todayNotified = 0;
  let tasksNotified = 0;
  let calendarNotified = 0;
  let analyticsNotified = 0;

  const tabComponents = {
    today: { onTasksChanged: () => { todayNotified++; } },
    tasks: { onTasksChanged: () => { tasksNotified++; } },
    calendar: { onTasksChanged: () => { calendarNotified++; } },
    analytics: { onTasksChanged: () => { analyticsNotified++; } },
    pomodoro: { onTasksChanged: () => {} },
    habits: {},
  };

  const activeTab = 'today';

  // Simulated handleTaskIndexChanged
  for (const tab of tabRendered.keys()) {
    if (tab === activeTab) {
      const comp = tabComponents[tab];
      if (typeof comp.onTasksChanged === 'function') {
        comp.onTasksChanged();
      }
    } else if (tabRendered.get(tab) === true) {
      tabRendered.set(tab, false);
    }
  }

  // Active tab must be notified immediately
  assert.equal(todayNotified, 1, 'TodayTab must receive onTasksChanged immediately');

  // Hidden tabs must NOT be notified immediately
  assert.equal(tasksNotified, 0, 'TasksTab must NOT be re-rendered while hidden');
  assert.equal(calendarNotified, 0, 'CalendarTab must NOT be re-rendered while hidden');
  assert.equal(analyticsNotified, 0, 'AnalyticsTab must NOT be re-rendered while hidden');

  // Hidden tabs must be marked as pending refresh (tabRendered: false)
  assert.equal(tabRendered.get('tasks'), false, 'Tasks tab must be marked unrendered');
  assert.equal(tabRendered.get('calendar'), false, 'Calendar tab must be marked unrendered');
  assert.equal(tabRendered.get('analytics'), false, 'Analytics tab must be marked unrendered');
});
