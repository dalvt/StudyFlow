import test from 'node:test';
import assert from 'node:assert/strict';
import { TFile } from 'obsidian';
import {
  isTasksSection,
  isTimeBlocksSection,
  formatPomodoroLogLine,
  parsePomodoroLogLine,
  isPomodoroLogLine,
  isSpacedRepetitionTag,
  getSpacedRepetitionFrontmatter,
  getDefaultConventions,
} from '../src/conventions.ts';
import {
  extractAllTasksFromContent,
  appendClosingNoteToDailyContent,
} from '../src/markdown-utils.ts';
import { parseTimeBlocksFromMarkdown } from '../src/calendar-utils.ts';
import { isSpacedRepetitionNote } from '../src/spaced-repetition.ts';
import { TaskIndex } from '../src/task-index.ts';
import { cloneDefaultSettings } from '../src/settings-utils.ts';

test('Conventions: Section headers match both Spanish and English', () => {
  // Tasks headers
  assert.equal(isTasksSection('## Tareas'), true);
  assert.equal(isTasksSection('## Tasks'), true);
  assert.equal(isTasksSection('Tareas'), true);
  assert.equal(isTasksSection('tasks'), true);
  assert.equal(isTasksSection('## CustomTasks', '## CustomTasks'), true);
  assert.equal(isTasksSection('## Notas'), false);

  // Time blocks headers
  assert.equal(isTimeBlocksSection('## Bloques de Tiempo'), true);
  assert.equal(isTimeBlocksSection('## Time Blocks'), true);
  assert.equal(isTimeBlocksSection('bloques de tiempo'), true);
  assert.equal(isTimeBlocksSection('time blocks'), true);
  assert.equal(isTimeBlocksSection('## Schedule', '## Schedule'), true);
  assert.equal(isTimeBlocksSection('## Tareas'), false);
});

test('Conventions: Pomodoro log line parsing accepts both new and old formats in Spanish and English', () => {
  // 1. New format: - 🍅 HH:mm · task · subject
  const newFull = '- 🍅 14:30 · Estudiar Cálculo · Matemáticas';
  assert.equal(isPomodoroLogLine(newFull), true);
  const parsedNewFull = parsePomodoroLogLine(newFull);
  assert.ok(parsedNewFull);
  assert.equal(parsedNewFull.time, '14:30');
  assert.equal(parsedNewFull.taskText, 'Estudiar Cálculo');
  assert.equal(parsedNewFull.subject, 'Matemáticas');
  assert.equal(parsedNewFull.isOldFormat, false);

  // 2. New format: - 🍅 HH:mm · task (without subject)
  const newNoSubject = '- 🍅 10:15 · Resolver ejercicios';
  const parsedNewNoSubject = parsePomodoroLogLine(newNoSubject);
  assert.ok(parsedNewNoSubject);
  assert.equal(parsedNewNoSubject.time, '10:15');
  assert.equal(parsedNewNoSubject.taskText, 'Resolver ejercicios');
  assert.equal(parsedNewNoSubject.subject, undefined);
  assert.equal(parsedNewNoSubject.isOldFormat, false);

  // 3. New format: - 🍅 HH:mm (time only)
  const newTimeOnly = '- 🍅 09:00';
  const parsedNewTimeOnly = parsePomodoroLogLine(newTimeOnly);
  assert.ok(parsedNewTimeOnly);
  assert.equal(parsedNewTimeOnly.time, '09:00');
  assert.equal(parsedNewTimeOnly.taskText, undefined);
  assert.equal(parsedNewTimeOnly.isOldFormat, false);

  // 4. Old format Spanish: - [x] Pomodoro completado a las HH:mm — *task*
  const oldEs = '- [x] Pomodoro completado a las 16:45 — *Lectura de Química*';
  assert.equal(isPomodoroLogLine(oldEs), true);
  const parsedOldEs = parsePomodoroLogLine(oldEs);
  assert.ok(parsedOldEs);
  assert.equal(parsedOldEs.time, '16:45');
  assert.equal(parsedOldEs.taskText, 'Lectura de Química');
  assert.equal(parsedOldEs.isOldFormat, true);

  // 5. Old format English: - [x] Pomodoro completed at HH:mm — *task*
  const oldEn = '- [x] Pomodoro completed at 11:20 — *Read History Chapter*';
  assert.equal(isPomodoroLogLine(oldEn), true);
  const parsedOldEn = parsePomodoroLogLine(oldEn);
  assert.ok(parsedOldEn);
  assert.equal(parsedOldEn.time, '11:20');
  assert.equal(parsedOldEn.taskText, 'Read History Chapter');
  assert.equal(parsedOldEn.isOldFormat, true);

  // 6. Non-pomodoro lines
  assert.equal(isPomodoroLogLine('- [ ] Tarea pendiente normal'), false);
  assert.equal(isPomodoroLogLine('- [x] Tarea completada normal'), false);
  assert.equal(isPomodoroLogLine('- Viñeta normal de notas'), false);
});

test('Conventions: Pomodoro log line formatting produces bullet format', () => {
  assert.equal(
    formatPomodoroLogLine('14:00', 'Estudiar álgebra', '#algebra'),
    '- 🍅 14:00 · Estudiar álgebra · #algebra'
  );
  assert.equal(
    formatPomodoroLogLine('15:30', 'Leer capítulo'),
    '- 🍅 15:30 · Leer capítulo'
  );
  assert.equal(
    formatPomodoroLogLine('08:00'),
    '- 🍅 08:00'
  );
});

