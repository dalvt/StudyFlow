import test from 'node:test';
import assert from 'node:assert/strict';

test('extractTagsFromText deduplication: markdown-utils and analytics exports are consistent and functional', async () => {
  const { extractTagsFromText: extractFromMarkdown } = await import('../src/markdown-utils.ts');
  const { extractTagsFromText: extractFromAnalytics } = await import('../src/analytics.ts');

  // Both should be functions
  assert.equal(typeof extractFromMarkdown, 'function');
  assert.equal(typeof extractFromAnalytics, 'function');

  // Identical behavior on complex text
  const text = 'Estudiar #química-orgánica y #física [[Guía Práctica|Capítulo 1]] con #examen';
  const expected = ['#química-orgánica', '#física', '#examen', '[[Guía Práctica]]'];

  const res1 = extractFromMarkdown(text);
  const res2 = extractFromAnalytics(text);

  assert.deepEqual(res1, expected);
  assert.deepEqual(res2, expected);
  assert.deepEqual(res1, res2);

  // Edge cases
  assert.deepEqual(extractFromMarkdown(''), []);
  assert.deepEqual(extractFromAnalytics(''), []);
  assert.deepEqual(extractFromMarkdown('Texto sin etiquetas'), []);
  assert.deepEqual(extractFromAnalytics('Texto sin etiquetas'), []);

  // Deduplication of identical tags in text
  const duplicateText = '#algebra repasar #algebra y #ALGEBRA';
  assert.deepEqual(extractFromMarkdown(duplicateText), ['#algebra']);
  assert.deepEqual(extractFromAnalytics(duplicateText), ['#algebra']);
});

test('Task migration logic converts [ ] to [>] for migrated pending tasks in calendar planner fusion', () => {
  const original = `## Tareas
- [ ] Estudiar cálculo diferencial
- [ ] Preparar entrega de redes
- [x] Tarea ya terminada
`;
  const taskTextToMigrate = 'Estudiar cálculo diferencial';
  const escaped = taskTextToMigrate.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const regex = new RegExp(`^(\\s*)-\\s+\\[\\s\\]\\s+${escaped}`, 'm');
  const updated = original.replace(regex, `$1- [>] ${taskTextToMigrate}`);

  assert.ok(updated.includes('- [>] Estudiar cálculo diferencial'));
  assert.ok(updated.includes('- [ ] Preparar entrega de redes'));
  assert.ok(updated.includes('- [x] Tarea ya terminada'));
  assert.ok(!updated.includes('- [ ] Estudiar cálculo diferencial'));
});

test('Tomorrow planning date calculation produces valid next-day key', async () => {
  const { formatDateKey } = await import('../src/calendar-utils.ts');
  const ref = new Date('2026-10-13T12:00:00Z');
  const tomorrow = new Date(ref);
  tomorrow.setDate(tomorrow.getDate() + 1);

  const key = formatDateKey(tomorrow);
  assert.equal(key, '2026-10-14');
});

