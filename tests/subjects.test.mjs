import test from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizeTag,
  matchesSubjectTag,
  getLocalWeekRange,
  calculateSubjectWeeklyFocusMinutes,
  calculateSubjectTaskPomodoros,
  calculateSubjectGoalStreak,
  computeSubjectsAnalyticsSummary,
  computeSubjectsWeeklyProgress,
} from '../src/subject-analytics.ts';
import {
  computeWeeklyFocusTrend,
  computeFocusAllocation,
} from '../src/analytics.ts';
import {
  computeHabitHeatmapYear,
} from '../src/habits.ts';
import { AnalyticsTab } from '../src/ui/analytics-tab.ts';
import { renderAnalyticsDashboard } from '../src/analytics-ui.ts';

test('normalizeTag normalizes tags with lowercasing and leading hash', () => {
  assert.equal(normalizeTag(''), '');
  assert.equal(normalizeTag('   '), '');
  assert.equal(normalizeTag('algebra'), '#algebra');
  assert.equal(normalizeTag('#algebra'), '#algebra');
  assert.equal(normalizeTag('#AlgebraLineal'), '#algebralineal');
  assert.equal(normalizeTag('  #BIO_101  '), '#bio_101');
});

test('matchesSubjectTag matches tags array or text content accurately', () => {
  assert.equal(matchesSubjectTag('#algebra', ['#algebra', '#tarea']), true);
  assert.equal(matchesSubjectTag('algebra', ['#Algebra']), true);
  assert.equal(matchesSubjectTag('#algebra', [], 'Estudiar para el examen #algebra'), true);
  assert.equal(matchesSubjectTag('#algebra', ['#calculo'], 'Sin tag en texto'), false);
  assert.equal(matchesSubjectTag('', ['#algebra']), false);
});

test('getLocalWeekRange calculates local Monday to Sunday range correctly', () => {
  // Wednesday, October 14, 2026
  const wed = new Date(2026, 9, 14, 15, 30);
  const wedRange = getLocalWeekRange(wed);
  assert.equal(wedRange.startDateStr, '2026-10-12'); // Monday
  assert.equal(wedRange.endDateStr, '2026-10-18'); // Sunday
  assert.equal(wedRange.startMonday.getDay(), 1);
  assert.equal(wedRange.endSunday.getDay(), 0);

  // Monday, October 12, 2026
  const mon = new Date(2026, 9, 12, 9, 0);
  const monRange = getLocalWeekRange(mon);
  assert.equal(monRange.startDateStr, '2026-10-12');
  assert.equal(monRange.endDateStr, '2026-10-18');

  // Sunday, October 18, 2026 (late evening)
  const sun = new Date(2026, 9, 18, 23, 45);
  const sunRange = getLocalWeekRange(sun);
  assert.equal(sunRange.startDateStr, '2026-10-12');
  assert.equal(sunRange.endDateStr, '2026-10-18');

  // Month-crossing week: Sunday, November 1, 2026
  // Monday is Oct 26, Sunday is Nov 1
  const crossingSun = new Date(2026, 10, 1, 10, 0);
  const crossingRange = getLocalWeekRange(crossingSun);
  assert.equal(crossingRange.startDateStr, '2026-10-26');
  assert.equal(crossingRange.endDateStr, '2026-11-01');
});

test('calculateSubjectWeeklyFocusMinutes aggregates minutes and counts within week range', () => {
  const subject = {
    id: 'sub-1',
    name: 'Álgebra',
    tag: '#algebra',
    color: '#4f46e5',
    weeklyGoalHours: 4,
  };

  const sessions = [
    // Inside week 2026-10-12 to 2026-10-18
    { id: '1', timestamp: 1, date: '2026-10-12', durationMinutes: 50, tags: ['#algebra'] },
    { id: '2', timestamp: 2, date: '2026-10-14', durationMinutes: 25, tags: ['#algebra'] },
    { id: '3', timestamp: 3, date: '2026-10-15', durationMinutes: 60, tags: ['#calculo'] }, // Other subject
    { id: '4', timestamp: 4, date: '2026-10-18', durationMinutes: 30, taskText: 'Guía #algebra', tags: [] },
    // Outside week
    { id: '5', timestamp: 5, date: '2026-10-11', durationMinutes: 90, tags: ['#algebra'] }, // Previous Sunday
    { id: '6', timestamp: 6, date: '2026-10-19', durationMinutes: 60, tags: ['#algebra'] }, // Next Monday
  ];

  const result = calculateSubjectWeeklyFocusMinutes(sessions, subject, '2026-10-12', '2026-10-18');
  assert.equal(result.actualMinutes, 105); // 50 + 25 + 30
  assert.equal(result.sessionCount, 3);
});

