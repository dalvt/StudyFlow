const fs = require('fs');
const path = require('path');

const obsidianDir = path.join(__dirname, '..', 'node_modules', 'obsidian');
if (!fs.existsSync(obsidianDir)) {
  process.exit(0);
}

const mockContent = `// Mock implementation of Obsidian API for Node test environment
if (typeof globalThis.window === 'undefined') {
  globalThis.window = globalThis;
}

export class App {
  constructor() {
    this.vault = {
      getAbstractFileByPath: () => null,
      read: async () => '',
      process: async () => '',
      create: async () => {},
      modify: async () => {},
    };
    this.workspace = {
      getLeavesOfType: () => [],
      onLayoutReady: (cb) => cb(),
    };
  }
}

export class TFile {
  constructor(path = '') {
    this.path = path;
    this.name = path.split('/').pop() || '';
    this.basename = this.name.replace(/\\.[^/.]+$/, '');
    this.extension = (this.name.split('.').pop() || '').toLowerCase();
    this.stat = { mtime: Date.now(), ctime: Date.now(), size: 0 };
  }
}

export class TFolder {
  constructor(path = '') {
    this.path = path;
    this.name = path.split('/').pop() || '';
    this.children = [];
  }
}

export class Notice {
  constructor(message, duration) {
    this.message = message;
    this.duration = duration;
  }
  setMessage(msg) { this.message = msg; return this; }
  hide() {}
}

export function normalizePath(path) {
  if (!path) return '';
  return path
    .replace(/\\\\/g, '/')
    .replace(/\\/+/g, '/')
    .replace(/\\/$/, '')
    .replace(/^\\.\\//, '');
}

export function setIcon() {}
export function setTooltip() {}
export function getLanguage() { return 'en'; }

export class Plugin {}
export class PluginSettingTab {}
export class ItemView {}
export class WorkspaceLeaf {}
export class ViewStateResult {}

export class Modal {
  constructor(app) { this.app = app; }
  open() {}
  close() {}
}

export class Setting {
  constructor(containerEl) {
    this.containerEl = containerEl;
    this.nameEl = { createSpan: () => ({ style: {} }), prepend: () => {} };
    this.descEl = { createDiv: () => ({ setText: () => {}, addClass: () => {}, removeClass: () => {} }) };
  }
  setName() { return this; }
  setDesc() { return this; }
  setHeading() { return this; }
  addText(cb) {
    cb({
      setValue: () => ({ onChange: () => {} }),
      inputEl: { addClass: () => {}, removeClass: () => {} },
      onChange: () => {}
    });
    return this;
  }
  addToggle(cb) {
    cb({ setValue: () => ({ onChange: () => {} }), onChange: () => {} });
    return this;
  }
  addDropdown(cb) {
    cb({ setValue: () => ({ onChange: () => {} }), addOption: () => {}, onChange: () => {} });
    return this;
  }
  addSlider(cb) {
    cb({ setValue: () => ({ onChange: () => {} }), onChange: () => {} });
    return this;
  }
  addButton(cb) {
    cb({ setButtonText: () => ({ onClick: () => {} }), setCta: () => {}, setWarning: () => {}, onClick: () => {} });
    return this;
  }
  addExtraButton(cb) {
    cb({ setIcon: () => ({ setTooltip: () => ({ onClick: () => {} }) }), onClick: () => {} });
    return this;
  }
}

export class Menu {
  addItem() { return this; }
  showAtMouseEvent() {}
  showAtPosition() {}
}

export const Platform = {
  isDesktop: true,
  isMobile: false,
  isMacOS: false,
};

export const moment = () => ({
  format: () => '',
  add: () => ({ format: () => '' }),
  subtract: () => ({ format: () => '' }),
});
`;

fs.writeFileSync(path.join(obsidianDir, 'index.js'), mockContent, 'utf8');

const pkgJsonPath = path.join(obsidianDir, 'package.json');
if (fs.existsSync(pkgJsonPath)) {
  try {
    const pkg = JSON.parse(fs.readFileSync(pkgJsonPath, 'utf8'));
    pkg.main = 'index.js';
    pkg.exports = {
      ".": {
        "types": "./obsidian.d.ts",
        "import": "./index.js",
        "default": "./index.js"
      }
    };
    fs.writeFileSync(pkgJsonPath, JSON.stringify(pkg, null, 2), 'utf8');
  } catch (e) {
    console.error('Error patching obsidian package.json:', e);
  }
}
