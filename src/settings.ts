import {
  App,
  PluginSettingTab,
  Setting,
  Notice,
  type ButtonComponent,
  type SettingDefinitionItem,
  type SettingDefinition,
} from 'obsidian';
import type StudyFlowPlugin from './main';
import { playPomodoroSound } from './audio';
import {
  cloneDefaultSettings,
  validateSettingNumber,
  type PomodoroSoundType,
  type TodayTabSectionsConfig,
} from './settings-utils';
export * from './settings-utils';
import { t, setLanguage, getEffectiveLanguage } from './i18n/index.ts';
import { getDefaultConventions } from './conventions.ts';
import { SubjectEditModal } from './subject-modal.ts';
import { VIEW_TYPE_STUDY_FLOW, StudyFlowView } from './ui/view.ts';

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
    this.app.workspace.getLeavesOfType(VIEW_TYPE_STUDY_FLOW).forEach((leaf) => {
      if (leaf.view instanceof StudyFlowView) {
        void leaf.view.render();
      }
    });
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

    if (key === 'dailyNotesFolder') {
      const raw = typeof value === 'string' ? value.trim() : '';
      this.plugin.settings.dailyNotesFolder = raw || 'StudyFlow/Daily';
      await this.onSave();
      return;
    }

    if (key === 'dailyNoteDateFormat') {
      const raw = typeof value === 'string' ? value.trim() : '';
      this.plugin.settings.dailyNoteDateFormat = raw || 'YYYY-MM-DD';
      await this.onSave();
      return;
    }

    if (key === 'inboxFilePath') {
      const raw = typeof value === 'string' ? value.trim() : '';
      this.plugin.settings.inboxFilePath = raw || 'StudyFlow/Inbox.md';
      await this.onSave();
      return;
    }

    if (key === 'habitsFilePath') {
      const raw = typeof value === 'string' ? value.trim() : '';
      this.plugin.settings.habitsFilePath = raw || 'StudyFlow/Habits.md';
      await this.onSave();
      return;
    }

    if (key === 'scheduleFilePath') {
      const raw = typeof value === 'string' ? value.trim() : '';
      this.plugin.settings.scheduleFilePath = raw || 'StudyFlow/Schedule.md';
      await this.onSave();
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

  getSettingDefinitions(): SettingDefinitionItem[] {
    const startHourOptions: Record<string, string> = {};
    for (let h = 0; h <= 12; h++) {
      startHourOptions[String(h)] = `${String(h).padStart(2, '0')}:00`;
    }

    const endHourOptions: Record<string, string> = {};
    for (let h = 13; h <= 23; h++) {
      endHourOptions[String(h)] = `${String(h).padStart(2, '0')}:00`;
    }

    const subjectItems: SettingDefinition[] = [
      {
        name: t('subjects.addSubjectBtn'),
        desc: t('subjects.descSettings'),
        render: (setting: Setting) => {
          setting.addButton((btn) => {
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
        },
      },
    ];

    const subjects = this.plugin.settings.subjects || [];
    if (subjects.length === 0) {
      subjectItems.push({
        name: t('subjects.noSubjectsConfigured'),
        render: (setting: Setting) => {
          setting.nameEl.addClass('study-flow-text-muted');
        },
      });
    } else {
      subjects.forEach((sub, index) => {
        subjectItems.push({
          name: sub.name,
          desc: `${sub.tag} • ${t('subjects.weeklyGoalUnit', { hours: String(sub.weeklyGoalHours) })}`,
          render: (setting: Setting) => {
            const dot = setting.nameEl.createSpan({ cls: 'study-flow-subject-color-dot' });
            dot.style.backgroundColor = sub.color || '#4f46e5';
            setting.nameEl.prepend(dot);

            setting.addExtraButton((btn) => {
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

            setting.addExtraButton((btn) => {
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
          },
        });
      });
    }

    return [
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
              validate: (val) => {
                const res = validateSettingNumber(String(val), 1, 180, t('settings.workDurationName'));
                return res.valid ? undefined : res.error || t('settings.validationInvalid');
              },
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
              validate: (val) => {
                const res = validateSettingNumber(String(val), 1, 60, t('settings.breakDurationName'));
                return res.valid ? undefined : res.error || t('settings.validationInvalid');
              },
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
              validate: (val) => {
                const res = validateSettingNumber(String(val), 1, 120, t('settings.longBreakDurationName'));
                return res.valid ? undefined : res.error || t('settings.validationInvalid');
              },
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
              validate: (val) => {
                const res = validateSettingNumber(String(val), 1, 20, t('settings.longBreakIntervalName'));
                return res.valid ? undefined : res.error || t('settings.validationInvalid');
              },
            },
          },
          {
            name: t('settings.autoStartNextPhaseName'),
            desc: t('settings.autoStartNextPhaseDesc'),
            control: {
              type: 'toggle',
              key: 'autoStartNextPhase',
              defaultValue: false,
            },
          },
          {
            name: t('settings.chimeSoundName'),
            desc: t('settings.chimeSoundDesc'),
            control: {
              type: 'toggle',
              key: 'enableChimeSound',
              defaultValue: true,
            },
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
            control: {
              type: 'toggle',
              key: 'enableSessionClosingReview',
              defaultValue: true,
            },
          },
          {
            name: t('settings.breakTipsName'),
            desc: t('settings.breakTipsDesc'),
            control: {
              type: 'toggle',
              key: 'enableBreakTips',
              defaultValue: true,
            },
          },
          {
            name: t('settings.logDailyNoteName'),
            desc: t('settings.logDailyNoteDesc'),
            control: {
              type: 'toggle',
              key: 'logPomodoroToDailyNote',
              defaultValue: true,
            },
          },
          {
            name: t('settings.systemNotificationsName'),
            desc: t('settings.systemNotificationsDesc'),
            control: {
              type: 'toggle',
              key: 'enableSystemNotifications',
              defaultValue: false,
            },
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
            control: {
              type: 'text',
              key: 'tasksSectionHeader',
              placeholder: getDefaultConventions(getEffectiveLanguage()).tasksSectionHeader,
            },
          },
          {
            name: t('settings.iceboxHeaderName'),
            desc: t('settings.iceboxHeaderDesc'),
            control: {
              type: 'text',
              key: 'iceboxSectionHeader',
              placeholder: getDefaultConventions(getEffectiveLanguage()).iceboxSectionHeader,
            },
          },
          {
            name: t('settings.timeBlocksHeaderName'),
            desc: t('settings.timeBlocksHeaderDesc'),
            control: {
              type: 'text',
              key: 'timeBlocksSectionHeader',
              placeholder: getDefaultConventions(getEffectiveLanguage()).timeBlocksSectionHeader,
            },
          },
          {
            name: t('settings.includedFoldersName'),
            desc: t('settings.includedFoldersDesc'),
            control: {
              type: 'text',
              key: 'taskIncludedFolders',
              placeholder: t('settings.includedFoldersPlaceholder'),
            },
          },
          {
            name: t('settings.excludedFoldersName'),
            desc: t('settings.excludedFoldersDesc'),
            control: {
              type: 'text',
              key: 'taskExcludedFolders',
              placeholder: 'Templates, templates',
            },
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
            control: {
              type: 'folder',
              key: 'dailyNotesFolder',
              placeholder: 'StudyFlow/daily',
            },
          },
          {
            name: t('settings.dailyNoteFormatName'),
            desc: t('settings.dailyNoteFormatDesc'),
            control: {
              type: 'text',
              key: 'dailyNoteDateFormat',
              placeholder: 'YYYY-MM-DD',
            },
          },
          {
            name: t('settings.inboxFilePathName'),
            desc: t('settings.inboxFilePathDesc'),
            control: {
              type: 'file',
              key: 'inboxFilePath',
              placeholder: 'StudyFlow/Inbox.md',
            },
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
            control: {
              type: 'file',
              key: 'habitsFilePath',
              placeholder: 'StudyFlow/Habits.md',
            },
          },
        ],
      },

      // 5. Apariencia Section
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
            control: {
              type: 'file',
              key: 'scheduleFilePath',
              placeholder: 'StudyFlow/Schedule.md',
            },
          },
          {
            name: t('settings.autoZenName'),
            desc: t('settings.autoZenDesc'),
            control: {
              type: 'toggle',
              key: 'autoZenMode',
              defaultValue: false,
            },
          },
        ],
      },

      // 6. Materias (Cursos) Section
      {
        type: 'group',
        heading: t('subjects.headingSettings'),
        items: subjectItems,
      },

      // 7. Avanzado Section
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

      // Spaced Repetition Section
      {
        type: 'group',
        heading: t('settings.headingSpacedRepetition'),
        items: [
          {
            name: t('settings.spacedTagName'),
            desc: t('settings.spacedTagDesc'),
            control: {
              type: 'text',
              key: 'spacedRepetitionTag',
              placeholder: getDefaultConventions(getEffectiveLanguage()).spacedRepetitionTag,
            },
          },
          {
            name: t('settings.spacedNextKeyName'),
            desc: t('settings.spacedNextKeyDesc'),
            control: {
              type: 'text',
              key: 'spacedRepetitionNextKey',
              placeholder: getDefaultConventions(getEffectiveLanguage()).spacedRepetitionNextKey,
            },
          },
          {
            name: t('settings.spacedIntervalKeyName'),
            desc: t('settings.spacedIntervalKeyDesc'),
            control: {
              type: 'text',
              key: 'spacedRepetitionIntervalKey',
              placeholder: getDefaultConventions(getEffectiveLanguage()).spacedRepetitionIntervalKey,
            },
          },
          {
            name: t('settings.spacedReviewedKeyName'),
            desc: t('settings.spacedReviewedKeyDesc'),
            control: {
              type: 'text',
              key: 'spacedRepetitionReviewedKey',
              placeholder: getDefaultConventions(getEffectiveLanguage()).spacedRepetitionReviewedKey,
            },
          },
        ],
      },

      // Maintenance & Migration Section
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

      // Today Tab Sections
      {
        type: 'group',
        heading: t('settings.headingTodayTab'),
        items: [
          {
            name: t('settings.todaySectionNowNextName'),
            desc: t('settings.todaySectionNowNextDesc'),
            control: {
              type: 'toggle',
              key: 'todaySections.showNowNext',
              defaultValue: true,
            },
          },
          {
            name: t('settings.todaySectionTodayTasksName'),
            desc: t('settings.todaySectionTodayTasksDesc'),
            control: {
              type: 'toggle',
              key: 'todaySections.showTodayTasks',
              defaultValue: true,
            },
          },
          {
            name: t('settings.todaySectionHabitsName'),
            desc: t('settings.todaySectionHabitsDesc'),
            control: {
              type: 'toggle',
              key: 'todaySections.showHabits',
              defaultValue: true,
            },
          },
          {
            name: t('settings.todaySectionSpacedRepetitionName'),
            desc: t('settings.todaySectionSpacedRepetitionDesc'),
            control: {
              type: 'toggle',
              key: 'todaySections.showSpacedRepetition',
              defaultValue: true,
            },
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
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();

    // 1. Pomodoro Section
    new Setting(containerEl).setName(t('settings.headingPomodoro')).setHeading();

    this.addValidatedNumberSetting(
      containerEl,
      t('settings.workDurationName'),
      t('settings.workDurationDesc'),
      this.plugin.settings.pomodoroWorkDuration,
      1,
      180,
      async (val) => {
        this.plugin.settings.pomodoroWorkDuration = val;
        await this.onSave();
        await this.plugin.pomodoro.onSettingsUpdated();
      }
    );

    this.addValidatedNumberSetting(
      containerEl,
      t('settings.breakDurationName'),
      t('settings.breakDurationDesc'),
      this.plugin.settings.pomodoroBreakDuration,
      1,
      60,
      async (val) => {
        this.plugin.settings.pomodoroBreakDuration = val;
        await this.onSave();
        await this.plugin.pomodoro.onSettingsUpdated();
      }
    );

    this.addValidatedNumberSetting(
      containerEl,
      t('settings.longBreakDurationName'),
      t('settings.longBreakDurationDesc'),
      this.plugin.settings.pomodoroLongBreakDuration,
      1,
      120,
      async (val) => {
        this.plugin.settings.pomodoroLongBreakDuration = val;
        await this.onSave();
        await this.plugin.pomodoro.onSettingsUpdated();
      }
    );

    this.addValidatedNumberSetting(
      containerEl,
      t('settings.longBreakIntervalName'),
      t('settings.longBreakIntervalDesc'),
      this.plugin.settings.pomodoroLongBreakInterval,
      1,
      20,
      async (val) => {
        this.plugin.settings.pomodoroLongBreakInterval = val;
        await this.onSave();
        await this.plugin.pomodoro.onSettingsUpdated();
      }
    );

    new Setting(containerEl)
      .setName(t('settings.autoStartNextPhaseName'))
      .setDesc(t('settings.autoStartNextPhaseDesc'))
      .addToggle((toggle) =>
        toggle
          .setValue(this.plugin.settings.autoStartNextPhase)
          .onChange(async (value) => {
            this.plugin.settings.autoStartNextPhase = value;
            await this.onSave();
          })
      );

    new Setting(containerEl)
      .setName(t('settings.chimeSoundName'))
      .setDesc(t('settings.chimeSoundDesc'))
      .addToggle((toggle) =>
        toggle
          .setValue(this.plugin.settings.enableChimeSound)
          .onChange(async (value) => {
            this.plugin.settings.enableChimeSound = value;
            await this.onSave();
          })
      );

    new Setting(containerEl)
      .setName(t('settings.soundSelectorName'))
      .setDesc(t('settings.soundSelectorDesc'))
      .addDropdown((drop) =>
        drop
          .addOption('bell', t('settings.soundBell'))
          .addOption('soft', t('settings.soundSoft'))
          .addOption('click', t('settings.soundClick'))
          .addOption('silent', t('settings.soundSilent'))
          .setValue(this.plugin.settings.pomodoroSound || 'bell')
          .onChange(async (value) => {
            this.plugin.settings.pomodoroSound = value as PomodoroSoundType;
            await this.onSave();
          })
      );

    new Setting(containerEl)
      .setName(t('settings.chimeVolumeName'))
      .setDesc(t('settings.chimeVolumeDesc'))
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
            playPomodoroSound(this.plugin.settings.pomodoroSound || 'bell', 'work', this.plugin.settings.chimeVolume);
          })
      );

    new Setting(containerEl)
      .setName(t('settings.closingReviewName'))
      .setDesc(t('settings.closingReviewDesc'))
      .addToggle((toggle) =>
        toggle
          .setValue(this.plugin.settings.enableSessionClosingReview)
          .onChange(async (value) => {
            this.plugin.settings.enableSessionClosingReview = value;
            await this.onSave();
          })
      );

    new Setting(containerEl)
      .setName(t('settings.breakTipsName'))
      .setDesc(t('settings.breakTipsDesc'))
      .addToggle((toggle) =>
        toggle
          .setValue(this.plugin.settings.enableBreakTips)
          .onChange(async (value) => {
            this.plugin.settings.enableBreakTips = value;
            await this.onSave();
          })
      );

    new Setting(containerEl)
      .setName(t('settings.logDailyNoteName'))
      .setDesc(t('settings.logDailyNoteDesc'))
      .addToggle((toggle) =>
        toggle
          .setValue(this.plugin.settings.logPomodoroToDailyNote)
          .onChange(async (value) => {
            this.plugin.settings.logPomodoroToDailyNote = value;
            await this.onSave();
          })
      );

    new Setting(containerEl)
      .setName(t('settings.systemNotificationsName'))
      .setDesc(t('settings.systemNotificationsDesc'))
      .addToggle((toggle) =>
        toggle
          .setValue(this.plugin.settings.enableSystemNotifications)
          .onChange(async (value) => {
            this.plugin.settings.enableSystemNotifications = value;
            if (value && typeof Notification !== 'undefined' && Notification.permission === 'default') {
              void Notification.requestPermission();
            }
            await this.onSave();
          })
      );

    // 2. Tareas Section
    new Setting(containerEl).setName(t('settings.headingTasks')).setHeading();

    new Setting(containerEl)
      .setName(t('settings.tasksHeaderName'))
      .setDesc(t('settings.tasksHeaderDesc'))
      .addText((text) =>
        text
          .setPlaceholder(getDefaultConventions(getEffectiveLanguage()).tasksSectionHeader)
          .setValue(this.plugin.settings.tasksSectionHeader)
          .onChange(async (value) => {
            this.plugin.settings.tasksSectionHeader = value.trim() || getDefaultConventions(getEffectiveLanguage()).tasksSectionHeader;
            await this.onSave();
          })
      );

    new Setting(containerEl)
      .setName(t('settings.iceboxHeaderName'))
      .setDesc(t('settings.iceboxHeaderDesc'))
      .addText((text) =>
        text
          .setPlaceholder(getDefaultConventions(getEffectiveLanguage()).iceboxSectionHeader)
          .setValue(this.plugin.settings.iceboxSectionHeader)
          .onChange(async (value) => {
            this.plugin.settings.iceboxSectionHeader = value.trim() || getDefaultConventions(getEffectiveLanguage()).iceboxSectionHeader;
            await this.onSave();
          })
      );

    new Setting(containerEl)
      .setName(t('settings.timeBlocksHeaderName'))
      .setDesc(t('settings.timeBlocksHeaderDesc'))
      .addText((text) =>
        text
          .setPlaceholder(getDefaultConventions(getEffectiveLanguage()).timeBlocksSectionHeader)
          .setValue(this.plugin.settings.timeBlocksSectionHeader)
          .onChange(async (value) => {
            this.plugin.settings.timeBlocksSectionHeader = value.trim() || getDefaultConventions(getEffectiveLanguage()).timeBlocksSectionHeader;
            await this.onSave();
          })
      );

    new Setting(containerEl)
      .setName(t('settings.includedFoldersName'))
      .setDesc(t('settings.includedFoldersDesc'))
      .addText((text) =>
        text
          .setPlaceholder(t('settings.includedFoldersPlaceholder'))
          .setValue((this.plugin.settings.taskIncludedFolders || []).join(', '))
          .onChange(async (value) => {
            const folders = value
              .split(',')
              .map((s) => s.trim())
              .filter((s) => s.length > 0);
            this.plugin.settings.taskIncludedFolders = folders;
            await this.onSave();
            if (this.plugin.taskIndex) {
              await this.plugin.taskIndex.reindexAll();
            }
          })
      );

    new Setting(containerEl)
      .setName(t('settings.excludedFoldersName'))
      .setDesc(t('settings.excludedFoldersDesc'))
      .addText((text) =>
        text
          .setPlaceholder('Templates, templates')
          .setValue((this.plugin.settings.taskExcludedFolders || []).join(', '))
          .onChange(async (value) => {
            const folders = value
              .split(',')
              .map((s) => s.trim())
              .filter((s) => s.length > 0);
            this.plugin.settings.taskExcludedFolders = folders;
            await this.onSave();
            if (this.plugin.taskIndex) {
              await this.plugin.taskIndex.reindexAll();
            }
          })
      );

    // 3. Notas Section
    new Setting(containerEl).setName(t('settings.headingNotes')).setHeading();

    new Setting(containerEl)
      .setName(t('settings.dailyNotesFolderName'))
      .setDesc(t('settings.dailyNotesFolderDesc'))
      .addText((text) =>
        text
          .setPlaceholder('StudyFlow/daily')
          .setValue(this.plugin.settings.dailyNotesFolder)
          .onChange((value) => {
            void (async () => {
              this.plugin.settings.dailyNotesFolder = value.trim() || 'StudyFlow/Daily';
              await this.onSave();
            })();
          })
      );

    new Setting(containerEl)
      .setName(t('settings.dailyNoteFormatName'))
      .setDesc(t('settings.dailyNoteFormatDesc'))
      .addText((text) =>
        text
          .setPlaceholder('YYYY-MM-DD')
          .setValue(this.plugin.settings.dailyNoteDateFormat)
          .onChange((value) => {
            void (async () => {
              this.plugin.settings.dailyNoteDateFormat = value.trim() || 'YYYY-MM-DD';
              await this.onSave();
            })();
          })
      );

    new Setting(containerEl)
      .setName(t('settings.inboxFilePathName'))
      .setDesc(t('settings.inboxFilePathDesc'))
      .addText((text) =>
        text
          .setPlaceholder('StudyFlow/Inbox.md')
          .setValue(this.plugin.settings.inboxFilePath)
          .onChange(async (value) => {
            this.plugin.settings.inboxFilePath = value.trim() || 'StudyFlow/Inbox.md';
            await this.onSave();
          })
      );

    // 4. Hábitos Section
    new Setting(containerEl).setName(t('settings.headingHabits')).setHeading();

    new Setting(containerEl)
      .setName(t('settings.habitsFilePathName'))
      .setDesc(t('settings.habitsFilePathDesc'))
      .addText((text) =>
        text
          .setPlaceholder('StudyFlow/Habits.md')
          .setValue(this.plugin.settings.habitsFilePath)
          .onChange(async (value) => {
            this.plugin.settings.habitsFilePath = value.trim() || 'StudyFlow/Habits.md';
            await this.onSave();
          })
      );

    // 5. Apariencia Section
    new Setting(containerEl).setName(t('settings.headingAppearance')).setHeading();

    new Setting(containerEl)
      .setName(t('settings.weekStartName'))
      .setDesc(t('settings.weekStartDesc'))
      .addDropdown((drop) =>
        drop
          .addOption('monday', t('settings.weekStartMonday'))
          .addOption('sunday', t('settings.weekStartSunday'))
          .setValue(this.plugin.settings.weekStartDay || 'monday')
          .onChange(async (value) => {
            this.plugin.settings.weekStartDay = value as 'monday' | 'sunday';
            await this.onSave();
          })
      );

    new Setting(containerEl)
      .setName(t('settings.startHourName'))
      .setDesc(t('settings.startHourDesc'))
      .addDropdown((drop) => {
        for (let h = 0; h <= 12; h++) {
          drop.addOption(String(h), `${String(h).padStart(2, '0')}:00`);
        }
        drop
          .setValue(String(this.plugin.settings.calendarStartHour ?? 7))
          .onChange(async (value) => {
            this.plugin.settings.calendarStartHour = parseInt(value, 10);
            await this.onSave();
          });
      });

    new Setting(containerEl)
      .setName(t('settings.endHourName'))
      .setDesc(t('settings.endHourDesc'))
      .addDropdown((drop) => {
        for (let h = 13; h <= 23; h++) {
          drop.addOption(String(h), `${String(h).padStart(2, '0')}:00`);
        }
        drop
          .setValue(String(this.plugin.settings.calendarEndHour ?? 22))
          .onChange(async (value) => {
            this.plugin.settings.calendarEndHour = parseInt(value, 10);
            await this.onSave();
          });
      });

    new Setting(containerEl)
      .setName(t('settings.scheduleFilePathName'))
      .setDesc(t('settings.scheduleFilePathDesc'))
      .addText((text) =>
        text
          .setPlaceholder('StudyFlow/Schedule.md')
          .setValue(this.plugin.settings.scheduleFilePath || 'StudyFlow/Schedule.md')
          .onChange(async (value) => {
            this.plugin.settings.scheduleFilePath = value.trim() || 'StudyFlow/Schedule.md';
            await this.onSave();
          })
      );

    new Setting(containerEl)
      .setName(t('settings.autoZenName'))
      .setDesc(t('settings.autoZenDesc'))
      .addToggle((toggle) =>
        toggle
          .setValue(this.plugin.settings.autoZenMode)
          .onChange(async (value) => {
            this.plugin.settings.autoZenMode = value;
            await this.onSave();
          })
      );

    // 6. Materias (Cursos) Section
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

    // 7. Avanzado Section
    new Setting(containerEl).setName(t('settings.headingAdvanced')).setHeading();

    new Setting(containerEl)
      .setName(t('settings.languageName'))
      .setDesc(t('settings.languageDesc'))
      .addDropdown((drop) =>
        drop
          .addOption('auto', t('settings.langAuto'))
          .addOption('es', t('settings.langEs'))
          .addOption('en', t('settings.langEn'))
          .setValue(this.plugin.settings.language || 'auto')
          .onChange(async (value) => {
            this.plugin.settings.language = value as 'es' | 'en' | 'auto';
            setLanguage(this.plugin.settings.language);
            await this.onSave();
            this.refreshTab();
          })
      );

    // Spaced Repetition Section
    new Setting(containerEl).setName(t('settings.headingSpacedRepetition')).setHeading();

    new Setting(containerEl)
      .setName(t('settings.spacedTagName'))
      .setDesc(t('settings.spacedTagDesc'))
      .addText((text) =>
        text
          .setPlaceholder(getDefaultConventions(getEffectiveLanguage()).spacedRepetitionTag)
          .setValue(this.plugin.settings.spacedRepetitionTag)
          .onChange(async (value) => {
            this.plugin.settings.spacedRepetitionTag = value.trim() || getDefaultConventions(getEffectiveLanguage()).spacedRepetitionTag;
            await this.onSave();
          })
      );

    new Setting(containerEl)
      .setName(t('settings.spacedNextKeyName'))
      .setDesc(t('settings.spacedNextKeyDesc'))
      .addText((text) =>
        text
          .setPlaceholder(getDefaultConventions(getEffectiveLanguage()).spacedRepetitionNextKey)
          .setValue(this.plugin.settings.spacedRepetitionNextKey)
          .onChange(async (value) => {
            this.plugin.settings.spacedRepetitionNextKey = value.trim() || getDefaultConventions(getEffectiveLanguage()).spacedRepetitionNextKey;
            await this.onSave();
          })
      );

    new Setting(containerEl)
      .setName(t('settings.spacedIntervalKeyName'))
      .setDesc(t('settings.spacedIntervalKeyDesc'))
      .addText((text) =>
        text
          .setPlaceholder(getDefaultConventions(getEffectiveLanguage()).spacedRepetitionIntervalKey)
          .setValue(this.plugin.settings.spacedRepetitionIntervalKey)
          .onChange(async (value) => {
            this.plugin.settings.spacedRepetitionIntervalKey = value.trim() || getDefaultConventions(getEffectiveLanguage()).spacedRepetitionIntervalKey;
            await this.onSave();
          })
      );

    new Setting(containerEl)
      .setName(t('settings.spacedReviewedKeyName'))
      .setDesc(t('settings.spacedReviewedKeyDesc'))
      .addText((text) =>
        text
          .setPlaceholder(getDefaultConventions(getEffectiveLanguage()).spacedRepetitionReviewedKey)
          .setValue(this.plugin.settings.spacedRepetitionReviewedKey)
          .onChange(async (value) => {
            this.plugin.settings.spacedRepetitionReviewedKey = value.trim() || getDefaultConventions(getEffectiveLanguage()).spacedRepetitionReviewedKey;
            await this.onSave();
          })
      );

    // Maintenance & Migration Section
    new Setting(containerEl).setName(t('settings.headingMaintenance')).setHeading();

    new Setting(containerEl)
      .setName(t('settings.syncHistoryName'))
      .setDesc(t('settings.syncHistoryDesc'))
      .addButton((btn) =>
        btn
          .setButtonText(t('settings.syncNowBtn'))
          .onClick(async () => {
            const { syncHistoricalSessionsFromVault } = await import('./storage-migration.ts');
            const count = await syncHistoricalSessionsFromVault(this.app, this.plugin.settings, this.plugin);
            new Notice(t('settings.syncHistoryNotice', { count }));
          })
      );

    // 7. Today Tab Sections
    new Setting(containerEl).setName(t('settings.headingTodayTab')).setHeading();

    const todaySec = this.plugin.settings.todaySections || {
      showNowNext: true,
      showTodayTasks: true,
      showHabits: true,
      showSpacedRepetition: true,
    };
    this.plugin.settings.todaySections = todaySec;

    new Setting(containerEl)
      .setName(t('settings.todaySectionNowNextName'))
      .setDesc(t('settings.todaySectionNowNextDesc'))
      .addToggle((toggle) =>
        toggle.setValue(todaySec.showNowNext).onChange(async (val) => {
          todaySec.showNowNext = val;
          await this.onSave();
        })
      );

    new Setting(containerEl)
      .setName(t('settings.todaySectionTodayTasksName'))
      .setDesc(t('settings.todaySectionTodayTasksDesc'))
      .addToggle((toggle) =>
        toggle.setValue(todaySec.showTodayTasks).onChange(async (val) => {
          todaySec.showTodayTasks = val;
          await this.onSave();
        })
      );

    new Setting(containerEl)
      .setName(t('settings.todaySectionHabitsName'))
      .setDesc(t('settings.todaySectionHabitsDesc'))
      .addToggle((toggle) =>
        toggle.setValue(todaySec.showHabits).onChange(async (val) => {
          todaySec.showHabits = val;
          await this.onSave();
        })
      );

    new Setting(containerEl)
      .setName(t('settings.todaySectionSpacedRepetitionName'))
      .setDesc(t('settings.todaySectionSpacedRepetitionDesc'))
      .addToggle((toggle) =>
        toggle.setValue(todaySec.showSpacedRepetition).onChange(async (val) => {
          todaySec.showSpacedRepetition = val;
          await this.onSave();
        })
      );


    new Setting(containerEl)
      .setName(t('settings.resetDefaultsName'))
      .setDesc(t('settings.resetDefaultsDesc'))
      .addButton((btn) => {
        this.setButtonDestructive(btn);
        btn
          .setButtonText(t('settings.resetValuesBtn'))
          .onClick(() => {
            void (async () => {
              const effectiveLang = this.plugin.settings.language === 'en' ? 'en' : (this.plugin.settings.language === 'es' ? 'es' : getEffectiveLanguage());
              this.plugin.settings = cloneDefaultSettings(effectiveLang);
              setLanguage(this.plugin.settings.language);
              await this.onSave();
              await this.plugin.pomodoro.onSettingsUpdated();
              new Notice(t('settings.resetDefaultsNotice'));
              this.refreshTab();
            })();
          });
      });
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
    const setting = new Setting(containerEl)
      .setName(name)
      .setDesc(desc);

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
