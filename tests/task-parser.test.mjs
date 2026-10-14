import test from 'node:test';
import assert from 'node:assert/strict';
import {
  parseTaskDeadline,
  parseTaskScheduledDate,
  formatTaskWithScheduledDate,
  parseTaskStartDate,
  formatTaskWithStartDate,
  parseTaskCompletionDate,
  formatTaskWithCompletionDate,
  parseTaskRecurrence,
  formatTaskWithRecurrence,
  parseRecurrenceRule,
  calculateNextRecurrenceDate,
  getCleanTaskDisplayTitle,
  extractAllTasksFromContent,
  extractPendingTasksFromContent,
  mutateTaskLineInContent,
  computeDeadlinesFromTasks,
  getLocalDateString,
} from '../src/markdown-utils.ts';

test('parseTaskScheduledDate parses ⏳ date and returns clean title', () => {
  const parsed = parseTaskScheduledDate('Repasar apuntes de biología ⏳ 2026-10-18 #biologia');
  assert.equal(parsed.scheduledDate, '2026-10-18');
  assert.equal(parsed.cleanTitle, 'Repasar apuntes de biología #biologia');

  const tagged = parseTaskScheduledDate('Estudiar parcial #scheduled/2026-10-25');
  assert.equal(tagged.scheduledDate, '2026-10-25');
  assert.equal(tagged.cleanTitle, 'Estudiar parcial');

  const none = parseTaskScheduledDate('Tarea normal sin fecha');
  assert.equal(none.scheduledDate, undefined);
  assert.equal(none.cleanTitle, 'Tarea normal sin fecha');
});

test('formatTaskWithScheduledDate appends or updates ⏳ date cleanly', () => {
  const formatted = formatTaskWithScheduledDate('Repasar física ⏳ 2026-10-10', '2026-10-20');
  assert.equal(formatted, 'Repasar física ⏳ 2026-10-20');

  const newFormatted = formatTaskWithScheduledDate('Hacer resumen', '2026-10-15');
  assert.equal(newFormatted, 'Hacer resumen ⏳ 2026-10-15');
});

test('parseTaskStartDate parses 🛫 date and returns clean title', () => {
  const parsed = parseTaskStartDate('Comenzar proyecto final 🛫 2026-10-14 📅 2026-10-30');
  assert.equal(parsed.startDate, '2026-10-14');
  assert.equal(parsed.cleanTitle, 'Comenzar proyecto final 📅 2026-10-30');

  const tagged = parseTaskStartDate('Leer paper #start/2026-10-11');
  assert.equal(tagged.startDate, '2026-10-11');
  assert.equal(tagged.cleanTitle, 'Leer paper');
});

test('formatTaskWithStartDate appends or updates 🛫 date cleanly', () => {
  const formatted = formatTaskWithStartDate('Trabajo de química 🛫 2026-10-12', '2026-10-14');
  assert.equal(formatted, 'Trabajo de química 🛫 2026-10-14');
});

test('parseTaskCompletionDate parses ✅ date and returns clean title', () => {
  const parsed = parseTaskCompletionDate('Entregar informe ✅ 2026-10-12');
  assert.equal(parsed.completedDate, '2026-10-12');
  assert.equal(parsed.cleanTitle, 'Entregar informe');

  const tagged = parseTaskCompletionDate('Finalizar lectura #completed/2026-10-09');
  assert.equal(tagged.completedDate, '2026-10-09');
  assert.equal(tagged.cleanTitle, 'Finalizar lectura');
});

test('formatTaskWithCompletionDate appends or updates ✅ date cleanly', () => {
  const formatted = formatTaskWithCompletionDate('Resolver ejercicios', '2026-10-12');
  assert.equal(formatted, 'Resolver ejercicios ✅ 2026-10-12');
});

