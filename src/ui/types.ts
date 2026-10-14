import type { App } from 'obsidian';
import type StudyFlowPlugin from '../main';

export type ActiveTab = 'today' | 'pomodoro' | 'tasks' | 'habits' | 'calendar' | 'analytics';

export interface TabComponent {
  render(container: HTMLElement): void | Promise<void>;
  destroy(): void;
}
