import test from 'node:test';
import assert from 'node:assert/strict';
import {
  getIsoWeekInfo,
  getWeeklyReviewFilePath,
  buildWeeklyReviewContent,
  DEFAULT_WEEKLY_REVIEW_TEMPLATE,
} from '../src/weekly-review.ts';

test('getIsoWeekInfo computes ISO week year and formatted string correctly', () => {
  // Tuesday, October 13, 2026 -> 2026-W42
  const d1 = new Date(2026, 9, 13, 10, 0);
  const info1 = getIsoWeekInfo(d1);
  assert.equal(info1.year, 2026);
  assert.equal(info1.week, 42);
  assert.equal(info1.formatted, '2026-W42');

  // Monday, January 5, 2026 -> 2026-W02
  const d2 = new Date(2026, 0, 5, 10, 0);
  const info2 = getIsoWeekInfo(d2);
  assert.equal(info2.year, 2026);
  assert.equal(info2.week, 2);
  assert.equal(info2.formatted, '2026-W02');

  // Thursday, January 1, 2026 -> 2026-W01
  const d3 = new Date(2026, 0, 1, 12, 0);
  const info3 = getIsoWeekInfo(d3);
  assert.equal(info3.year, 2026);
  assert.equal(info3.week, 1);
  assert.equal(info3.formatted, '2026-W01');
});

test('getWeeklyReviewFilePath formats path to StudyFlow/Reviews/YYYY-[W]WW.md', () => {
  const d1 = new Date(2026, 9, 13);
  const path = getWeeklyReviewFilePath('StudyFlow/Reviews', d1);
  assert.equal(path, 'StudyFlow/Reviews/2026-W42.md');

  const customPath = getWeeklyReviewFilePath('Custom/Folder/', d1);
  assert.equal(customPath, 'Custom/Folder/2026-W42.md');
});

test('buildWeeklyReviewContent generates markdown with subjects, sessions, habits, tasks and reflection', () => {
  const subjects = [
    { id: '1', name: 'Álgebra', tag: '#algebra', color: '#4f46e5', weeklyGoalHours: 4 },
  ];

  const sessions = [
    { id: 's1', timestamp: 1, date: '2026-10-13', durationMinutes: 120, tags: ['#algebra'] },
    { id: 's2', timestamp: 2, date: '2026-10-14', durationMinutes: 60, tags: ['#algebra'], interrupted: true },
  ];

  const habits = [
    { id: 'h1', name: 'Lectura diaria', streak: 5, completedToday: true },
  ];

  const tasks = [
    { id: 't1', text: 'Resolver ejercicios guía', completed: true, isIdea: false, sourceFile: 'Inbox.md' },
    { id: 't2', text: 'Entrega proyecto', completed: false, isIdea: false, daysRemaining: -2, dueDate: '2026-10-11', sourceFile: 'Inbox.md' },
  ];

  const content = buildWeeklyReviewContent({
    weekFormatted: '2026-W42',
    startDateStr: '2026-10-12',
    endDateStr: '2026-10-18',
    subjects,
    sessions,
    habits,
    tasks,
  });

  // Check header
  assert.ok(content.includes('Revisión Semanal 2026-W42 (2026-10-12 al 2026-10-18)'));

  // Check subjects summary: 180 min = 3h out of 4h (75%)
  assert.ok(content.includes('Álgebra'));
  assert.ok(content.includes('3h'));
  assert.ok(content.includes('Meta: 4h'));
  assert.ok(content.includes('75%'));

  // Check sessions summary: 2 sessions, 3h total, 1 completed, 1 interrupted
  assert.ok(content.includes('**Total sesiones:** 2'));
  assert.ok(content.includes('**Tiempo total enfocado:** 3h'));
  assert.ok(content.includes('**Sesiones completadas:** 1'));
  assert.ok(content.includes('**Sesiones interrumpidas:** 1'));

  // Check habits summary
  assert.ok(content.includes('Lectura diaria'));
  assert.ok(content.includes('Racha: 5 días'));

  // Check tasks summary
  assert.ok(content.includes('- [x] Resolver ejercicios guía'));
  assert.ok(content.includes('- [ ] Entrega proyecto ⚠️'));

  // Check the 3 reflection fields required by user
  assert.ok(content.includes('### ¿Qué funcionó?'));
  assert.ok(content.includes('### ¿Qué ajustar?'));
  assert.ok(content.includes('### Foco de la próxima semana'));
});

test('buildWeeklyReviewContent supports custom template', () => {
  const customTemplate = `# Custom Review {{week}}
Hours:
{{subjectsSummary}}
Sessions:
{{sessionsSummary}}
Reflect:
- What worked?
- What to adjust?
- Next week focus?
`;

  const content = buildWeeklyReviewContent({
    weekFormatted: '2026-W42',
    startDateStr: '2026-10-12',
    endDateStr: '2026-10-18',
    template: customTemplate,
  });

  assert.ok(content.includes('# Custom Review 2026-W42'));
  assert.ok(content.includes('Hours:'));
  assert.ok(content.includes('Sessions:'));
  assert.ok(content.includes('Reflect:'));
});
