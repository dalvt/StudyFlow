import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { locateTaskLineIndex, mutateTaskLineInContent, computeLineHash } from '../src/markdown-utils.ts';
import { t, setLanguage } from '../src/i18n/index.ts';

test('CSS hygiene: styles.css contains zero !important declarations', () => {
  const css = fs.readFileSync('styles.css', 'utf8');
  const matches = css.match(/!important/g);
  assert.equal(matches, null, `Found !important in styles.css: ${matches?.length}`);
});

test('CSS hygiene: no window media queries for narrow layout (<400px), uses @container instead', () => {
  const css = fs.readFileSync('styles.css', 'utf8');
  assert.ok(
    !css.includes('@media (max-width: 400px)'),
    'Should not use window @media (max-width: 400px)'
  );
  assert.ok(
    css.includes('@container (max-width: 400px)'),
    'Must use @container (max-width: 400px)'
  );
  assert.ok(
    css.includes('.study-flow-container.is-in-sidebar .study-flow-brand-header'),
    'Must hide brand header when docked in sidebar'
  );
});

test('CSS hygiene: mobile touch target minimum dimensions (44px) are defined without !important', () => {
  const css = fs.readFileSync('styles.css', 'utf8');
  assert.ok(
    css.includes('min-height: 44px;') && css.includes('min-width: 44px;'),
    'Must define min 44px touch targets'
  );
});

test('Code hygiene: zero style.display assignments in src/ directory', () => {
  const files = fs.readdirSync('src', { recursive: true });
  const tsFiles = files.filter((f) => typeof f === 'string' && f.endsWith('.ts'));

  const violations = [];
  for (const f of tsFiles) {
    const fullPath = `src/${f}`;
    const content = fs.readFileSync(fullPath, 'utf8');
    if (content.includes('style.display')) {
      violations.push(fullPath);
    }
  }

  assert.deepEqual(violations, [], `Found style.display in: ${violations.join(', ')}`);
});

test('Task context menu & Undo: restores deleted task lines accurately in content', () => {
  const initialContent = `## Tareas
- [ ] Tarea 1 #fisica
- [ ] Tarea a borrar #quimica
- [ ] Tarea 3 #algebra
`;

  const taskToDelete = {
    id: 't-del',
    text: 'Tarea a borrar #quimica',
    completed: false,
    rawText: '- [ ] Tarea a borrar #quimica',
    sourceFile: 'Inbox.md',
    lineNumber: 3,
    lineHash: computeLineHash('- [ ] Tarea a borrar #quimica'),
  };

  // Simulate deletion capture & processing
  const lines = initialContent.split(/\r?\n/);
  const locate = locateTaskLineIndex(lines, taskToDelete);
  assert.equal(locate.status, 'exact_position');
  assert.equal(locate.index, 2);

  const rawDeletedLines = lines.slice(locate.index, locate.index + 1);
  assert.deepEqual(rawDeletedLines, ['- [ ] Tarea a borrar #quimica']);

  const mut = mutateTaskLineInContent(initialContent, taskToDelete, { action: 'delete' });
  assert.ok(mut.success);
  assert.ok(!mut.updatedContent.includes('Tarea a borrar'));

  // Simulate Undo restoration (splice at deletedIndex)
  const modifiedLines = mut.updatedContent.split(/\r?\n/);
  modifiedLines.splice(locate.index, 0, ...rawDeletedLines);
  const restoredContent = modifiedLines.join('\n');

  assert.equal(restoredContent, initialContent);
});

test('A11y and Context Menu i18n keys are present and localized in both languages', () => {
  const keys = [
    'common.undo',
    'pomodoro.sessionCompletedAnnounce',
    'pomodoro.breakCompletedAnnounce',
    'tasks.menuMoreActions',
    'tasks.menuEdit',
    'tasks.menuComplete',
    'tasks.menuUncomplete',
    'tasks.menuPromote',
    'tasks.menuConvertToIdea',
    'tasks.menuOpenInNote',
    'tasks.menuDelete',
    'tasks.taskCompletedWithUndo',
    'tasks.taskDeletedWithUndo',
    'tasks.taskRestoredNotice',
    'tasks.filterMenuLabel',
  ];

  setLanguage('es');
  for (const k of keys) {
    const valEs = t(k);
    assert.ok(valEs && valEs.length > 0, `es missing key ${k}`);
  }

  setLanguage('en');
  for (const k of keys) {
    const valEn = t(k);
    assert.ok(valEn && valEn.length > 0, `en missing key ${k}`);
  }
});

test('CSS dark mode select arrow: data URI uses stroke="%23888888" instead of currentColor', () => {
  const css = fs.readFileSync('styles.css', 'utf8');
  assert.ok(
    !css.includes('stroke="currentColor"') && !css.includes("stroke='currentColor'"),
    'CSS select data URIs must not use stroke="currentColor" (invisible in dark mode)'
  );
  assert.ok(
    css.includes('stroke="%23888888"'),
    'CSS select data URIs must use stroke="%23888888"'
  );
});

test('CSS variables: zero raw #ea580c or #8b5cf6 in styles.css', () => {
  const css = fs.readFileSync('styles.css', 'utf8');
  assert.ok(!css.includes('#ea580c'), 'styles.css must not contain raw #ea580c');
  assert.ok(!css.includes('#8b5cf6'), 'styles.css must not contain raw #8b5cf6');
});

test('Command IDs: no plugin ID prefix (open-hub, open-calendar, open-hub-sidebar)', () => {
  const mainContent = fs.readFileSync('src/main.ts', 'utf8');
  assert.ok(!mainContent.includes("'open-study-flow-hub'"), 'Should not have open-study-flow-hub');
  assert.ok(!mainContent.includes("'open-study-flow-calendar'"), 'Should not have open-study-flow-calendar');
  assert.ok(!mainContent.includes("'open-study-flow-hub-sidebar'"), 'Should not have open-study-flow-hub-sidebar');
  assert.ok(mainContent.includes("id: 'open-hub'"), 'Must have open-hub');
  assert.ok(mainContent.includes("id: 'open-calendar'"), 'Must have open-calendar');
  assert.ok(mainContent.includes("id: 'open-hub-sidebar'"), 'Must have open-hub-sidebar');
});
