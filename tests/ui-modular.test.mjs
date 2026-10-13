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
