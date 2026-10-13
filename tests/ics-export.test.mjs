import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildIcsCalendar,
  createStableIcsUid,
  escapeIcsText,
  formatIcsStamp,
} from '../src/ics-export.ts';

test('createStableIcsUid generates deterministic, stable UIDs', () => {
  const uid1 = createStableIcsUid('block', '2026-10-15-14:00-15:30-Estudiar Álgebra');
  const uid2 = createStableIcsUid('block', '2026-10-15-14:00-15:30-Estudiar Álgebra');
  assert.strictEqual(uid1, uid2);
  assert.ok(uid1.startsWith('study-flow-block-'));
  assert.ok(uid1.endsWith('@studyflow'));
});

test('escapeIcsText escapes backslashes, semicolons, commas and newlines', () => {
  const input = 'Capítulo 1, 2; nota \\ importante\nsegunda línea';
  const escaped = escapeIcsText(input);
  assert.strictEqual(escaped, 'Capítulo 1\\, 2\\; nota \\\\ importante\\nsegunda línea');
});

test('formatIcsStamp produces UTC timestamp string', () => {
  const d = new Date('2026-10-15T18:30:00Z');
  const stamp = formatIcsStamp(d);
  assert.strictEqual(stamp, '20261015T183000Z');
});

test('buildIcsCalendar generates RFC 5545 valid calendar with time blocks and deadlines', () => {
  const blocks = [
    {
      date: '2026-10-15',
      startTime: '10:00',
      endTime: '11:30',
      title: 'Repaso Física',
      linkedNote: 'Notas/Fisica',
      completed: true,
    },
  ];

  const deadlines = [
    {
      text: 'Entrega Proyecto Final',
      dueDate: '2026-10-20',
      priority: 'high',
      sourceFile: 'Inbox.md',
      completed: false,
    },
    {
      text: 'Examen de Cálculo',
      dueDate: '2026-10-22',
      dueTime: '15:00',
      priority: 'high',
      completed: false,
    },
  ];

  const fixedDate = new Date('2026-10-15T12:00:00Z');
  const ics = buildIcsCalendar({
    blocks,
    deadlines,
    calendarName: 'Mi Calendario Académico',
    now: fixedDate,
  });

  assert.ok(ics.startsWith('BEGIN:VCALENDAR\r\n'));
  assert.ok(ics.includes('VERSION:2.0'));
  assert.ok(ics.includes('X-WR-CALNAME:Mi Calendario Académico'));
  assert.ok(ics.endsWith('END:VCALENDAR\r\n'));

  // Time block verification
  assert.ok(ics.includes('SUMMARY:Repaso Física'));
  assert.ok(ics.includes('DTSTART:20261015T100000'));
  assert.ok(ics.includes('DTEND:20261015T113000'));
  assert.ok(ics.includes('STATUS:COMPLETED'));

  // All-day deadline verification
  assert.ok(ics.includes('SUMMARY:Entrega Proyecto Final'));
  assert.ok(ics.includes('DTSTART;VALUE=DATE:20261020'));
  assert.ok(ics.includes('DTEND;VALUE=DATE:20261021'));

  // Timed deadline verification
  assert.ok(ics.includes('SUMMARY:Examen de Cálculo'));
  assert.ok(ics.includes('DTSTART:20261022T150000'));
  assert.ok(ics.includes('DTEND:20261022T153000'));
});

test('buildIcsCalendar produces identical output across multiple runs with identical input (stable UIDs)', () => {
  const blocks = [
    {
      date: '2026-10-15',
      startTime: '09:00',
      endTime: '10:00',
      title: 'Lectura',
    },
  ];
  const deadlines = [
    {
      text: 'Entrega Ensayo',
      dueDate: '2026-10-18',
    },
  ];
  const now = new Date('2026-10-15T08:00:00Z');

  const ics1 = buildIcsCalendar({ blocks, deadlines, now });
  const ics2 = buildIcsCalendar({ blocks, deadlines, now });

  assert.strictEqual(ics1, ics2);
});
