import test from 'node:test';
import assert from 'node:assert/strict';
import {
  findCurrentOrNextTimeBlock,
  filterTodayAndOverdueTasks,
  filterUpcomingDeadlines,
} from '../src/today-utils.ts';
import { cloneDefaultSettings } from '../src/settings-utils.ts';

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

test('TodayTabSectionsConfig: default settings enable all 6 sections', () => {
  const settings = cloneDefaultSettings('es');
  assert.ok(settings.todaySections);
  assert.equal(settings.todaySections.showNowNext, true);
  assert.equal(settings.todaySections.showMiniTimer, true);
  assert.equal(settings.todaySections.showTodayTasks, true);
  assert.equal(settings.todaySections.showHabits, true);
  assert.equal(settings.todaySections.showSpacedRepetition, true);
  assert.equal(settings.todaySections.showUpcomingDeadlines, true);
});