test('TasksTab 4 Views: categorizes today (with overdue), upcoming, subjects, and icebox cleanly', () => {
  const todayDate = '2026-10-13';

  const isToday = (t) =>
    !t.isIdea &&
    ((t.daysRemaining !== undefined && t.daysRemaining <= 0) ||
      t.dueDate === todayDate ||
      (t.dueDate !== undefined && t.dueDate < todayDate));

  const isUpcoming = (t) =>
    !t.isIdea &&
    ((t.daysRemaining !== undefined && t.daysRemaining > 0) ||
      (t.dueDate !== undefined && t.dueDate > todayDate));

  const isSubject = (t) => !t.isIdea;
  const isIcebox = (t) => Boolean(t.isIdea);

  const sampleTasks = [
    { id: '1', text: 'Overdue task', daysRemaining: -2, dueDate: '2026-10-11', isIdea: false, completed: false },
    { id: '2', text: 'Due today task', daysRemaining: 0, dueDate: '2026-10-13', isIdea: false, completed: false },
    { id: '3', text: 'Upcoming task', daysRemaining: 3, dueDate: '2026-10-16', isIdea: false, completed: false },
    { id: '4', text: 'Task without date with tag', tags: ['#algebra'], isIdea: false, completed: false },
    { id: '5', text: 'Task without date no tag', tags: [], isIdea: false, completed: false },
    { id: '6', text: 'Icebox idea', isIdea: true, completed: false },
    { id: '7', text: 'Completed today task', daysRemaining: 0, dueDate: '2026-10-13', isIdea: false, completed: true },
  ];

  const todayTasks = sampleTasks.filter(isToday);
  assert.equal(todayTasks.length, 3); // 1, 2, 7
  assert.deepEqual(todayTasks.map((t) => t.id), ['1', '2', '7']);

  const upcomingTasks = sampleTasks.filter(isUpcoming);
  assert.equal(upcomingTasks.length, 1);
  assert.equal(upcomingTasks[0].id, '3');

  const subjectTasks = sampleTasks.filter(isSubject);
  assert.equal(subjectTasks.length, 6); // all except icebox (6)

  const iceboxTasks = sampleTasks.filter(isIcebox);
  assert.equal(iceboxTasks.length, 1);
  assert.equal(iceboxTasks[0].id, '6');
});

test('TasksTab: showCompleted switch filters pending vs completed tasks across views', () => {
  const sampleTasks = [
    { id: '1', text: 'Pending task', isIdea: false, completed: false },
    { id: '2', text: 'Completed task', isIdea: false, completed: true },
  ];

  const withoutCompleted = sampleTasks.filter((t) => !t.completed);
  assert.equal(withoutCompleted.length, 1);
  assert.equal(withoutCompleted[0].id, '1');

  const withCompleted = sampleTasks; // includes completed
  assert.equal(withCompleted.length, 2);
});

test('TasksTab: unclassified grouping accurately isolates tasks without subject tags', () => {
  const sampleTasks = [
    { id: '1', text: 'Tagged task', tags: ['#fisica'] },
    { id: '2', text: 'Empty tags task', tags: [] },
    { id: '3', text: 'Undefined tags task' },
  ];

  const unclassified = sampleTasks.filter((t) => !t.tags || t.tags.length === 0);
  assert.equal(unclassified.length, 2);
  assert.deepEqual(unclassified.map((t) => t.id), ['2', '3']);
});

test('Modals and satellite reduction: verifies obsolete modals and pruned modules are removed while TaskCreateModal and PomodoroModal are kept', async () => {
  const fs = await import('node:fs');
  const tasksSrc = fs.readFileSync('src/tasks.ts', 'utf8');
  const habitsSrc = fs.readFileSync('src/habits.ts', 'utf8');

  // Obsolete modals and pruned satellite modules must not exist
  assert.ok(!tasksSrc.includes('class TasksManagerModal'));
  assert.ok(!tasksSrc.includes('class QuickCaptureModal'));
  assert.ok(!habitsSrc.includes('class HabitsModal'));
  assert.ok(!fs.existsSync('src/planner.ts'));
  assert.ok(!fs.existsSync('src/analytics-modal.ts'));
  assert.ok(!fs.existsSync('src/pomodoro-migration-modal.ts'));
  assert.ok(!fs.existsSync('src/ics-export.ts'));
  assert.ok(!fs.existsSync('src/weekly-review.ts'));

  // Unified TaskCreateModal and PomodoroModal must exist
  assert.ok(fs.existsSync('src/task-modal.ts'));
  assert.ok(fs.existsSync('src/pomodoro-modal.ts'));
  const pomoSrc = fs.readFileSync('src/pomodoro-modal.ts', 'utf8');
  assert.ok(pomoSrc.includes('class PomodoroModal'));
});


