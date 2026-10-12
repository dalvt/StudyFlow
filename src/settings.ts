import { App, PluginSettingTab, Setting } from 'obsidian';
import type StudyFlowPlugin from './main';

export interface StudyFlowSettings {
  pomodoroWorkDuration: number;
  pomodoroBreakDuration: number;
  dailyNotesFolder: string;
  dailyNoteDateFormat: string;
  inboxFilePath: string;
  logPomodoroToDailyNote: boolean;
}

export const DEFAULT_SETTINGS: StudyFlowSettings = {
  pomodoroWorkDuration: 25,
  pomodoroBreakDuration: 5,
  dailyNotesFolder: 'Daily',
  dailyNoteDateFormat: 'YYYY-MM-DD',
  inboxFilePath: 'Inbox.md',
  logPomodoroToDailyNote: true,
};

export class StudyFlowSettingTab extends PluginSettingTab {
  plugin: StudyFlowPlugin;

  constructor(app: App, plugin: StudyFlowPlugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();

    containerEl.createEl('h2', { text: 'Study Flow Assistant — Ajustes' });

    // Pomodoro section
    containerEl.createEl('h3', { text: 'Pomodoro' });

    new Setting(containerEl)
      .setName('Duración de trabajo (minutos)')
      .setDesc('Minutos asignados para cada sesión de enfoque.')
      .addText((text) =>
        text
          .setPlaceholder('25')
          .setValue(String(this.plugin.settings.pomodoroWorkDuration))
          .onChange(async (value) => {
            const parsed = parseInt(value, 10);
            if (!isNaN(parsed) && parsed > 0) {
              this.plugin.settings.pomodoroWorkDuration = parsed;
              await this.plugin.saveSettings();
              this.plugin.pomodoro.onSettingsUpdated();
            }
          })
      );

    new Setting(containerEl)
      .setName('Duración de descanso (minutos)')
      .setDesc('Minutos asignados para el descanso tras completar una sesión.')
      .addText((text) =>
        text
          .setPlaceholder('5')
          .setValue(String(this.plugin.settings.pomodoroBreakDuration))
          .onChange(async (value) => {
            const parsed = parseInt(value, 10);
            if (!isNaN(parsed) && parsed > 0) {
              this.plugin.settings.pomodoroBreakDuration = parsed;
              await this.plugin.saveSettings();
              this.plugin.pomodoro.onSettingsUpdated();
            }
          })
      );

    new Setting(containerEl)
      .setName('Registrar Pomodoro automáticamente')
      .setDesc('Registra "- [x] Pomodoro completado a las HH:mm" en la nota diaria de hoy.')
      .addToggle((toggle) =>
        toggle
          .setValue(this.plugin.settings.logPomodoroToDailyNote)
          .onChange(async (value) => {
            this.plugin.settings.logPomodoroToDailyNote = value;
            await this.plugin.saveSettings();
          })
      );

    // Daily Notes & Inbox section
    containerEl.createEl('h3', { text: 'Notas Diarias e Inbox' });

    new Setting(containerEl)
      .setName('Carpeta de Notas Diarias')
      .setDesc('Ruta relativa donde se almacenan las notas diarias (ej. Daily).')
      .addText((text) =>
        text
          .setPlaceholder('Daily')
          .setValue(this.plugin.settings.dailyNotesFolder)
          .onChange(async (value) => {
            this.plugin.settings.dailyNotesFolder = value.trim();
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName('Formato de fecha de la Nota Diaria')
      .setDesc('Formato de fecha compatible con Moment.js (por defecto: YYYY-MM-DD).')
      .addText((text) =>
        text
          .setPlaceholder('YYYY-MM-DD')
          .setValue(this.plugin.settings.dailyNoteDateFormat)
          .onChange(async (value) => {
            this.plugin.settings.dailyNoteDateFormat = value.trim() || 'YYYY-MM-DD';
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName('Ruta de archivo Inbox')
      .setDesc('Ruta del archivo Markdown para capturas rápidas (por defecto: Inbox.md).')
      .addText((text) =>
        text
          .setPlaceholder('Inbox.md')
          .setValue(this.plugin.settings.inboxFilePath)
          .onChange(async (value) => {
            this.plugin.settings.inboxFilePath = value.trim() || 'Inbox.md';
            await this.plugin.saveSettings();
          })
      );
  }
}