test('calculateSubjectTaskPomodoros aggregates estimated and completed counts per subject', () => {
  const subject = {
    id: 'sub-1',
    name: 'Física',
    tag: '#fisica',
    color: '#10b981',
    weeklyGoalHours: 5,
  };

  const tasks = [
    {
      id: 't1',
      originalLine: '- [ ] Guía Cinemática #fisica 🍅 4/2',
      text: 'Guía Cinemática #fisica',
      sourceFile: 'Inbox.md',
      completed: false,
      statusChar: ' ',
      tags: ['#fisica'],
      estimatedPomodoros: 4,
      completedPomodoros: 2,
    },
    {
      id: 't2',
      originalLine: '- [x] Resumen Termodinámica #fisica 🍅 2/2',
      text: 'Resumen Termodinámica #fisica',
      sourceFile: 'Inbox.md',
      completed: true,
      statusChar: 'x',
      tags: ['#fisica'],
      estimatedPomodoros: 2,
      completedPomodoros: 2,
    },
    {
      id: 't3',
      originalLine: '- [ ] Historia trabajo #historia 🍅 3/0',
      text: 'Historia trabajo #historia',
      sourceFile: 'Inbox.md',
      completed: false,
      statusChar: ' ',
      tags: ['#historia'],
      estimatedPomodoros: 3,
      completedPomodoros: 0,
    },
  ];

  const result = calculateSubjectTaskPomodoros(tasks, subject);
  assert.equal(result.totalTasks, 2);
  assert.equal(result.completedTasks, 1);
  assert.equal(result.estimatedPomodoros, 6);
  assert.equal(result.completedPomodoros, 4);
});

test('calculateSubjectGoalStreak computes consecutive weekly goal achievements', () => {
  const subject = {
    id: 'sub-1',
    name: 'Química',
    tag: '#quimica',
    color: '#f59e0b',
    weeklyGoalHours: 3, // 180 minutes
  };

  // Current week: Wednesday 2026-10-14 (week 2026-10-12 to 2026-10-18)
  const refDate = new Date(2026, 9, 14, 12, 0);

  // Case A: Prior 2 weeks met, current week in progress (60m < 180m) -> streak 2
  const sessionsA = [
    // 2 weeks ago (Oct 01): 200m
    { id: '1', timestamp: 1, date: '2026-10-01', durationMinutes: 200, tags: ['#quimica'] },
    // 1 week ago (Oct 08): 190m
    { id: '2', timestamp: 2, date: '2026-10-08', durationMinutes: 190, tags: ['#quimica'] },
    // Current week: 60m
    { id: '3', timestamp: 3, date: '2026-10-13', durationMinutes: 60, tags: ['#quimica'] },
  ];
  assert.equal(calculateSubjectGoalStreak(sessionsA, subject, refDate), 2);

  // Case B: Current week completes 180m -> streak becomes 3
  const sessionsB = [
    ...sessionsA,
    { id: '4', timestamp: 4, date: '2026-10-14', durationMinutes: 130, tags: ['#quimica'] },
  ];
  assert.equal(calculateSubjectGoalStreak(sessionsB, subject, refDate), 3);

  // Case C: Prior week (Oct 05-11) failed (< 180m), current week in progress -> streak 0
  const sessionsC = [
    { id: '1', timestamp: 1, date: '2026-10-01', durationMinutes: 200, tags: ['#quimica'] },
    { id: '2', timestamp: 2, date: '2026-10-08', durationMinutes: 50, tags: ['#quimica'] }, // Failed
    { id: '3', timestamp: 3, date: '2026-10-13', durationMinutes: 60, tags: ['#quimica'] },
  ];
  assert.equal(calculateSubjectGoalStreak(sessionsC, subject, refDate), 0);

  // Case D: Goal is 0 -> streak is 0
  const zeroGoalSubject = { ...subject, weeklyGoalHours: 0 };
  assert.equal(calculateSubjectGoalStreak(sessionsB, zeroGoalSubject, refDate), 0);
});

