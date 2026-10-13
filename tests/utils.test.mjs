import test from 'node:test';
import assert from 'node:assert/strict';
import {
  appendIceboxItemToMarkdownSection,
  appendTaskToMarkdownSection,
  calculateDaysRemaining,
  extractPendingTasksFromContent,
  formatDailyNoteFileName,
  formatDeadlineHuman,
  formatTaskWithDeadline,
  formatTaskWithPriority,
  formatTaskWithPomodoroEstimate,
  parseTaskDeadline,
  parseTaskPriority,
  parseTaskPomodoroEstimate,
  incrementTaskPomodoroInContent,
  decrementTaskPomodoroInContent,
  promoteIdeaToTaskInContent,
  toggleTaskCompletionInContent,
  updateTaskTextInContent,
  toggleSubtaskInContent,
  addSubtaskToContent,
  deleteTaskFromContent,
  formatHabitsToMarkdown,
  syncBlocksToMarkdown,
  mergeTemplateIntoContent,
  getLocalDateString,
  shouldZenIgnoreEscape,
  computeLineHash,
  locateTaskLineIndex,
  mutateTaskLineInContent,
  createHabitId,
  syncHabitsToMarkdown,
  extractAllTasksFromContent,
  appendClosingNoteToDailyContent,
} from '../src/markdown-utils.ts';

