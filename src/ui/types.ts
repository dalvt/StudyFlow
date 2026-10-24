export type ActiveTab = 'today' | 'pomodoro' | 'tasks' | 'habits' | 'calendar' | 'analytics';

export interface StudyFlowViewHost {
  switchTab(tab: ActiveTab, options?: { taskView?: 'today' | 'upcoming' | 'subjects' }): void | Promise<void>;
  openTasksUpcoming?(): void | Promise<void>;
}

export interface TabComponent {
  render(container: HTMLElement): void | Promise<void>;
  destroy(): void;
}
