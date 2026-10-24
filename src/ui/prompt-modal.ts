import { App, Modal } from 'obsidian';
import { t } from '../i18n/index.ts';

export interface PromptModalOptions {
  initialValue?: string;
  defaultValueOnEmpty?: string;
}

export class PromptModal extends Modal {
  private titleText: string;
  private placeholder: string;
  private onSubmit: (value: string) => void | Promise<void>;
  private options?: PromptModalOptions;
  private previousActiveElement: HTMLElement | null = null;

  constructor(
    app: App,
    titleText: string,
    placeholder: string,
    onSubmit: (value: string) => void | Promise<void>,
    options?: PromptModalOptions
  ) {
    super(app);
    this.titleText = titleText;
    this.placeholder = placeholder;
    this.onSubmit = onSubmit;
    this.options = options;
  }

  onOpen(): void {
    this.previousActiveElement = document.activeElement as HTMLElement | null;
    const { contentEl } = this;
    contentEl.empty();
    contentEl.addClass('study-flow-prompt-modal');

    contentEl.createEl('h3', { text: this.titleText, cls: 'study-flow-prompt-title' });

    const input = contentEl.createEl('input', {
      type: 'text',
      cls: 'study-flow-prompt-input',
      attr: { placeholder: this.placeholder },
    });
    if (this.options?.initialValue !== undefined) {
      input.value = this.options.initialValue;
    }
    input.focus();
    if (this.options?.initialValue !== undefined) {
      input.select();
    }

    const btnContainer = contentEl.createDiv({ cls: 'study-flow-prompt-buttons' });
    const cancelBtn = btnContainer.createEl('button', { text: t('common.cancel') });
    cancelBtn.addEventListener('click', () => this.close());

    const submitBtn = btnContainer.createEl('button', { text: t('common.accept'), cls: 'mod-cta' });

    const handleConfirm = async () => {
      let val = input.value.trim();
      if (!val && this.options?.defaultValueOnEmpty) {
        val = this.options.defaultValueOnEmpty.trim();
      }
      if (val) {
        this.close();
        await this.onSubmit(val);
      }
    };

    submitBtn.addEventListener('click', () => {
      void handleConfirm();
    });
    input.addEventListener('keydown', (e: KeyboardEvent) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        void handleConfirm();
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
