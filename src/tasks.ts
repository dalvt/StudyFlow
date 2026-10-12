import { App, Modal, Notice, Setting, TFile } from 'obsidian';
import type StudyFlowPlugin from './main';
import { appendTaskToMarkdownSection, getOrCreateFile } from './utils';

export class QuickCaptureModal extends Modal {
  private plugin: StudyFlowPlugin;
  private taskText: string = '';
  private targetDestination: 'inbox' | 'activeNote' = 'inbox';

  constructor(app: App, plugin: StudyFlowPlugin) {
    super(app);
    this.plugin = plugin;
  }

  onOpen(): void {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.addClass('study-flow-modal');

    contentEl.createEl('h2', { text: 'Capturar tarea rápida' });
    contentEl.createEl('p', {
      text: 'Ingresa una nueva tarea para registrarla con formato - [ ] en la sección ## Tareas.',
      cls: 'study-flow-modal-desc',
    });

    const activeFile = this.app.workspace.getActiveFile();
    const canUseActiveFile = activeFile !== null && activeFile.extension === 'md';

    // Destination selector
    new Setting(contentEl)
      .setName('Destino')
      .setDesc('Selecciona dónde registrar la tarea')
      .addDropdown((drop) => {
        drop.addOption('inbox', `Inbox (${this.plugin.settings.inboxFilePath})`);
        if (canUseActiveFile && activeFile) {
          drop.addOption('activeNote', `Nota activa (${activeFile.basename})`);
        }
        drop.setValue('inbox');
        drop.onChange((val) => {
          this.targetDestination = val as 'inbox' | 'activeNote';
        });
      });

    // Task text input
    const inputContainer = contentEl.createDiv();
    const inputEl = inputContainer.createEl('input', {
      type: 'text',
      cls: 'study-flow-task-input',
      placeholder: 'Escribe tu tarea y presiona Enter...',
    });

    inputEl.focus();

    inputEl.addEventListener('keydown', async (evt: KeyboardEvent) => {
      if (evt.key === 'Enter') {
        evt.preventDefault();
        this.taskText = inputEl.value.trim();
        await this.submitTask();
      }
    });

    // Action buttons
    const btnContainer = contentEl.createDiv({ cls: 'study-flow-button-row' });
    const cancelBtn = btnContainer.createEl('button', { text: 'Cancelar' });
    cancelBtn.addEventListener('click', () => this.close());

    const submitBtn = btnContainer.createEl('button', {
      text: 'Guardar Tarea',
      cls: 'mod-cta',
    });
    submitBtn.addEventListener('click', async () => {
      this.taskText = inputEl.value.trim();
      await this.submitTask();
    });
  }

  onClose(): void {
    const { contentEl } = this;
    contentEl.empty();
  }

  private async submitTask(): Promise<void> {
    if (!this.taskText) {
      new Notice('Por favor ingresa el texto de la tarea');
      return;
    }

    try {
      let targetFile: TFile | null = null;
      let targetName = '';

      if (this.targetDestination === 'activeNote') {
        targetFile = this.app.workspace.getActiveFile();
        if (targetFile) {
          targetName = targetFile.basename;
        }
      }

      if (!targetFile) {
        const inboxPath = this.plugin.settings.inboxFilePath || 'Inbox.md';
        targetFile = await getOrCreateFile(this.app, inboxPath, '# Inbox\n\n## Tareas\n\n');
        targetName = targetFile.basename;
      }

      const content = await this.app.vault.read(targetFile);
      const updated = appendTaskToMarkdownSection(content, this.taskText, '## Tareas');
      await this.app.vault.modify(targetFile, updated);

      new Notice(`Tarea agregada a ${targetName}`);
      this.close();
    } catch (err) {
      console.error('Study Flow Assistant: Error capturando tarea', err);
      new Notice('Error al guardar la tarea en el archivo');
    }
  }
}
