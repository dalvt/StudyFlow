import { App, Modal } from 'obsidian';
import type StudyFlowPlugin from './main';
import { renderAnalyticsDashboard } from './analytics-ui';

export class AnalyticsModal extends Modal {
  private plugin: StudyFlowPlugin;

  constructor(app: App, plugin: StudyFlowPlugin) {
    super(app);
    this.plugin = plugin;
  }

  async onOpen(): Promise<void> {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.addClass('study-flow-modal', 'study-flow-analytics-modal');

    await renderAnalyticsDashboard(contentEl, this.app, this.plugin, async () => {
      await renderAnalyticsDashboard(contentEl, this.app, this.plugin);
    });
  }

  onClose(): void {
    const { contentEl } = this;
    contentEl.empty();
  }
}
