import test from 'node:test';
import assert from 'node:assert/strict';
import {
  calculateHabitStreak,
  computeHabitWeeklyProgress,
  formatHabitLine,
  getIsoWeekRange,
  parseHabitLine,
  syncHabitsToMarkdown,
} from '../src/markdown-utils.ts';

test('getIsoWeekRange returns Monday through Sunday with 7 dates', () => {
  const ref = new Date('2026-10-14T12:00:00'); // Wednesday
  const range = getIsoWeekRange(ref);
  assert.strictEqual(range.dates.length, 7);
  assert.strictEqual(range.dates[0], '2026-10-12'); // Monday
  assert.strictEqual(range.dates[6], '2026-10-18'); // Sunday
});

test('calculateHabitStreak: daily habit consecutive days', () => {
  const ref = new Date('2026-10-15T12:00:00'); // Thursday
  // Mon (12), Tue (13), Wed (14), Thu (15) completed
  const habit = {
    frequency: { type: 'daily' },
    history: ['2026-10-12', '2026-10-13', '2026-10-14', '2026-10-15'],
    restDays: [],
  };
  const streak = calculateHabitStreak(habit, ref);
  assert.strictEqual(streak, 4);
});

test('calculateHabitStreak: daily habit in progress today carries yesterday streak', () => {
  const ref = new Date('2026-10-15T12:00:00'); // Thursday, not completed yet
  const habit = {
    frequency: { type: 'daily' },
    history: ['2026-10-12', '2026-10-13', '2026-10-14'],
    restDays: [],
  };
  const streak = calculateHabitStreak(habit, ref);
  assert.strictEqual(streak, 3);
});

test('calculateHabitStreak: daily habit broken when yesterday was missed without rest day', () => {
  const ref = new Date('2026-10-15T12:00:00'); // Thursday
  // Wednesday (14) was missed
  const habit = {
    frequency: { type: 'daily' },
    history: ['2026-10-12', '2026-10-13'],
    restDays: [],
  };
  const streak = calculateHabitStreak(habit, ref);
  assert.strictEqual(streak, 0);
});

test('calculateHabitStreak: daily habit rest day preserves streak across skipped day', () => {
  const ref = new Date('2026-10-15T12:00:00'); // Thursday (completed)
  // Wed (14) was rest day, Mon (12) and Tue (13) completed
  const habit = {
    frequency: { type: 'daily' },
    history: ['2026-10-12', '2026-10-13', '2026-10-15'],
    restDays: ['2026-10-14'],
  };
  const streak = calculateHabitStreak(habit, ref);
  // Completed days: Mon, Tue, Thu = 3 completed days
  assert.strictEqual(streak, 3);
});

test('calculateHabitStreak: specific_days habit ignores off-days and counts scheduled sessions', () => {
  // Habit on Mon (1), Wed (3), Fri (5)
  // Oct 12 = Mon, Oct 14 = Wed, Oct 16 = Fri
  const ref = new Date('2026-10-16T12:00:00'); // Friday (completed)
  const habit = {
    frequency: { type: 'specific_days', daysOfWeek: [1, 3, 5] },
    history: ['2026-10-12', '2026-10-14', '2026-10-16'],
    restDays: [],
  };
  const streak = calculateHabitStreak(habit, ref);
  assert.strictEqual(streak, 3);
});

test('calculateHabitStreak: specific_days habit rest day on scheduled day preserves streak', () => {
  // Habit on Mon (1), Wed (3), Fri (5)
  // Wed was rest day, Mon and Fri completed
  const ref = new Date('2026-10-16T12:00:00'); // Friday (completed)
  const habit = {
    frequency: { type: 'specific_days', daysOfWeek: [1, 3, 5] },
    history: ['2026-10-12', '2026-10-16'],
    restDays: ['2026-10-14'],
  };
  const streak = calculateHabitStreak(habit, ref);
  assert.strictEqual(streak, 2);
});

test('calculateHabitStreak: specific_days habit breaks when scheduled day is missed without rest day', () => {
  // Habit on Mon (1), Wed (3), Fri (5)
  // Wed was missed (not in history, not in rest)
  const ref = new Date('2026-10-16T12:00:00'); // Friday (completed)
  const habit = {
    frequency: { type: 'specific_days', daysOfWeek: [1, 3, 5] },
    history: ['2026-10-12', '2026-10-16'],
    restDays: [],
  };
  const streak = calculateHabitStreak(habit, ref);
  assert.strictEqual(streak, 1);
});

test('calculateHabitStreak: weekly habit counts consecutive weeks meeting target', () => {
  // Weekly habit: 3 times / week
  // Prior week 1 (Oct 5-11): completed Oct 5, 7, 9 (3 times)
  // Current week (Oct 12-18): completed Oct 12, 13, 14 (3 times)
  const ref = new Date('2026-10-14T12:00:00'); // Wednesday
  const habit = {
    frequency: { type: 'weekly', weeklyTarget: 3 },
    history: ['2026-10-05', '2026-10-07', '2026-10-09', '2026-10-12', '2026-10-13', '2026-10-14'],
    restDays: [],
  };
  const streak = calculateHabitStreak(habit, ref);
  assert.strictEqual(streak, 2);
});

test('calculateHabitStreak: weekly habit in progress carries over prior weeks streak', () => {
  // Prior week met (3 times). Current week only 1 time so far (in progress).
  const ref = new Date('2026-10-13T12:00:00'); // Tuesday
  const habit = {
    frequency: { type: 'weekly', weeklyTarget: 3 },
    history: ['2026-10-05', '2026-10-07', '2026-10-09', '2026-10-12'],
    restDays: [],
  };
  const streak = calculateHabitStreak(habit, ref);
  assert.strictEqual(streak, 1);
});

