import test from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizeTag,
  matchesSubjectTag,
  getLocalWeekRange,
  calculateSubjectWeeklyFocusMinutes,
  calculateSubjectTaskPomodoros,
  calculateSubjectGoalStreak,
  computeSubjectsAnalyticsSummary,
} from '../src/subject-analytics.ts';

test('normalizeTag normalizes tags with lowercasing and leading hash', () => {
  assert.equal(normalizeTag(''), '');
  assert.equal(normalizeTag('   '), '');
  assert.equal(normalizeTag('algebra'), '#algebra');
  assert.equal(normalizeTag('#algebra'), '#algebra');
  assert.equal(normalizeTag('#AlgebraLineal'), '#algebralineal');
  assert.equal(normalizeTag('  #BIO_101  '), '#bio_101');
});

test('matchesSubjectTag matches tags array or text content accurately', () => {
  assert.equal(matchesSubjectTag('#algebra', ['#algebra', '#tarea']), true);
  assert.equal(matchesSubjectTag('algebra', ['#Algebra']), true);
  assert.equal(matchesSubjectTag('#algebra', [], 'Estudiar para el examen #algebra'), true);
  assert.equal(matchesSubjectTag('#algebra', ['#calculo'], 'Sin tag en texto'), false);
  assert.equal(matchesSubjectTag('', ['#algebra']), false);
});

test('getLocalWeekRange calculates local Monday to Sunday range correctly', () => {
  // Wednesday, October 14, 2026
  const wed = new Date(2026, 9, 14, 15, 30);
  const wedRange = getLocalWeekRange(wed);
  assert.equal(wedRange.startDateStr, '2026-10-12'); // Monday
  assert.equal(wedRange.endDateStr, '2026-10-18'); // Sunday
  assert.equal(wedRange.startMonday.getDay(), 1);
  assert.equal(wedRange.endSunday.getDay(), 0);

  // Monday, October 12, 2026
  const mon = new Date(2026, 9, 12, 9, 0);
  const monRange = getLocalWeekRange(mon);
  assert.equal(monRange.startDateStr, '2026-10-12');
  assert.equal(monRange.endDateStr, '2026-10-18');

  // Sunday, October 18, 2026 (late evening)
  const sun = new Date(2026, 9, 18, 23, 45);
  const sunRange = getLocalWeekRange(sun);
  assert.equal(sunRange.startDateStr, '2026-10-12');
  assert.equal(sunRange.endDateStr, '2026-10-18');

  // Month-crossing week: Sunday, November 1, 2026
  // Monday is Oct 26, Sunday is Nov 1
  const crossingSun = new Date(2026, 10, 1, 10, 0);
  const crossingRange = getLocalWeekRange(crossingSun);
  assert.equal(crossingRange.startDateStr, '2026-10-26');
  assert.equal(crossingRange.endDateStr, '2026-11-01');
});

test('calculateSubjectWeeklyFocusMinutes aggregates minutes and counts within week range', () => {
  const subject = {
    id: 'sub-1',
    name: 'Álgebra',
    tag: '#algebra',
    color: '#4f46e5',
    weeklyGoalHours: 4,
  };

  const sessions = [
    // Inside week 2026-10-12 to 2026-10-18
    { id: '1', timestamp: 1, date: '2026-10-12', durationMinutes: 50, tags: ['#algebra'] },
    { id: '2', timestamp: 2, date: '2026-10-14', durationMinutes: 25, tags: ['#algebra'] },
    { id: '3', timestamp: 3, date: '2026-10-15', durationMinutes: 60, tags: ['#calculo'] }, // Other subject
    { id: '4', timestamp: 4, date: '2026-10-18', durationMinutes: 30, taskText: 'Guía #algebra', tags: [] },
    // Outside week
    { id: '5', timestamp: 5, date: '2026-10-11', durationMinutes: 90, tags: ['#algebra'] }, // Previous Sunday
    { id: '6', timestamp: 6, date: '2026-10-19', durationMinutes: 60, tags: ['#algebra'] }, // Next Monday
  ];

  const result = calculateSubjectWeeklyFocusMinutes(sessions, subject, '2026-10-12', '2026-10-18');
  assert.equal(result.actualMinutes, 105); // 50 + 25 + 30
  assert.equal(result.sessionCount, 3);
});

test('calculateSubjectTaskPomodoros aggregates estimated and completed counts per subject', () => {
  const subject = {
    id: 'sub-1',
    name: 'Física',
    tag: '#fisica',
    color: '#10b981',
    weeklyGoalHours: 5,
  };

  const tasks = [
    {
      id: 't1',
      originalLine: '- [ ] Guía Cinemática #fisica 🍅 4/2',
      text: 'Guía Cinemática #fisica',
      sourceFile: 'Inbox.md',
      completed: false,
      statusChar: ' ',
      tags: ['#fisica'],
      estimatedPomodoros: 4,
      completedPomodoros: 2,
    },
    {
      id: 't2',
      originalLine: '- [x] Resumen Termodinámica #fisica 🍅 2/2',
      text: 'Resumen Termodinámica #fisica',
      sourceFile: 'Inbox.md',
      completed: true,
      statusChar: 'x',
      tags: ['#fisica'],
      estimatedPomodoros: 2,
      completedPomodoros: 2,
    },
    {
      id: 't3',
      originalLine: '- [ ] Historia trabajo #historia 🍅 3/0',
      text: 'Historia trabajo #historia',
      sourceFile: 'Inbox.md',
      completed: false,
      statusChar: ' ',
      tags: ['#historia'],
      estimatedPomodoros: 3,
      completedPomodoros: 0,
    },
  ];

  const result = calculateSubjectTaskPomodoros(tasks, subject);
  assert.equal(result.totalTasks, 2);
  assert.equal(result.completedTasks, 1);
  assert.equal(result.estimatedPomodoros, 6);
  assert.equal(result.completedPomodoros, 4);
});