test('appendTaskToMarkdownSection appends new section if it does not exist', () => {
  const initial = '# Mi Nota\n\nContenido inicial';
  const updated = appendTaskToMarkdownSection(initial, 'Nueva tarea', '## Tareas');
  assert.match(updated, /## Tareas\n- \[ \] Nueva tarea/);
  assert.ok(updated.startsWith('# Mi Nota'));
});

test('appendTaskToMarkdownSection appends under existing ## Tareas section before subsequent sections', () => {
  const initial = `# Mi Nota

## Tareas
- [ ] Tarea 1

## Otra Sección
Texto posterior`;

  const updated = appendTaskToMarkdownSection(initial, 'Tarea 2', '## Tareas');
  assert.ok(updated.includes('- [ ] Tarea 1\n- [ ] Tarea 2'));
  assert.ok(updated.includes('## Otra Sección\nTexto posterior'));
});

test('appendTaskToMarkdownSection handles empty initial file', () => {
  const initial = '';
  const updated = appendTaskToMarkdownSection(initial, 'Primera tarea', '## Tareas');
  assert.equal(updated, '## Tareas\n- [ ] Primera tarea\n');
});

test('extractPendingTasksFromContent extracts only uncompleted markdown checkboxes', () => {
  const content = `# Notas

- [ ] Tarea pendiente 1
- [x] Tarea completada
- [/] Tarea en progreso
  - [ ] Subtarea pendiente 2
- [>] Tarea migrada
Normal text
`;

  const tasks = extractPendingTasksFromContent(content, 'test.md');
  assert.equal(tasks.length, 2);
  assert.equal(tasks[0].text, 'Tarea pendiente 1');
  assert.equal(tasks[1].text, 'Subtarea pendiente 2');
});

test('formatDailyNoteFileName calculates dates with offset', () => {
  const base = new Date('2026-10-11T12:00:00Z');
  const today = formatDailyNoteFileName('YYYY-MM-DD', 0, base);
  const tomorrow = formatDailyNoteFileName('YYYY-MM-DD', 1, base);
  assert.equal(today, '2026-10-11.md');
  assert.equal(tomorrow, '2026-10-12.md');
});

test('parseTaskPriority recognizes Obsidian Tasks emojis and tags', () => {
  const high1 = parseTaskPriority('⏫ Estudiar para parcial de Álgebra');
  assert.equal(high1.priority, 'high');
  assert.equal(high1.cleanTitle, 'Estudiar para parcial de Álgebra');

  const high2 = parseTaskPriority('Entregar trabajo #p1');
  assert.equal(high2.priority, 'high');
  assert.equal(high2.cleanTitle, 'Entregar trabajo');

  const med = parseTaskPriority('🔼 Repasar apuntes');
  assert.equal(med.priority, 'medium');

  const low = parseTaskPriority('🔽 Comprar lapiceras');
  assert.equal(low.priority, 'low');

  const none = parseTaskPriority('Leer capítulo 1');
  assert.equal(none.priority, 'none');
  assert.equal(none.cleanTitle, 'Leer capítulo 1');
});

test('formatTaskWithPriority prefixes standard emojis', () => {
  assert.equal(formatTaskWithPriority('Hacer ejercicio', 'high'), '⏫ Hacer ejercicio');
  assert.equal(formatTaskWithPriority('Hacer ejercicio', 'medium'), '🔼 Hacer ejercicio');
  assert.equal(formatTaskWithPriority('Hacer ejercicio', 'low'), '🔽 Hacer ejercicio');
  assert.equal(formatTaskWithPriority('Hacer ejercicio', 'none'), 'Hacer ejercicio');
});

test('extractTagsFromText extracts hashtags and wikilinks correctly', async () => {
  const { extractTagsFromText } = await import('../src/analytics.ts');
  const tags = extractTagsFromText('Estudiar #algebra y repasar [[Teorema de Gauss]] con #examen-final');
  assert.deepEqual(tags, ['#algebra', '#examen-final', '[[Teorema de Gauss]]']);

  assert.deepEqual(extractTagsFromText('Tarea sin tags'), []);
});

test('formatMinutesHuman formats minutes into human readable duration', async () => {
  const { formatMinutesHuman } = await import('../src/analytics.ts');
  assert.equal(formatMinutesHuman(0), '0m');
  assert.equal(formatMinutesHuman(45), '45m');
  assert.equal(formatMinutesHuman(60), '1h');
  assert.equal(formatMinutesHuman(150), '2h 30m');
});

test('computeWeeklyFocusTrend aggregates daily minutes over last 7 days', async () => {
  const { computeWeeklyFocusTrend } = await import('../src/analytics.ts');
  const refDate = new Date('2026-10-12T12:00:00Z');
  const sessions = [
    { id: '1', timestamp: 1, date: '2026-10-12', durationMinutes: 25, tags: ['#dev'] },
    { id: '2', timestamp: 2, date: '2026-10-12', durationMinutes: 50, tags: ['#dev'] },
    { id: '3', timestamp: 3, date: '2026-10-11', durationMinutes: 25, tags: ['#math'] },
  ];

  const trend = computeWeeklyFocusTrend(sessions, refDate, 7);
  assert.equal(trend.length, 7);

  const todayEntry = trend.find((t) => t.date === '2026-10-12');
  assert.ok(todayEntry);
  assert.equal(todayEntry.totalMinutes, 75);
  assert.equal(todayEntry.sessionCount, 2);
  assert.equal(todayEntry.isToday, true);

  const yesterdayEntry = trend.find((t) => t.date === '2026-10-11');
  assert.ok(yesterdayEntry);
  assert.equal(yesterdayEntry.totalMinutes, 25);
  assert.equal(yesterdayEntry.sessionCount, 1);
});

test('computeTagDistribution calculates percentages by tag', async () => {
  const { computeTagDistribution } = await import('../src/analytics.ts');
  const sessions = [
    { id: '1', timestamp: 1, date: '2026-10-12', durationMinutes: 75, tags: ['#dev'] },
    { id: '2', timestamp: 2, date: '2026-10-12', durationMinutes: 25, tags: ['#math'] },
  ];

  const dist = computeTagDistribution(sessions);
  assert.equal(dist.length, 2);
  assert.equal(dist[0].tag, '#dev');
  assert.equal(dist[0].totalMinutes, 75);
  assert.equal(dist[0].percentage, 75);
  assert.equal(dist[1].tag, '#math');
  assert.equal(dist[1].totalMinutes, 25);
  assert.equal(dist[1].percentage, 25);
});

test('computeTasksOverview calculates priority breakdown and rate', async () => {
  const { computeTasksOverview } = await import('../src/analytics.ts');
  const tasks = [
    { id: '1', originalLine: '', text: 'T1', sourceFile: '', completed: true, statusChar: 'x', priority: 'high' },
    { id: '2', originalLine: '', text: 'T2', sourceFile: '', completed: false, statusChar: ' ', priority: 'high' },
    { id: '3', originalLine: '', text: 'T3', sourceFile: '', completed: false, statusChar: ' ', priority: 'medium' },
    { id: '4', originalLine: '', text: 'T4', sourceFile: '', completed: false, statusChar: ' ', priority: 'none' },
  ];

  const stat = computeTasksOverview(tasks);
  assert.equal(stat.totalAll, 4);
  assert.equal(stat.totalCompleted, 1);
  assert.equal(stat.totalPending, 3);
  assert.equal(stat.completionRate, 25);
  assert.equal(stat.byPriority.high, 1); // 1 pending high
  assert.equal(stat.byPriority.medium, 1); // 1 pending medium
  assert.equal(stat.byPriority.none, 1);
});

test('extractPendingTasksFromContent differentiates tasks from ideas', () => {
  const content = `# Inbox

## Tareas
- [ ] ⏫ Estudiar para final
- [ ] Comprar cuaderno

## Ideas
- [ ] Aprender Rust en vacaciones
- [ ] Crear blog personal #idea
`;

  const items = extractPendingTasksFromContent(content, 'Inbox.md');
  assert.equal(items.length, 4);

  // Tareas
  assert.equal(items[0].text, '⏫ Estudiar para final');
  assert.equal(items[0].isIdea, false);
  assert.equal(items[1].text, 'Comprar cuaderno');
  assert.equal(items[1].isIdea, false);

  // Ideas
  assert.equal(items[2].text, 'Aprender Rust en vacaciones');
  assert.equal(items[2].isIdea, true);
  assert.equal(items[3].text, 'Crear blog personal #idea');
  assert.equal(items[3].isIdea, true);
});

test('parseTaskPomodoroEstimate extracts estimated and completed pomodoros', () => {
  const estOnly = parseTaskPomodoroEstimate('Estudiar cálculo 🍅 3');
  assert.equal(estOnly.estimated, 3);
  assert.equal(estOnly.completed, 0);
  assert.equal(estOnly.cleanTitle, 'Estudiar cálculo');

  const completedAndEst = parseTaskPomodoroEstimate('Resumen de historia 🍅 2/4');
  assert.equal(completedAndEst.estimated, 4);
  assert.equal(completedAndEst.completed, 2);
  assert.equal(completedAndEst.cleanTitle, 'Resumen de historia');

  const noEstimate = parseTaskPomodoroEstimate('Hacer compras');
  assert.equal(noEstimate.estimated, undefined);
  assert.equal(noEstimate.completed, 0);
  assert.equal(noEstimate.cleanTitle, 'Hacer compras');
});

test('formatTaskWithPomodoroEstimate formats estimated and completed counts cleanly', () => {
  assert.equal(formatTaskWithPomodoroEstimate('Estudiar cálculo', 3), 'Estudiar cálculo 🍅 3');
  assert.equal(formatTaskWithPomodoroEstimate('Estudiar cálculo 🍅 3', 3, 1), 'Estudiar cálculo 🍅 1/3');
  assert.equal(formatTaskWithPomodoroEstimate('Estudiar cálculo 🍅 1/3', 3, 3), 'Estudiar cálculo 🍅 3/3');
  assert.equal(formatTaskWithPomodoroEstimate('Estudiar cálculo', undefined), 'Estudiar cálculo');
});

test('formatTaskWithPomodoroEstimate correctly decrements and clears pomodoros', () => {
  const step1 = formatTaskWithPomodoroEstimate('Tarea 🍅 2/4', 4, 1);
  assert.equal(step1, 'Tarea 🍅 1/4');

  const step2 = formatTaskWithPomodoroEstimate(step1, 4, 0);
  assert.equal(step2, 'Tarea 🍅 4');

  const noEstStep1 = formatTaskWithPomodoroEstimate('Tarea 🍅 2', undefined, 1);
  assert.equal(noEstStep1, 'Tarea 🍅 1');

  const noEstStep2 = formatTaskWithPomodoroEstimate(noEstStep1, undefined, 0);
  assert.equal(noEstStep2, 'Tarea');
});

test('extractPendingTasksFromContent parses pomodoro estimates from markdown lines', () => {
  const content = `# Inbox

## Tareas
- [ ] ⏫ Estudiar para final 🍅 4
- [ ] Resolver guía práctica 🍅 1/3
- [ ] Comprar cuaderno
`;
  const items = extractPendingTasksFromContent(content, 'Inbox.md');
  assert.equal(items.length, 3);
  assert.equal(items[0].estimatedPomodoros, 4);
  assert.equal(items[0].completedPomodoros, 0);

  assert.equal(items[1].estimatedPomodoros, 3);
  assert.equal(items[1].completedPomodoros, 1);

  assert.equal(items[2].estimatedPomodoros, undefined);
  assert.equal(items[2].completedPomodoros, 0);
});

test('computeTasksOverview includes pomodoro estimates and completions', async () => {
  const { computeTasksOverview } = await import('../src/analytics.ts');
  const tasks = [
    { id: '1', originalLine: '', text: 'T1', sourceFile: '', completed: false, statusChar: ' ', priority: 'high', estimatedPomodoros: 2, completedPomodoros: 1 },
    { id: '2', originalLine: '', text: 'T2', sourceFile: '', completed: false, statusChar: ' ', priority: 'medium', estimatedPomodoros: 3, completedPomodoros: 0 },
    { id: '3', originalLine: '', text: 'T3', sourceFile: '', completed: true, statusChar: 'x', priority: 'none', estimatedPomodoros: 2, completedPomodoros: 2 },
  ];

  const stat = computeTasksOverview(tasks);
  assert.equal(stat.totalEstimatedPomodoros, 7);
  assert.equal(stat.totalCompletedPomodoros, 3);
});

test('parseTaskDeadline extracts due dates and times', () => {
  const item1 = parseTaskDeadline('Entrega Trabajo Práctico 📅 2026-10-20');
  assert.equal(item1.dueDate, '2026-10-20');
  assert.equal(item1.dueTime, undefined);
  assert.equal(item1.cleanTitle, 'Entrega Trabajo Práctico');

  const item2 = parseTaskDeadline('Examen Parcial 📅 2026-10-25 15:30');
  assert.equal(item2.dueDate, '2026-10-25');
  assert.equal(item2.dueTime, '15:30');
  assert.equal(item2.cleanTitle, 'Examen Parcial');

  const item3 = parseTaskDeadline('Repasar sin fecha');
  assert.equal(item3.dueDate, undefined);
  assert.equal(item3.cleanTitle, 'Repasar sin fecha');
});

test('formatTaskWithDeadline formats and updates deadline cleanly', () => {
  assert.equal(formatTaskWithDeadline('Entregar TP', '2026-10-20'), 'Entregar TP 📅 2026-10-20');
  assert.equal(formatTaskWithDeadline('Entregar TP 📅 2026-10-15', '2026-10-20'), 'Entregar TP 📅 2026-10-20');
  assert.equal(formatTaskWithDeadline('Entregar TP', '2026-10-20', '18:00'), 'Entregar TP 📅 2026-10-20 18:00');
});

test('calculateDaysRemaining and formatDeadlineHuman handle relative dates', () => {
  const ref = new Date('2026-10-12T10:00:00');
  assert.equal(calculateDaysRemaining('2026-10-12', ref), 0);
  assert.equal(calculateDaysRemaining('2026-10-13', ref), 1);
  assert.equal(calculateDaysRemaining('2026-10-15', ref), 3);
  assert.equal(calculateDaysRemaining('2026-10-10', ref), -2);

  assert.equal(formatDeadlineHuman(0, '2026-10-12'), 'Vence hoy');
  assert.equal(formatDeadlineHuman(1, '2026-10-13'), 'Vence mañana');
  assert.equal(formatDeadlineHuman(3, '2026-10-15'), 'Vence en 3 días (2026-10-15)');
  assert.equal(formatDeadlineHuman(-1, '2026-10-11'), 'Venció ayer (2026-10-11)');
  assert.equal(formatDeadlineHuman(-3, '2026-10-09'), 'Venció hace 3 días (2026-10-09)');
});

test('extractPendingTasksFromContent populates dueDate and daysRemaining', () => {
  const content = `# Inbox

## Tareas
- [ ] ⏫ Entrega Final 📅 2026-10-20
- [ ] Tarea sin deadline
`;
  const tasks = extractPendingTasksFromContent(content, 'Inbox.md');
  assert.equal(tasks.length, 2);
  assert.equal(tasks[0].dueDate, '2026-10-20');
  assert.ok(typeof tasks[0].daysRemaining === 'number');
  assert.equal(tasks[1].dueDate, undefined);
  assert.equal(tasks[1].daysRemaining, undefined);
});

test('getCalendarMonthMatrix calculates correct rows and days for month', async () => {
  const { getCalendarMonthMatrix, formatMonthYearHeader, formatLongDate } = await import('../src/calendar-utils.ts');
  const ref = new Date('2026-10-12T12:00:00');
  // October 2026 (month index 9) has 31 days. Oct 1 is Thursday (index 3 in Mon-Sun).
  const cells = getCalendarMonthMatrix(2026, 9, ref);
  assert.equal(cells.length % 7, 0); // Complete rows of 7

  const currentMonthCells = cells.filter((c) => c.isCurrentMonth);
  assert.equal(currentMonthCells.length, 31);

  const todayCell = cells.find((c) => c.dateStr === '2026-10-12');
  assert.ok(todayCell);
  assert.equal(todayCell.isToday, true);

  assert.equal(formatMonthYearHeader(2026, 9), 'Octubre 2026');
  assert.equal(formatLongDate('2026-10-12'), 'Lunes 12 de Octubre, 2026');
});

test('getWeekDays generates 7 days Monday to Sunday', async () => {
  const { getWeekDays } = await import('../src/calendar-utils.ts');
  const ref = new Date('2026-10-14T12:00:00'); // Wednesday
  const days = getWeekDays(ref);
  assert.equal(days.length, 7);
  assert.equal(days[0].shortDay, 'Lun');
  assert.equal(days[0].dateStr, '2026-10-12');
  assert.equal(days[6].shortDay, 'Dom');
  assert.equal(days[6].dateStr, '2026-10-18');
});

test('extractAllTasksFromContent extracts tasks, subtasks, tags, and pomodoros', async () => {
  const { extractAllTasksFromContent } = await import('../src/markdown-utils.ts');
  const markdown = `# Inbox

## Tareas
- [ ] Resolver guía práctica 4 #algebra 📅 2026-10-15 🍅 0/3 ⏫
  - [x] Ejercicios 1 a 5
  - [ ] Ejercicios 6 a 10
- [x] Repasar teoría de matrices #algebra
- [ ] Entrega de Trabajo Práctico #redes 📅 2026-10-12 🍅 2/4

## Ideas
- [ ] Investigar algoritmo Raft para distribuidos #sistemas
`;

  const tasks = extractAllTasksFromContent(markdown, 'StudyFlow/Inbox.md');
  assert.equal(tasks.length, 4);

  // Check algebra task with subtasks
  const algebraTask = tasks.find((t) => t.text.includes('guía práctica 4'));
  assert.ok(algebraTask);
  assert.equal(algebraTask.completed, false);
  assert.equal(algebraTask.priority, 'high');
  assert.equal(algebraTask.estimatedPomodoros, 3);
  assert.equal(algebraTask.completedPomodoros, 0);
  assert.equal(algebraTask.dueDate, '2026-10-15');
  assert.deepEqual(algebraTask.tags, ['#algebra']);
  assert.ok(algebraTask.subtasks);
  assert.equal(algebraTask.subtasks.length, 2);
  assert.equal(algebraTask.subtasks[0].text, 'Ejercicios 1 a 5');
  assert.equal(algebraTask.subtasks[0].completed, true);
  assert.equal(algebraTask.subtasks[1].text, 'Ejercicios 6 a 10');
  assert.equal(algebraTask.subtasks[1].completed, false);

  // Check idea task
  const ideaTask = tasks.find((t) => t.text.includes('algoritmo Raft'));
  assert.ok(ideaTask);
  assert.equal(ideaTask.isIdea, true);

  // Check completed task
  const doneTask = tasks.find((t) => t.text.includes('teoría de matrices'));
  assert.ok(doneTask);
  assert.equal(doneTask.completed, true);
});

test('compareTasksByPriority prioritizes incomplete, imminent deadlines, and high priority', async () => {
  const { compareTasksByPriority } = await import('../src/markdown-utils.ts');
  const taskA = {
    id: '1',
    originalLine: '',
    text: 'A',
    sourceFile: 'f.md',
    completed: false,
    statusChar: ' ',
    priority: 'low',
    dueDate: '2026-10-12',
    daysRemaining: 0,
  };
  const taskB = {
    id: '2',
    originalLine: '',
    text: 'B',
    sourceFile: 'f.md',
    completed: false,
    statusChar: ' ',
    priority: 'high',
    dueDate: '2026-10-20',
    daysRemaining: 8,
  };
  const taskDone = {
    id: '3',
    originalLine: '',
    text: 'Done',
    sourceFile: 'f.md',
    completed: true,
    statusChar: 'x',
    priority: 'high',
  };

  // Imminent deadline beats higher priority with later deadline
  assert.ok(compareTasksByPriority(taskA, taskB) < 0);
  // Uncompleted beats completed
  assert.ok(compareTasksByPriority(taskA, taskDone) < 0);
  assert.ok(compareTasksByPriority(taskDone, taskA) > 0);
});

test('getCleanTaskDisplayTitle strips metadata tags and leaves human title', async () => {
  const { getCleanTaskDisplayTitle } = await import('../src/markdown-utils.ts');
  const input = 'Resolver guía práctica 4 #algebra 📅 2026-10-15 🍅 0/3 ⏫';
  assert.equal(getCleanTaskDisplayTitle(input), 'Resolver guía práctica 4');

  const input2 = 'nose 🍅 1';
  assert.equal(getCleanTaskDisplayTitle(input2), 'nose');

  const input3 = '💡 Estudiar para parcial #quimica 📅 2026-10-20';
  assert.equal(getCleanTaskDisplayTitle(input3), 'Estudiar para parcial');

  const input4 = '🧊 Investigar compiladores JIT #cs';
  assert.equal(getCleanTaskDisplayTitle(input4), 'Investigar compiladores JIT');
});

test('appendIceboxItemToMarkdownSection appends plain bullet without checkbox syntax', () => {
  const initial = `# Inbox\n\n## Tareas\n- [ ] Estudiar parcial\n\n## Icebox\n- Proyecto Rust\n`;
  const updated = appendIceboxItemToMarkdownSection(initial, 'Leer libro de Clean Code #arquitectura');

  assert.ok(updated.includes('- Leer libro de Clean Code #arquitectura'));
  assert.ok(!updated.includes('- [ ] Leer libro de Clean Code'));
  assert.ok(updated.includes('## Tareas\n- [ ] Estudiar parcial'));
});

test('extractAllTasksFromContent parses plain bullets in Icebox as isIdea: true without checkboxes', async () => {
  const { extractAllTasksFromContent } = await import('../src/markdown-utils.ts');
  const content = `# Inbox

## Tareas
- [ ] Hacer ejercicio 1 #algebra 🍅 1/2
- [x] Tarea vieja

## Icebox
- Investigar algoritmos A* #ia
- 🧊 Leer tutorial de WebGL #graficos
`;

  const all = extractAllTasksFromContent(content, 'Inbox.md');
  assert.equal(all.length, 4);

  const iceboxItems = all.filter((t) => t.isIdea);
  assert.equal(iceboxItems.length, 2);
  assert.ok(iceboxItems.some((t) => t.text === 'Investigar algoritmos A* #ia' && !t.completed));
  assert.ok(iceboxItems.some((t) => t.text === '🧊 Leer tutorial de WebGL #graficos' && !t.completed));

  const actionableTasks = all.filter((t) => !t.isIdea);
  assert.equal(actionableTasks.length, 2);
});

test('incrementTaskPomodoroInContent increments completed pomodoro count', () => {
  const content = `# Inbox\n- [ ] Tarea con pomodoro 🍅 1/3\n- [ ] Otra tarea\n`;
  const res = incrementTaskPomodoroInContent(content, 'Tarea con pomodoro 🍅 1/3');
  assert.ok(res !== null);
  assert.equal(res.updatedText, 'Tarea con pomodoro 🍅 2/3');
  assert.ok(res.updatedContent.includes('- [ ] Tarea con pomodoro 🍅 2/3'));
});

test('decrementTaskPomodoroInContent decrements completed pomodoro count', () => {
  const content = `# Inbox\n- [ ] Tarea con pomodoro 🍅 2/3\n`;
  const res = decrementTaskPomodoroInContent(content, 'Tarea con pomodoro 🍅 2/3');
  assert.ok(res !== null);
  assert.equal(res.updatedText, 'Tarea con pomodoro 🍅 1/3');
  assert.ok(res.updatedContent.includes('- [ ] Tarea con pomodoro 🍅 1/3'));
});

test('promoteIdeaToTaskInContent moves item from icebox to tasks section', () => {
  const content = `# Inbox\n\n## Tareas\n- [ ] Tarea existente\n\n## Icebox\n- 🧊 Idea innovadora\n`;
  const res = promoteIdeaToTaskInContent(content, '🧊 Idea innovadora', 'high');
  assert.equal(res.promoted, true);
  assert.ok(!res.updatedContent.includes('## Icebox\n- 🧊 Idea innovadora'));
  assert.ok(res.updatedContent.includes('- [ ] ⏫ Idea innovadora'));
});

test('toggleTaskCompletionInContent flips checkbox status correctly', () => {
  const content = `# Inbox\n- [ ] Pendiente\n- [x] Ya hecha\n`;
  const completed = toggleTaskCompletionInContent(content, 'Pendiente', true);
  assert.equal(completed.found, true);
  assert.ok(completed.updatedContent.includes('- [x] Pendiente'));

  const uncompleted = toggleTaskCompletionInContent(content, 'Ya hecha', false);
  assert.equal(uncompleted.found, true);
  assert.ok(uncompleted.updatedContent.includes('- [ ] Ya hecha'));
});

test('updateTaskTextInContent updates the matching line cleanly', () => {
  const content = `# Inbox\n- [ ] Texto viejo\n`;
  const res = updateTaskTextInContent(content, 'Texto viejo', 'Texto actualizado #importante');
  assert.equal(res.found, true);
  assert.ok(res.updatedContent.includes('- [ ] Texto actualizado #importante'));
});

test('toggleSubtaskInContent toggles indented checkbox', () => {
  const content = `# Inbox\n- [ ] Tarea padre\n  - [ ] Subtarea 1\n`;
  const res = toggleSubtaskInContent(content, 'Subtarea 1', true);
  assert.equal(res.found, true);
  assert.ok(res.updatedContent.includes('  - [x] Subtarea 1'));
});

test('addSubtaskToContent inserts subtask under target parent', () => {
  const content = `# Inbox\n- [ ] Tarea padre\n- [ ] Siguiente tarea\n`;
  const res = addSubtaskToContent(content, 'Tarea padre', 'Nueva subtarea hija');
  assert.equal(res.added, true);
  assert.ok(res.updatedContent.includes('- [ ] Tarea padre\n  - [ ] Nueva subtarea hija\n- [ ] Siguiente tarea'));
});

test('deleteTaskFromContent removes target task and any indented subtasks', () => {
  const content = `# Inbox\n- [ ] Tarea a borrar\n  - [ ] Subtarea hija\n- [ ] Tarea conservada\n`;
  const res = deleteTaskFromContent(content, 'Tarea a borrar');
  assert.equal(res.deleted, true);
  assert.ok(!res.updatedContent.includes('Tarea a borrar'));
  assert.ok(!res.updatedContent.includes('Subtarea hija'));
  assert.ok(res.updatedContent.includes('- [ ] Tarea conservada'));
});

test('formatHabitsToMarkdown formats habits array into standard markdown checklist', () => {
  const habits = [
    { name: 'Leer 20 mins', completedToday: true, streak: 5, lastCompletedDate: '2026-10-12', history: ['2026-10-11', '2026-10-12'] },
    { name: 'Meditar', completedToday: false, streak: 0, lastCompletedDate: '', history: [] },
  ];
  const markdown = formatHabitsToMarkdown(habits);
  assert.ok(markdown.startsWith('# Registro de Hábitos\n\n'));
  assert.ok(markdown.includes('- [x] Leer 20 mins <!-- streak: 5 | last: 2026-10-12 | history: 2026-10-11,2026-10-12 -->'));
  assert.ok(markdown.includes('- [ ] Meditar <!-- streak: 0 | last:  | history:  -->'));
});

test('syncBlocksToMarkdown adds new section if none exists or updates existing section', () => {
  const initial = `# 2026-10-12\n\nNotas del día`;
  const blocks = [
    { startTime: '09:00', endTime: '10:30', title: 'Estudio de Redes', completed: false, linkedNote: 'Redes.md' },
    { startTime: '11:00', endTime: '12:00', title: 'Práctica', completed: true },
  ];
  const synced = syncBlocksToMarkdown(initial, blocks);
  assert.ok(synced.includes('## Bloques de Tiempo'));
  assert.ok(synced.includes('- [ ] 09:00—10:30 Estudio de Redes [[Redes.md]]'));
  assert.ok(synced.includes('- [x] 11:00—12:00 Práctica'));

  // Updating existing section
  const updatedBlocks = [
    { startTime: '09:00', endTime: '10:30', title: 'Estudio de Redes', completed: true, linkedNote: 'Redes.md' },
  ];
  const reSynced = syncBlocksToMarkdown(synced, updatedBlocks);
  assert.ok(reSynced.includes('- [x] 09:00—10:30 Estudio de Redes [[Redes.md]]'));
  assert.ok(!reSynced.includes('11:00 — 12:00 Práctica'));
});

test('mergeTemplateIntoContent handles empty or existing content properly', () => {
  const empty = '';
  assert.equal(mergeTemplateIntoContent(empty, '## Nuevo'), '## Nuevo');

  const existing = `# Nota\nTexto`;
  assert.equal(mergeTemplateIntoContent(existing, '## Nuevo'), '# Nota\nTexto\n\n## Nuevo');
});

test('getLocalDateString accurately formats dates near midnight without day jumping', () => {
  // Late night near midnight (23:59:59)
  const lateNight = new Date(2026, 9, 12, 23, 59, 59);
  assert.equal(getLocalDateString(lateNight), '2026-10-12');

  // Just after midnight (00:00:01)
  const earlyMorning = new Date(2026, 9, 13, 0, 0, 1);
  assert.equal(getLocalDateString(earlyMorning), '2026-10-13');

  // Exact midnight (00:00:00)
  const exactMidnight = new Date(2026, 9, 13, 0, 0, 0);
  assert.equal(getLocalDateString(exactMidnight), '2026-10-13');
});

test('getLocalDateString prevents UTC shift bugs in UTC-5 evening', () => {
  // In UTC-5 (e.g. Bogota, Lima, CDMX daylight), 23:30 on Oct 12 corresponds to 04:30 UTC on Oct 13.
  // toISOString().slice(0, 10) produces '2026-10-13' (WRONG next day).
  // getLocalDateString must preserve the actual local date '2026-10-12'.
  const utcDate = new Date('2026-10-13T04:30:00.000Z');
  
  // Verify that if a local date has year 2026, month 10, day 12, it always formats as 2026-10-12
  const localDate = new Date(2026, 9, 12, 23, 30, 0);
  assert.equal(getLocalDateString(localDate), '2026-10-12');
  assert.notEqual(getLocalDateString(localDate), '2026-10-13');

  // Verify that an ISO string from UTC would fail if taken directly
  const isoUtcDay = utcDate.toISOString().slice(0, 10);
  assert.equal(isoUtcDay, '2026-10-13'); // proves UTC has already shifted
});

test('formatDailyNoteFileName accepts string date, Date object, or numeric offset', () => {
  // Passing explicit date string
  assert.equal(formatDailyNoteFileName('YYYY-MM-DD', '2026-10-12'), '2026-10-12.md');
  assert.equal(formatDailyNoteFileName('YYYY-MM-DD', '2026-10-12.md'), '2026-10-12.md');
  assert.equal(formatDailyNoteFileName('YYYY/MM/DD', '2026-10-12'), '2026/10/12.md');

  // Passing Date object near midnight
  const lateNight = new Date(2026, 9, 12, 23, 59, 59);
  assert.equal(formatDailyNoteFileName('YYYY-MM-DD', lateNight), '2026-10-12.md');

  // Passing numeric offset
  const ref = new Date(2026, 9, 12, 12, 0, 0);
  assert.equal(formatDailyNoteFileName('YYYY-MM-DD', 1, ref), '2026-10-13.md');
  assert.equal(formatDailyNoteFileName('YYYY-MM-DD', -1, ref), '2026-10-11.md');
});

test('shouldZenIgnoreEscape ignores Escape when modals are open or inputs/editors have focus', () => {
  // Modal open
  assert.equal(shouldZenIgnoreEscape(null, true), true);

  // Input focused
  assert.equal(shouldZenIgnoreEscape({ tagName: 'INPUT' }, false), true);

  // Textarea focused
  assert.equal(shouldZenIgnoreEscape({ tagName: 'TEXTAREA' }, false), true);

  // Select focused
  assert.equal(shouldZenIgnoreEscape({ tagName: 'SELECT' }, false), true);

  // ContentEditable focused
  assert.equal(shouldZenIgnoreEscape({ tagName: 'DIV', isContentEditable: true }, false), true);

  // CodeMirror editor focused
  const editorEl = {
    tagName: 'DIV',
    closest: (sel) => sel.includes('.cm-editor') ? {} : null,
  };
  assert.equal(shouldZenIgnoreEscape(editorEl, false), true);

  // Plain div/body focused with no modal -> should NOT ignore Escape (can exit Zen)
  const plainEl = {
    tagName: 'DIV',
    isContentEditable: false,
    closest: () => null,
  };
  assert.equal(shouldZenIgnoreEscape(plainEl, false), false);
  assert.equal(shouldZenIgnoreEscape(null, false), false);
});

test('computeLineHash produces deterministic hash and ignores trailing carriage returns', () => {
  const hash1 = computeLineHash('- [ ] Tarea de prueba');
  const hash2 = computeLineHash('- [ ] Tarea de prueba\r');
  const hash3 = computeLineHash('- [ ] Otra tarea distinta');

  assert.equal(typeof hash1, 'string');
  assert.equal(hash1, hash2);
  assert.notEqual(hash1, hash3);
});

test('extractAllTasksFromContent populates lineNumber and lineHash on tasks and subtasks', () => {
  const md = `# Inbox

## Tareas
- [ ] Tarea 1
  - [ ] Subtarea 1.1
- [x] Tarea 2
`;
  const tasks = extractAllTasksFromContent(md, 'Inbox.md');
  assert.equal(tasks.length, 2);

  const t1 = tasks.find((t) => t.text === 'Tarea 1');
  assert.ok(t1);
  assert.equal(t1.lineNumber, 4);
  assert.equal(t1.lineHash, computeLineHash('- [ ] Tarea 1'));
  assert.equal(t1.subtasks?.length, 1);
  assert.equal(t1.subtasks[0].lineNumber, 5);
  assert.equal(t1.subtasks[0].lineHash, computeLineHash('  - [ ] Subtarea 1.1'));

  const t2 = tasks.find((t) => t.text === 'Tarea 2');
  assert.ok(t2);
  assert.equal(t2.lineNumber, 6);
  assert.equal(t2.lineHash, computeLineHash('- [x] Tarea 2'));
});

test('mutateTaskLineInContent correctly differentiates tasks with duplicate text using lineNumber and lineHash', () => {
  const content = `# Mis Tareas

- [ ] Repasar matemáticas
- [ ] Repasar matemáticas
`;
  const lineHash = computeLineHash('- [ ] Repasar matemáticas');

  // Toggle first duplicate (Line 3)
  const res1 = mutateTaskLineInContent(
    content,
    { sourceFile: 'test.md', lineNumber: 3, lineHash, text: 'Repasar matemáticas' },
    { action: 'toggle', completed: true }
  );
  assert.equal(res1.success, true);
  const linesAfterFirst = res1.updatedContent.split('\n');
  assert.ok(linesAfterFirst[2].startsWith('- [x] Repasar matemáticas'));
  assert.equal(linesAfterFirst[3], '- [ ] Repasar matemáticas');

  // Toggle second duplicate (Line 4)
  const res2 = mutateTaskLineInContent(
    content,
    { sourceFile: 'test.md', lineNumber: 4, lineHash, text: 'Repasar matemáticas' },
    { action: 'toggle', completed: true }
  );
  assert.equal(res2.success, true);
  const linesAfterSecond = res2.updatedContent.split('\n');
  assert.equal(linesAfterSecond[2], '- [ ] Repasar matemáticas');
  assert.ok(linesAfterSecond[3].startsWith('- [x] Repasar matemáticas'));
});

test('mutateTaskLineInContent updates only the targeted duplicate when updating text or deleting', () => {
  const content = `## Tareas
- [ ] Comprar fruta
- [ ] Comprar fruta
`;
  const lineHash = computeLineHash('- [ ] Comprar fruta');

  // Update text of second duplicate
  const updateRes = mutateTaskLineInContent(
    content,
    { sourceFile: 'test.md', lineNumber: 3, lineHash, text: 'Comprar fruta' },
    { action: 'update', newText: 'Comprar manzanas y peras' }
  );
  assert.equal(updateRes.success, true);
  assert.ok(updateRes.updatedContent.includes('- [ ] Comprar fruta\n- [ ] Comprar manzanas y peras'));

  // Delete first duplicate
  const delRes = mutateTaskLineInContent(
    content,
    { sourceFile: 'test.md', lineNumber: 2, lineHash, text: 'Comprar fruta' },
    { action: 'delete' }
  );
  assert.equal(delRes.success, true);
  assert.equal(delRes.updatedContent.trim(), '## Tareas\n- [ ] Comprar fruta');
});

test('mutateTaskLineInContent avoids substring collisions (e.g. Estudiar vs Estudiar matemáticas)', () => {
  const content = `## Tareas
- [ ] Estudiar matemáticas
- [ ] Estudiar
`;
  // Without specifying line number, targeting "Estudiar" must NOT match "Estudiar matemáticas"
  const res = mutateTaskLineInContent(
    content,
    { sourceFile: 'test.md', text: 'Estudiar' },
    { action: 'toggle', completed: true }
  );
  assert.equal(res.success, true);
  const lines = res.updatedContent.split('\n');
  assert.equal(lines[1], '- [ ] Estudiar matemáticas');
  assert.ok(lines[2].startsWith('- [x] Estudiar'));
});

test('mutateTaskLineInContent detects ambiguity and aborts when lines shifted and multiple duplicates exist', () => {
  const originalHash = computeLineHash('- [ ] Leer 10 páginas');
  // Two duplicate tasks at lines 4 and 6
  const shiftedContent = `# Notas
Línea agregada 1
Línea agregada 2
- [ ] Leer 10 páginas
Otra cosa
- [ ] Leer 10 páginas
`;
  // Locator expects line 2 (which no longer matches due to shift)
  const res = mutateTaskLineInContent(
    shiftedContent,
    { sourceFile: 'test.md', lineNumber: 2, lineHash: originalHash, text: 'Leer 10 páginas' },
    { action: 'toggle', completed: true }
  );
  assert.equal(res.success, false);
  assert.equal(res.error, 'ambiguous');
  assert.equal(res.updatedContent, shiftedContent);
});

test('mutateTaskLineInContent resolves unique match when lines shifted and only one match exists in file', () => {
  const originalHash = computeLineHash('- [ ] Tarea única desplazada');
  const shiftedContent = `# Notas
Línea nueva 1
Línea nueva 2
- [ ] Tarea única desplazada
`;
  // Stored lineNumber was 2, but task is now at line 4
  const res = mutateTaskLineInContent(
    shiftedContent,
    { sourceFile: 'test.md', lineNumber: 2, lineHash: originalHash, text: 'Tarea única desplazada' },
    { action: 'toggle', completed: true }
  );
  assert.equal(res.success, true);
  assert.ok(res.updatedContent.includes('- [x] Tarea única desplazada'));
});

test('mutateTaskLineInContent handles all 7 mutation operations cleanly', () => {
  const md = `# Inbox

## Tareas
- [ ] Tarea Base
- [ ] Tarea Con Pomos 🍅 1/3
- [ ] Tarea Con Subtareas
  - [ ] Sub 1

## Ideas
- [ ] 💡 Idea brillante
`;
  // 1. Toggle
  const toggleRes = mutateTaskLineInContent(
    md,
    { sourceFile: 'inbox.md', lineNumber: 4, text: 'Tarea Base' },
    { action: 'toggle', completed: true }
  );
  assert.equal(toggleRes.success, true);
  assert.ok(toggleRes.updatedContent.includes('- [x] Tarea Base'));

  // 2. Update
  const updateRes = mutateTaskLineInContent(
    md,
    { sourceFile: 'inbox.md', lineNumber: 4, text: 'Tarea Base' },
    { action: 'update', newText: 'Tarea Base Modificada' }
  );
  assert.equal(updateRes.success, true);
  assert.ok(updateRes.updatedContent.includes('- [ ] Tarea Base Modificada'));

  // 3. Increment pomodoro
  const incRes = mutateTaskLineInContent(
    md,
    { sourceFile: 'inbox.md', lineNumber: 5, text: 'Tarea Con Pomos 🍅 1/3' },
    { action: 'increment' }
  );
  assert.equal(incRes.success, true);
  assert.ok(incRes.updatedContent.includes('🍅 2/3'));

  // 4. Decrement pomodoro
  const decRes = mutateTaskLineInContent(
    md,
    { sourceFile: 'inbox.md', lineNumber: 5, text: 'Tarea Con Pomos 🍅 1/3' },
    { action: 'decrement' }
  );
  assert.equal(decRes.success, true);
  assert.ok(decRes.updatedContent.includes('🍅 3'));

  // 5. Subtask add
  const addSubRes = mutateTaskLineInContent(
    md,
    { sourceFile: 'inbox.md', lineNumber: 6, text: 'Tarea Con Subtareas' },
    { action: 'subtask', subtaskAction: 'add', subtaskText: 'Sub 2' }
  );
  assert.equal(addSubRes.success, true);
  assert.ok(addSubRes.updatedContent.includes('  - [ ] Sub 1\n  - [ ] Sub 2'));

  // 6. Subtask toggle
  const toggleSubRes = mutateTaskLineInContent(
    md,
    { sourceFile: 'inbox.md', lineNumber: 6, text: 'Tarea Con Subtareas' },
    { action: 'subtask', subtaskAction: 'toggle', subtaskText: 'Sub 1', completed: true }
  );
  assert.equal(toggleSubRes.success, true);
  assert.ok(toggleSubRes.updatedContent.includes('  - [x] Sub 1'));

  // 7. Promote idea
  const promoteRes = mutateTaskLineInContent(
    md,
    { sourceFile: 'inbox.md', lineNumber: 10, text: 'Idea brillante' },
    { action: 'promote', priority: 'high' }
  );
  assert.equal(promoteRes.success, true);
  assert.ok(promoteRes.updatedContent.includes('- [ ] ⏫ Idea brillante'));
  assert.ok(!promoteRes.updatedContent.includes('- [ ] 💡 Idea brillante'));

  // Delete
  const delRes = mutateTaskLineInContent(
    md,
    { sourceFile: 'inbox.md', lineNumber: 6, text: 'Tarea Con Subtareas' },
    { action: 'delete' }
  );
  assert.equal(delRes.success, true);
  assert.ok(!delRes.updatedContent.includes('Tarea Con Subtareas'));
  assert.ok(!delRes.updatedContent.includes('Sub 1'));
});

test('createHabitId generates clean, stable, deterministic slugs', () => {
  assert.equal(createHabitId('📚 Lectura 20 min'), 'lectura-20-min');
  assert.equal(createHabitId('💧 Tomar 2L de agua'), 'tomar-2l-de-agua');
  assert.equal(createHabitId('🏃‍♂️ Ejercicio / Estiramiento'), 'ejercicio-estiramiento');
  assert.equal(createHabitId('🧘 Meditación o Desconexión'), 'meditacion-o-desconexion');
  assert.equal(createHabitId('Estudiar Inglés'), 'estudiar-ingles');
  assert.equal(createHabitId('  --- Test Habit !!! ---  '), 'test-habit');
});

test('syncHabitsToMarkdown modifies ONLY habit lines and preserves all other content in Habits.md', () => {
  const content = `# Registro de Hábitos

> [!TIP] Racha personal
> Mantener la consistencia cada mañana antes de comenzar a estudiar.

- [ ] 📚 Lectura 20 min <!-- streak: 2 | last: 2026-10-11 | history: 2026-10-10,2026-10-11 -->
- [ ] 💧 Tomar 2L de agua <!-- streak: 5 | last: 2026-10-11 | history: 2026-10-07,2026-10-08,2026-10-09,2026-10-10,2026-10-11 -->

## Notas y Reflexiones
* No usar el teléfono en los primeros 30 minutos del día.
* Llevar botella de agua al escritorio.
`;

  const updatedHabits = [
    {
      id: 'lectura-20-min',
      name: '📚 Lectura 20 min',
      completedToday: true,
      streak: 3,
      lastCompletedDate: '2026-10-12',
      history: ['2026-10-10', '2026-10-11', '2026-10-12'],
    },
    {
      id: 'tomar-2l-de-agua',
      name: '💧 Tomar 2L de agua',
      completedToday: false,
      streak: 5,
      lastCompletedDate: '2026-10-11',
      history: ['2026-10-07', '2026-10-08', '2026-10-09', '2026-10-10', '2026-10-11'],
    },
  ];

  const synced = syncHabitsToMarkdown(content, updatedHabits);

  // Verifies the habit line was updated in place
  assert.ok(synced.includes('- [x] 📚 Lectura 20 min <!-- streak: 3 | last: 2026-10-12 | history: 2026-10-10,2026-10-11,2026-10-12 -->'));
  assert.ok(synced.includes('- [ ] 💧 Tomar 2L de agua <!-- streak: 5 | last: 2026-10-11'));

  // Verifies that headers, callouts, and notes are 100% preserved
  assert.ok(synced.includes('# Registro de Hábitos'));
  assert.ok(synced.includes('> [!TIP] Racha personal\n> Mantener la consistencia cada mañana antes de comenzar a estudiar.'));
  assert.ok(synced.includes('## Notas y Reflexiones'));
  assert.ok(synced.includes('* No usar el teléfono en los primeros 30 minutos del día.'));
  assert.ok(synced.includes('* Llevar botella de agua al escritorio.'));
});

test('syncHabitsToMarkdown inserts newly added habits after existing habits while keeping extra content', () => {
  const content = `# Mis Hábitos
Intro libre.

- [ ] 📚 Lectura 20 min <!-- streak: 0 | last:  -->

## Fin de notas
Comentario final.
`;

  const habits = [
    { id: 'lectura-20-min', name: '📚 Lectura 20 min', streak: 0 },
    { id: 'meditacion', name: '🧘 Meditación', streak: 0 },
  ];

  const result = syncHabitsToMarkdown(content, habits);

  assert.ok(result.includes('- [ ] 📚 Lectura 20 min'));
  assert.ok(result.includes('- [ ] 🧘 Meditación'));
  assert.ok(result.includes('Intro libre.'));
  assert.ok(result.includes('## Fin de notas\nComentario final.'));

  // Check ordering: Meditación must be before '## Fin de notas'
  const medIdx = result.indexOf('🧘 Meditación');
  const finIdx = result.indexOf('## Fin de notas');
  assert.ok(medIdx < finIdx);
});

test('syncHabitsToMarkdown deletes removed habits while preserving surrounding markdown notes', () => {
  const content = `# Hábitos
Nota inicial.

- [ ] Hábito 1 <!-- streak: 1 | last:  -->
- [ ] Hábito 2 <!-- streak: 2 | last:  -->

Nota final.
`;

  // We keep only Hábito 1
  const habits = [{ id: 'habito-1', name: 'Hábito 1', streak: 1 }];
  const result = syncHabitsToMarkdown(content, habits);

  assert.ok(result.includes('- [ ] Hábito 1'));
  assert.ok(!result.includes('Hábito 2'));
  assert.ok(result.includes('Nota inicial.'));
  assert.ok(result.includes('Nota final.'));
});

test('appendClosingNoteToDailyContent indents note right below matching pomodoro session', () => {
  const content = `# 2026-10-12

- [x] Pomodoro completado a las 14:00 — *Estudiar Biología*
- [x] Pomodoro completado a las 15:30 — *Resolver guía de Cálculo*

## Tareas
- [ ] Otra cosa
`;

  const updated = appendClosingNoteToDailyContent(content, 'Resolver guía de Cálculo', 'Terminé ejercicios del 1 al 5');
  assert.ok(updated.includes('- [x] Pomodoro completado a las 15:30 — *Resolver guía de Cálculo*\n  - 📝 Nota: Terminé ejercicios del 1 al 5'));
  assert.ok(updated.includes('## Tareas\n- [ ] Otra cosa'));
});

test('appendClosingNoteToDailyContent appends bullet at end when no matching pomodoro entry exists', () => {
  const content = `# 2026-10-12

Texto previo.
`;

  const updated = appendClosingNoteToDailyContent(content, 'Lectura', 'Leí capítulo 2');
  assert.ok(updated.includes('- 📝 Nota Pomodoro (*Lectura*): Leí capítulo 2'));
});

test('appendClosingNoteToDailyContent returns unchanged content when note is empty', () => {
  const content = `# 2026-10-12\n\n- [x] Pomodoro completado`;
  assert.equal(appendClosingNoteToDailyContent(content, 'Tarea', '   '), content);
});

