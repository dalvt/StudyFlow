import test from 'node:test';
import assert from 'node:assert';
import { TFile } from 'obsidian';
import {
  parseScheduleMarkdown,
  getVirtualBlocksForDate,
  getDefaultScheduleTemplate,
} from '../src/schedule.ts';
import {
  snapTo15Minutes,
  minutesToTimeString,
  computeBlockLayouts,
  formatTimeBlockLine,
  parseTimeBlockLine,
  doBlocksOverlap,
} from '../src/calendar-utils.ts';
import {
  getTimeBlocksForDate,
  saveTimeBlock,
  toggleTimeBlockCompletion,
  deleteTimeBlock,
} from '../src/calendar.ts';
import { cloneDefaultSettings } from '../src/settings-utils.ts';


test('parseScheduleMarkdown parses weekly recurring schedule items accurately', () => {
  const content = `
# Horario de Clases

## Lunes
- [ ] 08:00—10:00 Álgebra Lineal [subject:: Matemáticas] [color:: #3b82f6] [[Notas/Algebra]]
- [ ] 14:00—16:00 Física I [subject:: Física]

## Miércoles
- [ ] 08:00—10:00 Álgebra Lineal [subject:: Matemáticas]

## Viernes
- [ ] 10:00—12:00 Programación Avanzada [subject:: Informática] [color:: #10b981]
`;

  const items = parseScheduleMarkdown(content);
  assert.strictEqual(items.length, 4);

  const algebraMon = items.find((i) => i.dayOfWeek === 1 && i.title === 'Álgebra Lineal');
  assert.ok(algebraMon);
  assert.strictEqual(algebraMon.startTime, '08:00');
  assert.strictEqual(algebraMon.endTime, '10:00');
  assert.strictEqual(algebraMon.subject, 'Matemáticas');
  assert.strictEqual(algebraMon.color, '#3b82f6');
  assert.strictEqual(algebraMon.linkedNote, 'Notas/Algebra');

  const fisicaMon = items.find((i) => i.dayOfWeek === 1 && i.title === 'Física I');
  assert.ok(fisicaMon);
  assert.strictEqual(fisicaMon.startTime, '14:00');
  assert.strictEqual(fisicaMon.endTime, '16:00');
  assert.strictEqual(fisicaMon.subject, 'Física');

  const progFri = items.find((i) => i.dayOfWeek === 5);
  assert.ok(progFri);
  assert.strictEqual(progFri.startTime, '10:00');
  assert.strictEqual(progFri.endTime, '12:00');
  assert.strictEqual(progFri.color, '#10b981');
});

test('getVirtualBlocksForDate generates virtual blocks for the correct day of week and inherits subject color', () => {
  const items = [
    {
      id: 'sched-1',
      dayOfWeek: 1, // Monday
      startTime: '09:00',
      endTime: '11:00',
      title: 'Química General',
      subject: 'Química',
    },
    {
      id: 'sched-2',
      dayOfWeek: 2, // Tuesday
      startTime: '10:00',
      endTime: '12:00',
      title: 'Biología Celular',
      subject: 'Biología',
    },
  ];

  const subjects = [
    { name: 'Química', tag: '#quimica', color: '#8b5cf6', weeklyGoalHours: 5 },
    { name: 'Biología', tag: '#biologia', color: '#10b981', weeklyGoalHours: 5 },
  ];

  // 2026-10-12 was a Monday
  const mondayDate = '2026-10-12';
  const mondayBlocks = getVirtualBlocksForDate(items, mondayDate, subjects);
  assert.strictEqual(mondayBlocks.length, 1);
  assert.strictEqual(mondayBlocks[0].title, 'Química General');
  assert.strictEqual(mondayBlocks[0].date, mondayDate);
  assert.strictEqual(mondayBlocks[0].isVirtual, true);
  assert.strictEqual(mondayBlocks[0].isRecurring, true);
  assert.strictEqual(mondayBlocks[0].color, '#8b5cf6'); // Inherited from subjects!

  // 2026-10-13 was a Tuesday
  const tuesdayDate = '2026-10-13';
  const tuesdayBlocks = getVirtualBlocksForDate(items, tuesdayDate, subjects);
  assert.strictEqual(tuesdayBlocks.length, 1);
  assert.strictEqual(tuesdayBlocks[0].title, 'Biología Celular');
  assert.strictEqual(tuesdayBlocks[0].color, '#10b981');

  // 2026-10-14 was a Wednesday (no classes scheduled)
  const wednesdayBlocks = getVirtualBlocksForDate(items, '2026-10-14', subjects);
  assert.strictEqual(wednesdayBlocks.length, 0);
});

