import test from 'node:test';
import assert from 'node:assert/strict';
import { TFile } from 'obsidian';
import {
  findCurrentOrNextTimeBlock,
  filterTodayAndOverdueTasks,
  filterUpcomingDeadlines,
} from '../src/today-utils.ts';
import { cloneDefaultSettings } from '../src/settings-utils.ts';
import { TodayTab } from '../src/ui/today-tab.ts';
import { computeDeadlinesFromTasks } from '../src/markdown-utils.ts';
import { getLocalDateString } from '../src/utils.ts';

test('findCurrentOrNextTimeBlock: returns current active block when within range', () => {
  const blocks = [
    { id: '1', date: '2026-10-13', startTime: '09:00', endTime: '10:30', title: 'Matemáticas #algebra' },
    { id: '2', date: '2026-10-13', startTime: '11:00', endTime: '12:30', title: 'Física Cuántica #fisica' },
    { id: '3', date: '2026-10-13', startTime: '15:00', endTime: '16:30', title: 'Programación #codigo' },
  ];

  // At 11:15, block 2 is active
  const res = findCurrentOrNextTimeBlock(blocks, '11:15');
  assert.ok(res !== null);
  assert.equal(res.type, 'now');
  assert.equal(res.block.id, '2');
});

test('findCurrentOrNextTimeBlock: returns next upcoming block when between blocks', () => {
  const blocks = [
    { id: '1', date: '2026-10-13', startTime: '09:00', endTime: '10:30', title: 'Lectura' },
    { id: '2', date: '2026-10-13', startTime: '14:00', endTime: '15:30', title: 'Laboratorio' },
  ];

  // At 12:00, block 2 is the next upcoming block
  const res = findCurrentOrNextTimeBlock(blocks, '12:00');
  assert.ok(res !== null);
  assert.equal(res.type, 'next');
  assert.equal(res.block.id, '2');
});

test('findCurrentOrNextTimeBlock: returns null when all blocks have passed or list is empty', () => {
  const blocks = [
    { id: '1', date: '2026-10-13', startTime: '08:00', endTime: '09:30', title: 'Desayuno' },
  ];

  assert.equal(findCurrentOrNextTimeBlock(blocks, '10:00'), null);
  assert.equal(findCurrentOrNextTimeBlock([], '12:00'), null);
});

test('filterTodayAndOverdueTasks: extracts up to 5 pending today/overdue tasks sorted by urgency and priority', () => {
  const sampleTasks = [
    { id: '1', text: 'Overdue high', daysRemaining: -2, priority: 'high', completed: false, isIdea: false },
    { id: '2', text: 'Overdue low', daysRemaining: -1, priority: 'low', completed: false, isIdea: false },
    { id: '3', text: 'Due today high', daysRemaining: 0, priority: 'high', dueDate: '2026-10-13', completed: false, isIdea: false },
    { id: '4', text: 'Due today normal', daysRemaining: 0, priority: 'none', dueDate: '2026-10-13', completed: false, isIdea: false },
    { id: '5', text: 'Completed today', daysRemaining: 0, completed: true, isIdea: false },
    { id: '6', text: 'Future task', daysRemaining: 4, dueDate: '2026-10-17', completed: false, isIdea: false },
    { id: '7', text: 'Icebox idea', daysRemaining: 0, completed: false, isIdea: true },
    { id: '8', text: 'Due today medium 1', daysRemaining: 0, priority: 'medium', dueDate: '2026-10-13', completed: false, isIdea: false },
    { id: '9', text: 'Due today medium 2', daysRemaining: 0, priority: 'medium', dueDate: '2026-10-13', completed: false, isIdea: false },
  ];

  const filtered = filterTodayAndOverdueTasks(sampleTasks, '2026-10-13', 5);

  assert.equal(filtered.length, 5);
  // Must not include completed, idea, or future tasks
  assert.ok(!filtered.some((t) => t.completed));
  assert.ok(!filtered.some((t) => t.isIdea));
  assert.ok(!filtered.some((t) => t.id === '6'));

  // First must be the most overdue (-2)
  assert.equal(filtered[0].id, '1');
  // Second must be overdue (-1)
  assert.equal(filtered[1].id, '2');
  // Third must be today high priority
  assert.equal(filtered[2].id, '3');
});

