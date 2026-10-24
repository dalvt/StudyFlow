import { App } from 'obsidian';
import type StudyFlowPlugin from '../main';
import type { TabComponent } from './types';
import { renderAnalyticsDashboard } from '../analytics-ui.ts';

export class AnalyticsTab implements TabComponent {
  private app: App;
  private plugin: StudyFlowPlugin;
  private container: HTMLElement | null = null;
  private isRendering = false;
  private pendingRender = false;
  public activeRange: 'total' | 'week' = 'total';

  constructor(app: App, plugin: StudyFlowPlugin) {
    this.app = app;
    this.plugin = plugin;
  }

  async render(container: HTMLElement): Promise<void> {
    this.container = container;
    if (this.isRendering) {
      this.pendingRender = true;
      return;
    }

    this.isRendering = true;
    try {
      await renderAnalyticsDashboard(
        container,
        this.app,
        this.plugin,
        async () => {
          if (this.container) {
            await this.render(this.container);
          }
        },
        {
          activeRange: this.activeRange,
          onRangeChange: (range: 'total' | 'week') => {
            this.activeRange = range;
          },
        }
      );
    } finally {
      this.isRendering = false;
      if (this.pendingRender) {
        this.pendingRender = false;
        if (this.container) {
          void this.render(this.container);
        }
      }
    }
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
    this.isRendering = false;
    this.pendingRender = false;
  }
}