test('snapTo15Minutes and minutesToTimeString calculate 15-minute intervals cleanly', () => {
  assert.strictEqual(snapTo15Minutes(0), 0);
  assert.strictEqual(snapTo15Minutes(7), 0);
  assert.strictEqual(snapTo15Minutes(8), 15);
  assert.strictEqual(snapTo15Minutes(14), 15);
  assert.strictEqual(snapTo15Minutes(22), 15);
  assert.strictEqual(snapTo15Minutes(23), 30);
  assert.strictEqual(snapTo15Minutes(59), 60);

  assert.strictEqual(minutesToTimeString(0), '00:00');
  assert.strictEqual(minutesToTimeString(540), '09:00');
  assert.strictEqual(minutesToTimeString(615), '10:15');
  assert.strictEqual(minutesToTimeString(1380), '23:00');
  assert.strictEqual(minutesToTimeString(1439), '23:59');
});

test('computeBlockLayouts calculates sub-columns and overlap flags for overlapping blocks', () => {
  const blocks = [
    {
      id: 'b1',
      date: '2026-10-15',
      startTime: '09:00',
      endTime: '10:30',
      title: 'Clase A',
    },
    {
      id: 'b2',
      date: '2026-10-15',
      startTime: '10:00',
      endTime: '11:30',
      title: 'Clase B (Solapada)',
    },
    {
      id: 'b3',
      date: '2026-10-15',
      startTime: '14:00',
      endTime: '15:00',
      title: 'Clase C (Disjunta)',
    },
  ];

  const layouts = computeBlockLayouts(blocks);
  assert.strictEqual(layouts.length, 3);

  const l1 = layouts.find((l) => l.block.id === 'b1');
  const l2 = layouts.find((l) => l.block.id === 'b2');
  const l3 = layouts.find((l) => l.block.id === 'b3');

  assert.ok(l1 && l2 && l3);

  // b1 and b2 overlap: should have totalCols = 2, distinct colIndexes, and hasOverlap = true
  assert.strictEqual(l1.totalCols, 2);
  assert.strictEqual(l2.totalCols, 2);
  assert.strictEqual(l1.hasOverlap, true);
  assert.strictEqual(l2.hasOverlap, true);
  assert.notStrictEqual(l1.colIndex, l2.colIndex);

  // b3 does not overlap: totalCols = 1, colIndex = 0, hasOverlap = false
  assert.strictEqual(l3.totalCols, 1);
  assert.strictEqual(l3.colIndex, 0);
  assert.strictEqual(l3.hasOverlap, false);
});

test('formatTimeBlockLine and parseTimeBlockLine preserve inline metadata [subject:: ...] and [color:: ...]', () => {
  const original = {
    id: 'block-test-1',
    date: '2026-10-15',
    startTime: '10:00',
    endTime: '11:30',
    title: 'Resolución de Guía',
    subject: 'Matemática Discreta',
    color: '#ec4899',
    linkedNote: 'Guía 4',
    completed: false,
  };

  const line = formatTimeBlockLine(original);
  assert.ok(line.includes('- [ ] 10:00—11:30 Resolución de Guía'));
  assert.ok(line.includes('[subject:: Matemática Discreta]'));
  assert.ok(line.includes('[color:: #ec4899]'));
  assert.ok(line.includes('[[Guía 4]]'));

  const parsed = parseTimeBlockLine(line, '2026-10-15');
  assert.ok(parsed);
  assert.strictEqual(parsed.startTime, '10:00');
  assert.strictEqual(parsed.endTime, '11:30');
  assert.strictEqual(parsed.title, 'Resolución de Guía');
  assert.strictEqual(parsed.subject, 'Matemática Discreta');
  assert.strictEqual(parsed.color, '#ec4899');
  assert.strictEqual(parsed.linkedNote, 'Guía 4');
  assert.strictEqual(parsed.completed, false);
});

