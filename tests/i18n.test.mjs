import test from 'node:test';
import assert from 'node:assert/strict';
import { en } from '../src/i18n/en.ts';
import { es } from '../src/i18n/es.ts';
import {
  t,
  setLanguage,
  getLanguageSetting,
  getEffectiveLanguage,
  setObsidianLanguageResolver,
} from '../src/i18n/index.ts';

test('i18n dictionaries: both dictionaries have the exact same keys', () => {
  const enKeys = Object.keys(en).sort();
  const esKeys = Object.keys(es).sort();

  // Test that both arrays have the same size and identical keys
  assert.equal(
    esKeys.length,
    enKeys.length,
    `Key counts mismatch: es has ${esKeys.length}, en has ${enKeys.length}`
  );
  assert.deepEqual(esKeys, enKeys);
});

test('i18n dictionaries: all entries have non-empty strings', () => {
  for (const [k, v] of Object.entries(en)) {
    assert.equal(typeof v, 'string', `en[${k}] is not a string`);
    assert.ok(v.trim().length > 0, `en[${k}] is empty`);
  }
  for (const [k, v] of Object.entries(es)) {
    assert.equal(typeof v, 'string', `es[${k}] is not a string`);
    assert.ok(v.trim().length > 0, `es[${k}] is empty`);
  }
});

test('i18n Spanish dictionary is unified in neutral tuteo without voseo', () => {
  const voseoRegex = /\b(Ingresá|Presioná|Diferenciá|Asigná|Marcá|Probá|Limpiá|Añadí|Tenés|Necesitás|Querés|Organizá|Visualizá|Configurá|Guardá|Completá|Creá|Seleccioná|Empezá|Recordá|Tomá)\b/i;

  const violations = [];
  for (const [key, value] of Object.entries(es)) {
    if (voseoRegex.test(value)) {
      violations.push({ key, value });
    }
  }

  assert.deepEqual(
    violations,
    [],
    `Found voseo in Spanish dictionary: ${JSON.stringify(violations)}`
  );
});

test('t(key, params) accurately translates and interpolates parameters', () => {
  // Test Spanish
  setLanguage('es');
  assert.equal(getEffectiveLanguage(), 'es');
  assert.equal(t('common.save'), 'Guardar');
  assert.equal(
    t('settings.syncHistoryNotice', { count: 12 }),
    'Se sincronizaron 12 sesiones históricas desde tus notas.'
  );
  assert.equal(
    t('pomodoro.timesConfiguredNotice', { work: 25, break: 5 }),
    '✓ Tiempos configurados: 25m foco / 5m descanso'
  );

  // Test English
  setLanguage('en');
  assert.equal(getEffectiveLanguage(), 'en');
  assert.equal(t('common.save'), 'Save');
  assert.equal(
    t('settings.syncHistoryNotice', { count: 12 }),
    'Synchronized 12 historical sessions from your notes.'
  );
  assert.equal(
    t('pomodoro.timesConfiguredNotice', { work: 25, break: 5 }),
    '✓ Times configured: 25m focus / 5m break'
  );
});

test('language setting handles auto mode with Obsidian language resolver', () => {
  setLanguage('auto');
  assert.equal(getLanguageSetting(), 'auto');

  // When resolver returns 'en'
  setObsidianLanguageResolver(() => 'en');
  assert.equal(getEffectiveLanguage(), 'en');
  assert.equal(t('common.cancel'), 'Cancel');

  // When resolver returns 'es'
  setObsidianLanguageResolver(() => 'es');
  assert.equal(getEffectiveLanguage(), 'es');
  assert.equal(t('common.cancel'), 'Cancelar');

  // When resolver returns regional Spanish 'es-ES' or 'es-419'
  setObsidianLanguageResolver(() => 'es-419');
  assert.equal(getEffectiveLanguage(), 'es');
  assert.equal(t('common.cancel'), 'Cancelar');

  // When resolver returns an unsupported language e.g. 'fr' or 'de' -> falls back to 'en'
  setObsidianLanguageResolver(() => 'fr');
  assert.equal(getEffectiveLanguage(), 'en');
  assert.equal(t('common.cancel'), 'Cancel');

  // Reset resolver and set back to auto
  setObsidianLanguageResolver(null);
});