test('computeSubjectsAnalyticsSummary calculates summary for all subjects', () => {
  const subjects = [
    { id: 's1', name: 'Álgebra', tag: '#algebra', color: '#6366f1', weeklyGoalHours: 2 }, // 120m
    { id: 's2', name: 'Literatura', tag: '#literatura', color: '#ec4899', weeklyGoalHours: 1 }, // 60m
  ];

  const sessions = [
    { id: '1', timestamp: 1, date: '2026-10-13', durationMinutes: 90, tags: ['#algebra'] },
    { id: '2', timestamp: 2, date: '2026-10-14', durationMinutes: 60, tags: ['#literatura'] },
  ];

  const tasks = [
    {
      id: 't1',
      originalLine: '- [ ] Guía Álgebra #algebra 🍅 4/2',
      text: 'Guía Álgebra #algebra',
      sourceFile: 'Inbox.md',
      completed: false,
      statusChar: ' ',
      tags: ['#algebra'],
      estimatedPomodoros: 4,
      completedPomodoros: 2,
    },
  ];

  const refDate = new Date(2026, 9, 14, 12, 0);
  const summary = computeSubjectsAnalyticsSummary(sessions, tasks, subjects, refDate);

  assert.equal(summary.weekStartDate, '2026-10-12');
  assert.equal(summary.weekEndDate, '2026-10-18');
  assert.equal(summary.subjects.length, 2);

  const algebra = summary.subjects[0];
  assert.equal(algebra.subject.name, 'Álgebra');
  assert.equal(algebra.goalMinutes, 120);
  assert.equal(algebra.actualMinutes, 90);
  assert.equal(algebra.percentage, 75);
  assert.equal(algebra.estimatedPomodoros, 4);
  assert.equal(algebra.completedPomodoros, 2);

  const lit = summary.subjects[1];
  assert.equal(lit.subject.name, 'Literatura');
  assert.equal(lit.goalMinutes, 60);
  assert.equal(lit.actualMinutes, 60);
  assert.equal(lit.percentage, 100);
});

test('calculateSubjectWeeklyFocusMinutes excludes interrupted sessions', () => {
  const subject = {
    id: 'sub-1',
    name: 'Álgebra',
    tag: '#algebra',
    color: '#4f46e5',
    weeklyGoalHours: 4,
  };

  const sessions = [
    { id: '1', timestamp: 1, date: '2026-10-12', durationMinutes: 50, tags: ['#algebra'], interrupted: false },
    { id: '2', timestamp: 2, date: '2026-10-14', durationMinutes: 25, tags: ['#algebra'], interrupted: true }, // Interrupted
    { id: '3', timestamp: 3, date: '2026-10-15', durationMinutes: 30, tags: ['#algebra'] }, // Completed (default undefined is not interrupted)
    { id: '4', timestamp: 4, date: '2026-10-16', durationMinutes: 40, tags: ['#algebra'], interrupted: true }, // Interrupted
  ];

  const result = calculateSubjectWeeklyFocusMinutes(sessions, subject, '2026-10-12', '2026-10-18');
  assert.equal(result.actualMinutes, 80); // 50 + 30
  assert.equal(result.sessionCount, 2);
});

test('computeWeeklyFocusTrend and computeFocusAllocation exclude interrupted sessions', () => {
  const refDate = new Date(2026, 9, 14, 12, 0); // 2026-10-14
  const sessions = [
    { id: '1', timestamp: 1, date: '2026-10-14', durationMinutes: 25, tags: ['#focus'], interrupted: false },
    { id: '2', timestamp: 2, date: '2026-10-14', durationMinutes: 10, tags: ['#focus'], interrupted: true }, // Should be excluded
    { id: '3', timestamp: 3, date: '2026-10-13', durationMinutes: 50, tags: ['#study'], interrupted: false },
    { id: '4', timestamp: 4, date: '2026-10-13', durationMinutes: 15, tags: ['#study'], interrupted: true }, // Should be excluded
  ];

  const trend = computeWeeklyFocusTrend(sessions, refDate, 7);
  const todayEntry = trend.find((d) => d.date === '2026-10-14');
  assert.ok(todayEntry);
  assert.equal(todayEntry.totalMinutes, 25);
  assert.equal(todayEntry.sessionCount, 1);

  const prevEntry = trend.find((d) => d.date === '2026-10-13');
  assert.ok(prevEntry);
  assert.equal(prevEntry.totalMinutes, 50);
  assert.equal(prevEntry.sessionCount, 1);

  const allocation = computeFocusAllocation(sessions);
  assert.equal(allocation.totalMinutes, 75); // 25 + 50
  assert.equal(allocation.totalSessions, 2);
});

