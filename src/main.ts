import { getLanguage, Notice, Plugin, WorkspaceLeaf } from 'obsidian';
import { HabitsModal } from './habits';
import { NextDayPlannerModal } from './planner';
import { PomodoroManager } from './pomodoro';
import { PomodoroModal } from './pomodoro-modal';
import { AnalyticsModal } from './analytics-modal';
import { cloneDefaultSettings, StudyFlowSettings, StudyFlowSettingTab } from './settings';
import { QuickCaptureModal, TasksManagerModal } from './tasks';
import { ActiveTab, StudyFlowView, VIEW_TYPE_STUDY_FLOW } from './view';
import { ZenModeManager } from './zen';
import { migratePluginFilesToDedicatedFolder } from './utils';
import { TaskIndex } from './task-index';
import { runStartupMigration, loadFocusSessionsFromFile } from './storage-migration';
import type { FocusSessionRecord } from './analytics';
import { t, setLanguage, setObsidianLanguageResolver, getEffectiveLanguage } from './i18n/index.ts';
import { getDefaultConventions } from './conventions.ts';
import { exportStudyFlowIcsFile } from './ics-export';
import { handleStudyFlowProtocol } from './protocol-handler';

export default class StudyFlowPlugin extends Plugin {
  settings: StudyFlowSettings = cloneDefaultSettings();
  pomodoro!: PomodoroManager;
  taskIndex!: TaskIndex;
  zen: ZenModeManager = new ZenModeManager(this);
  focusSessions: FocusSessionRecord[] = [];

