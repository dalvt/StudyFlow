import { Plugin, WorkspaceLeaf } from 'obsidian';
import { NextDayPlannerModal } from './planner';
import { PomodoroManager } from './pomodoro';
import { PomodoroModal } from './pomodoro-modal';
import { DEFAULT_SETTINGS, StudyFlowSettings, StudyFlowSettingTab } from './settings';
import { QuickCaptureModal, TasksManagerModal } from './tasks';
import { StudyFlowView, VIEW_TYPE_STUDY_FLOW } from './view';

export default class StudyFlowPlugin extends Plugin {
  settings: StudyFlowSettings = DEFAULT_SETTINGS;
  pomodoro: PomodoroManager = new PomodoroManager(this);

  async onload(): Promise<void> {
    await this.loadSettings();

    // Register Sidebar Hub View
    this.registerView(
      VIEW_TYPE_STUDY_FLOW,
      (leaf: WorkspaceLeaf) => new StudyFlowView(leaf, this)
    );

    // Initialize Pomodoro Manager with status bar element
    const statusBarEl = this.addStatusBarItem();
    this.pomodoro = new PomodoroManager(this);
    this.pomodoro.initStatusBar(statusBarEl);

    // Ribbon Icons
    this.addRibbonIcon('clock', 'Study Flow: Abrir Panel Principal', () => {
      this.activateView();
    });

    this.addRibbonIcon('check-square', 'Study Flow: Gestor de Tareas', () => {
      new TasksManagerModal(this.app, this).open();
    });

    this.addRibbonIcon('calendar-check', 'Study Flow: Planificar el día siguiente', () => {
      new NextDayPlannerModal(this.app, this).open();
    });

    // Commands
    this.addCommand({
      id: 'open-study-flow-hub',
      name: 'Abrir panel principal (Hub)',
      callback: () => {
        this.activateView();
      },
    });

    this.addCommand({
      id: 'open-pomodoro-modal',
      name: 'Abrir temporizador Pomodoro',
      callback: () => {
        new PomodoroModal(this.app, this).open();
      },
    });

    this.addCommand({
      id: 'open-tasks-manager',
      name: 'Abrir gestor de tareas & Inbox',
      callback: () => {
        new TasksManagerModal(this.app, this).open();
      },
    });

    this.addCommand({
      id: 'capture-quick-task',
      name: 'Capturar tarea rápida',
      callback: () => {
        new QuickCaptureModal(this.app, this).open();
      },
    });

    this.addCommand({
      id: 'plan-next-day',
      name: 'Planificar el día siguiente',
      callback: () => {
        new NextDayPlannerModal(this.app, this).open();
      },
    });

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

  async activateView(): Promise<void> {
    const { workspace } = this.app;
    let leaf = workspace.getLeavesOfType(VIEW_TYPE_STUDY_FLOW)[0];

    if (!leaf) {
      const rightLeaf = workspace.getRightLeaf(false);
      if (rightLeaf) {
        await rightLeaf.setViewState({
          type: VIEW_TYPE_STUDY_FLOW,
          active: true,
        });
        leaf = rightLeaf;
      }
    }

    if (leaf) {
      workspace.revealLeaf(leaf);
    }
  }

  async loadSettings(): Promise<void> {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
  }

  async saveSettings(): Promise<void> {
    await this.saveData(this.settings);
  }
}
