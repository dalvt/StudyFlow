import test from 'node:test';
import assert from 'node:assert/strict';
import {
  parseSessionsFromJsonl,
  formatSessionsToJsonl,
  needsMigration,
  prepareMigrationData,
  SCHEMA_VERSION,
  SESSIONS_FILE_PATH,
} from '../src/migration-utils.ts';
import { syncBlocksToMarkdown } from '../src/markdown-utils.ts';
import { parseTimeBlocksFromMarkdown } from '../src/calendar-utils.ts';
import { migratePluginFilesToDedicatedFolder } from '../src/utils.ts';

test('parseSessionsFromJsonl parses JSON lines and skips blank lines and malformed entries', () => {
  const jsonlContent = `{"id":"s1","timestamp":1700000000000,"date":"2026-10-12","durationMinutes":25,"tags":["#algebra"],"taskText":"Estudiar álgebra"}

{"id":"s2","timestamp":1700000100000,"date":"2026-10-12","durationMinutes":15,"tags":[],"interrupted":true}
not-a-valid-json-line
{"id":"s3","timestamp":1700000200000,"date":"2026-10-13","durationMinutes":30,"tags":["#quimica"]}
`;

  const sessions = parseSessionsFromJsonl(jsonlContent);
  assert.equal(sessions.length, 3);
  assert.equal(sessions[0].id, 's1');
  assert.equal(sessions[0].taskText, 'Estudiar álgebra');
  assert.equal(sessions[0].durationMinutes, 25);
  assert.equal(sessions[1].id, 's2');
  assert.equal(sessions[1].interrupted, true);
  assert.equal(sessions[2].id, 's3');
  assert.equal(sessions[2].date, '2026-10-13');
});

test('formatSessionsToJsonl serializes sessions to one JSON object per line ending with newline', () => {
  const sessions = [
    {
      id: 's1',
      timestamp: 1700000000000,
      date: '2026-10-12',
      durationMinutes: 25,
      tags: ['#redes'],
      taskText: 'Configurar router',
    },
    {
      id: 's2',
      timestamp: 1700001000000,
      date: '2026-10-13',
      durationMinutes: 50,
      tags: ['#algebra'],
      interrupted: false,
    },
  ];

  const jsonl = formatSessionsToJsonl(sessions);
  const lines = jsonl.trim().split('\n');
  assert.equal(lines.length, 2);
  assert.equal(jsonl.endsWith('\n'), true);

  // Round-trip check
  const reParsed = parseSessionsFromJsonl(jsonl);
  assert.deepEqual(reParsed, sessions);
});

test('needsMigration correctly detects whether migration is required', () => {
  // Fresh install with empty rawData
  assert.equal(needsMigration(null), false);
  assert.equal(needsMigration({}), false);

  // Already migrated
  assert.equal(needsMigration({ schemaVersion: 2, pomodoroWorkDuration: 25 }), false);
  assert.equal(needsMigration({ schemaVersion: 3 }), false);

  // Legacy data without schemaVersion
  assert.equal(
    needsMigration({
      pomodoroWorkDuration: 25,
      calendarBlocks: { '2026-10-12': [] },
      focusHistory: [],
    }),
    true
  );

  // Legacy data with schemaVersion 1
  assert.equal(
    needsMigration({
      schemaVersion: 1,
      pomodoroWorkDuration: 30,
    }),
    true
  );
});

