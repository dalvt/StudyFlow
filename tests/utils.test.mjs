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
