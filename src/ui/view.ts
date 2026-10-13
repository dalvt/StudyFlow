import { ItemView, setIcon, WorkspaceLeaf } from 'obsidian';
import type StudyFlowPlugin from '../main';
import type { ActiveTab, TabComponent } from './types';
import { PomodoroTab } from './pomodoro-tab';
import { TasksTab } from './tasks-tab';
import { HabitsTab } from './habits-tab';
import { CalendarTab } from './calendar-tab';
import { AnalyticsTab } from './analytics-tab';
import { t } from '../i18n/index.ts';

export const VIEW_TYPE_STUDY_FLOW = 'study-flow-view';
export type { ActiveTab, TabComponent };
export { PromptModal } from './prompt-modal';

export class StudyFlowView extends ItemView {
  private plugin: StudyFlowPlugin;
  private activeTab: ActiveTab = 'pomodoro';

  // Sub-tabs
  public pomodoroTab: PomodoroTab;
  public tasksTab: TasksTab;
  public habitsTab: HabitsTab;
  public calendarTab: CalendarTab;
  public analyticsTab: AnalyticsTab;

  private tabComponents: Record<ActiveTab, TabComponent>;
  private tabContainers: Map<ActiveTab, HTMLElement> = new Map();
  private tabRendered: Map<ActiveTab, boolean> = new Map();
  private navButtons: Map<ActiveTab, HTMLElement> = new Map();

  private unsubscribePomodoro: (() => void) | null = null;
  private unsubscribeTaskIndex: (() => void) | null = null;

  constructor(leaf: WorkspaceLeaf, plugin: StudyFlowPlugin) {
    super(leaf);
    this.plugin = plugin;

    this.pomodoroTab = new PomodoroTab(this.app, this.plugin);
    this.tasksTab = new TasksTab(this.app, this.plugin, (tab) => {
      void this.setActiveTab(tab);
    });
    this.habitsTab = new HabitsTab(this.app, this.plugin);
    this.calendarTab = new CalendarTab(this.app, this.plugin, (tab) => {
      void this.setActiveTab(tab);
    });
    this.analyticsTab = new AnalyticsTab(this.app, this.plugin);

    this.tabComponents = {
      pomodoro: this.pomodoroTab,
      tasks: this.tasksTab,
      habits: this.habitsTab,
      calendar: this.calendarTab,
      analytics: this.analyticsTab,
    };
  }

  getViewType(): string {
    return VIEW_TYPE_STUDY_FLOW;
  }

  getDisplayText(): string {
    return 'Study Flow Hub';
  }

  getIcon(): string {
    return 'clock';
  }

  async onOpen(): Promise<void> {
    const { containerEl } = this;
    containerEl.empty();
    containerEl.addClass('study-flow-view-root');

    this.buildShell();

    // Activate default tab
    await this.switchTab(this.activeTab);

    // Reactive subscriptions (incremental updates without full renderView)
    this.unsubscribePomodoro = this.plugin.pomodoro.subscribe(() => {
      this.pomodoroTab.updateClock();
    });

    if (this.plugin.taskIndex) {
      this.unsubscribeTaskIndex = this.plugin.taskIndex.onChange(() => {
        this.handleTaskIndexChanged();
      });
    }

    this.registerEvent(
      this.app.vault.on('modify', async (file) => {
        const habitsPath = this.plugin.settings.habitsFilePath || 'StudyFlow/Habits.md';
        if (file.path === habitsPath) {
          await this.habitsTab.onHabitsModified();
        }
      })
    );
  }

  async onClose(): Promise<void> {
    if (this.unsubscribePomodoro) {
      this.unsubscribePomodoro();
      this.unsubscribePomodoro = null;
    }
    if (this.unsubscribeTaskIndex) {
      this.unsubscribeTaskIndex();
      this.unsubscribeTaskIndex = null;
    }

    Object.values(this.tabComponents).forEach((tab) => tab.destroy());
    this.tabContainers.clear();
    this.tabRendered.clear();
    this.navButtons.clear();
    this.containerEl.empty();
  }

  public async setActiveTab(tab: ActiveTab): Promise<void> {
    await this.switchTab(tab);
  }

  public async openCalendarDate(dateStr: string, showPendingSelector: boolean = false): Promise<void> {
    await this.switchTab('calendar');
    await this.calendarTab.openDate(dateStr, showPendingSelector);
  }

  public async openTomorrowWithPlanner(): Promise<void> {
    await this.switchTab('calendar');
    await this.calendarTab.openTomorrowWithPlanner();
  }

