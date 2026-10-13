import test from 'node:test';
import assert from 'node:assert/strict';
import {
  SPACED_REPETITION_INTERVALS,
  getNextSpacedInterval,
  calculateNextRepetition,
  hasRepasarTag,
  isSpacedRepetitionNote,
  filterDueSpacedNotes,
} from '../src/spaced-repetition.ts';

test('SPACED_REPETITION_INTERVALS matches 1-3-7-14-30 scale', () => {
  assert.deepEqual(SPACED_REPETITION_INTERVALS, [1, 3, 7, 14, 30]);
});

test('getNextSpacedInterval advances on "facil" along 1 -> 3 -> 7 -> 14 -> 30', () => {
  assert.equal(getNextSpacedInterval(1, 'facil'), 3);
  assert.equal(getNextSpacedInterval(3, 'facil'), 7);
  assert.equal(getNextSpacedInterval(7, 'facil'), 14);
  assert.equal(getNextSpacedInterval(14, 'facil'), 30);
  assert.equal(getNextSpacedInterval(30, 'facil'), 30); // Capped at 30
  assert.equal(getNextSpacedInterval(45, 'facil'), 30); // Above 30 stays capped at 30
});

test('getNextSpacedInterval handles initial or undefined intervals gracefully on "facil"', () => {
  assert.equal(getNextSpacedInterval(undefined, 'facil'), 3);
  assert.equal(getNextSpacedInterval(0, 'facil'), 3);
});

test('getNextSpacedInterval resets to 1 day on "dificil" from any interval', () => {
  assert.equal(getNextSpacedInterval(1, 'dificil'), 1);
  assert.equal(getNextSpacedInterval(3, 'dificil'), 1);
  assert.equal(getNextSpacedInterval(7, 'dificil'), 1);
  assert.equal(getNextSpacedInterval(14, 'dificil'), 1);
  assert.equal(getNextSpacedInterval(30, 'dificil'), 1);
  assert.equal(getNextSpacedInterval(undefined, 'dificil'), 1);
});

test('calculateNextRepetition computes dates and state accurately', () => {
  const refDate = new Date(2026, 9, 13, 12, 0); // 2026-10-13

  // 1 -> 3 days on facil
  const res1 = calculateNextRepetition(1, 'facil', refDate);
  assert.equal(res1.nextInterval, 3);
  assert.equal(res1.nextReviewDate, '2026-10-16');
  assert.equal(res1.lastReviewedDate, '2026-10-13');

  // 14 -> 30 days on facil across month boundary (Oct 13 + 30 days = Nov 12)
  const res2 = calculateNextRepetition(14, 'facil', refDate);
  assert.equal(res2.nextInterval, 30);
  assert.equal(res2.nextReviewDate, '2026-11-12');
  assert.equal(res2.lastReviewedDate, '2026-10-13');

  // 30 -> 1 day on dificil
  const res3 = calculateNextRepetition(30, 'dificil', refDate);
  assert.equal(res3.nextInterval, 1);
  assert.equal(res3.nextReviewDate, '2026-10-14');
  assert.equal(res3.lastReviewedDate, '2026-10-13');
});

test('hasRepasarTag checks tags in body and frontmatter', () => {
  assert.equal(hasRepasarTag(['#repasar']), true);
  assert.equal(hasRepasarTag(['#repasar/biologia']), true);
  assert.equal(hasRepasarTag(['#algebra']), false);
  assert.equal(hasRepasarTag([], { tags: ['repasar'] }), true);
  assert.equal(hasRepasarTag([], { tags: ['#repasar'] }), true);
  assert.equal(hasRepasarTag([], { tag: 'repasar' }), true);
  assert.equal(hasRepasarTag([], { tags: ['historia', 'examenes'] }), false);
  assert.equal(hasRepasarTag(undefined, null), false);
});

test('isSpacedRepetitionNote validates both #repasar tag and repasar_siguiente format', () => {
  assert.equal(
    isSpacedRepetitionNote(['#repasar'], { repasar_siguiente: '2026-10-13' }),
    true
  );
  // Missing tag
  assert.equal(
    isSpacedRepetitionNote(['#otra'], { repasar_siguiente: '2026-10-13' }),
    false
  );
  // Missing repasar_siguiente
  assert.equal(
    isSpacedRepetitionNote(['#repasar'], {}),
    false
  );
  // Invalid date format
  assert.equal(
    isSpacedRepetitionNote(['#repasar'], { repasar_siguiente: 'invalid-date' }),
    false
  );
});

test('filterDueSpacedNotes filters items due on or before target date', () => {
  const notes = [
    { title: 'Nota 1', repasarSiguiente: '2026-10-11' }, // Overdue
    { title: 'Nota 2', repasarSiguiente: '2026-10-13' }, // Due today
    { title: 'Nota 3', repasarSiguiente: '2026-10-14' }, // Due tomorrow (future)
    { title: 'Nota 4', repasarSiguiente: '2026-10-20' }, // Future
  ];

  const due = filterDueSpacedNotes(notes, '2026-10-13');
  assert.equal(due.length, 2);
  assert.equal(due[0].title, 'Nota 1');
  assert.equal(due[1].title, 'Nota 2');
});