test('filterUpcomingDeadlines: returns 3 nearest deadlines sorted by days remaining', () => {
  const deadlines = [
    { cleanTitle: 'Entrega Final', daysRemaining: 1, dueDate: '2026-10-14', completed: false },
    { cleanTitle: 'Proyecto Redes', daysRemaining: 5, dueDate: '2026-10-18', completed: false },
    { cleanTitle: 'Tarea Pasada', daysRemaining: -1, dueDate: '2026-10-12', completed: false },
    { cleanTitle: 'Parcial Química', daysRemaining: 3, dueDate: '2026-10-16', completed: false },
    { cleanTitle: 'Ya Entregado', daysRemaining: 2, dueDate: '2026-10-15', completed: true },
  ];

  const top3 = filterUpcomingDeadlines(deadlines, 3);
  assert.equal(top3.length, 3);
  assert.equal(top3[0].cleanTitle, 'Tarea Pasada'); // -1 days
  assert.equal(top3[1].cleanTitle, 'Entrega Final'); // 1 day
  assert.equal(top3[2].cleanTitle, 'Parcial Química'); // 3 days
});

test('TodayTabSectionsConfig: default settings enable the 4 streamlined sections without miniTimer or separate deadlines', () => {
  const settings = cloneDefaultSettings('es');
  assert.ok(settings.todaySections);
  assert.equal(settings.todaySections.showNowNext, true);
  assert.equal(settings.todaySections.showTodayTasks, true);
  assert.equal(settings.todaySections.showHabits, true);
  assert.equal(settings.todaySections.showSpacedRepetition, true);
  assert.equal('showMiniTimer' in settings.todaySections, false);
  assert.equal('showUpcomingDeadlines' in settings.todaySections, false);
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
    click(e = {}) {
      if (e.stopPropagation === undefined) e.stopPropagation = () => {};
      for (const fn of el.listeners['click'] || []) {
        fn(e);
      }
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
      return el.querySelectorAll(selector)[0] || null;
    },
  };
  return el;
}

test('TodayTab onHabitsChanged: concurrent invocations do not duplicate cards in habits section', async () => {
  const habitsFile = new TFile('Habits.md');
  const mockApp = {
    vault: {
      getAbstractFileByPath: (p) => (p === 'Habits.md' ? habitsFile : null),
      read: async () => `- [ ] Ejercicio diario\n- [ ] Leer 20 páginas`,
      process: async () => '',
      create: async () => habitsFile,
      modify: async () => {},
    },
    workspace: {
      getLeavesOfType: () => [],
      onLayoutReady: (cb) => cb(),
      openLinkText: async () => {},
    },
  };

  const mockPlugin = {
    app: mockApp,
    settings: {
      habitsFilePath: 'Habits.md',
      todaySections: {
        showNowNext: false,
        showTodayTasks: false,
        showHabits: true,
        showSpacedRepetition: false,
      },
      subjects: [],
    },
    taskIndex: {
      getAllTasks: () => [],
      getAllDeadlines: () => [],
      getPendingTasks: () => [],
    },
  };

  const container = createMockElement('div');
  const todayTab = new TodayTab(mockApp, mockPlugin, () => {});
  await todayTab.render(container);

  const habitsSec = container.querySelectorAll('.study-flow-today-habits-sec')[0];
  assert.ok(habitsSec, 'Habits section element should exist');

  const initialCards = habitsSec.children.filter((c) => c.classes.has('study-flow-card'));
  assert.equal(initialCards.length, 1, 'Initial render must have exactly 1 card');

  // Trigger two concurrent refreshes simultaneously without awaiting the first
  const p1 = todayTab.onHabitsChanged();
  const p2 = todayTab.onHabitsChanged();
  await Promise.all([p1, p2]);

  const cardsAfterConcurrentCalls = habitsSec.children.filter((c) => c.classes.has('study-flow-card'));
  assert.equal(
    cardsAfterConcurrentCalls.length,
    1,
    'Concurrent onHabitsChanged must produce exactly 1 card, never duplicates'
  );

  todayTab.destroy();
});

test('computeDeadlinesFromTasks: recalculates daysRemaining dynamically from dueDate rather than stale indexed value', () => {
  const todayStr = getLocalDateString(new Date());
  const staleTasks = [
    {
      id: 'task-stale-1',
      text: `Entrega de Laboratorio 📅 ${todayStr}`,
      cleanTitle: 'Entrega de Laboratorio',
      sourceFile: 'Inbox.md',
      dueDate: todayStr,
      daysRemaining: 1, // Stale value computed yesterday
      completed: false,
    },
  ];

  const deadlines = computeDeadlinesFromTasks(staleTasks);
  assert.equal(deadlines.length, 1);
  assert.equal(deadlines[0].daysRemaining, 0, 'Must dynamically calculate 0 days remaining on today date');
});