test('calculateSubjectGoalStreak computes consecutive weekly goal achievements', () => {
  const subject = {
    id: 'sub-1',
    name: 'Química',
    tag: '#quimica',
    color: '#f59e0b',
    weeklyGoalHours: 3, // 180 minutes
  };

  // Current week: Wednesday 2026-10-14 (week 2026-10-12 to 2026-10-18)
  const refDate = new Date(2026, 9, 14, 12, 0);

  // Case A: Prior 2 weeks met, current week in progress (60m < 180m) -> streak 2
  const sessionsA = [
    // 2 weeks ago (Oct 01): 200m
    { id: '1', timestamp: 1, date: '2026-10-01', durationMinutes: 200, tags: ['#quimica'] },
    // 1 week ago (Oct 08): 190m
    { id: '2', timestamp: 2, date: '2026-10-08', durationMinutes: 190, tags: ['#quimica'] },
    // Current week: 60m
    { id: '3', timestamp: 3, date: '2026-10-13', durationMinutes: 60, tags: ['#quimica'] },
  ];
  assert.equal(calculateSubjectGoalStreak(sessionsA, subject, refDate), 2);

  // Case B: Current week completes 180m -> streak becomes 3
  const sessionsB = [
    ...sessionsA,
    { id: '4', timestamp: 4, date: '2026-10-14', durationMinutes: 130, tags: ['#quimica'] },
  ];
  assert.equal(calculateSubjectGoalStreak(sessionsB, subject, refDate), 3);

  // Case C: Prior week (Oct 05-11) failed (< 180m), current week in progress -> streak 0
  const sessionsC = [
    { id: '1', timestamp: 1, date: '2026-10-01', durationMinutes: 200, tags: ['#quimica'] },
    { id: '2', timestamp: 2, date: '2026-10-08', durationMinutes: 50, tags: ['#quimica'] }, // Failed
    { id: '3', timestamp: 3, date: '2026-10-13', durationMinutes: 60, tags: ['#quimica'] },
  ];
  assert.equal(calculateSubjectGoalStreak(sessionsC, subject, refDate), 0);

  // Case D: Goal is 0 -> streak is 0
  const zeroGoalSubject = { ...subject, weeklyGoalHours: 0 };
  assert.equal(calculateSubjectGoalStreak(sessionsB, zeroGoalSubject, refDate), 0);
});

test('computeSubjectsAnalyticsSummary calculates summary for all subjects', () => {
  const subjects = [
    { id: 's1', name: 'Álgebra', tag: '#algebra', color: '#6366f1', weeklyGoalHours: 2 }, // 120m
    { id: 's2', name: 'Literatura', tag: '#literatura', color: '#ec4899', weeklyGoalHours: 1 }, // 60m
  ];

  const sessions = [
    { id: '1', timestamp: 1, date: '2026-10-13', durationMinutes: 90, tags: ['#algebra'] },
    { id: '2', timestamp: 2, date: '2026-10-14', durationMinutes: 60, tags: ['#literatura'] },
  ];

  const tasks = [
    {
      id: 't1',
      originalLine: '- [ ] Guía Álgebra #algebra 🍅 4/2',
      text: 'Guía Álgebra #algebra',
      sourceFile: 'Inbox.md',
      completed: false,
      statusChar: ' ',
      tags: ['#algebra'],
      estimatedPomodoros: 4,
      completedPomodoros: 2,
    },
  ];

  const refDate = new Date(2026, 9, 14, 12, 0);
  const summary = computeSubjectsAnalyticsSummary(sessions, tasks, subjects, refDate);

  assert.equal(summary.weekStartDate, '2026-10-12');
  assert.equal(summary.weekEndDate, '2026-10-18');
  assert.equal(summary.subjects.length, 2);

  const algebra = summary.subjects[0];
  assert.equal(algebra.subject.name, 'Álgebra');
  assert.equal(algebra.goalMinutes, 120);
  assert.equal(algebra.actualMinutes, 90);
  assert.equal(algebra.percentage, 75);
  assert.equal(algebra.estimatedPomodoros, 4);
  assert.equal(algebra.completedPomodoros, 2);

  const lit = summary.subjects[1];
  assert.equal(lit.subject.name, 'Literatura');
  assert.equal(lit.goalMinutes, 60);
  assert.equal(lit.actualMinutes, 60);
  assert.equal(lit.percentage, 100);
});