test('Conventions: extractAllTasksFromContent ignores both old checkbox logs and new bullet logs', () => {
  const content = `# 2026-10-13

## Tareas
- [ ] Tarea válida pendiente 📅 2026-10-15
- [x] Tarea válida terminada
- [x] Pomodoro completado a las 14:00 — *Estudiar Biología*
- [x] Pomodoro completed at 15:00 — *Read Physics*
- 🍅 16:30 · Resolver ejercicios · Matemáticas
- 🍅 17:00
`;

  const tasks = extractAllTasksFromContent(content, 'Daily/2026-10-13.md');

  // Only the 2 real tasks should be extracted, neither old nor new Pomodoro logs
  assert.equal(tasks.length, 2);
  assert.equal(tasks.some((t) => t.text.includes('Pomodoro completado')), false);
  assert.equal(tasks.some((t) => t.text.includes('Pomodoro completed')), false);
  assert.equal(tasks.some((t) => t.text.includes('🍅')), false);
  assert.ok(tasks.some((t) => t.text.includes('Tarea válida pendiente')));
  assert.ok(tasks.some((t) => t.text.includes('Tarea válida terminada')));
});

test('Conventions: TaskIndex.getAllTasks() excludes Pomodoro log lines in a vault scan', async () => {
  const dailyFile = new TFile('Daily/2026-10-13.md');
  dailyFile.content = `# 2026-10-13

## Tareas
- [ ] Practicar algoritmos
- [x] Pomodoro completado a las 11:00 — *Algoritmos grafos*
- 🍅 12:00 · Algoritmos ordenamiento
`;

  const plugin = {
    app: {
      vault: {
        getMarkdownFiles: () => [dailyFile],
        getAbstractFileByPath: () => dailyFile,
        cachedRead: async () => dailyFile.content,
      },
      metadataCache: {
        getFileCache: () => ({}),
        on: () => ({}),
      },
      workspace: {
        onLayoutReady: (cb) => cb(),
      },
    },
    settings: cloneDefaultSettings(),
    registerEvent: (e) => e,
  };

  const index = new TaskIndex(plugin);
  await index.scanVault();

  const allTasks = index.getAllTasks();
  assert.equal(allTasks.length, 1);
  assert.equal(allTasks[0].text, 'Practicar algoritmos');

  index.destroy();
});

test('Conventions: parseTimeBlocksFromMarkdown accepts both Spanish and English headings', () => {
  const contentSpanish = `# 2026-10-13

## Bloques de Tiempo
- [ ] 09:00 - 10:30 Clase de Física
- [x] 11:00 - 12:00 Repaso
`;

  const blocksEs = parseTimeBlocksFromMarkdown(contentSpanish, '2026-10-13');
  assert.equal(blocksEs.length, 2);
  assert.equal(blocksEs[0].title, 'Clase de Física');
  assert.equal(blocksEs[0].startTime, '09:00');
  assert.equal(blocksEs[0].endTime, '10:30');

  const contentEnglish = `# 2026-10-13

## Time Blocks
- [ ] 14:00 - 15:30 Machine Learning Study
`;

  const blocksEn = parseTimeBlocksFromMarkdown(contentEnglish, '2026-10-13');
  assert.equal(blocksEn.length, 1);
  assert.equal(blocksEn[0].title, 'Machine Learning Study');
  assert.equal(blocksEn[0].startTime, '14:00');

  const contentCustom = `# 2026-10-13

## Mi Horario
- [ ] 16:00 - 17:00 Gimnasio
`;
  const blocksCustom = parseTimeBlocksFromMarkdown(contentCustom, '2026-10-13', '## Mi Horario');
  assert.equal(blocksCustom.length, 1);
  assert.equal(blocksCustom[0].title, 'Gimnasio');
});

test('Conventions: Spaced repetition recognizes Spanish (#repasar) and English (#review) conventions', () => {
  // Spanish convention
  assert.equal(isSpacedRepetitionTag('#repasar'), true);
  assert.equal(isSpacedRepetitionTag('#repasar/calculo'), true);
  assert.equal(
    isSpacedRepetitionNote(['#repasar'], { repasar_siguiente: '2026-10-14' }),
    true
  );

  // English convention
  assert.equal(isSpacedRepetitionTag('#review'), true);
  assert.equal(isSpacedRepetitionTag('#review/biology'), true);
  assert.equal(
    isSpacedRepetitionNote(['#review'], { review_next: '2026-10-14' }),
    true
  );

  // Cross convention (e.g. tag #review with repasar_siguiente property)
  assert.equal(
    isSpacedRepetitionNote(['#review'], { repasar_siguiente: '2026-10-14' }),
    true
  );

  // Custom configuration
  const customConfig = {
    tag: '#estudiar',
    nextKey: 'proximo_repaso',
    intervalKey: 'intervalo_dias',
  };
  assert.equal(
    isSpacedRepetitionNote(['#estudiar'], { proximo_repaso: '2026-10-20' }, customConfig),
    true
  );

  // Missing date or tag
  assert.equal(isSpacedRepetitionNote(['#review'], {}), false);
  assert.equal(isSpacedRepetitionNote(['#otra'], { review_next: '2026-10-14' }), false);
});

test('Conventions: Default conventions depend on language', () => {
  const esConventions = getDefaultConventions('es');
  assert.equal(esConventions.tasksSectionHeader, '## Tareas');
  assert.equal(esConventions.timeBlocksSectionHeader, '## Bloques de Tiempo');
  assert.equal(esConventions.spacedRepetitionTag, '#repasar');
  assert.equal(esConventions.spacedRepetitionNextKey, 'repasar_siguiente');

  const enConventions = getDefaultConventions('en');
  assert.equal(enConventions.tasksSectionHeader, '## Tasks');
  assert.equal(enConventions.timeBlocksSectionHeader, '## Time Blocks');
  assert.equal(enConventions.spacedRepetitionTag, '#review');
  assert.equal(enConventions.spacedRepetitionNextKey, 'review_next');
});