test('getLocalWeekRange handles weekStartDay: sunday correctly', () => {
  // Wednesday, October 14, 2026
  const wed = new Date(2026, 9, 14, 15, 30);
  const wedRange = getLocalWeekRange(wed, 'sunday');
  assert.equal(wedRange.startDateStr, '2026-10-11'); // Sunday
  assert.equal(wedRange.endDateStr, '2026-10-17'); // Saturday
  assert.equal(wedRange.startMonday.getDay(), 0); // Sunday
  assert.equal(wedRange.endSunday.getDay(), 6); // Saturday

  // Sunday, October 11, 2026 (first day of week)
  const sun = new Date(2026, 9, 11, 8, 0);
  const sunRange = getLocalWeekRange(sun, 'sunday');
  assert.equal(sunRange.startDateStr, '2026-10-11');
  assert.equal(sunRange.endDateStr, '2026-10-17');

  // Saturday, October 17, 2026 (last day of week)
  const sat = new Date(2026, 9, 17, 23, 50);
  const satRange = getLocalWeekRange(sat, 'sunday');
  assert.equal(satRange.startDateStr, '2026-10-11');
  assert.equal(satRange.endDateStr, '2026-10-17');

  // Sunday, October 18, 2026 (new week starts)
  const nextSun = new Date(2026, 9, 18, 0, 5);
  const nextSunRange = getLocalWeekRange(nextSun, 'sunday');
  assert.equal(nextSunRange.startDateStr, '2026-10-18');
  assert.equal(nextSunRange.endDateStr, '2026-10-24');
});

test('computeHabitHeatmapYear handles weekStartDay: sunday correctly', () => {
  const habits = [
    {
      id: 'h1',
      name: 'Leer',
      frequency: 'daily',
      history: ['2026-10-11', '2026-10-14'],
      streak: 2,
    },
  ];

  // Wednesday, October 14, 2026
  const refDate = new Date(2026, 9, 14, 12, 0);
  const data = computeHabitHeatmapYear(habits, refDate, 1, 'sunday');

  assert.equal(data.weeks.length, 1);
  const week = data.weeks[0];
  assert.equal(week.days.length, 7);

  // Sunday is day 0, Saturday is day 6
  assert.equal(week.days[0].date, '2026-10-11');
  assert.equal(week.days[0].dayOfWeek, 0);
  assert.equal(week.days[0].completedCount, 1);

  assert.equal(week.days[3].date, '2026-10-14');
  assert.equal(week.days[3].completedCount, 1);

  assert.equal(week.days[6].date, '2026-10-17');
  assert.equal(week.days[6].dayOfWeek, 6);
});

