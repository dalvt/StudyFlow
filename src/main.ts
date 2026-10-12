import { Plugin, WorkspaceLeaf } from 'obsidian';
import { HabitsModal } from './habits';
import { NextDayPlannerModal } from './planner';
import { PomodoroManager } from './pomodoro';
import { PomodoroModal } from './pomodoro-modal';
import { AnalyticsModal } from './analytics-modal';
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
    this.addRibbonIcon('clock', 'Study Flow: Abrir Interfaz Completa', () => {
      this.activateView(true);
    });

    this.addRibbonIcon('check-square', 'Study Flow: Gestor de Tareas', () => {
      new TasksManagerModal(this.app, this).open();
    });

    this.addRibbonIcon('flame', 'Study Flow: Hábitos y Rutinas', () => {
      new HabitsModal(this.app, this).open();
    });

    this.addRibbonIcon('calendar-check', 'Study Flow: Planificar el día siguiente', () => {
      new NextDayPlannerModal(this.app, this).open();
    });

    this.addRibbonIcon('bar-chart-2', 'Study Flow: Métricas y Rendimiento', () => {
      new AnalyticsModal(this.app, this).open();
    });

    // Commands
    this.addCommand({
      id: 'open-study-flow-hub',
      name: 'Abrir interfaz completa (Pestaña central)',
      callback: () => {
        this.activateView(true);
      },
    });

    this.addCommand({
      id: 'open-study-flow-hub-sidebar',
      name: 'Abrir en panel lateral (Sidebar)',
      callback: () => {
        this.activateView(false);
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
      id: 'open-habits-tracker',
      name: 'Abrir registro de hábitos diarios',
      callback: () => {
        new HabitsModal(this.app, this).open();
      },
    });

    this.addCommand({
      id: 'open-analytics-dashboard',
      name: 'Abrir métricas y rendimiento de estudio',
      callback: () => {
        new AnalyticsModal(this.app, this).open();
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
      id: 'complete-pomodoro-active-task',
      name: 'Pomodoro: Completar tarea activa actual',
      callback: async () => {
        await this.pomodoro.completeActiveTask();
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

  async activateView(inTab: boolean = true): Promise<void> {
    const { workspace } = this.app;
    const existingLeaves = workspace.getLeavesOfType(VIEW_TYPE_STUDY_FLOW);

    let targetLeaf: WorkspaceLeaf | null = null;

    if (inTab) {
      // Find if already open in the center workspace (rootSplit)
      const tabLeaf = existingLeaves.find((l) => l.getRoot() === workspace.rootSplit);
      if (tabLeaf) {
        targetLeaf = tabLeaf;
      } else {
        // Detach existing sidebar leaves to transition smoothly to a full tab
        if (existingLeaves.length > 0) {
          existingLeaves.forEach((l) => l.detach());
        }
        targetLeaf = workspace.getLeaf('tab');
        await targetLeaf.setViewState({
          type: VIEW_TYPE_STUDY_FLOW,
          active: true,
        });
      }
    } else {
      // Open or reveal in sidebar
      const sideLeaf = existingLeaves.find((l) => l.getRoot() !== workspace.rootSplit);
      if (sideLeaf) {
        targetLeaf = sideLeaf;
      } else {
        if (existingLeaves.length > 0) {
          existingLeaves.forEach((l) => l.detach());
        }
        const rightLeaf = workspace.getRightLeaf(false);
        if (rightLeaf) {
          await rightLeaf.setViewState({
            type: VIEW_TYPE_STUDY_FLOW,
            active: true,
          });
          targetLeaf = rightLeaf;
        }
      }
    }

    if (targetLeaf) {
      workspace.setActiveLeaf(targetLeaf, { focus: true });
      workspace.revealLeaf(targetLeaf);
    }
  }

  async loadSettings(): Promise<void> {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
    if (!Array.isArray(this.settings.focusHistory)) {
      this.settings.focusHistory = [];
    }
  }

  async saveSettings(): Promise<void> {
    await this.saveData(this.settings);
  }
}
