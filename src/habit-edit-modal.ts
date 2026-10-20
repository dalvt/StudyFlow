import { App, Modal, Notice, Setting, setIcon } from 'obsidian';
import type StudyFlowPlugin from './main';
import type { HabitFrequency, HabitFrequencyType, HabitItem } from './habits.ts';
import { getEffectiveLanguage, t } from './i18n/index.ts';

export class HabitEditModal extends Modal {
  private plugin: StudyFlowPlugin;
  private habit: HabitItem;
  private onSave: (updates: { name: string; frequency: HabitFrequency }) => Promise<void> | void;

  private name: string = '';
  private freqType: HabitFrequencyType = 'daily';
  private weeklyTarget: number = 3;
  private daysOfWeek: number[] = [1, 2, 3, 4, 5];
  private previousActiveElement: HTMLElement | null = null;

  constructor(
    app: App,
    plugin: StudyFlowPlugin,
    habit: HabitItem,
    onSave: (updates: { name: string; frequency: HabitFrequency }) => Promise<void> | void
  ) {
    super(app);
    this.plugin = plugin;
    this.habit = habit;
    this.onSave = onSave;

    this.name = habit.name;
    const freq = habit.frequency || { type: 'daily' };
    this.freqType = freq.type || 'daily';
    this.weeklyTarget = freq.weeklyTarget || 3;
    if (freq.type === 'specific_days' && Array.isArray(freq.daysOfWeek) && freq.daysOfWeek.length > 0) {
      this.daysOfWeek = [...freq.daysOfWeek];
    } else {
      this.daysOfWeek = [1, 2, 3, 4, 5];
    }
  }

  onOpen(): void {
    this.previousActiveElement = document.activeElement as HTMLElement | null;
    const { contentEl } = this;
    contentEl.empty();
    contentEl.addClass('study-flow-modal', 'study-flow-habit-edit-modal');

    // Header
    const header = contentEl.createDiv({ cls: 'study-flow-modal-header' });
    const title = header.createEl('h2', { text: t('habits.editModalTitle') });
    const iconSpan = title.createSpan({ cls: 'study-flow-header-icon' });
    setIcon(iconSpan, 'flame');

    // Habit Name setting
    new Setting(contentEl)
      .setName(t('habits.nameLabel'))
      .setDesc(t('habits.nameDesc'))
      .addText((text) => {
        text
          .setPlaceholder(t('habits.newHabitPlaceholder'))
          .setValue(this.name)
          .onChange((val) => {
            this.name = val;
          });
        text.inputEl.focus();
      });

    // Frequency setting
    let targetSetting: Setting | null = null;
    let specificDaysSetting: Setting | null = null;
    new Setting(contentEl)
      .setName(t('habits.frequencyLabel'))
      .setDesc(t('habits.frequencyDesc'))
      .addDropdown((dropdown) => {
        dropdown
          .addOption('daily', t('habits.freqDailyOption'))
          .addOption('weekly', t('habits.freqWeeklyOption'))
          .addOption('specific_days', t('habits.freqWeekdaysOption'))
          .setValue(this.freqType)
          .onChange((val: string) => {
            this.freqType = val as HabitFrequencyType;
            if (targetSetting) {
              targetSetting.settingEl.toggleClass('is-hidden', this.freqType !== 'weekly');
            }
            if (specificDaysSetting) {
              specificDaysSetting.settingEl.toggleClass('is-hidden', this.freqType !== 'specific_days');
            }
          });
      });

    // Weekly target setting
    targetSetting = new Setting(contentEl)
      .setName(t('habits.timesPerWeekPlaceholder'))
      .setDesc(t('habits.timesPerWeekDesc'))
      .addText((text) => {
        text
          .setPlaceholder('3')
          .setValue(String(this.weeklyTarget))
          .onChange((val) => {
            const num = parseInt(val, 10);
            if (!isNaN(num) && num >= 1 && num <= 7) {
              this.weeklyTarget = num;
            }
          });
        text.inputEl.type = 'number';
        text.inputEl.min = '1';
        text.inputEl.max = '7';
      });

    if (this.freqType !== 'weekly') {
      targetSetting.settingEl.addClass('is-hidden');
    }

    // Specific days picker setting
    const isEn = getEffectiveLanguage() === 'en';
    specificDaysSetting = new Setting(contentEl)
      .setName(t('habits.freqWeekdaysOption'))
      .setDesc(isEn ? 'Select active days of the week' : 'Selecciona los días activos de la semana');

    const pillsContainer = specificDaysSetting.controlEl.createDiv({ cls: 'study-flow-days-picker' });
    const daysConfig = [
      { day: 1, label: isEn ? 'Mon' : 'Lun' },
      { day: 2, label: isEn ? 'Tue' : 'Mar' },
      { day: 3, label: isEn ? 'Wed' : 'Mié' },
      { day: 4, label: isEn ? 'Thu' : 'Jue' },
      { day: 5, label: isEn ? 'Fri' : 'Vie' },
      { day: 6, label: isEn ? 'Sat' : 'Sáb' },
      { day: 0, label: isEn ? 'Sun' : 'Dom' },
    ];

    daysConfig.forEach(({ day, label }) => {
      const btn = pillsContainer.createEl('button', {
        text: label,
        cls: `study-flow-day-picker-btn ${this.daysOfWeek.includes(day) ? 'mod-cta' : ''}`,
      });
      btn.type = 'button';
      btn.addEventListener('click', () => {
        if (this.daysOfWeek.includes(day)) {
          this.daysOfWeek = this.daysOfWeek.filter((d) => d !== day);
          btn.removeClass('mod-cta');
        } else {
          this.daysOfWeek.push(day);
          btn.addClass('mod-cta');
        }
      });
    });

    if (this.freqType !== 'specific_days') {
      specificDaysSetting.settingEl.addClass('is-hidden');
    }

    // Modal buttons
    const btnContainer = contentEl.createDiv({ cls: 'study-flow-modal-footer study-flow-modal-buttons' });
    const cancelBtn = btnContainer.createEl('button', { text: t('common.cancel') });
    cancelBtn.addEventListener('click', () => this.close());

    const saveBtn = btnContainer.createEl('button', {
      text: t('common.save'),
      cls: 'mod-cta',
    });

    const handleSave = async () => {
      const trimmedName = this.name.trim();
      if (!trimmedName) {
        new Notice(t('habits.enterNameNotice'));
        return;
      }
      let frequency: HabitFrequency = { type: 'daily' };
      if (this.freqType === 'weekly') {
        frequency = {
          type: 'weekly',
          weeklyTarget: Math.max(1, Math.min(7, this.weeklyTarget || 3)),
        };
      } else if (this.freqType === 'specific_days') {
        const sorted = Array.from(new Set(this.daysOfWeek)).sort((a, b) => a - b);
        frequency = {
          type: 'specific_days',
          daysOfWeek: sorted.length > 0 ? sorted : [1, 2, 3, 4, 5],
        };
      }

      this.close();
      await this.onSave({
        name: trimmedName,
        frequency,
      });
    };

    saveBtn.addEventListener('click', () => {
      void handleSave();
    });

    contentEl.addEventListener('keydown', (e: KeyboardEvent) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        void handleSave();
      }
    });
  }

  onClose(): void {
    const { contentEl } = this;
    contentEl.empty();
    if (this.previousActiveElement && typeof this.previousActiveElement.focus === 'function') {
      this.previousActiveElement.focus();
    }
  }
}
