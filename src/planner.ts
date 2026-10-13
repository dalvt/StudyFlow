import { App, Modal } from 'obsidian';
import type StudyFlowPlugin from './main';

export class NextDayPlannerModal extends Modal {
  private plugin: StudyFlowPlugin;

  constructor(app: App, plugin: StudyFlowPlugin) {
    super(app);
    this.plugin = plugin;
  }

  onOpen(): void {
    this.close();
    void this.plugin.openCalendarTomorrow(true);
  }
}
