import { Notice, setIcon } from 'obsidian';
import type StudyFlowPlugin from './main';

export type ZenListener = (isActive: boolean) => void;

export class ZenModeManager {
  private plugin: StudyFlowPlugin;
  private isZenActive: boolean = false;
  private previousLeftCollapsed: boolean = true;
  private previousRightCollapsed: boolean = true;
  private indicatorEl: HTMLElement | null = null;
  private keydownHandler: ((evt: KeyboardEvent) => void) | null = null;
  private listeners: Set<ZenListener> = new Set();

  constructor(plugin: StudyFlowPlugin) {
    this.plugin = plugin;
  }

  public subscribe(listener: ZenListener): () => void {
    this.listeners.add(listener);
    listener(this.isZenActive);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private notify(): void {
    this.listeners.forEach((l) => {
      try {
        l(this.isZenActive);
      } catch (err) {
        console.error('Error en listener de modo zen', err);
      }
    });
  }

  public isZen(): boolean {
    return this.isZenActive;
  }

  public toggleZen(): void {
    if (this.isZenActive) {
      this.disableZen();
    } else {
      this.enableZen();
    }
  }

  public enableZen(silent: boolean = false): void {
    if (this.isZenActive) return;

    const { workspace } = this.plugin.app;

    // 1. Record existing states
    const leftSplit = workspace.leftSplit as { collapse?: () => void; collapsed?: boolean };
    const rightSplit = workspace.rightSplit as { collapse?: () => void; collapsed?: boolean };

    this.previousLeftCollapsed = leftSplit?.collapsed ?? true;
    this.previousRightCollapsed = rightSplit?.collapsed ?? true;

    // 2. Collapse both sidebars if expanded
    if (leftSplit && typeof leftSplit.collapse === 'function' && !leftSplit.collapsed) {
      leftSplit.collapse();
    }
    if (rightSplit && typeof rightSplit.collapse === 'function' && !rightSplit.collapsed) {
      rightSplit.collapse();
    }

    // 3. Add visual class to document
    document.body.addClass('is-study-flow-zen');

    // 4. Create floating exit pill
    this.showIndicator();

    // 5. Register escape key listener
    this.keydownHandler = (evt: KeyboardEvent) => {
      if (evt.key === 'Escape') {
        evt.preventDefault();
        this.disableZen();
      }
    };
    window.addEventListener('keydown', this.keydownHandler);

    this.isZenActive = true;
    this.notify();

    if (!silent) {
      new Notice('🧘 Modo Zen activado (Presioná Esc para salir)');
    }
  }

  public disableZen(silent: boolean = false): void {
    if (!this.isZenActive) return;

    const { workspace } = this.plugin.app;

    // 1. Restore previous sidebar states
    const leftSplit = workspace.leftSplit as { expand?: () => void; collapsed?: boolean };
    const rightSplit = workspace.rightSplit as { expand?: () => void; collapsed?: boolean };

    if (!this.previousLeftCollapsed && leftSplit && typeof leftSplit.expand === 'function') {
      leftSplit.expand();
    }
    if (!this.previousRightCollapsed && rightSplit && typeof rightSplit.expand === 'function') {
      rightSplit.expand();
    }

    // 2. Remove document class
    document.body.removeClass('is-study-flow-zen');

    // 3. Remove indicator and event listeners
    this.hideIndicator();

    if (this.keydownHandler) {
      window.removeEventListener('keydown', this.keydownHandler);
      this.keydownHandler = null;
    }

    this.isZenActive = false;
    this.notify();

    if (!silent) {
      new Notice('Modo Zen desactivado');
    }
  }

  private showIndicator(): void {
    this.hideIndicator();

    const indicator = document.createElement('div');
    indicator.className = 'study-flow-zen-indicator';

    const iconSpan = document.createElement('span');
    iconSpan.className = 'study-flow-zen-indicator-icon';
    setIcon(iconSpan, 'eye-off');
    indicator.appendChild(iconSpan);

    const labelSpan = document.createElement('span');
    labelSpan.className = 'study-flow-zen-indicator-text';
    labelSpan.textContent = 'Modo Zen Activo';
    indicator.appendChild(labelSpan);

    const exitBtn = document.createElement('button');
    exitBtn.className = 'study-flow-zen-indicator-btn';
    exitBtn.textContent = 'Salir (Esc)';
    exitBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      this.disableZen();
    });
    indicator.appendChild(exitBtn);

    document.body.appendChild(indicator);
    this.indicatorEl = indicator;
  }

  private hideIndicator(): void {
    if (this.indicatorEl) {
      this.indicatorEl.remove();
      this.indicatorEl = null;
    }
  }

  public destroy(): void {
    this.disableZen(true);
    this.listeners.clear();
  }
}