test('parseTaskRecurrence parses daily, weekly, monthly and weekday rules', () => {
  const daily = parseTaskRecurrence('Entrenar 🔁 every day 📅 2026-10-15');
  assert.equal(daily.recurrence, 'every day');
  assert.equal(daily.cleanTitle, 'Entrenar 📅 2026-10-15');

  const weekly = parseTaskRecurrence('Reunión de laboratorio 🔁 every week 🍅 1');
  assert.equal(weekly.recurrence, 'every week');
  assert.equal(weekly.cleanTitle, 'Reunión de laboratorio 🍅 1');

  const monthly = parseTaskRecurrence('Pagar cuota 🔁 every month');
  assert.equal(monthly.recurrence, 'every month');
  assert.equal(monthly.cleanTitle, 'Pagar cuota');

  const weekday = parseTaskRecurrence('Revisar correo 🔁 every weekday #rutina');
  assert.equal(weekday.recurrence, 'every weekday');
  assert.equal(weekday.cleanTitle, 'Revisar correo #rutina');

  const spanish = parseTaskRecurrence('Limpiar escritorio 🔁 cada semana');
  assert.equal(spanish.recurrence, 'cada semana');
  assert.equal(spanish.cleanTitle, 'Limpiar escritorio');
});

test('calculateNextRecurrenceDate computes next occurrence accurately', () => {
  // Daily
  assert.equal(calculateNextRecurrenceDate('2026-10-12', 'every day'), '2026-10-13');
  assert.equal(calculateNextRecurrenceDate('2026-10-12', 'every 3 days'), '2026-10-15');
  assert.equal(calculateNextRecurrenceDate('2026-10-12', 'daily'), '2026-10-13');

  // Weekly
  assert.equal(calculateNextRecurrenceDate('2026-10-12', 'every week'), '2026-10-19');
  assert.equal(calculateNextRecurrenceDate('2026-10-12', 'every 2 weeks'), '2026-10-26');
  assert.equal(calculateNextRecurrenceDate('2026-10-12', 'weekly'), '2026-10-19');

  // Monthly
  assert.equal(calculateNextRecurrenceDate('2026-10-12', 'every month'), '2026-11-12');
  assert.equal(calculateNextRecurrenceDate('2026-10-12', 'monthly'), '2026-11-12');
  // Monthly leap / end-of-month clamp: Jan 31 -> Feb 28
  assert.equal(calculateNextRecurrenceDate('2026-01-31', 'every month'), '2026-02-28');

  // Weekday: Friday 2026-10-16 -> Monday 2026-10-19
  assert.equal(calculateNextRecurrenceDate('2026-10-16', 'every weekday'), '2026-10-19');
  // Weekday: Tuesday 2026-10-13 -> Wednesday 2026-10-14
  assert.equal(calculateNextRecurrenceDate('2026-10-13', 'every weekday'), '2026-10-14');
});

test('getCleanTaskDisplayTitle strips ⏳, 🛫, ✅, and 🔁 metadata cleanly', () => {
  const text = 'Estudiar para el examen final ⏳ 2026-10-15 🛫 2026-10-10 📅 2026-10-20 🔁 every week 🍅 2/4 ⏫ #algebra';
  const clean = getCleanTaskDisplayTitle(text);
  assert.equal(clean, 'Estudiar para el examen final');

  const textWithCompletion = 'Trabajo práctico entregado ✅ 2026-10-12 #quimica';
  assert.equal(getCleanTaskDisplayTitle(textWithCompletion), 'Trabajo práctico entregado');
});

test('extractAllTasksFromContent populates scheduledDate, startDate, completedDate and recurrence', () => {
  const content = `# Mis Tareas

## Tareas
- [ ] Tarea con Tasks emojis 🛫 2026-10-10 ⏳ 2026-10-12 📅 2026-10-15 🔁 every week #materia
- [x] Tarea terminada 📅 2026-10-08 ✅ 2026-10-09
`;

  const tasks = extractAllTasksFromContent(content, 'Test.md');
  assert.equal(tasks.length, 2);

  const t1 = tasks.find((t) => !t.completed);
  assert.ok(t1);
  assert.equal(t1.startDate, '2026-10-10');
  assert.equal(t1.scheduledDate, '2026-10-12');
  assert.equal(t1.dueDate, '2026-10-15');
  assert.equal(t1.recurrence, 'every week');
  assert.equal(t1.completed, false);

  const t2 = tasks.find((t) => t.completed);
  assert.ok(t2);
  assert.equal(t2.dueDate, '2026-10-08');
  assert.equal(t2.completedDate, '2026-10-09');
  assert.equal(t2.completed, true);
});

