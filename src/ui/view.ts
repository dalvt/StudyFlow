import { ItemView, Platform, setIcon, setTooltip, ViewStateResult, WorkspaceLeaf } from 'obsidian';
import type StudyFlowPlugin from '../main';
import type { ActiveTab, TabComponent } from './types';
import { TodayTab } from './today-tab';
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
  private activeTab: ActiveTab = 'today';

  // Sub-tabs
  public todayTab: TodayTab;
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

    this.todayTab = new TodayTab(this.app, this.plugin, (tab) => {
      void this.setActiveTab(tab);
    });
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
      today: this.todayTab,
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
    return t('view.title');
  }

  getIcon(): string {
    return 'clock';
  }

  getState(): Record<string, unknown> {
    return {
      activeTab: this.activeTab,
    };
  }

  async setState(state: unknown, result: ViewStateResult): Promise<void> {
    await super.setState(state, result);
    const typedState = state as { activeTab?: ActiveTab } | undefined;
    if (typedState?.activeTab && this.tabComponents[typedState.activeTab]) {
      this.activeTab = typedState.activeTab;
      if (this.navButtons.size > 0) {
        await this.switchTab(typedState.activeTab);
      }
    }
  }

  async onOpen(): Promise<void> {
    const { containerEl } = this;
    containerEl.empty();
    containerEl.addClass('study-flow-view-root');

    this.buildShell();

    // Activate default tab
    await this.switchTab(this.activeTab);

    // Reactive subscriptions (incremental updates without full renderView)
    this.unsubscribePomodoro = this.plugin.pomodoro.subscribe((status) => {
      this.pomodoroTab.updateClock();
      this.todayTab.onPomodoroTick(status);
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
          await this.todayTab.onHabitsChanged();
          if (this.activeTab === 'analytics') {
            await this.analyticsTab.refresh();
          }
        }
      })
    );

    this.registerEvent(
      (this.app.workspace as any).on('study-flow:focus-session-recorded', async () => {
        if (this.activeTab === 'analytics') {
          await this.analyticsTab.refresh();
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
    const isMainTab = this.leaf.getRoot() === this.app.workspace.rootSplit;
    const rootWrapper = this.containerEl.createDiv({
      cls: `study-flow-container ${!isMainTab ? 'is-in-sidebar' : ''} ${Platform.isMobile ? 'is-mobile' : ''}`,
    });

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

    if (!isMainTab) {
      const expandBtn = headerActions.createEl('button', {
        cls: 'study-flow-expand-tab-btn clickable-icon',
        attr: { 'aria-label': t('view.fullTab') },
      });
      const expIcon = expandBtn.createSpan();
      setIcon(expIcon, 'maximize-2');
      expandBtn.createSpan({ text: t('view.fullTab') });
      expandBtn.addEventListener('click', async () => {
        await this.plugin.activateView(true);
      });
    } else {
      const dockBtn = headerActions.createEl('button', {
        cls: 'study-flow-header-icon-btn clickable-icon',
        attr: { 'aria-label': t('view.moveToSidebar') },
      });
      setIcon(dockBtn, 'panel-right');
      dockBtn.addEventListener('click', async () => {
        await this.plugin.activateView(false);
      });
    }

    const refreshBtn = headerActions.createEl('button', {
      cls: 'study-flow-header-icon-btn clickable-icon',
      attr: { 'aria-label': t('view.reloadView') },
    });
    setIcon(refreshBtn, 'rotate-cw');
    refreshBtn.addEventListener('click', async () => {
      const currentContainer = this.tabContainers.get(this.activeTab);
      if (currentContainer) {
        await this.tabComponents[this.activeTab].render(currentContainer);
      }
    });

    // Navigation Tab Bar (role="tablist")
    const navBar = rootWrapper.createDiv({
      cls: 'study-flow-segmented-nav',
      attr: {
        role: 'tablist',
        'aria-label': t('view.navigationAria'),
      },
    });

    const tabsConfig: Array<{ id: ActiveTab; label: string; icon: string }> = [
      { id: 'today', label: t('tabs.today'), icon: 'sun' },
      { id: 'pomodoro', label: t('tabs.pomodoro'), icon: 'timer' },
      { id: 'tasks', label: t('tabs.tasks'), icon: 'check-square' },
      { id: 'habits', label: t('tabs.habits'), icon: 'flame' },
      { id: 'calendar', label: t('tabs.calendar'), icon: 'calendar-days' },
      { id: 'analytics', label: t('tabs.analytics'), icon: 'bar-chart-2' },
    ];

    tabsConfig.forEach((tab) => {
      const isSelected = this.activeTab === tab.id;
      const btn = navBar.createEl('button', {
        cls: `study-flow-nav-pill clickable-icon ${isSelected ? 'is-active' : ''}`,
        attr: {
          role: 'tab',
          id: `study-flow-tab-${tab.id}`,
          'aria-controls': `study-flow-panel-${tab.id}`,
          'aria-selected': isSelected ? 'true' : 'false',
          tabindex: isSelected ? '0' : '-1',
          'aria-label': tab.label,
        },
      });
      setTooltip(btn, tab.label);
      const iconSpan = btn.createSpan({ cls: 'study-flow-nav-pill-icon' });
      setIcon(iconSpan, tab.icon);
      btn.createSpan({ text: tab.label, cls: 'study-flow-nav-pill-label' });

      btn.addEventListener('click', async () => {
        await this.switchTab(tab.id);
      });

      this.navButtons.set(tab.id, btn);
    });

    // Arrow keys & Home/End navigation on tablist
    navBar.addEventListener('keydown', async (e: KeyboardEvent) => {
      const tabIds = tabsConfig.map((t) => t.id);
      const currentIndex = tabIds.indexOf(this.activeTab);
      let targetIndex = -1;

      if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
        e.preventDefault();
        targetIndex = (currentIndex + 1) % tabIds.length;
      } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
        e.preventDefault();
        targetIndex = (currentIndex - 1 + tabIds.length) % tabIds.length;
      } else if (e.key === 'Home') {
        e.preventDefault();
        targetIndex = 0;
      } else if (e.key === 'End') {
        e.preventDefault();
        targetIndex = tabIds.length - 1;
      }

      if (targetIndex !== -1) {
        const nextTab = tabIds[targetIndex];
        await this.switchTab(nextTab);
        const targetBtn = this.navButtons.get(nextTab);
        targetBtn?.focus();
      }
    });

    // Persistent Content Container Body
    const contentBody = rootWrapper.createDiv({ cls: 'study-flow-tab-body' });

    // Create a container for each tab (role="tabpanel")
    tabsConfig.forEach((tab) => {
      const isSelected = this.activeTab === tab.id;
      const tabContainer = contentBody.createDiv({
        cls: `study-flow-tab-content study-flow-tab-${tab.id} ${isSelected ? '' : 'is-hidden'}`,
        attr: {
          role: 'tabpanel',
          id: `study-flow-panel-${tab.id}`,
          'aria-labelledby': `study-flow-tab-${tab.id}`,
          tabindex: '0',
        },
      });
      this.tabContainers.set(tab.id, tabContainer);
      this.tabRendered.set(tab.id, false);
    });
  }

  private async switchTab(tab: ActiveTab): Promise<void> {
    this.activeTab = tab;

    // Update nav pills
    this.navButtons.forEach((btn, id) => {
      const isSelected = id === tab;
      btn.toggleClass('is-active', isSelected);
      btn.setAttribute('aria-selected', isSelected ? 'true' : 'false');
      btn.tabIndex = isSelected ? 0 : -1;
    });

    // Toggle container visibility without destroying DOM state
    for (const [id, container] of this.tabContainers.entries()) {
      const isSelected = id === tab;
      container.toggleClass('is-hidden', !isSelected);
      if (isSelected) {
        if (!this.tabRendered.get(id)) {
          await this.tabComponents[id].render(container);
          this.tabRendered.set(id, true);
        } else if (id === 'analytics') {
          await this.analyticsTab.refresh();
        }
      }
    }
  }

  private handleTaskIndexChanged(): void {
    // Incrementally notify components without destroying active view or tab state
    this.todayTab.onTasksChanged();
    this.tasksTab.onTasksChanged();
    this.calendarTab.onTasksChanged();
    this.analyticsTab.onTasksChanged();
    this.pomodoroTab.onTasksChanged();
  }
}
