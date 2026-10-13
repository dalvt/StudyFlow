import { App, PluginSettingTab, Setting, Notice } from 'obsidian';
import type StudyFlowPlugin from './main';
import { playPomodoroChime } from './audio';
import type { FocusSessionRecord } from './analytics';

import { DEFAULT_SETTINGS, DEFAULT_WEEKLY_REVIEW_TEMPLATE, validateSettingNumber } from './settings-utils';
export * from './settings-utils';
import { t, setLanguage } from './i18n/index.ts';
import { SubjectEditModal } from './subject-modal.ts';

export class StudyFlowSettingTab extends PluginSettingTab {
  plugin: StudyFlowPlugin;

  constructor(app: App, plugin: StudyFlowPlugin) {
    super(app, plugin);
    this.plugin = plugin;
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
        await this.plugin.saveSettings();
        this.plugin.pomodoro.onSettingsUpdated();
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
        await this.plugin.saveSettings();
        this.plugin.pomodoro.onSettingsUpdated();
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
        await this.plugin.saveSettings();
        this.plugin.pomodoro.onSettingsUpdated();
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
        await this.plugin.saveSettings();
        this.plugin.pomodoro.onSettingsUpdated();
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
            await this.plugin.saveSettings();
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
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName(t('settings.chimeVolumeName'))
      .setDesc(t('settings.chimeVolumeDesc'))
      .addSlider((slider) =>
        slider
          .setLimits(0.1, 1.0, 0.05)
          .setValue(this.plugin.settings.chimeVolume)
          .setDynamicTooltip()
          .onChange(async (value) => {
            this.plugin.settings.chimeVolume = value;
            await this.plugin.saveSettings();
          })
      )
      .addButton((btn) =>
        btn
          .setButtonText(t('settings.testSoundBtn'))
          .setIcon('bell')
          .onClick(() => {
            playPomodoroChime('work', this.plugin.settings.chimeVolume);
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
            await this.plugin.saveSettings();
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
              Notification.requestPermission();
            }
            await this.plugin.saveSettings();
          })
      );

    // 2. Tareas Section
    new Setting(containerEl).setName(t('settings.headingTasks')).setHeading();

