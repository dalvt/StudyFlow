import { App, Notice, TFile } from 'obsidian';
import type StudyFlowPlugin from './main';
import {
  compareTasksByPriority,
  computeDeadlinesFromTasks,
  type DeadlineItem,
  extractAllTasksFromContent,
  isPathIndexed,
  type TaskRecord,
} from './markdown-utils.ts';
import { t } from './i18n/index.ts';

export { isPathIndexed };

export class TaskIndex {
  private plugin: StudyFlowPlugin;
  private app: App;
  private tasksByFile: Map<string, TaskRecord[]> = new Map();
  private allTasksCache: TaskRecord[] | null = null;
  private allDeadlinesCache: DeadlineItem[] | null = null;
  private dirtyFiles: Set<string> = new Set();
  private debounceTimer: number | null = null;
  private listeners: Set<() => void> = new Set();
  private initialized: boolean = false;
  private isProcessing: boolean = false;

  constructor(plugin: StudyFlowPlugin) {
    this.plugin = plugin;
    this.app = plugin.app;
  }

  /**
   * Initializes the task index, registers vault and metadataCache event listeners,
   * and performs initial vault scanning once workspace layout is ready.
   */
  init(): void {
    if (this.initialized) return;
    this.initialized = true;

    this.registerVaultEvents();

    this.app.workspace.onLayoutReady(async () => {
      await this.scanVault({ isInitial: true });
    });
  }

  /**
   * Scans all markdown files in vault matching inclusion/exclusion settings,
   * yielding every 50 files and removing files that no longer match settings.
   */
  async scanVault(options?: { isInitial?: boolean }): Promise<void> {
    const startTime = Date.now();
    const files = this.app.vault.getMarkdownFiles();
    const { taskIncludedFolders, taskExcludedFolders, tasksSectionHeader, iceboxSectionHeader, habitsFilePath } =
      this.plugin.settings;
    const excludedFiles = habitsFilePath ? [habitsFilePath] : [];

    const validPaths = new Set<string>();

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      if (!isPathIndexed(file.path, taskIncludedFolders, taskExcludedFolders, excludedFiles)) {
        if (this.tasksByFile.has(file.path)) {
          this.tasksByFile.delete(file.path);
        }
        continue;
      }

      validPaths.add(file.path);
      await this.indexFile(file, { tasksSectionHeader, iceboxSectionHeader });

      // Yield event loop every 50 files
      if ((i + 1) % 50 === 0 && i + 1 < files.length) {
        await new Promise((resolve) => window.setTimeout(resolve, 0));
      }
    }

    // Clean up any files that were in the index but are no longer valid or no longer in vault
    for (const indexedPath of Array.from(this.tasksByFile.keys())) {
      if (!validPaths.has(indexedPath)) {
        this.tasksByFile.delete(indexedPath);
      }
    }

    this.invalidateCaches();
    this.emitChange();