function createMockElement(tag = 'div') {
  const el = {
    tag,
    children: [],
    classes: new Set(),
    attributes: {},
    listeners: {},
    text: '',
    checked: false,
    style: {},
    empty() {
      el.children = [];
    },
    addClass(cls) {
      if (cls) cls.split(/\s+/).filter(Boolean).forEach((c) => el.classes.add(c));
      return el;
    },
    removeClass(cls) {
      if (cls) cls.split(/\s+/).filter(Boolean).forEach((c) => el.classes.delete(c));
      return el;
    },
    toggleClass(cls, val) {
      if (val === undefined) val = !el.classes.has(cls);
      if (val) el.addClass(cls);
      else el.removeClass(cls);
      return el;
    },
    setText(txt) {
      el.text = txt;
      return el;
    },
    setAttribute(k, v) {
      el.attributes[k] = v;
    },
    createDiv(options = {}) {
      const child = createMockElement('div');
      if (options.cls) child.addClass(options.cls);
      if (options.text) child.setText(options.text);
      el.children.push(child);
      return child;
    },
    createSpan(options = {}) {
      const child = createMockElement('span');
      if (options.cls) child.addClass(options.cls);
      if (options.text) child.setText(options.text);
      el.children.push(child);
      return child;
    },
    createEl(t, options = {}) {
      const child = createMockElement(t);
      if (options.cls) child.addClass(options.cls);
      if (options.text) child.setText(options.text);
      if (options.type) child.type = options.type;
      el.children.push(child);
      return child;
    },
    addEventListener(event, fn) {
      el.listeners[event] = el.listeners[event] || [];
      el.listeners[event].push(fn);
    },
    dispatchEvent(event) {
      const fns = el.listeners[event] || [];
      for (const fn of fns) fn();
    },
    click() {
      el.dispatchEvent('click');
    },
    querySelectorAll(selector) {
      const results = [];
      const traverse = (node) => {
        if (selector.startsWith('.') && node.classes.has(selector.slice(1))) {
          results.push(node);
        }
        for (const child of node.children) {
          traverse(child);
        }
      };
      traverse(el);
      return results;
    },
    querySelector(selector) {
      const all = el.querySelectorAll(selector);
      return all[0] || null;
    },
  };
  return el;
}

test('computeSubjectsWeeklyProgress computes summary, metrics, and tasks count correctly', () => {
  const subjects = [
    { id: 's1', name: 'Álgebra Lineal', tag: '#algebra', color: '#6366f1', weeklyGoalHours: 2 },
  ];
  const sessions = [
    { id: 'sess1', timestamp: 1, date: '2026-10-14', durationMinutes: 60, tags: ['#algebra'] },
  ];
  const tasks = [
    { id: 't1', text: 'Tarea 1 #algebra', completed: true, tags: ['#algebra'], estimatedPomodoros: 2, completedPomodoros: 2 },
    { id: 't2', text: 'Tarea 2 #algebra', completed: false, tags: ['#algebra'], estimatedPomodoros: 2, completedPomodoros: 0 },
  ];

  // Pass refDate: undefined, should use default new Date()
  const summary = computeSubjectsWeeklyProgress(subjects, sessions, tasks, undefined, 'monday');
  assert.ok(summary);
  assert.equal(summary.subjects.length, 1);

  const sub = summary.subjects[0];
  assert.equal(sub.subject.name, 'Álgebra Lineal');
  assert.equal(sub.goalMinutes, 120);
  assert.equal(sub.totalTasks, 2);
  assert.equal(sub.completedTasks, 1);
  assert.equal(sub.pendingTasks, 1);
  assert.equal(sub.estimatedPomodoros, 4);
  assert.equal(sub.completedPomodoros, 2);
});

test('renderAnalyticsDashboard renders Weekly Subject Progress Card with progress bar, subject color, and metrics', async () => {
  const mockApp = {
    vault: {
      getAbstractFileByPath: () => null,
      read: async () => '',
      process: async () => '',
      create: async () => null,
      modify: async () => {},
    },
    workspace: {
      getLeavesOfType: () => [],
      onLayoutReady: (cb) => cb(),
    },
  };

  const mockPlugin = {
    app: mockApp,
    settings: {
      habitsFilePath: 'Habits.md',
      subjects: [
        {
          id: 'sub-alg',
          name: 'Álgebra Lineal',
          tag: '#algebra',
          color: '#6366f1',
          weeklyGoalHours: 4,
        },
      ],
      weekStartDay: 'monday',
    },
    focusSessions: [],
    taskIndex: {
      getAllTasks: () => [
        {
          id: 't1',
          text: 'Resolver examen #algebra',
          completed: true,
          tags: ['#algebra'],
          estimatedPomodoros: 2,
          completedPomodoros: 2,
        },
        {
          id: 't2',
          text: 'Guía vectores #algebra',
          completed: false,
          tags: ['#algebra'],
          estimatedPomodoros: 3,
          completedPomodoros: 0,
        },
      ],
    },
  };

  const container = createMockElement('div');
  await renderAnalyticsDashboard(container, mockApp, mockPlugin);

  // Card exists
  const card = container.querySelector('.study-flow-subjects-card');
  assert.ok(card, 'Subjects card should be rendered');

  // Rows and bars exist
  const rows = container.querySelectorAll('.study-flow-subject-progress-row');
  assert.equal(rows.length, 1, 'Should render 1 subject progress row');

  const bgTrack = container.querySelectorAll('.study-flow-subject-progress-bar-bg');
  assert.equal(bgTrack.length, 1, 'Should render subject progress bar background');

  const fillBar = container.querySelectorAll('.study-flow-subject-progress-bar-fill');
  assert.equal(fillBar.length, 1, 'Should render subject progress bar fill');
  assert.equal(fillBar[0].style.backgroundColor, '#6366f1', 'Fill bar should have subject color');

  const colorDot = container.querySelector('.study-flow-subject-color-dot');
  assert.ok(colorDot, 'Color dot should be rendered');
  assert.equal(colorDot.style.backgroundColor, '#6366f1', 'Color dot should have subject color');

  // Task metrics
  const pomoRow = container.querySelector('.study-flow-subject-pomo-row');
  assert.ok(pomoRow, 'Pomo/tasks row should be rendered');
  const tasksSpan = pomoRow.children[0];
  assert.ok(tasksSpan && tasksSpan.text.includes('1'), 'Tasks metrics should be present');
});

