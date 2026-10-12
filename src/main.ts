import { Plugin } from 'obsidian';
import { NextDayPlannerModal } from './planner';
import { PomodoroManager } from './pomodoro';
import { DEFAULT_SETTINGS, StudyFlowSettings, StudyFlowSettingTab } from './settings';
import { QuickCaptureModal } from './tasks';

export default class StudyFlowPlugin extends Plugin {
  settings: StudyFlowSettings = DEFAULT_SETTINGS;
  pomodoro: PomodoroManager = new PomodoroManager(this);

  async onload(): Promise<void> {
    await this.loadSettings();

    // Initialize Pomodoro Manager with status bar element
    const statusBarEl = this.addStatusBarItem();
    this.pomodoro = new PomodoroManager(this);
    this.pomodoro.initStatusBar(statusBarEl);

    // Ribbon icon for quick access to planner
    this.addRibbonIcon('calendar-check', 'Study Flow: Planificar el día siguiente', () => {
      new NextDayPlannerModal(this.app, this).open();
    });

    // 1. Quick Task Capture Command
    this.addCommand({
      id: 'capture-quick-task',
      name: 'Capturar tarea rápida',
      callback: () => {
        new QuickCaptureModal(this.app, this).open();
      },
    });

    // 2. Next Day Planner Command
    this.addCommand({
      id: 'plan-next-day',
      name: 'Planificar el día siguiente',
      callback: () => {
        new NextDayPlannerModal(this.app, this).open();
      },
    });

    // 3. Pomodoro Commands
    this.addCommand({
      id: 'pomodoro-toggle',
      name: 'Pomodoro: Iniciar / Pausar',
      callback: () => {
        this.pomodoro.toggleStartPause();
      },
    });

    this.addCommand({
      id: 'pomodoro-reset',
      name: 'Pomodoro: Reiniciar',
      callback: () => {
        this.pomodoro.reset();
      },
    });

    this.addCommand({
      id: 'pomodoro-switch-mode',
      name: 'Pomodoro: Alternar entre trabajo y descanso',
      callback: () => {
        this.pomodoro.switchMode();
      },
    });

    // Add Settings Tab
    this.addSettingTab(new StudyFlowSettingTab(this.app, this));
  }

  onunload(): void {
    if (this.pomodoro) {
      this.pomodoro.destroy();
    }
  }

  async loadSettings(): Promise<void> {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
  }

  async saveSettings(): Promise<void> {
    await this.saveData(this.settings);
  }
}