test('prepareMigrationData extracts calendarBlocks and focusHistory, and strips them from settings', () => {
  const legacyRawData = {
    schemaVersion: 1,
    pomodoroWorkDuration: 30,
    dailyNotesFolder: 'Diarias',
    focusHistory: [
      { id: 'f1', timestamp: 1700000000000, date: '2026-10-12', durationMinutes: 25, tags: [] },
    ],
    calendarBlocks: {
      '2026-10-12': [
        { id: 'b1', date: '2026-10-12', startTime: '09:00', endTime: '10:30', title: 'Física', completed: true },
      ],
    },
  };

  const { calendarBlocks, sessions, cleanedSettings } = prepareMigrationData(legacyRawData);

  // Extracted data matches legacy
  assert.equal(sessions.length, 1);
  assert.equal(sessions[0].id, 'f1');
  assert.ok(calendarBlocks['2026-10-12']);
  assert.equal(calendarBlocks['2026-10-12'][0].title, 'Física');

  // Cleaned settings have schemaVersion = 2 and no legacy keys
  assert.equal(cleanedSettings.schemaVersion, SCHEMA_VERSION);
  assert.equal(cleanedSettings.pomodoroWorkDuration, 30);
  assert.equal(cleanedSettings.dailyNotesFolder, 'Diarias');
  assert.equal('calendarBlocks' in cleanedSettings, false);
  assert.equal('focusHistory' in cleanedSettings, false);
});

test('migrated calendarBlocks sync to daily note markdown and round-trip parse accurately', () => {
  const legacyBlocks = [
    { id: '1', date: '2026-10-13', startTime: '08:00', endTime: '09:30', title: 'Bloque Matutino', linkedNote: 'Matutino.md', completed: false },
    { id: '2', date: '2026-10-13', startTime: '10:00', endTime: '11:30', title: 'Bloque Práctico', completed: true },
  ];

  const initialDailyNote = `# 2026-10-13\n\n## Resumen del Día\nNotas previas.\n`;
  const syncedContent = syncBlocksToMarkdown(initialDailyNote, legacyBlocks);

  assert.ok(syncedContent.includes('## Bloques de Tiempo'));
  assert.ok(syncedContent.includes('- [ ] 08:00—09:30 Bloque Matutino [[Matutino.md]]'));
  assert.ok(syncedContent.includes('- [x] 10:00—11:30 Bloque Práctico'));
  assert.ok(syncedContent.includes('## Resumen del Día\nNotas previas.'));

  const parsedBlocks = parseTimeBlocksFromMarkdown(syncedContent, '2026-10-13');
  assert.equal(parsedBlocks.length, 2);
  assert.equal(parsedBlocks[0].title, 'Bloque Matutino');
  assert.equal(parsedBlocks[0].linkedNote, 'Matutino.md');
  assert.equal(parsedBlocks[0].completed, false);
  assert.equal(parsedBlocks[1].title, 'Bloque Práctico');
  assert.equal(parsedBlocks[1].completed, true);
});

test('migratePluginFilesToDedicatedFolder moves root Daily folder to StudyFlow/Daily and updates settings', async () => {
  const rootDaily = {
    name: 'Daily',
    path: 'Daily',
    children: [
      { name: '2026-10-18.md', path: 'Daily/2026-10-18.md' },
    ],
  };

  const filesMap = new Map();
  filesMap.set('Daily', rootDaily);

  const renamed = [];
  const app = {
    vault: {
      getAbstractFileByPath: (p) => filesMap.get(p) || null,
      createFolder: async (p) => {
        const folder = { name: p.split('/').pop(), path: p, children: [] };
        filesMap.set(p, folder);
        return folder;
      },
    },
    fileManager: {
      renameFile: async (file, newPath) => {
        renamed.push({ from: file.path, to: newPath });
        filesMap.delete(file.path);
        file.path = newPath;
        filesMap.set(newPath, file);
      },
    },
  };

  const settings = {
    dailyNotesFolder: 'Daily',
    inboxFilePath: 'StudyFlow/Inbox.md',
    habitsFilePath: 'StudyFlow/Habits.md',
  };

  await migratePluginFilesToDedicatedFolder(app, settings);

  assert.equal(settings.dailyNotesFolder, 'StudyFlow/Daily');
  assert.equal(renamed.length, 1);
  assert.equal(renamed[0].from, 'Daily');
  assert.equal(renamed[0].to, 'StudyFlow/Daily');
});