test('mutateTaskLineInContent writes ✅ date on completion and removes on uncomplete', () => {
  const content = `# Inbox\n- [ ] Estudiar cálculo 📅 2026-10-15\n`;
  const today = getLocalDateString(new Date());

  const completed = mutateTaskLineInContent(content, { sourceFile: '', text: 'Estudiar cálculo 📅 2026-10-15' }, {
    action: 'toggle',
    completed: true,
  });

  assert.equal(completed.success, true);
  assert.match(completed.updatedContent, new RegExp(`- \\[x\\] Estudiar cálculo 📅 2026-10-15 ✅ ${today}`));

  // Toggle back to incomplete
  const uncompleted = mutateTaskLineInContent(completed.updatedContent, { sourceFile: '', text: `Estudiar cálculo 📅 2026-10-15 ✅ ${today}` }, {
    action: 'toggle',
    completed: false,
  });

  assert.equal(uncompleted.success, true);
  assert.ok(uncompleted.updatedContent.includes('- [ ] Estudiar cálculo 📅 2026-10-15'));
  assert.ok(!uncompleted.updatedContent.includes('✅'));
});

test('mutateTaskLineInContent clones next occurrence for recurring tasks upon completion', () => {
  const content = `# Inbox\n- [ ] Ir a clase de natación 🔁 every week 📅 2026-10-12 ⏳ 2026-10-12\n`;
  const today = getLocalDateString(new Date());

  const res = mutateTaskLineInContent(content, { sourceFile: '', text: 'Ir a clase de natación' }, {
    action: 'toggle',
    completed: true,
  });

  assert.equal(res.success, true);
  const lines = res.updatedContent.split('\n');
  assert.equal(lines.length, 4); // # Inbox, completed task, next task, trailing newline

  // First task is completed with completion date
  assert.ok(lines[1].startsWith('- [x] Ir a clase de natación'));
  assert.ok(lines[1].includes(`✅ ${today}`));

  // Second task is uncompleted with next weekly date (2026-10-12 + 7 days -> 2026-10-19)
  assert.ok(lines[2].startsWith('- [ ] Ir a clase de natación'));
  assert.ok(lines[2].includes('📅 2026-10-19'));
  assert.ok(lines[2].includes('⏳ 2026-10-19'));
  assert.ok(lines[2].includes('🔁 every week'));
  assert.ok(!lines[2].includes('✅'));
});

test('extractAllTasksFromContent recognizes custom iceboxSectionHeader in options', () => {
  const content = `# Mis Notas\n\n## Nevera\n- Idea fría de verano #proyecto\n- [ ] Tarea regular\n`;
  const tasks = extractAllTasksFromContent(content, 'Vault.md', {
    iceboxSectionHeader: '## Nevera',
  });

  assert.equal(tasks.length, 2);
  const idea = tasks.find((t) => t.isIdea);
  assert.ok(idea);
  assert.equal(idea.text, 'Idea fría de verano #proyecto');
});

test('computeDeadlinesFromTasks sorts and extracts deadline items from in-memory tasks', () => {
  const tasks = [
    {
      id: '1',
      originalLine: '- [ ] Urgente 📅 2026-10-13',
      text: 'Urgente 📅 2026-10-13',
      sourceFile: 'a.md',
      completed: false,
      statusChar: ' ',
      priority: 'none',
      dueDate: '2026-10-13',
      daysRemaining: 1,
    },
    {
      id: '2',
      originalLine: '- [x] Hecho 📅 2026-10-10',
      text: 'Hecho 📅 2026-10-10',
      sourceFile: 'b.md',
      completed: true,
      statusChar: 'x',
      priority: 'none',
      dueDate: '2026-10-10',
      daysRemaining: -2,
    },
    {
      id: '3',
      originalLine: '- [ ] Lejano 📅 2026-10-25',
      text: 'Lejano 📅 2026-10-25',
      sourceFile: 'c.md',
      completed: false,
      statusChar: ' ',
      priority: 'none',
      dueDate: '2026-10-25',
      daysRemaining: 13,
    },
  ];

  const deadlines = computeDeadlinesFromTasks(tasks);
  assert.equal(deadlines.length, 3);
  // Incomplete first, ordered by daysRemaining
  assert.equal(deadlines[0].cleanTitle, 'Urgente');
  assert.equal(deadlines[1].cleanTitle, 'Lejano');
  assert.equal(deadlines[2].cleanTitle, 'Hecho');
});

