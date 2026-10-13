import test from 'node:test';
import assert from 'node:assert/strict';
import {
  calculateBlockDurationMinutes,
  timeStringToMinutes,
  doBlocksOverlap,
  findOverlappingBlocks,
  formatTimeBlockLine,
  parseTimeBlockLine,
  parseTimeBlocksFromMarkdown,
} from '../src/calendar-utils.ts';
import { syncBlocksToMarkdown } from '../src/markdown-utils.ts';

test('formatTimeBlockLine formats uncompleted block with linked note in [[note]] syntax', () => {
  const line = formatTimeBlockLine({
    startTime: '09:00',
    endTime: '10:30',
    title: 'Estudio de Redes',
    linkedNote: 'Redes.md',
    completed: false,
  });
  assert.equal(line, '- [ ] 09:00—10:30 Estudio de Redes [[Redes.md]]');
});

test('formatTimeBlockLine formats completed block without linked note', () => {
  const line = formatTimeBlockLine({
    startTime: '11:00',
    endTime: '12:00',
    title: 'Práctica de Laboratorio',
    completed: true,
  });
  assert.equal(line, '- [x] 11:00—12:00 Práctica de Laboratorio');
});

test('parseTimeBlockLine parses standard format with em-dash and wikilink', () => {
  const line = '- [ ] 09:00—10:30 Estudio de Redes [[Redes.md]]';
  const block = parseTimeBlockLine(line, '2026-10-13', 0);
  assert.ok(block);
  assert.equal(block.startTime, '09:00');
  assert.equal(block.endTime, '10:30');
  assert.equal(block.title, 'Estudio de Redes');
  assert.equal(block.linkedNote, 'Redes.md');
  assert.equal(block.completed, false);
  assert.equal(block.date, '2026-10-13');
});

test('parseTimeBlockLine handles completed block and variations in dashes or spaces', () => {
  const line1 = '- [x] 14:00 - 15:30 Álgebra Lineal';
  const block1 = parseTimeBlockLine(line1, '2026-10-13', 1);
  assert.ok(block1);
  assert.equal(block1.startTime, '14:00');
  assert.equal(block1.endTime, '15:30');
  assert.equal(block1.title, 'Álgebra Lineal');
  assert.equal(block1.completed, true);
  assert.equal(block1.linkedNote, undefined);

  // Pipe notation
  const line2 = '- [ ] 08:00 — 09:00 Química General | [[Apuntes Química]]';
  const block2 = parseTimeBlockLine(line2, '2026-10-13', 2);
  assert.ok(block2);
  assert.equal(block2.startTime, '08:00');
  assert.equal(block2.endTime, '09:00');
  assert.equal(block2.title, 'Química General');
  assert.equal(block2.linkedNote, 'Apuntes Química');
});

test('parseTimeBlockLine returns null for regular tasks or non-block lines', () => {
  assert.equal(parseTimeBlockLine('- [ ] Comprar pan'), null);
  assert.equal(parseTimeBlockLine('## Bloques de Tiempo'), null);
  assert.equal(parseTimeBlockLine(''), null);
});

test('parseTimeBlocksFromMarkdown extracts blocks only from ## Bloques de Tiempo section', () => {
  const markdown = `# 2026-10-13

## Notas de la Mañana
Texto de prueba antes de los bloques.

## Bloques de Tiempo
- [ ] 08:30—10:00 Matemáticas Discretas [[Discretas]]
- [x] 10:30—11:45 Algoritmos y Estructuras
Texto libre dentro de la sección.
- [ ] 14:00—16:00 Proyecto Final [[Tesis]]

## Tareas
- [ ] 09:00 - Esto no es un bloque porque está en ## Tareas
`;

  const blocks = parseTimeBlocksFromMarkdown(markdown, '2026-10-13');
  assert.equal(blocks.length, 3);

  assert.equal(blocks[0].startTime, '08:30');
  assert.equal(blocks[0].endTime, '10:00');
  assert.equal(blocks[0].title, 'Matemáticas Discretas');
  assert.equal(blocks[0].linkedNote, 'Discretas');
  assert.equal(blocks[0].completed, false);

  assert.equal(blocks[1].startTime, '10:30');
  assert.equal(blocks[1].endTime, '11:45');
  assert.equal(blocks[1].title, 'Algoritmos y Estructuras');
  assert.equal(blocks[1].completed, true);

  assert.equal(blocks[2].startTime, '14:00');
  assert.equal(blocks[2].endTime, '16:00');
  assert.equal(blocks[2].title, 'Proyecto Final');
  assert.equal(blocks[2].linkedNote, 'Tesis');
});