    if (options?.isInitial) {
      const elapsed = Date.now() - startTime;
      if (elapsed > 2000) {
        const count = this.getAllTasks().length;
        const seconds = (elapsed / 1000).toFixed(1);
        new Notice(t('tasks.indexingVaultNotice', { count, seconds }));
      }
    }
  }

  /**
   * Indexes tasks for a single file using metadataCache.listItems check and cachedRead.
   */
  async indexFile(
    file: TFile,
    options?: { tasksSectionHeader?: string; iceboxSectionHeader?: string }
  ): Promise<void> {
    try {
      const cache = this.app.metadataCache.getFileCache(file);
      // Quick check: if cache has listItems array and it's empty, file has no list items or tasks
      if (cache && Array.isArray(cache.listItems) && cache.listItems.length === 0) {
        if (this.tasksByFile.has(file.path)) {
          this.tasksByFile.delete(file.path);
          this.invalidateCaches();
        }
        return;
      }

      const content = await this.app.vault.cachedRead(file);
      const tasks = extractAllTasksFromContent(content, file.path, options);
      if (tasks.length > 0) {
        this.tasksByFile.set(file.path, tasks);
      } else {
        this.tasksByFile.delete(file.path);
      }
      this.invalidateCaches();
    } catch (err) {
      console.error('TaskIndex: error indexing file', file.path, err);
    }
  }

  private registerVaultEvents(): void {
    // 1. vault.modify
    this.plugin.registerEvent(
      this.app.vault.on('modify', (file) => {
        if (file instanceof TFile && file.extension === 'md') {
          this.queueFile(file.path);
        }
      })
    );

    // 2. vault.create
    this.plugin.registerEvent(
      this.app.vault.on('create', (file) => {
        if (file instanceof TFile && file.extension === 'md') {
          this.queueFile(file.path);
        }
      })
    );

    // 3. vault.delete
    this.plugin.registerEvent(
      this.app.vault.on('delete', (file) => {
        if (file instanceof TFile && file.extension === 'md') {
          this.handleFileDeleted(file.path);
        }
      })
    );

    // 4. vault.rename
    this.plugin.registerEvent(
      this.app.vault.on('rename', (file, oldPath) => {
        if (file instanceof TFile && file.extension === 'md') {
          this.handleFileRenamed(file, oldPath);
        }
      })
    );

    // 5. metadataCache.changed
    this.plugin.registerEvent(
      this.app.metadataCache.on('changed', (file) => {
        if (file instanceof TFile && file.extension === 'md') {
          this.queueFile(file.path);
        }
      })
    );
  }

  private queueFile(filePath: string): void {
    const { taskIncludedFolders, taskExcludedFolders, habitsFilePath } = this.plugin.settings;
    const excludedFiles = habitsFilePath ? [habitsFilePath] : [];
    if (!isPathIndexed(filePath, taskIncludedFolders, taskExcludedFolders, excludedFiles)) {
      if (this.tasksByFile.has(filePath)) {
        this.tasksByFile.delete(filePath);
        this.invalidateCaches();
        this.triggerDebouncedNotify();
      }
      return;
    }

    if (this.dirtyFiles.has(filePath)) {
      return;
    }

    this.dirtyFiles.add(filePath);
    this.triggerDebouncedProcessing();
  }

  private handleFileDeleted(filePath: string): void {
    this.dirtyFiles.delete(filePath);
    if (this.tasksByFile.has(filePath)) {
      this.tasksByFile.delete(filePath);
      this.invalidateCaches();
      this.triggerDebouncedNotify();
    }
  }

  private handleFileRenamed(file: TFile, oldPath: string): void {
    this.tasksByFile.delete(oldPath);
    this.dirtyFiles.delete(oldPath);
    this.invalidateCaches();
    this.queueFile(file.path);
  }

  private triggerDebouncedProcessing(): void {
    if (this.debounceTimer !== null) {
      window.clearTimeout(this.debounceTimer);
    }
    this.debounceTimer = window.setTimeout(() => {
      void (async () => {
        this.debounceTimer = null;
        await this.processDirtyFiles();
      })();
    }, 300);
  }

  private triggerDebouncedNotify(): void {
    if (this.debounceTimer !== null) {
      window.clearTimeout(this.debounceTimer);
    }
    this.debounceTimer = window.setTimeout(() => {
      this.debounceTimer = null;
      this.emitChange();
    }, 300);
  }

  private async processDirtyFiles(): Promise<void> {
    if (this.dirtyFiles.size === 0 || this.isProcessing) return;
    this.isProcessing = true;
    try {
      while (this.dirtyFiles.size > 0) {
        const pathsToProcess = Array.from(this.dirtyFiles);
        this.dirtyFiles.clear();

        const { tasksSectionHeader, iceboxSectionHeader } = this.plugin.settings;
        for (const path of pathsToProcess) {
          const file = this.app.vault.getAbstractFileByPath(path);
          if (file instanceof TFile) {
            await this.indexFile(file, { tasksSectionHeader, iceboxSectionHeader });
          } else {
            this.tasksByFile.delete(path);
          }
        }
      }

      this.invalidateCaches();
      this.emitChange();
    } finally {
      this.isProcessing = false;
    }
  }

  /**
   * Returns all tasks across all indexed files, sorted by priority and deadline.
   */
  getAllTasks(): TaskRecord[] {
    if (this.allTasksCache === null) {
      const all: TaskRecord[] = [];
      for (const tasks of this.tasksByFile.values()) {
        all.push(...tasks);
      }
      all.sort(compareTasksByPriority);
      this.allTasksCache = all;
    }
    return this.allTasksCache;
  }

  /**
   * Returns tasks belonging to a specific file.
   */
  getTasksForFile(filePath: string): TaskRecord[] {
    return this.tasksByFile.get(filePath) || [];
  }

  /**
   * Returns all actionable pending tasks (!completed && !isIdea).
   */
  getPendingTasks(): TaskRecord[] {
    return this.getAllTasks().filter((t) => !t.completed && !t.isIdea);
  }

  /**
   * Returns all icebox / passive idea items (isIdea).
   */
  getIceboxTasks(): TaskRecord[] {
    return this.getAllTasks().filter((t) => !t.completed && t.isIdea);
  }

  /**
   * Returns all completed tasks (completed && !isIdea).
   */
  getCompletedTasks(): TaskRecord[] {
    return this.getAllTasks().filter((t) => t.completed && !t.isIdea);
  }

  /**
   * Returns all deadline items computed from indexed tasks in memory.
   */
  getAllDeadlines(): DeadlineItem[] {
    if (this.allDeadlinesCache === null) {
      this.allDeadlinesCache = computeDeadlinesFromTasks(this.getAllTasks());
    }
    return this.allDeadlinesCache;
  }

  /**
   * Subscribes to index changes. Returns an unsubscribe function.
   */
  onChange(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private emitChange(): void {
    for (const listener of this.listeners) {
      try {
        listener();
      } catch (err) {
        console.error('TaskIndex listener error:', err);
      }
    }
  }

  private invalidateCaches(): void {
    this.allTasksCache = null;
    this.allDeadlinesCache = null;
  }

  /**
   * Re-indexes all vault files according to current settings.
   */
  async reindexAll(): Promise<void> {
    this.tasksByFile.clear();
    this.invalidateCaches();
    await this.scanVault();
  }

  /**
   * Cleans up all pending timers and listeners.
   */
  destroy(): void {
    if (this.debounceTimer !== null) {
      window.clearTimeout(this.debounceTimer);
      this.debounceTimer = null;
    }
    this.isProcessing = false;
    this.listeners.clear();
    this.dirtyFiles.clear();
    this.tasksByFile.clear();
    this.invalidateCaches();
  }
}
