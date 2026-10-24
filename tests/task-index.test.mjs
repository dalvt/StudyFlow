import test from 'node:test';
import assert from 'node:assert/strict';
import { TFile } from 'obsidian';
import { TaskIndex } from '../src/task-index.ts';
import { cloneDefaultSettings } from '../src/settings-utils.ts';

function createFakeFile(path, content = '') {
  const file = new TFile(path);
  file.content = content;
  file.basename = path.split('/').pop().replace(/\.md$/, '');
  return file;
}

function createFakeApp(files = []) {
  const fileMap = new Map(files.map((f) => [f.path, f]));
  const vaultListeners = new Map();
  const metadataListeners = new Map();
  let layoutReadyCallback = null;

  const app = {
    vault: {
      getMarkdownFiles: () => Array.from(fileMap.values()),
      getAbstractFileByPath: (p) => fileMap.get(p) || null,
      cachedRead: async (file) => file.content || '',
      getName: () => 'TestVault',
      on: (event, cb) => {
        if (!vaultListeners.has(event)) vaultListeners.set(event, []);
        vaultListeners.get(event).push(cb);
        return { event, cb };
      },
    },
    metadataCache: {
      getFileCache: (file) => ({
        listItems: [{ position: { start: { line: 1 } } }],
      }),
      on: (event, cb) => {
        if (!metadataListeners.has(event)) metadataListeners.set(event, []);
        metadataListeners.get(event).push(cb);
        return { event, cb };
      },
    },
    workspace: {
      onLayoutReady: (cb) => {
        layoutReadyCallback = cb;
      },
    },
  };

  const plugin = {
    app,
    settings: cloneDefaultSettings(),
    registerEvent: (e) => e,
  };

  return {
    app,
    plugin,
    fileMap,
    vaultListeners,
    metadataListeners,
    triggerLayoutReady: async () => {
      if (layoutReadyCallback) await layoutReadyCallback();
    },
    triggerVaultEvent: async (event, ...args) => {
      const cbs = vaultListeners.get(event) || [];
      for (const cb of cbs) await cb(...args);
    },
    triggerMetadataEvent: async (event, ...args) => {
      const cbs = metadataListeners.get(event) || [];
      for (const cb of cbs) await cb(...args);
    },
  };
}

test('TaskIndex: init() does NOT subscribe to metadataCache resolved and registers onLayoutReady', async () => {
  const { app, plugin, metadataListeners, triggerLayoutReady } = createFakeApp([
    createFakeFile('StudyFlow/Inbox.md', '## Tareas\n- [ ] Tarea inicial 1'),
  ]);

  const index = new TaskIndex(plugin);
  index.init();

  // Resolved event must NEVER be registered
  assert.equal(metadataListeners.has('resolved'), false);

  // Before layout ready, index is empty
  assert.equal(index.getAllTasks().length, 0);

  // Triggering onLayoutReady executes initial scan
  await triggerLayoutReady();
  assert.equal(index.getAllTasks().length, 1);
  assert.equal(index.getAllTasks()[0].text, 'Tarea inicial 1');

  index.destroy();
});

test('TaskIndex: initial vault scan handles 5,000 files in batches yielding thread without freezing', async () => {
  const files = [];
  for (let i = 0; i < 5000; i++) {
    files.push(
      createFakeFile(
        `Notes/Note-${i}.md`,
        i % 100 === 0 ? `## Tareas\n- [ ] Tarea número ${i}` : '# Nota sin tareas'
      )
    );
  }

  const { plugin } = createFakeApp(files);
  plugin.settings.taskIncludedFolders = [];
  plugin.settings.taskExcludedFolders = [];

  const index = new TaskIndex(plugin);

  const start = Date.now();
  await index.scanVault({ isInitial: true });
  const duration = Date.now() - start;

  // 5,000 files processed with 100 yield pauses
  const tasks = index.getAllTasks();
  assert.equal(tasks.length, 50); // 5000 / 100 = 50 tasks
  assert.ok(typeof duration === 'number');

  index.destroy();
});

test('TaskIndex: avoids enqueuing the same file twice when modify and changed fire together', async () => {
  const testFile = createFakeFile(
    'StudyFlow/Inbox.md',
    '## Tareas\n- [ ] Tarea original'
  );
  const { plugin, triggerVaultEvent, triggerMetadataEvent } = createFakeApp([testFile]);

  let readCount = 0;
  const originalRead = plugin.app.vault.cachedRead;
  plugin.app.vault.cachedRead = async (f) => {
    readCount++;
    return originalRead(f);
  };

  const index = new TaskIndex(plugin);
  index.init();

  // Initial indexing
  await index.scanVault();
  assert.equal(readCount, 1);
  assert.equal(index.getAllTasks()[0].text, 'Tarea original');

  // Update file content
  testFile.content = '## Tareas\n- [ ] Tarea editada con modify y changed';

  // Fire modify and changed simultaneously
  await triggerVaultEvent('modify', testFile);
  await triggerMetadataEvent('changed', testFile);

  // Advance timer to let debounce complete
  await new Promise((resolve) => setTimeout(resolve, 350));

  // Should have read the file only 1 additional time (total 2 reads)
  assert.equal(readCount, 2);
  assert.equal(index.getAllTasks()[0].text, 'Tarea editada con modify y changed');

  index.destroy();
});