  private buildShell(): void {
    const rootWrapper = this.containerEl.createDiv({ cls: 'study-flow-container' });

    // Top Brand Header
    const brandRow = rootWrapper.createDiv({ cls: 'study-flow-brand-header' });
    const brandTitle = brandRow.createDiv({ cls: 'study-flow-brand-title' });
    const brandIconBox = brandTitle.createSpan({ cls: 'study-flow-brand-icon-box' });
    const brandIcon = brandIconBox.createSpan();
    setIcon(brandIcon, 'sparkles');
    brandTitle.createSpan({ text: 'Study Flow', cls: 'study-flow-brand-text' });
    brandTitle.createSpan({ text: 'Hub', cls: 'study-flow-brand-sub' });

    // Header Action Buttons
    const headerActions = brandRow.createDiv({ cls: 'study-flow-header-actions' });
    const isMainTab = this.leaf.getRoot() === this.app.workspace.rootSplit;

    if (!isMainTab) {
      const expandBtn = headerActions.createEl('button', {
        cls: 'study-flow-expand-tab-btn',
      });
      const expIcon = expandBtn.createSpan();
      setIcon(expIcon, 'maximize-2');
      expandBtn.createSpan({ text: t('view.fullTab') });
      expandBtn.addEventListener('click', async () => {
        await this.plugin.activateView(true);
      });
    } else {
      const dockBtn = headerActions.createEl('button', {
        cls: 'study-flow-header-icon-btn',
        attr: { 'aria-label': t('view.moveToSidebar') },
      });
      setIcon(dockBtn, 'panel-right');
      dockBtn.addEventListener('click', async () => {
        await this.plugin.activateView(false);
      });
    }

    const refreshBtn = headerActions.createEl('button', {
      cls: 'study-flow-header-icon-btn',
      attr: { 'aria-label': t('view.reloadView') },
    });
    setIcon(refreshBtn, 'rotate-cw');
    refreshBtn.addEventListener('click', async () => {
      const currentContainer = this.tabContainers.get(this.activeTab);
      if (currentContainer) {
        await this.tabComponents[this.activeTab].render(currentContainer);
      }
    });

    // Navigation Tab Bar with 5 tabs
    const navBar = rootWrapper.createDiv({ cls: 'study-flow-segmented-nav' });

    const tabsConfig: Array<{ id: ActiveTab; label: string; icon: string }> = [
      { id: 'pomodoro', label: t('tabs.pomodoro'), icon: 'timer' },
      { id: 'tasks', label: t('tabs.tasks'), icon: 'check-square' },
      { id: 'habits', label: t('tabs.habits'), icon: 'flame' },
      { id: 'calendar', label: t('tabs.calendar'), icon: 'calendar-days' },
      { id: 'analytics', label: t('tabs.analytics'), icon: 'bar-chart-2' },
    ];

    tabsConfig.forEach((tab) => {
      const btn = navBar.createEl('button', {
        cls: `study-flow-nav-pill ${this.activeTab === tab.id ? 'is-active' : ''}`,
        attr: { 'aria-label': tab.label },
      });
      const iconSpan = btn.createSpan({ cls: 'study-flow-nav-pill-icon' });
      setIcon(iconSpan, tab.icon);
      btn.createSpan({ text: tab.label, cls: 'study-flow-nav-pill-label' });

      btn.addEventListener('click', async () => {
        await this.switchTab(tab.id);
      });

      this.navButtons.set(tab.id, btn);
    });

    // Persistent Content Container Body
    const contentBody = rootWrapper.createDiv({ cls: 'study-flow-tab-body' });

    // Create a container for each tab to preserve DOM state across tab switches
    tabsConfig.forEach((tab) => {
      const tabContainer = contentBody.createDiv({
        cls: `study-flow-tab-content study-flow-tab-${tab.id}`,
        attr: { style: 'display: none;' },
      });
      this.tabContainers.set(tab.id, tabContainer);
      this.tabRendered.set(tab.id, false);
    });
  }

  private async switchTab(tab: ActiveTab): Promise<void> {
    this.activeTab = tab;

    // Update nav pills
    this.navButtons.forEach((btn, id) => {
      if (id === tab) {
        btn.addClass('is-active');
      } else {
        btn.removeClass('is-active');
      }
    });

    // Toggle container visibility without destroying DOM state
    for (const [id, container] of this.tabContainers.entries()) {
      if (id === tab) {
        container.style.display = '';
        if (!this.tabRendered.get(id)) {
          await this.tabComponents[id].render(container);
          this.tabRendered.set(id, true);
        }
      } else {
        container.style.display = 'none';
      }
    }
  }

  private handleTaskIndexChanged(): void {
    // Incrementally notify components without destroying active view or tab state
    this.tasksTab.onTasksChanged();
    this.calendarTab.onTasksChanged();
    this.analyticsTab.onTasksChanged();
    this.pomodoroTab.onTasksChanged();
  }
}