test('calendar.ts operations respect custom settings.timeBlocksSectionHeader', async () => {
  const dailyFile = new TFile('Daily/2026-10-15.md');
  dailyFile.content = `# 2026-10-15\n\n## Mi Horario\n- [ ] 09:00—10:30 Laboratorio Física\n`;

  const settings = cloneDefaultSettings();
  settings.timeBlocksSectionHeader = '## Mi Horario';

  const app = {
    vault: {
      getAbstractFileByPath: (p) => (p === 'Daily/2026-10-15.md' ? dailyFile : null),
      read: async () => dailyFile.content,
      process: async (_file, fn) => {
        dailyFile.content = fn(dailyFile.content);
        return dailyFile.content;
      },
    },
  };
  const plugin = { app, settings };

  const blocks = await getTimeBlocksForDate(app, settings, '2026-10-15', false);
  assert.strictEqual(blocks.length, 1);
  assert.strictEqual(blocks[0].title, 'Laboratorio Física');

  // Toggle completion using custom header
  await toggleTimeBlockCompletion(plugin, '2026-10-15', blocks[0].id, true);
  assert.ok(dailyFile.content.includes('- [x] 09:00—10:30 Laboratorio Física'));
  assert.ok(dailyFile.content.includes('## Mi Horario'));
  assert.ok(!dailyFile.content.includes('## Bloques de Tiempo'));

  // Save new block under custom header
  await saveTimeBlock(plugin, {
    id: 'block-new',
    date: '2026-10-15',
    startTime: '11:00',
    endTime: '12:00',
    title: 'Repaso Álgebra',
    completed: false,
  });
  assert.ok(dailyFile.content.includes('- [ ] 11:00—12:00 Repaso Álgebra'));
  assert.ok(!dailyFile.content.includes('## Bloques de Tiempo'));

  // Delete first block under custom header
  await deleteTimeBlock(plugin, '2026-10-15', blocks[0].id);
  const afterDelete = await getTimeBlocksForDate(app, settings, '2026-10-15', false);
  assert.strictEqual(afterDelete.length, 1);
  assert.strictEqual(afterDelete[0].title, 'Repaso Álgebra');
});

test('toggleTimeBlockCompletion materializes a virtual schedule block into the Daily Note', async () => {
  const dailyFile = new TFile('Daily/2026-10-12.md');
  dailyFile.content = `# 2026-10-12\n\n`;

  const scheduleFile = new TFile('StudyFlow/Schedule.md');
  scheduleFile.content = `# Horario\n\n## Lunes\n- [ ] 08:00—10:00 Álgebra Lineal [subject:: Matemáticas]\n`;

  const settings = cloneDefaultSettings();
  const app = {
    vault: {
      getAbstractFileByPath: (p) => {
        if (p === 'Daily/2026-10-12.md') return dailyFile;
        if (p === 'StudyFlow/Schedule.md') return scheduleFile;
        return null;
      },
      read: async (f) => f.content,
      process: async (f, fn) => {
        f.content = fn(f.content);
        return f.content;
      },
    },
  };
  const plugin = { app, settings };

  const blocks = await getTimeBlocksForDate(app, settings, '2026-10-12', true);
  assert.strictEqual(blocks.length, 1);
  assert.strictEqual(blocks[0].isVirtual, true);

  await toggleTimeBlockCompletion(plugin, '2026-10-12', blocks[0].id, true);
  assert.ok(dailyFile.content.includes('- [x] 08:00—10:00 Álgebra Lineal'));
});

test('Task estimate calculation matches pomodoros * pomodoroWorkDuration', () => {
  const pomodoroWorkDuration = 25;
  const taskA = { estimatedPomodoros: 2 };
  const taskB = { estimatedPomodoros: 4 };
  const taskC = { estimatedPomodoros: undefined };

  const durationA = (taskA.estimatedPomodoros || 1) * pomodoroWorkDuration;
  const durationB = (taskB.estimatedPomodoros || 1) * pomodoroWorkDuration;
  const durationC = (taskC.estimatedPomodoros || 1) * pomodoroWorkDuration;

  assert.strictEqual(durationA, 50);
  assert.strictEqual(durationB, 100);
  assert.strictEqual(durationC, 25);
});