test('isPathIndexed correctly applies included and excluded folder settings', async () => {
  const { isPathIndexed } = await import('../src/markdown-utils.ts');

  // Default: empty inclusions, excluded: Templates, templates
  const excluded = ['Templates', 'templates'];
  assert.equal(isPathIndexed('Daily/2026-10-12.md', [], excluded), true);
  assert.equal(isPathIndexed('StudyFlow/Inbox.md', [], excluded), true);
  assert.equal(isPathIndexed('Templates/Daily.md', [], excluded), false);
  assert.equal(isPathIndexed('templates/Habit.md', [], excluded), false);
  assert.equal(isPathIndexed('image.png', [], excluded), false);

  // Trash and hidden folders are always excluded
  assert.equal(isPathIndexed('.trash/note.md', [], excluded), false);
  assert.equal(isPathIndexed('Folder/.trash/subnote.md', [], excluded), false);
  assert.equal(isPathIndexed('.obsidian/plugins/note.md', [], excluded), false);

  // Excluded files (e.g. StudyFlow/Habits.md)
  assert.equal(isPathIndexed('StudyFlow/Habits.md', [], excluded, ['StudyFlow/Habits.md']), false);

  // Whitelist folder: only 'Projects' and 'Tasks'
  const included = ['Projects', 'Tasks'];
  assert.equal(isPathIndexed('Projects/Paper.md', included, excluded), true);
  assert.equal(isPathIndexed('Tasks/Todo.md', included, excluded), true);
  assert.equal(isPathIndexed('Other/Random.md', included, excluded), false);
  assert.equal(isPathIndexed('Projects/Templates/Template.md', included, excluded), false);
});

test('getCleanTaskDisplayTitle strips HTML comments from task text', () => {
  const withComment = 'Databases <!-- streak: 0 | last: | history: -->';
  assert.equal(getCleanTaskDisplayTitle(withComment), 'Databases');

  const withMetadataAndComment = 'Numeric Methods <!-- streak: 1 --> 📅 2026-10-20 #materia';
  assert.equal(getCleanTaskDisplayTitle(withMetadataAndComment), 'Numeric Methods');
});

test('isIceboxSection accurately identifies icebox headings without false positives', async () => {
  const { isIceboxSection } = await import('../src/markdown-utils.ts');
  assert.equal(isIceboxSection('Icebox'), true);
  assert.equal(isIceboxSection('## Icebox'), true);
  assert.equal(isIceboxSection('## 🧊 Icebox'), true);
  assert.equal(isIceboxSection('## Ideas'), true);
  assert.equal(isIceboxSection('## 💡 Ideas'), true);
  assert.equal(isIceboxSection('## Nevera', '## Nevera'), true);

  // False positives from normal notes must be rejected
  assert.equal(isIceboxSection('## Main ideas'), false);
  assert.equal(isIceboxSection('## Key ideas of chapter 1'), false);
  assert.equal(isIceboxSection('## Ideas preconcebidas'), false);
});

test('extractAllTasksFromContent ignores habit lines with streak comments', () => {
  const content = `# StudyFlow\n\n## Tareas\n- [ ] Estudiar cálculo 📅 2026-10-15\n- [ ] Databases <!-- streak: 0 | last:  | history:  -->\n- [ ] Numeric Methods <!-- streak: 2 | last: 2026-10-12 | history: 2026-10-12 -->\n- [x] Tarea terminada\n`;
  const tasks = extractAllTasksFromContent(content, 'StudyFlow/Habits.md');

  // Only real tasks (not habit items) should be returned
  assert.equal(tasks.length, 2);
  assert.equal(tasks[0].text, 'Estudiar cálculo 📅 2026-10-15');
  assert.equal(tasks[1].text, 'Tarea terminada');
});

test('extractPendingTasksFromContent ignores habit lines with streak comments', () => {
  const content = `# Habits\n- [ ] English <!-- streak: 0 | last:  | history:  -->\n- [ ] Tarea real en Inbox\n`;
  const pending = extractPendingTasksFromContent(content, 'Test.md');
  assert.equal(pending.length, 1);
  assert.equal(pending[0].text, 'Tarea real en Inbox');
});