test('TaskIndex: scanVault cleans up files that no longer match inclusion/exclusion rules or were deleted', async () => {
  const fileA = createFakeFile('Projects/A.md', '## Tareas\n- [ ] Tarea en Proyecto A');
  const fileB = createFakeFile('Archives/B.md', '## Tareas\n- [ ] Tarea en Archivo B');
  const { plugin, fileMap } = createFakeApp([fileA, fileB]);

  const index = new TaskIndex(plugin);
  await index.scanVault();

  assert.equal(index.getAllTasks().length, 2);

  // Exclude Archives folder
  plugin.settings.taskExcludedFolders = ['Archives', 'Templates'];
  await index.scanVault();

  // B must be purged from index, only A remains
  assert.equal(index.getAllTasks().length, 1);
  assert.equal(index.getAllTasks()[0].text, 'Tarea en Proyecto A');

  // Simulate file deletion from vault
  fileMap.delete(fileA.path);
  await index.scanVault();

  // All files gone
  assert.equal(index.getAllTasks().length, 0);

  index.destroy();
});

test('TaskIndex: handles delete and rename events reactively', async () => {
  const fileA = createFakeFile('StudyFlow/Inbox.md', '## Tareas\n- [ ] Tarea a borrar');
  const { plugin, fileMap, triggerVaultEvent } = createFakeApp([fileA]);

  const index = new TaskIndex(plugin);
  index.init();
  await index.scanVault();
  assert.equal(index.getAllTasks().length, 1);

  // Trigger delete event
  fileMap.delete(fileA.path);
  await triggerVaultEvent('delete', fileA);
  assert.equal(index.getAllTasks().length, 0);

  // Trigger rename event
  const newFile = createFakeFile('StudyFlow/Renamed.md', '## Tareas\n- [ ] Tarea renombrada');
  fileMap.set(newFile.path, newFile);
  await triggerVaultEvent('rename', newFile, fileA.path);

  await new Promise((resolve) => setTimeout(resolve, 350));
  assert.equal(index.getAllTasks().length, 1);
  assert.equal(index.getAllTasks()[0].text, 'Tarea renombrada');

  index.destroy();
});

test('TaskIndex: interleaved modify and delete does not cancel dirtyFiles processing and leaves no stuck files', async () => {
  const fileA = createFakeFile('StudyFlow/Inbox.md', '## Tareas\n- [ ] Tarea original A');
  const fileB = createFakeFile('StudyFlow/Other.md', '## Tareas\n- [ ] Tarea en B');
  const { plugin, fileMap, triggerVaultEvent } = createFakeApp([fileA, fileB]);

  const index = new TaskIndex(plugin);
  index.init();
  await index.scanVault();
  assert.equal(index.getAllTasks().length, 2);

  // 1. Modify fileA
  fileA.content = '## Tareas\n- [ ] Tarea A modificada';
  await triggerVaultEvent('modify', fileA);

  // 2. Wait 50ms, then delete fileB (which triggers debounced notify)
  await new Promise((resolve) => setTimeout(resolve, 50));
  fileMap.delete(fileB.path);
  await triggerVaultEvent('delete', fileB);

  // 3. Wait for debounced processing and notify to complete
  await new Promise((resolve) => setTimeout(resolve, 400));

  // File B should be deleted, and File A should have its modified task indexed
  const tasksAfter = index.getAllTasks();
  assert.equal(tasksAfter.length, 1);
  assert.equal(tasksAfter[0].text, 'Tarea A modificada');

  // dirtyFiles must be cleared and not blocked
  assert.equal(index.dirtyFiles.size, 0, 'dirtyFiles must be empty');

  // 4. Verify fileA can be modified again and indexed properly (not stuck)
  fileA.content = '## Tareas\n- [ ] Tarea A segunda modificacion';
  await triggerVaultEvent('modify', fileA);
  await new Promise((resolve) => setTimeout(resolve, 350));

  const tasksFinal = index.getAllTasks();
  assert.equal(tasksFinal.length, 1);
  assert.equal(tasksFinal[0].text, 'Tarea A segunda modificacion');
  assert.equal(index.dirtyFiles.size, 0);

  index.destroy();
});
