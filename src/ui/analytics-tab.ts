import { App } from 'obsidian';
import type StudyFlowPlugin from '../main';
import type { TabComponent } from './types';
import { renderAnalyticsDashboard } from '../analytics-ui';

export class AnalyticsTab implements TabComponent {
  private app: App;
  private plugin: StudyFlowPlugin;
  private container: HTMLElement | null = null;

  constructor(app: App, plugin: StudyFlowPlugin) {
    this.app = app;
    this.plugin = plugin;
  }

  async render(container: HTMLElement): Promise<void> {
    this.container = container;
    container.empty();

    await renderAnalyticsDashboard(container, this.app, this.plugin, async () => {
      if (this.container) {
        await this.render(this.container);
      }
    });
  }

  public async refresh(): Promise<void> {
    if (this.container) {
      await this.render(this.container);
    }
  }

  public onTasksChanged(): void {
    if (this.container) {
      void this.render(this.container);
    }
  }

  destroy(): void {
    this.container = null;
  }
}