  async onload(): Promise<void> {
    await this.loadSettings();
    setObsidianLanguageResolver(getLanguage);
    setLanguage(this.settings.language || 'auto');

    await migratePluginFilesToDedicatedFolder(this.app, this.settings);
    await runStartupMigration(this);
    this.focusSessions = await loadFocusSessionsFromFile(this.app);
    await this.saveSettings();

    // Initialize reactive TaskIndex
    this.taskIndex = new TaskIndex(this);
    this.taskIndex.init();

    // Register Sidebar Hub View
    this.registerView(
      VIEW_TYPE_STUDY_FLOW,
      (leaf: WorkspaceLeaf) => new StudyFlowView(leaf, this)
    );

    // Initialize Pomodoro Manager with status bar element
    const statusBarEl = this.addStatusBarItem();
    this.pomodoro = new PomodoroManager(this);
    this.pomodoro.initStatusBar(statusBarEl);
    await this.pomodoro.restoreState();

    // Ribbon Icons
    this.addRibbonIcon('clock', t('ribbon.openView'), () => {
      this.activateView(true);
    });

    this.addRibbonIcon('plus-circle', t('ribbon.quickCapture'), () => {
      new QuickCaptureModal(this.app, this).open();
    });

    // Commands (Obsidian convention: no plugin prefix)
    this.addCommand({
      id: 'open-study-flow-hub',
      name: t('commands.openHub'),
      callback: () => {
        this.activateView(true);
      },
    });

    this.addCommand({
      id: 'open-study-flow-calendar',
      name: t('commands.openCalendar'),
      callback: () => {
        this.activateView(true, 'calendar');
      },
    });

    this.addCommand({
      id: 'open-study-flow-hub-sidebar',
      name: t('commands.openSidebar'),
      callback: () => {
        this.activateView(false);
      },
    });

    this.addCommand({
      id: 'open-pomodoro-modal',
      name: t('commands.openPomodoro'),
      callback: () => {
        new PomodoroModal(this.app, this).open();
      },
    });

    this.addCommand({
      id: 'open-tasks-manager',
      name: t('commands.openTasks'),
      callback: () => {
        new TasksManagerModal(this.app, this).open();
      },
    });

    this.addCommand({
      id: 'open-habits-tracker',
      name: t('commands.openHabits'),
      callback: () => {
        new HabitsModal(this.app, this).open();
      },
    });

    this.addCommand({
      id: 'open-analytics-dashboard',
      name: t('commands.openAnalytics'),
      callback: () => {
        new AnalyticsModal(this.app, this).open();
      },
    });

    this.addCommand({
      id: 'capture-quick-task',
      name: t('commands.quickCapture'),
      callback: () => {
        new QuickCaptureModal(this.app, this).open();
      },
    });

    this.addCommand({
      id: 'complete-pomodoro-active-task',
      name: t('commands.completeActiveTask'),
      callback: async () => {
        await this.pomodoro.completeActiveTask();
      },
    });

    this.addCommand({
      id: 'plan-next-day',
      name: t('commands.planNextDay'),
      callback: () => {
        void this.openCalendarTomorrow(true);
      },
    });

    this.addCommand({
      id: 'pomodoro-toggle',
      name: t('commands.pomodoroToggle'),
      callback: () => {
        this.pomodoro.toggleStartPause();
      },
    });

    this.addCommand({
      id: 'pomodoro-reset',
      name: t('commands.pomodoroReset'),
      callback: () => {
        this.pomodoro.reset();
      },
    });

    this.addCommand({
      id: 'pomodoro-switch-mode',
      name: t('commands.pomodoroSwitchMode'),
      callback: () => {
        this.pomodoro.switchMode();
      },
    });

    this.addCommand({
      id: 'toggle-zen-mode',
      name: t('commands.toggleZen'),
      callback: () => {
        this.zen.toggleZen();
      },
    });

    this.addCommand({
      id: 'generate-weekly-review',
      name: t('commands.generateWeeklyReview'),
      callback: async () => {
        try {
          const { generateWeeklyReviewFile } = await import('./weekly-review.ts');
          const { file, isNew } = await generateWeeklyReviewFile(this.app, this);
          new Notice(
            isNew
              ? t('weeklyReview.createdNotice', { path: file.path })
              : t('weeklyReview.openedNotice', { path: file.path })
          );
          const leaf = this.app.workspace.getLeaf('tab');
          await leaf.openFile(file);
        } catch (err) {
          console.error('Study Flow: Error generando revisión semanal', err);
          new Notice(t('weeklyReview.errorNotice'));
        }
      },
    });

    this.addCommand({
      id: 'spaced-repetition-init',
      name: t('commands.initSpacedRepetition'),
      checkCallback: (checking: boolean) => {
        const activeFile = this.app.workspace.getActiveFile();
        if (!activeFile) return false;
        if (checking) return true;
        void (async () => {
          try {
            const { initSpacedRepetitionForFile } = await import('./spaced-repetition.ts');
            await initSpacedRepetitionForFile(this.app, activeFile, undefined, this);
            new Notice(t('spaced.initializedNotice', { title: activeFile.basename }));
          } catch (err) {
            console.error('Study Flow: Error iniciando repaso espaciado', err);
          }
        })();
        return true;
      },
    });

    this.addCommand({
      id: 'migrate-pomodoro-logs',
      name: t('commands.migratePomodoroLogs'),
      callback: async () => {
        try {
          const { scanVaultForPomodoroLogMigrations } = await import('./storage-migration.ts');
          const { PomodoroLogMigrationModal } = await import('./pomodoro-migration-modal.ts');
          const previews = await scanVaultForPomodoroLogMigrations(this.app);
          new PomodoroLogMigrationModal(this.app, previews).open();
        } catch (err) {
          console.error('Study Flow: Error escaneando registros de Pomodoro para migración', err);
          new Notice(t('migration.errorNotice'));
        }
      },
    });

    this.addCommand({
      id: 'export-calendar-ics',
      name: t('commands.exportCalendarIcs'),
      callback: async () => {
        try {
          const outPath = await exportStudyFlowIcsFile(this.app, this);
          new Notice(t('ics.exportedNotice', { path: outPath }));
        } catch (err) {
          console.error('Study Flow: Error exportando calendario a .ics', err);
          new Notice(t('ics.exportErrorNotice'));
        }
      },
    });

    // Register Obsidian Protocol Handler: obsidian://study-flow?action=...
    this.registerObsidianProtocolHandler('study-flow', async (params) => {
      await handleStudyFlowProtocol(this, params as Record<string, string>);
    });

    // Add Settings Tab
    this.addSettingTab(new StudyFlowSettingTab(this.app, this));
  }

  onunload(): void {
    if (this.pomodoro) {
      this.pomodoro.destroy();
    }
    if (this.zen) {
      this.zen.destroy();
    }
    if (this.taskIndex) {
      this.taskIndex.destroy();
    }
  }