test('syncBlocksToMarkdown writes the required format and replaces existing section cleanly', () => {
  const initial = `# 2026-10-13\n\n## Tareas\n- [ ] Tarea 1\n`;
  const blocks = [
    { startTime: '09:00', endTime: '10:30', title: 'Estudio de Redes', completed: false, linkedNote: 'Redes.md' },
    { startTime: '11:00', endTime: '12:00', title: 'Práctica', completed: true },
  ];
  const synced = syncBlocksToMarkdown(initial, blocks);
  assert.ok(synced.includes('## Bloques de Tiempo'));
  assert.ok(synced.includes('- [ ] 09:00—10:30 Estudio de Redes [[Redes.md]]'));
  assert.ok(synced.includes('- [x] 11:00—12:00 Práctica'));
  assert.ok(synced.includes('## Tareas\n- [ ] Tarea 1'));

  // Parse round-trip
  const parsed = parseTimeBlocksFromMarkdown(synced, '2026-10-13');
  assert.equal(parsed.length, 2);
  assert.equal(parsed[0].title, 'Estudio de Redes');
  assert.equal(parsed[0].linkedNote, 'Redes.md');
  assert.equal(parsed[1].title, 'Práctica');
  assert.equal(parsed[1].completed, true);
});

test('overlap detection: timeStringToMinutes and doBlocksOverlap', () => {
  assert.equal(timeStringToMinutes('09:30'), 570);
  assert.equal(timeStringToMinutes('00:00'), 0);
  assert.equal(timeStringToMinutes('23:59'), 1439);

  // Overlapping
  assert.equal(
    doBlocksOverlap({ startTime: '09:00', endTime: '10:30' }, { startTime: '10:00', endTime: '11:00' }),
    true
  );

  // Adjacent (should NOT overlap)
  assert.equal(
    doBlocksOverlap({ startTime: '09:00', endTime: '10:00' }, { startTime: '10:00', endTime: '11:00' }),
    false
  );

  // Disjoint
  assert.equal(
    doBlocksOverlap({ startTime: '09:00', endTime: '10:00' }, { startTime: '11:00', endTime: '12:00' }),
    false
  );

  // Enclosed / Sub-interval
  assert.equal(
    doBlocksOverlap({ startTime: '09:00', endTime: '12:00' }, { startTime: '10:00', endTime: '11:00' }),
    true
  );
});

test('findOverlappingBlocks identifies conflicts and ignores self when editing', () => {
  const existing = [
    { id: 'b1', startTime: '09:00', endTime: '10:30', title: 'Bloque 1' },
    { id: 'b2', startTime: '11:00', endTime: '12:30', title: 'Bloque 2' },
  ];

  // Candidate overlapping with b1
  const overlaps1 = findOverlappingBlocks(existing, { startTime: '10:00', endTime: '11:30' });
  assert.equal(overlaps1.length, 2); // overlaps with both b1 (10:00-10:30) and b2 (11:00-11:30)
  assert.equal(overlaps1[0].id, 'b1');
  assert.equal(overlaps1[1].id, 'b2');

  // Candidate with no overlap (between b1 and b2)
  const overlaps2 = findOverlappingBlocks(existing, { startTime: '10:30', endTime: '11:00' });
  assert.equal(overlaps2.length, 0);

  // Editing b1 (extending it by 15 mins) - should not conflict with itself
  const overlaps3 = findOverlappingBlocks(existing, { id: 'b1', startTime: '09:00', endTime: '10:45' });
  assert.equal(overlaps3.length, 0);

  // Editing b1 so it now collides with b2
  const overlaps4 = findOverlappingBlocks(existing, { id: 'b1', startTime: '09:00', endTime: '11:15' });
  assert.equal(overlaps4.length, 1);
  assert.equal(overlaps4[0].id, 'b2');
});
