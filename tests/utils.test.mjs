import test from 'node:test';
import assert from 'node:assert/strict';
import {
  appendTaskToMarkdownSection,
  extractPendingTasksFromContent,
  formatDailyNoteFileName,
  formatTaskWithPriority,
  parseTaskPriority,
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