  async activateView(inTab: boolean = true, defaultTab?: ActiveTab): Promise<void> {
    const { workspace } = this.app;
    const existingLeaves = workspace.getLeavesOfType(VIEW_TYPE_STUDY_FLOW);

    let targetLeaf: WorkspaceLeaf | null = null;

    if (inTab) {
      // Find if already open in the center workspace (rootSplit)
      const tabLeaf = existingLeaves.find((l) => l.getRoot() === workspace.rootSplit);
      if (tabLeaf) {
        targetLeaf = tabLeaf;
      } else {
        // Detach existing sidebar leaves to transition smoothly to a full tab
        if (existingLeaves.length > 0) {
          existingLeaves.forEach((l) => l.detach());
        }
        targetLeaf = workspace.getLeaf('tab');
        await targetLeaf.setViewState({
          type: VIEW_TYPE_STUDY_FLOW,
          active: true,
        });
      }
    } else {
      // Open or reveal in sidebar
      const sideLeaf = existingLeaves.find((l) => l.getRoot() !== workspace.rootSplit);
      if (sideLeaf) {
        targetLeaf = sideLeaf;
      } else {
        if (existingLeaves.length > 0) {
          existingLeaves.forEach((l) => l.detach());
        }
        const rightLeaf = workspace.getRightLeaf(false);
        if (rightLeaf) {
          await rightLeaf.setViewState({
            type: VIEW_TYPE_STUDY_FLOW,
            active: true,
          });
          targetLeaf = rightLeaf;
        }
      }
    }

    if (targetLeaf) {
      workspace.setActiveLeaf(targetLeaf, { focus: true });
      workspace.revealLeaf(targetLeaf);
      if (defaultTab && targetLeaf.view instanceof StudyFlowView) {
        await targetLeaf.view.setActiveTab(defaultTab);
      }
    }
  }

  async openCalendarTomorrow(showPendingSelector: boolean = true): Promise<void> {
    await this.activateView(true, 'calendar');
    const leaves = this.app.workspace.getLeavesOfType(VIEW_TYPE_STUDY_FLOW);
    const leaf = leaves.find((l) => l.getRoot() === this.app.workspace.rootSplit) || leaves[0];
    if (leaf && leaf.view instanceof StudyFlowView) {
      await leaf.view.openTomorrowWithPlanner();
    }
  }

  async loadSettings(): Promise<void> {
    const rawData = await this.loadData();
    const isFirstInstall = !rawData || Object.keys(rawData).length === 0;
    const effectiveLang = getEffectiveLanguage();
    const defaults = cloneDefaultSettings(isFirstInstall ? effectiveLang : undefined);
    const loadedData = rawData || {};
    this.settings = Object.assign({}, defaults, loadedData);

    const userLang = loadedData.language === 'en' ? 'en' : (loadedData.language === 'es' ? 'es' : effectiveLang);
    const langConventions = getDefaultConventions(userLang);

    if (!this.settings.timeBlocksSectionHeader) {
      this.settings.timeBlocksSectionHeader = langConventions.timeBlocksSectionHeader;
    }
    if (!this.settings.spacedRepetitionTag) {
      this.settings.spacedRepetitionTag = langConventions.spacedRepetitionTag;
    }
    if (!this.settings.spacedRepetitionNextKey) {
      this.settings.spacedRepetitionNextKey = langConventions.spacedRepetitionNextKey;
    }
    if (!this.settings.spacedRepetitionIntervalKey) {
      this.settings.spacedRepetitionIntervalKey = langConventions.spacedRepetitionIntervalKey;
    }
    if (!this.settings.spacedRepetitionReviewedKey) {
      this.settings.spacedRepetitionReviewedKey = langConventions.spacedRepetitionReviewedKey;
    }

    if (Array.isArray(loadedData.taskIncludedFolders)) {
      this.settings.taskIncludedFolders = [...loadedData.taskIncludedFolders];
    } else {
      this.settings.taskIncludedFolders = [...defaults.taskIncludedFolders];
    }

    if (Array.isArray(loadedData.taskExcludedFolders)) {
      this.settings.taskExcludedFolders = [...loadedData.taskExcludedFolders];
    } else {
      this.settings.taskExcludedFolders = [...defaults.taskExcludedFolders];
    }

    if (Array.isArray(loadedData.subjects)) {
      this.settings.subjects = loadedData.subjects.map((sub: unknown) => ({ ...(sub as object) } as import('./settings-utils').Subject));
    } else {
      this.settings.subjects = [];
    }

    if (!this.settings.weeklyReviewsFolder) {
      this.settings.weeklyReviewsFolder = defaults.weeklyReviewsFolder;
    }
    if (!this.settings.weeklyReviewTemplate) {
      this.settings.weeklyReviewTemplate = defaults.weeklyReviewTemplate;
    }
  }

  async saveSettings(): Promise<void> {
    await this.saveData(this.settings);
  }
}