test('TodayTab: quick pomodoro action starts timer on today task and habit, and deadline row switches to upcoming view', async () => {
  const habitsFile = new TFile('Habits.md');
  const todayStr = getLocalDateString(new Date());

  const mockApp = {
    vault: {
      getAbstractFileByPath: (p) => (p === 'Habits.md' ? habitsFile : null),
      read: async () => `- [ ] 💧 Tomar 2L de agua <!-- streak: 3 | last: 2026-10-13 -->`,
      process: async () => '',
      create: async () => habitsFile,
      modify: async () => {},
    },
    workspace: {
      getLeavesOfType: () => [],
      onLayoutReady: (cb) => cb(),
      openLinkText: async () => {},
    },
  };

  let activeTaskSet = null;
  let activeHabitSet = null;
  let pomodoroStarted = false;
  let switchedTab = null;
  let switchOptions = null;

  const mockPlugin = {
    app: mockApp,
    settings: {
      habitsFilePath: 'Habits.md',
      todaySections: {
        showNowNext: false,
        showTodayTasks: true,
        showHabits: true,
        showSpacedRepetition: false,
      },
      subjects: [],
    },
    pomodoro: {
      setActiveTask: async (t) => {
        activeTaskSet = t;
      },
      setActiveHabit: async (h) => {
        activeHabitSet = h;
      },
      start: async () => {
        pomodoroStarted = true;
      },
    },
    taskIndex: {
      getAllTasks: () => [
        {
          id: 'task-today-1',
          text: `Resolver ejercicios de cálculo 📅 ${todayStr}`,
          sourceFile: 'Inbox.md',
          dueDate: todayStr,
          daysRemaining: 0,
          completed: false,
          isIdea: false,
        },
      ],
      getAllDeadlines: () => [
        {
          id: 'task-future-1',
          cleanTitle: 'Entrega Proyecto Final',
          text: 'Entrega Proyecto Final 📅 2026-10-30',
          sourceFile: 'Inbox.md',
          dueDate: '2026-10-30',
          daysRemaining: 6,
          completed: false,
        },
      ],
      getPendingTasks: () => [],
    },
  };

  const mockHost = {
    switchTab: (tab, options) => {
      switchedTab = tab;
      switchOptions = options;
    },
    openTasksUpcoming: () => {
      switchedTab = 'tasks';
      switchOptions = { taskView: 'upcoming' };
    },
  };

  const container = createMockElement('div');
  const todayTab = new TodayTab(mockApp, mockPlugin, mockHost);
  await todayTab.render(container);

  // 1. Verify quick Pomodoro button on task row
  const taskRow = container.querySelector('.study-flow-today-task-row');
  assert.ok(taskRow, 'Task row should exist');
  const taskPomoBtn = taskRow.querySelector('.study-flow-today-quick-pomo-btn');
  assert.ok(taskPomoBtn, 'Quick pomodoro button must exist on task row');

  taskPomoBtn.click();
  await new Promise((resolve) => setTimeout(resolve, 10));
  assert.ok(activeTaskSet, 'setActiveTask must be called');
  assert.equal(activeTaskSet.id, 'task-today-1');
  assert.equal(pomodoroStarted, true, 'pomodoro.start() must be called');
  assert.equal(switchedTab, 'pomodoro', 'host.switchTab("pomodoro") must be called');

  // Reset flags
  pomodoroStarted = false;
  switchedTab = null;

  // 2. Verify quick Pomodoro button on habit row
  const habitRow = container.querySelector('.study-flow-today-habit-row');
  assert.ok(habitRow, 'Habit row should exist');
  const habitPomoBtn = habitRow.querySelector('.study-flow-today-quick-pomo-btn');
  assert.ok(habitPomoBtn, 'Quick pomodoro button must exist on habit row');

  habitPomoBtn.click();
  await new Promise((resolve) => setTimeout(resolve, 10));
  assert.ok(activeHabitSet, 'setActiveHabit must be called');
  assert.equal(activeHabitSet.name, '💧 Tomar 2L de agua');
  assert.equal(pomodoroStarted, true, 'pomodoro.start() must be called for habit');
  assert.equal(switchedTab, 'pomodoro', 'host.switchTab("pomodoro") must be called for habit');

  // 3. Verify clicking upcoming deadline row navigates to tasks upcoming
  const deadlineRow = container.querySelector('.study-flow-today-deadline-row');
  assert.ok(deadlineRow, 'Deadline row should exist');

  deadlineRow.click();
  assert.equal(switchedTab, 'tasks', 'Must switch to tasks tab');
  assert.deepEqual(switchOptions, { taskView: 'upcoming' }, 'Must open tasks in upcoming view');
});