test('getDefaultHabitsContent returns correct localized content', async () => {
  const { getDefaultHabitsContent } = await import('../src/habits.ts');
  const esHabits = getDefaultHabitsContent('es');
  assert.ok(esHabits.includes('# Registro de Hábitos'));
  assert.ok(esHabits.includes('Tomar 2L de agua'));

  const enHabits = getDefaultHabitsContent('en');
  assert.ok(enHabits.includes('# Habit Tracker'));
  assert.ok(enHabits.includes('Drink 2L of water'));
});

test('getDefaultConventions returns localized section headers and tags', async () => {
  const { getDefaultConventions } = await import('../src/conventions.ts');
  const esConv = getDefaultConventions('es');
  assert.equal(esConv.tasksSectionHeader, '## Tareas');
  assert.equal(esConv.timeBlocksSectionHeader, '## Bloques de Tiempo');
  assert.equal(esConv.spacedRepetitionTag, '#repasar');

  const enConv = getDefaultConventions('en');
  assert.equal(enConv.tasksSectionHeader, '## Tasks');
  assert.equal(enConv.timeBlocksSectionHeader, '## Time Blocks');
  assert.equal(enConv.spacedRepetitionTag, '#review');
});

test('i18n English dictionary: key settings and actions adhere to sentence case', () => {
  assert.equal(en['settings.logDailyNoteName'], 'Log Pomodoro in daily note');
  assert.equal(en['settings.dailyNotesFolderName'], 'Daily notes folder');
  assert.equal(en['settings.dailyNoteFormatName'], 'Daily note date format');
  assert.equal(en['settings.headingAppearance'], 'Appearance and calendar');
  assert.equal(en['settings.autoZenName'], 'Automatic Zen mode when studying');
  assert.equal(en['settings.syncHistoryName'], 'Sync history with daily notes');
  assert.equal(en['settings.headingSpacedRepetition'], 'Spaced repetition');
  assert.equal(en['settings.headingMaintenance'], 'Maintenance and sync');
  assert.equal(en['settings.headingTodayTab'], 'Today tab');
  assert.equal(en['pomodoro.customTimesTitle'], 'Adjust focus and break times');
  assert.equal(en['pomodoro.applyTimes'], 'Apply times');
  assert.equal(en['tasks.cloudModalTitle'], 'New academic task');
  assert.equal(en['tasks.estimateLabel'], ' Pomodoro estimate');
  assert.equal(en['tasks.addTaskBtn'], 'Add task');
  assert.equal(en['calendar.timeBlocksTitle'], 'Time blocks');
  assert.equal(en['analytics.title'], 'Analytics & study performance');
  assert.equal(en['habits.editModalTitle'], 'Edit habit');
  assert.equal(en['habits.nameLabel'], 'Habit name');
  assert.equal(en['pomodoro.pillFocus'], '• Focus •');
  assert.equal(en['pomodoro.pillLongBreak'], '• Long break •');
  assert.equal(en['pomodoro.pillBreak'], '• Break •');
  assert.equal(en['pomodoro.statusBarTooltip'], 'Click: start/pause | Right click: menu');
  assert.equal(en['calendar.deadlineTitlePlaceholder'], 'Deadline title (e.g. final project)...');
  assert.equal(en['calendar.masterHubDeadlinePlaceholder'], 'Deadline title (e.g. networks project due)...');
  assert.equal(en['analytics.allocationGeneralCategory'], 'General / unclassified');
  assert.equal(en['settings.timeBlocksHeaderDesc'], 'Markdown heading name for time blocks in daily notes (default: ## Time blocks).');
  assert.equal(en['today.nowNextTitle'], 'Now / next');
});