test('renderAnalyticsDashboard does NOT render Weekly Subject Progress Card when no subjects configured', async () => {
  const mockApp = {
    vault: {
      getAbstractFileByPath: () => null,
      read: async () => '',
      process: async () => '',
      create: async () => null,
      modify: async () => {},
    },
    workspace: {
      getLeavesOfType: () => [],
      onLayoutReady: (cb) => cb(),
    },
  };

  const mockPlugin = {
    app: mockApp,
    settings: {
      habitsFilePath: 'Habits.md',
      subjects: [],
      weekStartDay: 'monday',
    },
    focusSessions: [],
    taskIndex: {
      getAllTasks: () => [],
    },
  };

  const container = createMockElement('div');
  await renderAnalyticsDashboard(container, mockApp, mockPlugin);

  const card = container.querySelector('.study-flow-subjects-card');
  assert.equal(card, null, 'Subjects card must not be rendered when no subjects configured');
});

test('AnalyticsTab maintains activeRange across refresh', async () => {
  const mockApp = {
    vault: {
      getAbstractFileByPath: () => null,
      read: async () => '',
      process: async () => '',
      create: async () => null,
      modify: async () => {},
    },
    workspace: {
      getLeavesOfType: () => [],
      onLayoutReady: (cb) => cb(),
    },
  };

  const mockPlugin = {
    app: mockApp,
    settings: {
      habitsFilePath: 'Habits.md',
      subjects: [
        { id: 's1', name: 'Química', tag: '#quimica', color: '#10b981', weeklyGoalHours: 3 },
      ],
      weekStartDay: 'monday',
    },
    focusSessions: [],
    taskIndex: {
      getAllTasks: () => [],
    },
  };

  const analyticsTab = new AnalyticsTab(mockApp, mockPlugin);
  const container = createMockElement('div');

  // Initial render
  await analyticsTab.render(container);
  assert.equal(analyticsTab.activeRange, 'total');

  const tabsBefore = container.querySelectorAll('.study-flow-allocation-tab-btn');
  assert.equal(tabsBefore.length, 2);
  const tabWeek = tabsBefore[0];
  const tabTotal = tabsBefore[1];
  assert.ok(tabTotal.classes.has('is-active'));
  assert.ok(!tabWeek.classes.has('is-active'));

  // Switch selector to "Esta semana"
  tabWeek.click();
  assert.equal(analyticsTab.activeRange, 'week');
  assert.ok(tabWeek.classes.has('is-active'));
  assert.ok(!tabTotal.classes.has('is-active'));

  // Trigger refresh()
  await analyticsTab.refresh();

  // Selection must be preserved!
  assert.equal(analyticsTab.activeRange, 'week');
  const tabsAfter = container.querySelectorAll('.study-flow-allocation-tab-btn');
  assert.equal(tabsAfter.length, 2);
  assert.ok(tabsAfter[0].classes.has('is-active'), '"Esta semana" tab must stay active after refresh');
  assert.ok(!tabsAfter[1].classes.has('is-active'), '"Total acumulado" tab must not be active');
});