    new Setting(containerEl)
      .setName(t('settings.tasksHeaderName'))
      .setDesc(t('settings.tasksHeaderDesc'))
      .addText((text) =>
        text
          .setPlaceholder('## Tareas')
          .setValue(this.plugin.settings.tasksSectionHeader)
          .onChange(async (value) => {
            this.plugin.settings.tasksSectionHeader = value.trim() || '## Tareas';
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName(t('settings.iceboxHeaderName'))
      .setDesc(t('settings.iceboxHeaderDesc'))
      .addText((text) =>
        text
          .setPlaceholder('## Icebox')
          .setValue(this.plugin.settings.iceboxSectionHeader)
          .onChange(async (value) => {
            this.plugin.settings.iceboxSectionHeader = value.trim() || '## Icebox';
            await this.plugin.saveSettings();
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
            await this.plugin.saveSettings();
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
            await this.plugin.saveSettings();
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
          .setPlaceholder('Daily')
          .setValue(this.plugin.settings.dailyNotesFolder)
          .onChange(async (value) => {
            this.plugin.settings.dailyNotesFolder = value.trim() || 'Daily';
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName(t('settings.dailyNoteFormatName'))
      .setDesc(t('settings.dailyNoteFormatDesc'))
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
      .setName(t('settings.inboxFilePathName'))
      .setDesc(t('settings.inboxFilePathDesc'))
      .addText((text) =>
        text
          .setPlaceholder('StudyFlow/Inbox.md')
          .setValue(this.plugin.settings.inboxFilePath)
          .onChange(async (value) => {
            this.plugin.settings.inboxFilePath = value.trim() || 'StudyFlow/Inbox.md';
            await this.plugin.saveSettings();
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
            await this.plugin.saveSettings();
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
            await this.plugin.saveSettings();
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
            await this.plugin.saveSettings();
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
              await this.plugin.saveSettings();
              new Notice(t('subjects.savedNotice', { name: saved.name }));
              this.display();
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
                await this.plugin.saveSettings();
                new Notice(t('subjects.savedNotice', { name: updated.name }));
                this.display();
              }).open();
            });
        });

        itemSetting.addExtraButton((btn) => {
          btn
            .setIcon('trash')
            .setTooltip(t('common.delete'))
            .onClick(async () => {
              this.plugin.settings.subjects.splice(index, 1);
              await this.plugin.saveSettings();
              new Notice(t('subjects.deletedNotice'));
              this.display();
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
            await this.plugin.saveSettings();
            this.display();
          })
      );

    // Weekly Review Section
    new Setting(containerEl).setName(t('settings.weeklyReviewHeading')).setHeading();

    new Setting(containerEl)
      .setName(t('settings.weeklyReviewFolderLabel'))
      .setDesc(t('settings.weeklyReviewFolderDesc'))
      .addText((text) =>
        text
          .setPlaceholder('StudyFlow/Reviews')
          .setValue(this.plugin.settings.weeklyReviewsFolder || 'StudyFlow/Reviews')
          .onChange(async (val) => {
            this.plugin.settings.weeklyReviewsFolder = val.trim() || 'StudyFlow/Reviews';
            await this.plugin.saveSettings();
          })
      );

    const templateSetting = new Setting(containerEl)
      .setName(t('settings.weeklyReviewTemplateLabel'))
      .setDesc(t('settings.weeklyReviewTemplateDesc'));

    templateSetting.addTextArea((ta) => {
      ta.inputEl.rows = 8;
      ta.inputEl.cols = 40;
      ta.setValue(this.plugin.settings.weeklyReviewTemplate || DEFAULT_WEEKLY_REVIEW_TEMPLATE)
        .onChange(async (val) => {
          this.plugin.settings.weeklyReviewTemplate = val;
          await this.plugin.saveSettings();
        });
    });

    templateSetting.addButton((btn) =>
      btn
        .setButtonText(t('settings.resetTemplateBtn'))
        .setTooltip(t('settings.resetTemplateTooltip'))
        .onClick(async () => {
          this.plugin.settings.weeklyReviewTemplate = DEFAULT_WEEKLY_REVIEW_TEMPLATE;
          await this.plugin.saveSettings();
          this.display();
          new Notice(t('settings.templateResetNotice'));
        })
    );

    new Setting(containerEl)
      .setName(t('settings.syncHistoryName'))
      .setDesc(t('settings.syncHistoryDesc'))
      .addButton((btn) =>
        btn
          .setButtonText(t('settings.syncNowBtn'))
          .onClick(async () => {
            const { syncHistoricalSessionsFromVault } = await import('./storage-migration');
            const count = await syncHistoricalSessionsFromVault(this.app, this.plugin.settings, this.plugin);
            new Notice(t('settings.syncHistoryNotice', { count }));
          })
      );

    new Setting(containerEl)
      .setName(t('settings.resetDefaultsName'))
      .setDesc(t('settings.resetDefaultsDesc'))
      .addButton((btn) =>
        btn
          .setWarning()
          .setButtonText(t('settings.resetValuesBtn'))
          .onClick(async () => {
            this.plugin.settings = Object.assign({}, DEFAULT_SETTINGS);
            setLanguage(this.plugin.settings.language);
            await this.plugin.saveSettings();
            this.plugin.pomodoro.onSettingsUpdated();
            new Notice(t('settings.resetDefaultsNotice'));
            this.display();
          })
      );
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

    const errorEl = setting.descEl.createDiv({ cls: 'study-flow-setting-error' });
    errorEl.style.display = 'none';

    setting.addText((text) => {
      text
        .setValue(String(currentVal))
        .onChange(async (raw) => {
          const res = validateSettingNumber(raw, minVal, maxVal, name);
          if (!res.valid) {
            errorEl.setText(res.error || t('settings.validationInvalid'));
            errorEl.style.display = 'block';
            text.inputEl.addClass('study-flow-input-invalid');
            return;
          }

          errorEl.style.display = 'none';
          text.inputEl.removeClass('study-flow-input-invalid');
          if (res.value !== undefined) {
            await onSave(res.value);
          }
        });
    });

    return setting;
  }
}