test('computeWeeklyFocusTrend formats day names according to effective language', async () => {
  const { computeWeeklyFocusTrend } = await import('../src/analytics.ts');
  const sessions = [
    { id: '1', timestamp: 1, date: '2026-10-12', durationMinutes: 25, tags: [] },
  ];
  const refDate = new Date('2026-10-12T12:00:00Z'); // Monday

  setLanguage('en');
  const enTrend = computeWeeklyFocusTrend(sessions, refDate, 1);
  assert.equal(enTrend[0].shortDay, 'Mon');
  assert.equal(enTrend[0].dayLabel, 'Mon 12');

  setLanguage('es');
  const esTrend = computeWeeklyFocusTrend(sessions, refDate, 1);
  assert.equal(esTrend[0].shortDay, 'Lun');
  assert.equal(esTrend[0].dayLabel, 'Lun 12');

  setLanguage('auto');
});

test('appendClosingNoteToDailyContent localizes note prefixes based on language', async () => {
  const { appendClosingNoteToDailyContent } = await import('../src/markdown-utils.ts');
  const dailyContentWithPomo = `# 2026-10-12\n\n- 🍅 15:30 · Reading · #book\n`;
  const dailyContentEmpty = `# 2026-10-12\n`;

  // English
  setLanguage('en');
  const enWithPomo = appendClosingNoteToDailyContent(dailyContentWithPomo, 'Reading', 'Completed chapter 1');
  assert.ok(enWithPomo.includes('  - 📝 Note: Completed chapter 1'));

  const enFallback = appendClosingNoteToDailyContent(dailyContentEmpty, 'Reading', 'Completed chapter 1');
  assert.ok(enFallback.includes('- 📝 Pomodoro note (*Reading*): Completed chapter 1'));

  // Spanish
  setLanguage('es');
  const esWithPomo = appendClosingNoteToDailyContent(dailyContentWithPomo, 'Reading', 'Capítulo 1 terminado');
  assert.ok(esWithPomo.includes('  - 📝 Nota: Capítulo 1 terminado'));

  const esFallback = appendClosingNoteToDailyContent(dailyContentEmpty, 'Reading', 'Capítulo 1 terminado');
  assert.ok(esFallback.includes('- 📝 Nota Pomodoro (*Reading*): Capítulo 1 terminado'));

  setLanguage('auto');
});

test('syncHabitsToMarkdown matches English # Habit Tracker header when inserting new habits', async () => {
  const { syncHabitsToMarkdown } = await import('../src/markdown-utils.ts');
  const initial = `# Habit Tracker\n\nSome intro text.\n`;
  const habits = [
    { name: 'Meditation', completedToday: false, streak: 3, history: [] },
  ];

  const updated = syncHabitsToMarkdown(initial, habits);
  assert.ok(updated.includes('# Habit Tracker'));
  assert.ok(updated.includes('- [ ] Meditation'));
});

test('mutateTaskLineInContent localizes error messages', async () => {
  const { mutateTaskLineInContent } = await import('../src/markdown-utils.ts');
  const content = `# Notes\n\nSome text\n`;

  setLanguage('en');
  const enRes = mutateTaskLineInContent(content, { sourceFile: 'Notes.md', text: 'Nonexistent' }, { action: 'toggle' });
  assert.equal(enRes.success, false);
  assert.equal(enRes.errorMessage, 'Specified task not found in file.');

  setLanguage('es');
  const esRes = mutateTaskLineInContent(content, { sourceFile: 'Notes.md', text: 'Nonexistent' }, { action: 'toggle' });
  assert.equal(esRes.success, false);
  assert.equal(esRes.errorMessage, 'No se encontró la tarea especificada en el archivo.');

  setLanguage('auto');
});
