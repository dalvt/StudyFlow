import {
  App,
  PluginSettingTab,
  Setting,
  Notice,
  type ButtonComponent,
  type SettingDefinitionItem,
} from 'obsidian';
import type StudyFlowPlugin from './main.ts';
import { playPomodoroSound } from './audio.ts';
import {
  cloneDefaultSettings,
  validateSettingNumber,
  type PomodoroSoundType,
  type TodayTabSectionsConfig,
  type AppSettingDefinitionItem,
  type AppSettingDefinition,
} from './settings-utils.ts';
export * from './settings-utils.ts';
import { t, setLanguage, getEffectiveLanguage } from './i18n/index.ts';
import { getDefaultConventions } from './conventions.ts';
import { SubjectEditModal } from './subject-modal.ts';
import { PromptModal } from './ui/prompt-modal.ts';

export class StudyFlowSettingTab extends PluginSettingTab {
  plugin: StudyFlowPlugin;

  constructor(app: App, plugin: StudyFlowPlugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  public async onSave(): Promise<void> {
    await this.plugin.saveSettings();
    this.refreshViews();
  }

  public refreshViews(): void {
    this.plugin.refreshViews();
  }

  public refreshTab(): void {
    const updateFn = (this as unknown as Record<string, (() => void) | undefined>)['update'];
    if (typeof updateFn === 'function') {
      updateFn.call(this);
    } else {
      const displayFn = (this as unknown as Record<string, (() => void) | undefined>)['display'];
      if (typeof displayFn === 'function') {
        displayFn.call(this);
      }
    }
  }

  private setButtonDestructive(btn: ButtonComponent): void {
    const btnObj = btn as unknown as Record<string, ((...args: unknown[]) => unknown) | undefined>;
    if (typeof btnObj['setDestructive'] === 'function') {
      btnObj['setDestructive'].call(btn);
    } else if (typeof btnObj['setWarning'] === 'function') {
      btnObj['setWarning'].call(btn);
    }
  }

  hide(): void {
    super.hide();
    this.refreshViews();
  }

  private validateNum(val: unknown, min: number, max: number, fieldName: string): string | null {
    const res = validateSettingNumber(String(val), min, max, fieldName);
    return res.valid ? null : res.error || t('settings.validationInvalid');
  }

  override getControlValue(key: string): unknown {
    if (key.startsWith('todaySections.')) {
      const subKey = key.split('.')[1] as keyof TodayTabSectionsConfig;
      return this.plugin.settings.todaySections?.[subKey] ?? true;
    }
    if (key === 'taskIncludedFolders') {
      return (this.plugin.settings.taskIncludedFolders || []).join(', ');
    }
    if (key === 'taskExcludedFolders') {
      return (this.plugin.settings.taskExcludedFolders || []).join(', ');
    }
    if (key === 'calendarStartHour' || key === 'calendarEndHour') {
      return String(this.plugin.settings[key] ?? (key === 'calendarStartHour' ? 7 : 22));
    }
    if (key === 'pomodoroSound') {
      return this.plugin.settings.pomodoroSound || 'bell';
    }
    if (key === 'weekStartDay') {
      return this.plugin.settings.weekStartDay || 'monday';
    }
    if (key === 'language') {
      return this.plugin.settings.language || 'auto';
    }
    return (this.plugin.settings as unknown as Record<string, unknown>)[key];
  }

  override async setControlValue(key: string, value: unknown): Promise<void> {
    if (key.startsWith('todaySections.')) {
      const subKey = key.split('.')[1] as keyof TodayTabSectionsConfig;
      if (!this.plugin.settings.todaySections) {
        this.plugin.settings.todaySections = {
          showNowNext: true,
          showTodayTasks: true,
          showHabits: true,
          showSpacedRepetition: true,
        };
      }
      this.plugin.settings.todaySections[subKey] = Boolean(value);
      await this.onSave();
      return;
    }

    if (key === 'taskIncludedFolders' || key === 'taskExcludedFolders') {
      const raw = typeof value === 'string' ? value : '';
      const folders = raw
        .split(',')
        .map((s) => s.trim())
        .filter((s) => s.length > 0);
      this.plugin.settings[key] = folders;
      await this.onSave();
      if (this.plugin.taskIndex) {
        await this.plugin.taskIndex.reindexAll();
      }
      return;
    }

    if (key === 'tasksSectionHeader' || key === 'iceboxSectionHeader' || key === 'timeBlocksSectionHeader') {
      const raw = typeof value === 'string' ? value.trim() : '';
      const fallback = getDefaultConventions(getEffectiveLanguage())[key];
      this.plugin.settings[key] = raw || fallback;
      await this.onSave();
      if (this.plugin.taskIndex) {
        await this.plugin.taskIndex.reindexAll();
      }
      return;
    }

    if (
      key === 'spacedRepetitionTag' ||
      key === 'spacedRepetitionNextKey' ||
      key === 'spacedRepetitionIntervalKey' ||
      key === 'spacedRepetitionReviewedKey'
    ) {
      const raw = typeof value === 'string' ? value.trim() : '';
      const fallback = getDefaultConventions(getEffectiveLanguage())[key];
      this.plugin.settings[key] = raw || fallback;
      await this.onSave();
      return;
    }

    const pathDefaults: Record<string, string> = {
      dailyNotesFolder: 'StudyFlow/Daily',
      dailyNoteDateFormat: 'YYYY-MM-DD',
      inboxFilePath: 'StudyFlow/Inbox.md',
      habitsFilePath: 'StudyFlow/Habits.md',
      scheduleFilePath: 'StudyFlow/Schedule.md',
    };

    if (key in pathDefaults) {
      const raw = typeof value === 'string' ? value.trim() : '';
      (this.plugin.settings as unknown as Record<string, unknown>)[key] = raw || pathDefaults[key];
      await this.onSave();
      if (key !== 'dailyNoteDateFormat' && this.plugin.taskIndex) {
        await this.plugin.taskIndex.reindexAll();
      }
      return;
    }

    if (key === 'calendarStartHour' || key === 'calendarEndHour') {
      const num = typeof value === 'number' ? value : parseInt(typeof value === 'string' ? value : '', 10);
      this.plugin.settings[key] = Number.isFinite(num) ? num : (key === 'calendarStartHour' ? 7 : 22);
      await this.onSave();
      return;
    }

    if (key === 'language') {
      this.plugin.settings.language = value as 'es' | 'en' | 'auto';
      setLanguage(this.plugin.settings.language);
      await this.onSave();
      this.refreshTab();
      return;
    }

    if (key === 'pomodoroSound') {
      this.plugin.settings.pomodoroSound = value as PomodoroSoundType;
      await this.onSave();
      return;
    }

    if (key === 'weekStartDay') {
      this.plugin.settings.weekStartDay = value as 'monday' | 'sunday';
      await this.onSave();
      return;
    }

    (this.plugin.settings as unknown as Record<string, unknown>)[key] = value;
    await this.onSave();

    if (key.startsWith('pomodoro')) {
      await this.plugin.pomodoro.onSettingsUpdated();
    } else if (key === 'enableSystemNotifications' && value) {
      if (typeof Notification !== 'undefined' && Notification.permission === 'default') {
        void Notification.requestPermission();
      }
    }
  }

  override getSettingDefinitions(): SettingDefinitionItem[] {
    const conventions = getDefaultConventions(getEffectiveLanguage());
    const startHourOptions: Record<string, string> = {};
    for (let h = 0; h <= 12; h++) {
      startHourOptions[String(h)] = `${String(h).padStart(2, '0')}:00`;
    }

    const endHourOptions: Record<string, string> = {};
    for (let h = 13; h <= 23; h++) {
      endHourOptions[String(h)] = `${String(h).padStart(2, '0')}:00`;
    }

    const defs: AppSettingDefinitionItem[] = [
      // 1. Pomodoro Section
      {
        type: 'group',
        heading: t('settings.headingPomodoro'),
        items: [
          {
            name: t('settings.workDurationName'),
            desc: t('settings.workDurationDesc'),
            control: {
              type: 'number',
              key: 'pomodoroWorkDuration',
              defaultValue: 25,
              min: 1,
              max: 180,
              validate: (val: unknown) => this.validateNum(val, 1, 180, t('settings.workDurationName')),
            },
          },
          {
            name: t('settings.breakDurationName'),
            desc: t('settings.breakDurationDesc'),
            control: {
              type: 'number',
              key: 'pomodoroBreakDuration',
              defaultValue: 5,
              min: 1,
              max: 60,
              validate: (val: unknown) => this.validateNum(val, 1, 60, t('settings.breakDurationName')),
            },
          },
          {
            name: t('settings.longBreakDurationName'),
            desc: t('settings.longBreakDurationDesc'),
            control: {
              type: 'number',
              key: 'pomodoroLongBreakDuration',
              defaultValue: 15,
              min: 1,
              max: 120,
              validate: (val: unknown) => this.validateNum(val, 1, 120, t('settings.longBreakDurationName')),
            },
          },
          {
            name: t('settings.longBreakIntervalName'),
            desc: t('settings.longBreakIntervalDesc'),
            control: {
              type: 'number',
              key: 'pomodoroLongBreakInterval',
              defaultValue: 4,
              min: 1,
              max: 20,
              validate: (val: unknown) => this.validateNum(val, 1, 20, t('settings.longBreakIntervalName')),
            },
          },
          {
            name: t('settings.autoStartNextPhaseName'),
            desc: t('settings.autoStartNextPhaseDesc'),
            control: { type: 'toggle', key: 'autoStartNextPhase', defaultValue: false },
          },
          {
            name: t('settings.chimeSoundName'),
            desc: t('settings.chimeSoundDesc'),
            control: { type: 'toggle', key: 'enableChimeSound', defaultValue: true },
          },
          {
            name: t('settings.soundSelectorName'),
            desc: t('settings.soundSelectorDesc'),
            control: {
              type: 'dropdown',
              key: 'pomodoroSound',
              defaultValue: 'bell',
              options: {
                bell: t('settings.soundBell'),
                soft: t('settings.soundSoft'),
                click: t('settings.soundClick'),
                silent: t('settings.soundSilent'),
              },
            },
          },
          {
            name: t('settings.chimeVolumeName'),
            desc: t('settings.chimeVolumeDesc'),
            render: (setting: Setting) => {
              setting
                .addSlider((slider) =>
                  slider
                    .setLimits(0.1, 1.0, 0.05)
                    .setValue(this.plugin.settings.chimeVolume)
                    .onChange((value) => {
                      void (async () => {
                        this.plugin.settings.chimeVolume = value;
                        await this.onSave();
                      })();
                    })
                )
                .addButton((btn) =>
                  btn
                    .setButtonText(t('settings.testSoundBtn'))
                    .setIcon('bell')
                    .onClick(() => {
                      playPomodoroSound(
                        this.plugin.settings.pomodoroSound || 'bell',
                        'work',
                        this.plugin.settings.chimeVolume
                      );
                    })
                );
            },
          },
          {
            name: t('settings.closingReviewName'),
            desc: t('settings.closingReviewDesc'),
            control: { type: 'toggle', key: 'enableSessionClosingReview', defaultValue: true },
          },
          {
            name: t('settings.breakTipsName'),
            desc: t('settings.breakTipsDesc'),
            control: { type: 'toggle', key: 'enableBreakTips', defaultValue: true },
          },
          {
            name: t('settings.logDailyNoteName'),
            desc: t('settings.logDailyNoteDesc'),
            control: { type: 'toggle', key: 'logPomodoroToDailyNote', defaultValue: true },
          },
          {
            name: t('settings.systemNotificationsName'),
            desc: t('settings.systemNotificationsDesc'),
            control: { type: 'toggle', key: 'enableSystemNotifications', defaultValue: false },
          },
        ],
      },

      // 2. Tareas Section
      {
        type: 'group',
        heading: t('settings.headingTasks'),
        items: [
          {
            name: t('settings.tasksHeaderName'),
            desc: t('settings.tasksHeaderDesc'),
            control: { type: 'text', key: 'tasksSectionHeader', placeholder: conventions.tasksSectionHeader },
          },
          {
            name: t('settings.iceboxHeaderName'),
            desc: t('settings.iceboxHeaderDesc'),
            control: { type: 'text', key: 'iceboxSectionHeader', placeholder: conventions.iceboxSectionHeader },
          },
          {
            name: t('settings.timeBlocksHeaderName'),
            desc: t('settings.timeBlocksHeaderDesc'),
            control: { type: 'text', key: 'timeBlocksSectionHeader', placeholder: conventions.timeBlocksSectionHeader },
          },
          {
            name: t('settings.includedFoldersName'),
            desc: t('settings.includedFoldersDesc'),
            control: { type: 'text', key: 'taskIncludedFolders', placeholder: t('settings.includedFoldersPlaceholder') },
          },
          {
            name: t('settings.excludedFoldersName'),
            desc: t('settings.excludedFoldersDesc'),
            control: { type: 'text', key: 'taskExcludedFolders', placeholder: 'Templates, templates' },
          },
        ],
      },

      // 3. Notas Section
      {
        type: 'group',
        heading: t('settings.headingNotes'),
        items: [
          {
            name: t('settings.dailyNotesFolderName'),
            desc: t('settings.dailyNotesFolderDesc'),
            control: { type: 'folder', key: 'dailyNotesFolder', placeholder: 'StudyFlow/Daily' },
          },
          {
            name: t('settings.dailyNoteFormatName'),
            desc: t('settings.dailyNoteFormatDesc'),
            control: { type: 'text', key: 'dailyNoteDateFormat', placeholder: 'YYYY-MM-DD' },
          },
          {
            name: t('settings.inboxFilePathName'),
            desc: t('settings.inboxFilePathDesc'),
            control: { type: 'file', key: 'inboxFilePath', placeholder: 'StudyFlow/Inbox.md' },
          },
        ],
      },

      // 4. Hábitos Section
      {
        type: 'group',
        heading: t('settings.headingHabits'),
        items: [
          {
            name: t('settings.habitsFilePathName'),
            desc: t('settings.habitsFilePathDesc'),
            control: { type: 'file', key: 'habitsFilePath', placeholder: 'StudyFlow/Habits.md' },
          },
        ],
      },

      // 5. Apariencia y Calendario Section
      {
        type: 'group',
        heading: t('settings.headingAppearance'),
        items: [
          {
            name: t('settings.weekStartName'),
            desc: t('settings.weekStartDesc'),
            control: {
              type: 'dropdown',
              key: 'weekStartDay',
              defaultValue: 'monday',
              options: {
                monday: t('settings.weekStartMonday'),
                sunday: t('settings.weekStartSunday'),
              },
            },
          },
          {
            name: t('settings.startHourName'),
            desc: t('settings.startHourDesc'),
            control: {
              type: 'dropdown',
              key: 'calendarStartHour',
              defaultValue: '7',
              options: startHourOptions,
            },
          },
          {
            name: t('settings.endHourName'),
            desc: t('settings.endHourDesc'),
            control: {
              type: 'dropdown',
              key: 'calendarEndHour',
              defaultValue: '22',
              options: endHourOptions,
            },
          },
          {
            name: t('settings.scheduleFilePathName'),
            desc: t('settings.scheduleFilePathDesc'),
            control: { type: 'file', key: 'scheduleFilePath', placeholder: 'StudyFlow/Schedule.md' },
          },
          {
            name: t('settings.autoZenName'),
            desc: t('settings.autoZenDesc'),
            control: { type: 'toggle', key: 'autoZenMode', defaultValue: false },
          },
        ],
      },

      // 6. Materias (Cursos) Section
      {
        type: 'group',
        heading: t('subjects.headingSettings'),
        items: [
          {
            name: t('subjects.headingSettings'),
            desc: t('subjects.descSettings'),
            render: (_setting: Setting) => {
              this.renderSubjectsSection(this.containerEl);
            },
          },
        ],
      },

      // 7. Avanzado e Idioma Section
      {
        type: 'group',
        heading: t('settings.headingAdvanced'),
        items: [
          {
            name: t('settings.languageName'),
            desc: t('settings.languageDesc'),
            control: {
              type: 'dropdown',
              key: 'language',
              defaultValue: 'auto',
              options: {
                auto: t('settings.langAuto'),
                es: t('settings.langEs'),
                en: t('settings.langEn'),
              },
            },
          },
        ],
      },

      // 8. Repetición Espaciada Section
      {
        type: 'group',
        heading: t('settings.headingSpacedRepetition'),
        items: [
          {
            name: t('settings.spacedTagName'),
            desc: t('settings.spacedTagDesc'),
            control: { type: 'text', key: 'spacedRepetitionTag', placeholder: conventions.spacedRepetitionTag },
          },
          {
            name: t('settings.spacedNextKeyName'),
            desc: t('settings.spacedNextKeyDesc'),
            control: { type: 'text', key: 'spacedRepetitionNextKey', placeholder: conventions.spacedRepetitionNextKey },
          },
          {
            name: t('settings.spacedIntervalKeyName'),
            desc: t('settings.spacedIntervalKeyDesc'),
            control: { type: 'text', key: 'spacedRepetitionIntervalKey', placeholder: conventions.spacedRepetitionIntervalKey },
          },
          {
            name: t('settings.spacedReviewedKeyName'),
            desc: t('settings.spacedReviewedKeyDesc'),
            control: { type: 'text', key: 'spacedRepetitionReviewedKey', placeholder: conventions.spacedRepetitionReviewedKey },
          },
        ],
      },

      // 9. Mantenimiento y Migración
      {
        type: 'group',
        heading: t('settings.headingMaintenance'),
        items: [
          {
            name: t('settings.syncHistoryName'),
            desc: t('settings.syncHistoryDesc'),
            render: (setting: Setting) => {
              setting.addButton((btn) =>
                btn
                  .setButtonText(t('settings.syncNowBtn'))
                  .onClick(async () => {
                    const { syncHistoricalSessionsFromVault } = await import('./storage-migration.ts');
                    const count = await syncHistoricalSessionsFromVault(this.app, this.plugin.settings, this.plugin);
                    new Notice(t('settings.syncHistoryNotice', { count }));
                  })
              );
            },
          },
        ],
      },

      // 10. Secciones de Hoy y Restablecimiento
      {
        type: 'group',
        heading: t('settings.headingTodayTab'),
        items: [
          {
            name: t('settings.todaySectionNowNextName'),
            desc: t('settings.todaySectionNowNextDesc'),
            control: { type: 'toggle', key: 'todaySections.showNowNext', defaultValue: true },
          },
          {
            name: t('settings.todaySectionTodayTasksName'),
            desc: t('settings.todaySectionTodayTasksDesc'),
            control: { type: 'toggle', key: 'todaySections.showTodayTasks', defaultValue: true },
          },
          {
            name: t('settings.todaySectionHabitsName'),
            desc: t('settings.todaySectionHabitsDesc'),
            control: { type: 'toggle', key: 'todaySections.showHabits', defaultValue: true },
          },
          {
            name: t('settings.todaySectionSpacedRepetitionName'),
            desc: t('settings.todaySectionSpacedRepetitionDesc'),
            control: { type: 'toggle', key: 'todaySections.showSpacedRepetition', defaultValue: true },
          },
          {
            name: t('settings.resetDefaultsName'),
            desc: t('settings.resetDefaultsDesc'),
            render: (setting: Setting) => {
              setting.addButton((btn) => {
                this.setButtonDestructive(btn);
                btn
                  .setButtonText(t('settings.resetValuesBtn'))
                  .onClick(() => {
                    void (async () => {
                      const effectiveLang =
                        this.plugin.settings.language === 'en'
                          ? 'en'
                          : this.plugin.settings.language === 'es'
                            ? 'es'
                            : getEffectiveLanguage();
                      this.plugin.settings = cloneDefaultSettings(effectiveLang);
                      setLanguage(this.plugin.settings.language);
                      await this.onSave();
                      await this.plugin.pomodoro.onSettingsUpdated();
                      new Notice(t('settings.resetDefaultsNotice'));
                      this.refreshTab();
                    })();
                  });
              });
            },
          },
        ],
      },
    ];
    return defs as unknown as SettingDefinitionItem[];
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();

    const defs = this['getSettingDefinitions']() as unknown as AppSettingDefinitionItem[];
    for (const group of defs) {
      if ('heading' in group && group.heading) {
        if (group.heading === t('subjects.headingSettings')) {
          this.renderSubjectsSection(containerEl);
          continue;
        }

        new Setting(containerEl).setName(group.heading).setHeading();

        if (Array.isArray(group.items)) {
          for (const item of group.items) {
            this.renderSettingItem(containerEl, item);
          }
        }

        if (group.heading === t('settings.headingPomodoro')) {
          this.renderPresetsSection(containerEl);
        }
      } else if (!('items' in group)) {
        this.renderSettingItem(containerEl, group);
      }
    }
  }

  private renderSettingItem(containerEl: HTMLElement, def: AppSettingDefinition): void {
    if (!def) return;

    if (typeof def.visible === 'function' ? !def.visible() : def.visible === false) {
      return;
    }

    if (typeof def.render === 'function') {
      const setting = new Setting(containerEl);
      if (def.name) setting.setName(def.name);
      if (def.desc) setting.setDesc(def.desc);
      def.render(setting);
      return;
    }

    if (typeof def.action === 'function') {
      const setting = new Setting(containerEl);
      if (def.name) setting.setName(def.name);
      if (def.desc) setting.setDesc(def.desc);
      setting.addButton((btn) => {
        btn.setButtonText(typeof def.name === 'string' ? def.name : '').onClick(() => def.action?.(setting.settingEl, 0));
      });
      return;
    }

    if (!def.control) return;

    const control = def.control;
    const type = control.type;

    switch (type) {
      case 'number': {
        const minVal = control.min ?? 1;
        const maxVal = control.max ?? 100;
        const currentVal = Number((control.key ? this.getControlValue(control.key) : null) ?? control.defaultValue ?? minVal);
        this.addValidatedNumberSetting(
          containerEl,
          typeof def.name === 'string' ? def.name : '',
          typeof def.desc === 'string' ? def.desc : '',
          currentVal,
          minVal,
          maxVal,
          async (val: number) => {
            if (control.key) {
              await this.setControlValue(control.key, val);
            }
          }
        );
        break;
      }
      case 'toggle': {
        const setting = new Setting(containerEl);
        if (def.name) setting.setName(def.name);
        if (def.desc) setting.setDesc(def.desc);
        const val = Boolean((control.key ? this.getControlValue(control.key) : null) ?? control.defaultValue ?? false);
        setting.addToggle((toggle) =>
          toggle.setValue(val).onChange(async (newVal) => {
            if (control.key) {
              await this.setControlValue(control.key, newVal);
            }
          })
        );
        break;
      }
      case 'dropdown': {
        const setting = new Setting(containerEl);
        if (def.name) setting.setName(def.name);
        if (def.desc) setting.setDesc(def.desc);
        const raw = (control.key ? this.getControlValue(control.key) : null) ?? control.defaultValue ?? '';
        const val = typeof raw === 'string' ? raw : (typeof raw === 'number' ? String(raw) : '');
        setting.addDropdown((drop) => {
          if (control.options) {
            for (const [optKey, optLabel] of Object.entries(control.options)) {
              drop.addOption(optKey, optLabel);
            }
          }
          drop.setValue(val).onChange(async (newVal) => {
            if (control.key) {
              await this.setControlValue(control.key, newVal);
            }
          });
        });
        break;
      }
      case 'text':
      case 'folder':
      case 'file': {
        const setting = new Setting(containerEl);
        if (def.name) setting.setName(def.name);
        if (def.desc) setting.setDesc(def.desc);
        const raw = control.key ? this.getControlValue(control.key) : '';
        const val = typeof raw === 'string' ? raw : (typeof raw === 'number' ? String(raw) : '');
        setting.addText((text) => {
          if (control.placeholder) {
            text.setPlaceholder(control.placeholder);
          }
          text.setValue(val).onChange(async (newVal) => {
            if (control.key) {
              await this.setControlValue(control.key, newVal);
            }
          });
        });
        break;
      }
      case 'slider': {
        const setting = new Setting(containerEl);
        if (def.name) setting.setName(def.name);
        if (def.desc) setting.setDesc(def.desc);
        const val = Number((control.key ? this.getControlValue(control.key) : null) ?? control.defaultValue ?? 0);
        setting.addSlider((slider) => {
          slider
            .setLimits(control.min ?? 0, control.max ?? 100, control.step ?? 1)
            .setValue(val)
            .onChange(async (newVal) => {
              if (control.key) {
                await this.setControlValue(control.key, newVal);
              }
            });
        });
        break;
      }
      default: {
        const setting = new Setting(containerEl);
        if (def.name) setting.setName(def.name);
        if (def.desc) setting.setDesc(def.desc);
        break;
      }
    }
  }

  private renderSubjectsSection(containerEl: HTMLElement): void {
    new Setting(containerEl).setName(t('subjects.headingSettings')).setHeading();
    new Setting(containerEl)
      .setDesc(t('subjects.descSettings'))
      .addButton((btn) => {
        btn
          .setButtonText(t('subjects.addSubjectBtn'))
          .setCta()
          .onClick(() => {
            new SubjectEditModal(this.app, this.plugin, null, async (saved) => {
              if (!this.plugin.settings.subjects) {
                this.plugin.settings.subjects = [];
              }
              this.plugin.settings.subjects.push(saved);
              await this.onSave();
              new Notice(t('subjects.savedNotice', { name: saved.name }));
              this.refreshTab();
            }).open();
          });
      });

    const subjectsList = containerEl.createDiv({ cls: 'study-flow-subjects-settings-list' });
    const subjects = this.plugin.settings.subjects || [];

    if (subjects.length === 0) {
      subjectsList.createEl('p', {
        text: t('subjects.noSubjectsConfigured'),
        cls: 'study-flow-text-muted',
      });
    } else {
      subjects.forEach((sub, index) => {
        const itemSetting = new Setting(subjectsList)
          .setName(sub.name)
          .setDesc(`${sub.tag} • ${t('subjects.weeklyGoalUnit', { hours: String(sub.weeklyGoalHours) })}`);

        const dot = itemSetting.nameEl.createSpan({ cls: 'study-flow-subject-color-dot' });
        dot.style.backgroundColor = sub.color || '#4f46e5';
        itemSetting.nameEl.prepend(dot);

        itemSetting.addExtraButton((btn) => {
          btn
            .setIcon('pencil')
            .setTooltip(t('common.edit'))
            .onClick(() => {
              new SubjectEditModal(this.app, this.plugin, sub, async (updated) => {
                this.plugin.settings.subjects[index] = updated;
                await this.onSave();
                new Notice(t('subjects.savedNotice', { name: updated.name }));
                this.refreshTab();
              }).open();
            });
        });

        itemSetting.addExtraButton((btn) => {
          btn
            .setIcon('trash')
            .setTooltip(t('common.delete'))
            .onClick(async () => {
              this.plugin.settings.subjects.splice(index, 1);
              await this.onSave();
              new Notice(t('subjects.deletedNotice'));
              this.refreshTab();
            });
        });
      });
    }
  }

  private renderPresetsSection(containerEl: HTMLElement): void {
    new Setting(containerEl)
      .setName(t('pomodoro.customPresets'))
      .addButton((btn) => {
        btn
          .setButtonText(t('pomodoro.addPreset'))
          .setCta()
          .onClick(() => {
            new PromptModal(
              this.app,
              t('pomodoro.createPresetTitle'),
              t('pomodoro.presetNamePlaceholder'),
              async (input) => {
                const parts = input.split('/');
                const name = parts[0]?.trim() || input.trim();
                const work = parseInt(parts[1]?.trim() || '25', 10) || 25;
                const brk = parseInt(parts[2]?.trim() || '5', 10) || 5;
                await this.plugin.pomodoro.addCustomPreset(name, work, brk);
                await this.onSave();
                new Notice(t('pomodoro.presetAddedNotice', { name }));
                this.refreshTab();
              }
            ).open();
          });
      });

    const customPresets = (this.plugin.settings.pomodoroPresets || []).filter((p) => p.isCustom);
    for (const preset of customPresets) {
      new Setting(containerEl)
        .setName(preset.name)
        .setDesc(`${preset.workMinutes}m / ${preset.breakMinutes}m`)
        .addExtraButton((btn) => {
          btn
            .setIcon('trash')
            .setTooltip(t('pomodoro.deletePresetTooltip'))
            .onClick(async () => {
              await this.plugin.pomodoro.deleteCustomPreset(preset.id);
              await this.onSave();
              new Notice(t('pomodoro.presetDeletedNotice'));
              this.refreshTab();
            });
        });
    }
  }

  private addValidatedNumberSetting(
    containerEl: HTMLElement,
    name: string,
    desc: string,
    currentVal: number,
    minVal: number,
    maxVal: number,
    onSave: (val: number) => Promise<void>
  ): Setting {
    const setting = new Setting(containerEl).setName(name).setDesc(desc);
    const errorEl = setting.descEl.createDiv({ cls: 'study-flow-setting-error is-hidden' });

    setting.addText((text) => {
      text
        .setValue(String(currentVal))
        .onChange(async (raw) => {
          const res = validateSettingNumber(raw, minVal, maxVal, name);
          if (!res.valid) {
            errorEl.setText(res.error || t('settings.validationInvalid'));
            errorEl.removeClass('is-hidden');
            text.inputEl.addClass('study-flow-input-invalid');
            return;
          }

          errorEl.addClass('is-hidden');
          text.inputEl.removeClass('study-flow-input-invalid');
          if (res.value !== undefined) {
            await onSave(res.value);
          }
        });
    });

    return setting;
  }
}
