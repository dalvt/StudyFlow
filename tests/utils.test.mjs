import test from 'node:test';
import assert from 'node:assert/strict';
import {
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