test('calculateHabitStreak: weekly habit rest days count towards target', () => {
  // Prior week: 2 completions + 1 rest day = 3 (target 3)
  const ref = new Date('2026-10-13T12:00:00'); // Tuesday
  const habit = {
    frequency: { type: 'weekly', weeklyTarget: 3 },
    history: ['2026-10-05', '2026-10-07'],
    restDays: ['2026-10-09'],
  };
  const streak = calculateHabitStreak(habit, ref);
  assert.strictEqual(streak, 1);
});

test('computeHabitWeeklyProgress calculates counts and percentages accurately', () => {
  const ref = new Date('2026-10-14T12:00:00'); // Current week Oct 12-18
  const habit = {
    frequency: { type: 'weekly', weeklyTarget: 4 },
    history: ['2026-10-12', '2026-10-14'], // 2 completions this week
    restDays: ['2026-10-13'], // 1 rest day this week
  };
  const prog = computeHabitWeeklyProgress(habit, ref);
  assert.strictEqual(prog.completedCount, 2);
  assert.strictEqual(prog.target, 4);
  assert.strictEqual(prog.percentage, 50);
  assert.strictEqual(prog.restDaysCount, 1);
  assert.strictEqual(prog.isMet, false); // 2+1=3 < 4

  // With one more completion:
  habit.history.push('2026-10-15');
  const prog2 = computeHabitWeeklyProgress(habit, ref);
  assert.strictEqual(prog2.completedCount, 3);
  assert.strictEqual(prog2.isMet, true); // 3+1 = 4 >= 4
});

test('parseHabitLine: parses legacy comments without freq/rest safely', () => {
  const line = '- [x] 📚 Lectura <!-- streak: 5 | last: 2026-10-12 | history: 2026-10-10,2026-10-11,2026-10-12 -->';
  const parsed = parseHabitLine(line, '2026-10-12');
  assert.ok(parsed);
  assert.strictEqual(parsed.name, '📚 Lectura');
  assert.strictEqual(parsed.completedToday, true);
  assert.strictEqual(parsed.streak, 5);
  assert.strictEqual(parsed.lastCompletedDate, '2026-10-12');
  assert.strictEqual(parsed.frequency?.type, 'daily');
  assert.deepStrictEqual(parsed.restDays, []);
});

test('parseHabitLine and formatHabitLine round-trip with frequency and rest days', () => {
  const habit = {
    name: '💪 Gym',
    completedToday: true,
    streak: 8,
    lastCompletedDate: '2026-10-14',
    history: ['2026-10-12', '2026-10-14'],
    frequency: { type: 'specific_days', daysOfWeek: [1, 3, 5] },
    restDays: ['2026-10-13'],
  };
  const line = formatHabitLine(habit);
  const parsed = parseHabitLine(line, '2026-10-14');
  assert.ok(parsed);
  assert.strictEqual(parsed.name, '💪 Gym');
  assert.strictEqual(parsed.completedToday, true);
  assert.strictEqual(parsed.streak, 8);
  assert.strictEqual(parsed.frequency?.type, 'specific_days');
  assert.deepStrictEqual(parsed.frequency?.daysOfWeek, [1, 3, 5]);
  assert.deepStrictEqual(parsed.restDays, ['2026-10-13']);
});

test('syncHabitsToMarkdown updates habit lines with new metadata while preserving file structure', () => {
  const content = `# Mis Hábitos Diarios
Notas adicionales antes de la lista.

- [ ] 📚 Lectura <!-- streak: 0 | last:  -->
- [ ] 🏃‍♂️ Ejercicio <!-- streak: 1 | last: 2026-10-10 -->

> Recuerda tomar agua.
`;

  const updated = syncHabitsToMarkdown(content, [
    {
      name: '📚 Lectura',
      completedToday: true,
      streak: 1,
      lastCompletedDate: '2026-10-14',
      history: ['2026-10-14'],
      frequency: { type: 'daily' },
      restDays: [],
    },
    {
      name: '🏃‍♂️ Ejercicio',
      completedToday: false,
      streak: 3,
      lastCompletedDate: '2026-10-12',
      history: ['2026-10-10', '2026-10-12'],
      frequency: { type: 'weekly', weeklyTarget: 3 },
      restDays: [],
    },
  ]);

  assert.ok(updated.includes('- [x] 📚 Lectura'));
  assert.ok(updated.includes('freq: weekly | target: 3'));
  assert.ok(updated.includes('# Mis Hábitos Diarios'));
  assert.ok(updated.includes('> Recuerda tomar agua.'));
});

test('Pomodoro habit integration: completing habit via syncHabitsToMarkdown marks checkbox and advances streak', () => {
  const content = `# Mis Hábitos
- [ ] 📚 Lectura 20 min <!-- streak: 2 | last: 2026-10-13 -->
`;
  const today = '2026-10-14';
  const parsed = parseHabitLine('- [ ] 📚 Lectura 20 min <!-- streak: 2 | last: 2026-10-13 -->', today);
  assert.ok(parsed);
  assert.strictEqual(parsed.completedToday, false);

  // Simulate completeActiveTask for habit
  parsed.completedToday = true;
  parsed.lastCompletedDate = today;
  parsed.history = ['2026-10-12', '2026-10-13', today];
  parsed.streak = calculateHabitStreak(parsed, new Date('2026-10-14T12:00:00'));

  assert.strictEqual(parsed.streak, 3);
  const updatedMarkdown = syncHabitsToMarkdown(content, [parsed]);
  assert.ok(updatedMarkdown.includes('- [x] 📚 Lectura 20 min'));
  assert.ok(updatedMarkdown.includes('streak: 3'));
  assert.ok(updatedMarkdown.includes('last: 2026-10-14'));
});
