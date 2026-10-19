import { App, Menu, Notice, setIcon, TFile } from 'obsidian';
import type StudyFlowPlugin from '../main';
import type { ActiveTab, TabComponent } from './types';
import { PromptModal } from './prompt-modal';
import { TaskCreateModal } from '../task-modal';
import {
  addSubtaskToFile,
  compareTasksByPriority,
  decrementTaskPomodoroInFile,
  deleteTaskFromFile,
  incrementTaskPomodoroInFile,
  promoteIdeaToTaskInFile,
  TaskRecord,
  toggleSubtaskInFile,
  toggleTaskCompletionInFile,
  updateTaskTextInFile,
} from '../tasks';
import {
  formatDeadlineHuman,
  formatDateKey,
  getCleanTaskDisplayTitle,
} from '../utils';
import { locateTaskLineIndex, mutateTaskLineInContent } from '../markdown-utils';
import { matchesSubjectTag } from '../subject-analytics';
import { t } from '../i18n/index.ts';

function showUndoNotice(message: string, onUndo: () => Promise<void>): void {
  const notice = new Notice('', 8000);
  const el = notice.noticeEl;
  el.empty();
  const wrapper = el.createDiv({ cls: 'study-flow-notice-undo-wrapper' });
  wrapper.createSpan({ text: message, cls: 'study-flow-notice-undo-msg' });
  const btn = wrapper.createEl('button', {
    text: t('common.undo'),
    cls: 'study-flow-notice-undo-btn mod-cta',
  });
  btn.addEventListener('click', async (e: MouseEvent) => {
    e.stopPropagation();
    notice.hide();
    await onUndo();
  });
}

export class TasksTab implements TabComponent {
  private app: App;
  private plugin: StudyFlowPlugin;
  private container: HTMLElement | null = null;
  private onSwitchTab: (tab: ActiveTab) => void;

  private tasks: TaskRecord[] = [];
  private taskView: 'today' | 'upcoming' | 'subjects' | 'icebox' = 'today';
  private showCompleted: boolean = false;
  private taskSearchQuery: string = '';
  private taskSortBy: 'urgency' | 'priority' | 'estimate' | 'alpha' = 'urgency';
  private editingTaskId: string | null = null;
  private selectedSubjectTag: string | null = null;

  constructor(app: App, plugin: StudyFlowPlugin, onSwitchTab: (tab: ActiveTab) => void) {
    this.app = app;
    this.plugin = plugin;
    this.onSwitchTab = onSwitchTab;
  }

  async render(container: HTMLElement): Promise<void> {
    this.container = container;
    container.empty();

    if (this.plugin.taskIndex) {
      this.tasks = this.plugin.taskIndex.getAllTasks();
    }

    const card = container.createDiv({ cls: 'study-flow-card study-flow-tasks-main-card' });

    const todayDate = formatDateKey(new Date());

    const isToday = (t: TaskRecord) =>
      !t.isIdea &&
      ((t.daysRemaining !== undefined && t.daysRemaining <= 0) ||
        t.dueDate === todayDate ||
        (t.dueDate !== undefined && t.dueDate < todayDate));

    const isUpcoming = (t: TaskRecord) =>
      !t.isIdea &&
      ((t.daysRemaining !== undefined && t.daysRemaining > 0) ||
        (t.dueDate !== undefined && t.dueDate > todayDate));

    const isSubject = (t: TaskRecord) => !t.isIdea;
    const isIcebox = (t: TaskRecord) => Boolean(t.isIdea);

    const pendingTasks = this.tasks.filter((t) => !t.completed);
    const todayCount = pendingTasks.filter(isToday).length;
    const upcomingCount = pendingTasks.filter(isUpcoming).length;
    const subjectsCount = pendingTasks.filter(isSubject).length;
    const iceboxCount = pendingTasks.filter(isIcebox).length;

    // 1. Header controls: 4 Views Tabs + Completed Toggle
    const headerControls = card.createDiv({ cls: 'study-flow-tasks-header-controls' });
    const filterRow = headerControls.createDiv({ cls: 'study-flow-segmented-control study-flow-tasks-nav' });
    const views: Array<{
      id: 'today' | 'upcoming' | 'subjects' | 'icebox';
      label: string;
      count: number;
      icon: string;
    }> = [
      { id: 'today', label: t('tasks.filterToday'), count: todayCount, icon: 'calendar-check' },
      { id: 'upcoming', label: t('tasks.filterUpcoming'), count: upcomingCount, icon: 'calendar' },
      { id: 'subjects', label: t('tasks.filterSubjects'), count: subjectsCount, icon: 'book-open' },
      { id: 'icebox', label: t('tasks.filterIcebox'), count: iceboxCount, icon: 'snowflake' },
    ];

    views.forEach((v) => {
      const btn = filterRow.createEl('button', {
        cls: `study-flow-segmented-btn ${this.taskView === v.id ? 'is-active' : ''}`,
        attr: { 'aria-label': `${v.label} (${v.count})` },
      });
      const iconSpan = btn.createSpan({ cls: 'study-flow-tab-icon' });
      setIcon(iconSpan, v.icon);
      btn.createSpan({ text: v.label, cls: 'study-flow-segmented-label' });
      btn.createSpan({ text: String(v.count), cls: 'study-flow-count-pill' });
      btn.addEventListener('click', async () => {
        this.taskView = v.id;
        this.selectedSubjectTag = null;
        if (this.container) await this.render(this.container);
      });
    });

    // Native dropdown Menu for narrow / mobile container (<400px)
    const filterMenuBtn = headerControls.createEl('button', {
      cls: 'study-flow-tasks-filter-menu-btn dropdown clickable-icon',
      attr: { 'aria-label': t('tasks.filterMenuLabel') },
    });
    const currentViewObj = views.find((v) => v.id === this.taskView) || views[0];
    const fIcon = filterMenuBtn.createSpan({ cls: 'study-flow-btn-icon' });
    setIcon(fIcon, currentViewObj.icon);
    filterMenuBtn.createSpan({
      text: `${currentViewObj.label} (${currentViewObj.count})`,
      cls: 'study-flow-filter-btn-label',
    });
    const fChevron = filterMenuBtn.createSpan({ cls: 'study-flow-chevron-icon' });
    setIcon(fChevron, 'chevron-down');

    filterMenuBtn.addEventListener('click', (e: MouseEvent) => {
      e.stopPropagation();
      const menu = new Menu();
      views.forEach((v) => {
        menu.addItem((item) => {
          item
            .setTitle(`${v.label} (${v.count})`)
            .setIcon(v.icon)
            .setChecked(this.taskView === v.id)
            .onClick(async () => {
              this.taskView = v.id;
              this.selectedSubjectTag = null;
              if (this.container) await this.render(this.container);
            });
        });
      });
      menu.showAtMouseEvent(e);
    });

    // Completed tasks toggle switch
    const toggleWrap = headerControls.createDiv({ cls: 'study-flow-tasks-completed-toggle-wrap' });
    const toggleLabel = toggleWrap.createEl('label', { cls: 'study-flow-toggle-label' });
    const toggleCheckbox = toggleLabel.createEl('input', {
      type: 'checkbox',
      cls: 'study-flow-toggle-checkbox',
    });
    toggleCheckbox.checked = this.showCompleted;
    toggleLabel.createSpan({ text: t('tasks.showCompleted'), cls: 'study-flow-toggle-text' });
    toggleCheckbox.addEventListener('change', () => {
      this.showCompleted = toggleCheckbox.checked;
      renderList();
    });

    // 2. Search & Sort Bar
    const searchRow = card.createDiv({ cls: 'study-flow-tasks-search-row' });
    const searchWrap = searchRow.createDiv({ cls: 'study-flow-search-input-wrap' });
    const sIcon = searchWrap.createSpan({ cls: 'study-flow-search-icon' });
    setIcon(sIcon, 'search');

    const searchInput = searchWrap.createEl('input', {
      type: 'text',
      cls: 'study-flow-task-search-input',
      placeholder: t('tasks.searchPlaceholder'),
      value: this.taskSearchQuery,
      attr: { 'aria-label': t('tasks.searchLabel') },
    });
    const clearBtn = searchWrap.createEl('button', {
      cls: `study-flow-search-clear-btn clickable-icon ${this.taskSearchQuery ? '' : 'is-hidden'}`,
      attr: { 'aria-label': t('tasks.clearSearch') },
    });
    setIcon(clearBtn, 'x');
    clearBtn.addEventListener('click', () => {
      this.taskSearchQuery = '';
      searchInput.value = '';
      clearBtn.addClass('is-hidden');
      searchInput.focus();
      renderList();
    });

    searchInput.addEventListener('input', () => {
      this.taskSearchQuery = searchInput.value.trim().toLowerCase();
      clearBtn.toggleClass('is-hidden', !this.taskSearchQuery);
      renderList();
    });

    const sortSelect = searchRow.createEl('select', {
      cls: 'study-flow-tasks-sort-select dropdown',
      attr: { 'aria-label': t('tasks.sortLabel') },
    });
    sortSelect.createEl('option', { value: 'urgency', text: t('tasks.sortUrgency') });
    sortSelect.createEl('option', { value: 'priority', text: t('tasks.sortPriority') });
    sortSelect.createEl('option', { value: 'estimate', text: t('tasks.sortEstimate') });
    sortSelect.createEl('option', { value: 'alpha', text: t('tasks.sortAlpha') });
    sortSelect.value = this.taskSortBy;
    sortSelect.addEventListener('change', () => {
      this.taskSortBy = sortSelect.value as any;
      renderList();
    });

    // 3. Quick Add Trigger Bar (Opens floating cloud modal)
    const configuredTags = (this.plugin.settings.subjects || []).map((s) => s.tag);
    const knownSubjects = Array.from(
      new Set([
        ...configuredTags,
        ...this.tasks
          .flatMap((t) => t.tags || [])
          .filter((tag) => tag && !['#idea', '#icebox', '#alta', '#media', '#baja'].includes(tag.toLowerCase())),
      ])
    );

    const triggerBox = card.createDiv({ cls: 'study-flow-cloud-trigger-bar study-flow-new-task-trigger-bar' });
    const triggerLeft = triggerBox.createDiv({ cls: 'study-flow-trigger-left' });
    const plusSpan = triggerLeft.createSpan({ cls: 'study-flow-trigger-plus' });
    setIcon(plusSpan, 'plus');
    triggerLeft.createSpan({
      text: t('tasks.newTaskPlaceholder'),
      cls: 'study-flow-trigger-label',
    });

    const triggerRight = triggerBox.createDiv({ cls: 'study-flow-trigger-right' });
    const newTaskBtn = triggerRight.createEl('button', {
      cls: 'study-flow-trigger-cloud-btn study-flow-new-task-btn',
      attr: { 'aria-label': t('tasks.newTaskTooltip') },
    });
    const cIcon = newTaskBtn.createSpan({ cls: 'study-flow-btn-icon' });
    setIcon(cIcon, 'plus');
    newTaskBtn.createSpan({ text: t('tasks.newTask') });

    const openCreationModal = (initial = '') => {
      new TaskCreateModal(
        this.app,
        this.plugin,
        knownSubjects,
        async () => {
          if (this.container) await this.render(this.container);
        },
        initial
      ).open();
    };

    triggerBox.addEventListener('click', () => openCreationModal());
    newTaskBtn.addEventListener('click', (e: MouseEvent) => {
      e.stopPropagation();
      openCreationModal();
    });

    // 5. Task List Container
    const listContainer = card.createDiv({ cls: 'study-flow-task-list-cards' });

    const renderList = () => {
      listContainer.empty();
      this.renderFilteredTaskList(listContainer, container);
    };

    renderList();
  }

  private renderFilteredTaskList(listContainer: HTMLElement, rootContainer: HTMLElement): void {
    const todayDate = formatDateKey(new Date());

    // 1. Filter by 4 views
    let filtered = this.tasks.filter((t) => {
      if (this.taskView === 'today') {
        if (t.isIdea) return false;
        return (
          (t.daysRemaining !== undefined && t.daysRemaining <= 0) ||
          t.dueDate === todayDate ||
          (t.dueDate !== undefined && t.dueDate < todayDate)
        );
      }
      if (this.taskView === 'upcoming') {
        if (t.isIdea) return false;
        return (
          (t.daysRemaining !== undefined && t.daysRemaining > 0) ||
          (t.dueDate !== undefined && t.dueDate > todayDate)
        );
      }
      if (this.taskView === 'subjects') {
        return !t.isIdea;
      }
      if (this.taskView === 'icebox') {
        return Boolean(t.isIdea);
      }
      return true;
    });

    // Completed tasks toggle
    if (!this.showCompleted) {
      filtered = filtered.filter((t) => !t.completed);
    }

    // 2. Search query filter
    if (this.taskSearchQuery) {
      const q = this.taskSearchQuery.toLowerCase();
      filtered = filtered.filter((t) => {
        if (t.text.toLowerCase().includes(q)) return true;
        if (t.tags && t.tags.some((tag) => tag.toLowerCase().includes(q))) return true;
        if (t.dueDate && t.dueDate.includes(q)) return true;
        return false;
      });
    }

    // 3. Subject filter if tag is clicked
    if (this.selectedSubjectTag) {
      if (this.selectedSubjectTag === '__unclassified__') {
        filtered = filtered.filter((t) => !t.tags || t.tags.length === 0);
      } else {
        filtered = filtered.filter((t) => t.tags && t.tags.includes(this.selectedSubjectTag!));
      }
    }

    // 4. Sort
    filtered.sort((a, b) => {
      if (a.completed !== b.completed) return a.completed ? 1 : -1;
      if (this.taskSortBy === 'urgency') {
        if (a.daysRemaining !== undefined && b.daysRemaining !== undefined) {
          return a.daysRemaining - b.daysRemaining;
        }
        if (a.daysRemaining !== undefined) return -1;
        if (b.daysRemaining !== undefined) return 1;
        return compareTasksByPriority(a, b);
      }
      if (this.taskSortBy === 'priority') {
        return compareTasksByPriority(a, b);
      }
      if (this.taskSortBy === 'estimate') {
        const estA = a.estimatedPomodoros || 0;
        const estB = b.estimatedPomodoros || 0;
        if (estB !== estA) return estB - estA;
        return a.text.localeCompare(b.text);
      }
      if (this.taskSortBy === 'alpha') {
        return a.text.localeCompare(b.text);
      }
      return 0;
    });

    // Empty state
    if (filtered.length === 0) {
      const emptyState = listContainer.createDiv({ cls: 'study-flow-empty-state' });
      const emptyIcon = emptyState.createDiv({ cls: 'study-flow-empty-icon' });
      if (this.taskView === 'icebox') {
        setIcon(emptyIcon, 'snowflake');
        emptyState.createEl('h4', { text: t('tasks.emptyIceboxTitle') });
        emptyState.createEl('p', { text: t('tasks.emptyIceboxDesc') });
      } else if (this.taskView === 'today') {
        setIcon(emptyIcon, 'calendar-check');
        emptyState.createEl('h4', { text: t('tasks.emptyTodayTitle') });
        emptyState.createEl('p', { text: t('tasks.emptyTodayDesc') });
      } else if (this.taskView === 'upcoming') {
        setIcon(emptyIcon, 'calendar');
        emptyState.createEl('h4', { text: t('tasks.emptyUpcomingTitle') });
        emptyState.createEl('p', { text: t('tasks.emptyUpcomingDesc') });
      } else if (this.taskView === 'subjects') {
        setIcon(emptyIcon, 'book-open');
        emptyState.createEl('h4', { text: t('tasks.emptySubjectsTitle') });
        emptyState.createEl('p', { text: t('tasks.emptySubjectsDesc') });
      } else {
        setIcon(emptyIcon, 'check-circle-2');
        emptyState.createEl('h4', { text: this.taskSearchQuery ? t('tasks.emptySearchTitle') : t('tasks.emptyAllTitle') });
        emptyState.createEl('p', {
          text: this.taskSearchQuery
            ? t('tasks.emptySearchDesc')
            : t('tasks.emptyAllDesc'),
        });
      }
      return;
    }

    // If subject view without selected tag, render grouped by subject!
    if (this.taskView === 'subjects' && !this.selectedSubjectTag) {
      const groups = new Map<string, TaskRecord[]>();
      filtered.forEach((task) => {
        const tags = (task.tags && task.tags.length > 0) ? task.tags : ['__unclassified__'];
        tags.forEach((tag) => {
          const groupName = tag === '__unclassified__' ? '__unclassified__' : (tag.startsWith('#') ? tag : `#${tag}`);
          if (!groups.has(groupName)) {
            groups.set(groupName, []);
          }
          groups.get(groupName)!.push(task);
        });
      });

      groups.forEach((tasksInGroup, groupTag) => {
        const isUnclassified = groupTag === '__unclassified__';
        const matchedSubject = (this.plugin.settings.subjects || []).find((s) =>
          matchesSubjectTag(s.tag, [groupTag])
        );
        const groupCard = listContainer.createDiv({ cls: 'study-flow-subject-group-box' });
        const groupHeader = groupCard.createDiv({ cls: 'study-flow-subject-group-header' });
        const headerLeft = groupHeader.createDiv({ cls: 'study-flow-subject-header-left' });
        const gIcon = headerLeft.createSpan({ cls: 'study-flow-subject-icon' });
        setIcon(gIcon, isUnclassified ? 'inbox' : 'book-open');
        if (matchedSubject?.color) {
          gIcon.style.color = matchedSubject.color;
        }
        const displayName = isUnclassified
          ? t('tasks.unclassified')
          : (matchedSubject ? matchedSubject.name : groupTag);
        const titleEl = headerLeft.createEl('h4', {
          text: displayName.toUpperCase(),
          cls: 'study-flow-subject-title',
        });
        if (matchedSubject?.color) {
          titleEl.style.color = matchedSubject.color;
        }
        headerLeft.createSpan({
          text: t('tasks.subjectTasksCount', { count: String(tasksInGroup.length) }),
          cls: 'study-flow-count-pill',
        });

        const filterSubjectBtn = groupHeader.createEl('button', {
          cls: 'study-flow-icon-action-btn-styled study-flow-filter-subject-btn',
          text: t('tasks.filterSubjectBtn'),
        });
        filterSubjectBtn.addEventListener('click', () => {
          this.selectedSubjectTag = groupTag;
          listContainer.empty();
          this.renderFilteredTaskList(listContainer, rootContainer);
        });

        const tasksBox = groupCard.createDiv({ cls: 'study-flow-subject-tasks-wrapper' });
        tasksInGroup.forEach((task) => {
          this.renderTaskCardItem(tasksBox, task, rootContainer);
        });
      });
      return;
    }

    // If a subject tag is actively selected, show breadcrumb back button
    if (this.selectedSubjectTag) {
      const isUnclassified = this.selectedSubjectTag === '__unclassified__';
      const banner = listContainer.createDiv({ cls: 'study-flow-subject-active-banner' });
      const bIcon = banner.createSpan({ cls: 'study-flow-banner-icon' });
      setIcon(bIcon, isUnclassified ? 'inbox' : 'book-open');
      const tagLabel = isUnclassified ? t('tasks.unclassified') : this.selectedSubjectTag;
      banner.createSpan({ text: t('tasks.filteringBy', { tag: tagLabel }) });
      const clearSubBtn = banner.createEl('button', {
        cls: 'study-flow-filter-clear-btn',
        text: t('tasks.viewAllSubjects'),
        attr: { 'aria-label': t('tasks.viewAllSubjectsTooltip') },
      });
      clearSubBtn.addEventListener('click', () => {
        this.selectedSubjectTag = null;
        listContainer.empty();
        this.renderFilteredTaskList(listContainer, rootContainer);
      });
    }

    // Standard list rendering
    filtered.forEach((task) => {
      this.renderTaskCardItem(listContainer, task, rootContainer);
    });
  }

  private renderTaskCardItem(container: HTMLElement, task: TaskRecord, rootContainer: HTMLElement): void {
    const isEditing = this.editingTaskId === task.id;
    const itemCard = container.createDiv({
      cls: `study-flow-task-card ${task.completed ? 'is-done' : ''} ${isEditing ? 'is-editing' : ''}`,
    });

    const handleToggleCompletion = async (newCompleted: boolean) => {
      const success = await toggleTaskCompletionInFile(this.app, task, newCompleted);
      if (!success) return;
      task.completed = newCompleted;
      if (this.container) await this.render(this.container);

      if (newCompleted) {
        showUndoNotice(
          t('tasks.taskCompletedWithUndo'),
          async () => {
            await toggleTaskCompletionInFile(this.app, task, false);
            task.completed = false;
            new Notice(t('tasks.taskRestoredNotice'));
            if (this.container) await this.render(this.container);
          }
        );
      } else {
        new Notice(t('tasks.unmarkedNotice'));
      }
    };

    const handleDeleteTask = async () => {
      const taskToRestore = { ...task };
      const file = this.app.vault.getAbstractFileByPath(task.sourceFile);
      if (!(file instanceof TFile)) {
        await deleteTaskFromFile(this.app, task);
        new Notice(t('tasks.entryDeletedNotice'));
        if (this.container) await this.render(this.container);
        return;
      }

      let rawDeletedLines: string[] = [];
      let deletedIndex = taskToRestore.lineNumber ?? -1;

      await this.app.vault.process(file, (content) => {
        const lines = content.split(/\r?\n/);
        const locate = locateTaskLineIndex(lines, task);
        if (locate.status !== 'ambiguous' && locate.status !== 'not_found' && locate.index !== -1) {
          deletedIndex = locate.index;
          let count = 1;
          while (locate.index + count < lines.length && /^(\s{2,}|\t+)-\s+\[.\]/.test(lines[locate.index + count])) {
            count++;
          }
          rawDeletedLines = lines.slice(locate.index, locate.index + count);
        }
        const mut = mutateTaskLineInContent(content, task, { action: 'delete' });
        return mut.success ? mut.updatedContent : content;
      });

      if (this.container) await this.render(this.container);

      showUndoNotice(
        t('tasks.taskDeletedWithUndo'),
        async () => {
          if (rawDeletedLines.length > 0) {
            await this.app.vault.process(file, (content) => {
              const lines = content.split(/\r?\n/);
              const insertIdx = deletedIndex >= 0 && deletedIndex <= lines.length ? deletedIndex : lines.length;
              lines.splice(insertIdx, 0, ...rawDeletedLines);
              return lines.join('\n');
            });
            new Notice(t('tasks.taskRestoredNotice'));
            if (this.container) await this.render(this.container);
          }
        }
      );
    };

    const showTaskContextMenu = (e: MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      const menu = new Menu();

      // 1. Edit
      menu.addItem((item) => {
        item
          .setTitle(t('tasks.menuEdit'))
          .setIcon('pencil')
          .onClick(() => {
            this.editingTaskId = task.id;
            if (this.container) void this.render(this.container);
          });
      });

      // 2. Complete / Uncomplete
      menu.addItem((item) => {
        const isCompleted = Boolean(task.completed);
        item
          .setTitle(isCompleted ? t('tasks.menuUncomplete') : t('tasks.menuComplete'))
          .setIcon(isCompleted ? 'square' : 'check-square')
          .onClick(async () => {
            await handleToggleCompletion(!isCompleted);
          });
      });

      // 3. Pomodoro & Subtask actions for active tasks
      if (!task.completed && !task.isIdea) {
        menu.addItem((item) => {
          item
            .setTitle(t('tasks.incrementPomodoroTooltip'))
            .setIcon('plus-circle')
            .onClick(async () => {
              const res = await incrementTaskPomodoroInFile(this.app, task);
              if (res) {
                new Notice(t('tasks.pomodoroIncrementedNotice', { text: task.text }));
                if (this.container) await this.render(this.container);
              }
            });
        });

        if ((task.completedPomodoros || 0) > 0) {
          menu.addItem((item) => {
            item
              .setTitle(t('tasks.decrementPomodoroTooltip'))
              .setIcon('minus-circle')
              .onClick(async () => {
                const res = await decrementTaskPomodoroInFile(this.app, task);
                if (res) {
                  new Notice(t('tasks.pomodoroDecrementedNotice', { text: task.text }));
                  if (this.container) await this.render(this.container);
                }
              });
          });
        }
      }

      // 4. Promote / Convert
      if (task.isIdea) {
        menu.addItem((item) => {
          item
            .setTitle(t('tasks.menuPromote'))
            .setIcon('zap')
            .onClick(async () => {
              await promoteIdeaToTaskInFile(this.app, task);
              new Notice(t('tasks.promotedToTaskNotice', { text: task.text }));
              if (this.container) await this.render(this.container);
            });
        });
      } else {
        menu.addItem((item) => {
          item
            .setTitle(t('tasks.menuConvertToIdea'))
            .setIcon('archive')
            .onClick(async () => {
              const newText = task.text.includes('#idea') ? task.text : `${task.text} #idea`;
              await updateTaskTextInFile(this.app, task, newText);
              new Notice(t('tasks.savedInIceboxNotice'));
              if (this.container) await this.render(this.container);
            });
        });
      }

      // 5. Open in note
      menu.addItem((item) => {
        item
          .setTitle(t('tasks.menuOpenInNote'))
          .setIcon('file-text')
          .onClick(async () => {
            await this.app.workspace.openLinkText(task.sourceFile, '', false);
          });
      });

      menu.addSeparator();

      // 6. Delete
      menu.addItem((item) => {
        item
          .setTitle(t('tasks.menuDelete'))
          .setIcon('trash-2')
          .setWarning(true)
          .onClick(async () => {
            await handleDeleteTask();
          });
      });

      menu.showAtMouseEvent(e);
    };

    itemCard.addEventListener('contextmenu', (e: MouseEvent) => {
      showTaskContextMenu(e);
    });

    // Checkbox or Icebox bullet
    const cbWrapper = itemCard.createDiv({ cls: 'study-flow-cb-wrapper' });
    let cb: HTMLInputElement | null = null;
    if (task.isIdea) {
      const iceboxBullet = cbWrapper.createSpan({ cls: 'study-flow-icebox-bullet' });
      setIcon(iceboxBullet, 'snowflake');
    } else {
      cb = cbWrapper.createEl('input', { type: 'checkbox' });
      cb.checked = task.completed;
      cb.addEventListener('change', async () => {
        await handleToggleCompletion(cb!.checked);
      });
    }

    // Main column
    const mainCol = itemCard.createDiv({ cls: 'study-flow-task-main-col' });

    if (isEditing) {
      // Inline Editing Input Row
      const editRow = mainCol.createDiv({ cls: 'study-flow-task-inline-edit' });
      const editInput = editRow.createEl('input', {
        type: 'text',
        cls: 'study-flow-inline-edit-input',
        value: task.text,
      });
      editInput.focus();

      const saveBtn = editRow.createEl('button', {
        cls: 'mod-cta study-flow-btn-xs',
        text: t('common.save'),
      });
      const cancelBtn = editRow.createEl('button', {
        cls: 'study-flow-btn-xs',
        text: t('common.cancel'),
      });

      const handleSave = async () => {
        const newText = editInput.value.trim();
        if (newText && newText !== task.text) {
          await updateTaskTextInFile(this.app, task, newText);
          new Notice(t('tasks.taskUpdatedNotice'));
        }
        this.editingTaskId = null;
        if (this.container) await this.render(this.container);
      };

      saveBtn.addEventListener('click', handleSave);
      editInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          handleSave();
        } else if (e.key === 'Escape') {
          e.preventDefault();
          this.editingTaskId = null;
          if (this.container) void this.render(this.container);
        }
      });
      cancelBtn.addEventListener('click', () => {
        this.editingTaskId = null;
        if (this.container) void this.render(this.container);
      });
    } else {
      // Normal Display Row
      const titleRow = mainCol.createDiv({ cls: 'study-flow-task-title-row' });
      const displayTitle = getCleanTaskDisplayTitle(task.text);
      const textSpan = titleRow.createEl('span', {
        text: displayTitle,
        cls: `study-flow-task-text ${task.completed ? 'is-strikethrough' : ''}`,
      });
      textSpan.addEventListener('click', () => {
        if (cb) {
          cb.checked = !cb.checked;
          cb.dispatchEvent(new Event('change'));
        }
      });

      // Tags & Badges Row
      const badgesRow = mainCol.createDiv({ cls: 'study-flow-task-badges-row' });

      // Subject tags chips first (Zen Minimal style)
      if (task.tags && task.tags.length > 0) {
        task.tags.forEach((tag) => {
          const matchedSubject = (this.plugin.settings.subjects || []).find((s) =>
            matchesSubjectTag(s.tag, [tag])
          );

          if (matchedSubject) {
            const tagChip = badgesRow.createSpan({
              cls: 'study-flow-subject-chip has-custom-color',
            });
            if (matchedSubject.color) {
              tagChip.style.borderColor = `${matchedSubject.color}66`;
              tagChip.style.backgroundColor = `${matchedSubject.color}1f`;
              tagChip.style.color = matchedSubject.color;
              const dot = tagChip.createSpan({ cls: 'study-flow-subject-dot' });
              dot.style.backgroundColor = matchedSubject.color;
            }
            tagChip.createSpan({ text: matchedSubject.name });
            tagChip.addEventListener('click', (e) => {
              e.stopPropagation();
              this.selectedSubjectTag = tag.startsWith('#') ? tag : `#${tag}`;
              this.taskView = 'subjects';
              if (this.container) void this.render(this.container);
            });
          } else {
            const tagChip = badgesRow.createSpan({
              text: tag.startsWith('#') ? tag : `#${tag}`,
              cls: 'study-flow-subject-chip',
            });
            tagChip.addEventListener('click', (e) => {
              e.stopPropagation();
              this.selectedSubjectTag = tag.startsWith('#') ? tag : `#${tag}`;
              this.taskView = 'subjects';
              if (this.container) void this.render(this.container);
            });
          }
        });
      }

      if (task.isIdea) {
        const iceSpan = badgesRow.createSpan({ cls: 'study-flow-priority-badge is-icebox' });
        const iceIcon = iceSpan.createSpan({ cls: 'study-flow-badge-icon' });
        setIcon(iceIcon, 'archive');
        iceSpan.createSpan({ text: t('tasks.iceboxBadge') });
      } else {
        const estCount = task.estimatedPomodoros || 0;
        const compCount = task.completedPomodoros || 0;
        if (estCount > 0 || compCount > 0) {
          let badgeLabel = '';
          let badgeCls = 'study-flow-estimate-badge';
          if (compCount > 0 && estCount > 0) {
            badgeLabel = `${compCount}/${estCount}`;
            if (compCount >= estCount) badgeCls += ' is-met';
          } else if (estCount > 0) {
            badgeLabel = `${estCount}`;
          } else if (compCount > 0) {
            badgeLabel = `${compCount}`;
          }
          const pBadge = badgesRow.createSpan({ cls: badgeCls });
          const pIcon = pBadge.createSpan({ cls: 'study-flow-badge-icon' });
          setIcon(pIcon, 'timer');
          pBadge.createSpan({ text: ` ${badgeLabel}` });
        }

        if (task.dueDate) {
          const badgeText =
            task.daysRemaining !== undefined
              ? formatDeadlineHuman(task.daysRemaining, task.dueDate)
              : task.dueDate;
          let badgeCls = 'study-flow-deadline-badge';
          let dlIconName = 'calendar';
          if (task.daysRemaining !== undefined) {
            if (task.daysRemaining < 0) {
              badgeCls += ' is-overdue';
              dlIconName = 'alert-circle';
            } else if (task.daysRemaining === 0) {
              badgeCls += ' is-today';
              dlIconName = 'clock';
            } else if (task.daysRemaining <= 3) {
              badgeCls += ' is-soon';
            }
          }
          const dlBadge = badgesRow.createSpan({ cls: badgeCls });
          const dlIcon = dlBadge.createSpan({ cls: 'study-flow-badge-icon' });
          setIcon(dlIcon, dlIconName);
          dlBadge.createSpan({ text: ` ${badgeText}` });
        }

        if (task.priority === 'high') {
          const prioSpan = badgesRow.createSpan({ cls: 'study-flow-priority-badge is-high' });
          const prioIcon = prioSpan.createSpan({ cls: 'study-flow-badge-icon' });
          setIcon(prioIcon, 'chevrons-up');
          prioSpan.createSpan({ text: ` ${t('priority.high')}` });
        } else if (task.priority === 'medium') {
          const prioSpan = badgesRow.createSpan({ cls: 'study-flow-priority-badge is-medium' });
          const prioIcon = prioSpan.createSpan({ cls: 'study-flow-badge-icon' });
          setIcon(prioIcon, 'chevron-up');
          prioSpan.createSpan({ text: ` ${t('priority.medium')}` });
        } else if (task.priority === 'low') {
          const prioSpan = badgesRow.createSpan({ cls: 'study-flow-priority-badge is-low' });
          const prioIcon = prioSpan.createSpan({ cls: 'study-flow-badge-icon' });
          setIcon(prioIcon, 'chevron-down');
          prioSpan.createSpan({ text: ` ${t('priority.low')}` });
        }
      }

      // Source indicator chip
      const isDaily = task.sourceFile.includes('/')
        ? task.sourceFile.split('/').pop()?.replace('.md', '')
        : task.sourceFile.replace('.md', '');
      const srcChip = badgesRow.createSpan({ cls: 'study-flow-source-chip' });
      const srcIcon = srcChip.createSpan({ cls: 'study-flow-badge-icon' });
      setIcon(srcIcon, task.sourceFile.includes('Inbox') ? 'inbox' : 'file-text');
      srcChip.createSpan({
        text: task.sourceFile.includes('Inbox') ? t('tasks.inboxSource') : ` ${isDaily}`,
      });
    }

    // Subtasks Section (if any exist)
    const hasSubtasks = task.subtasks && task.subtasks.length > 0;
    if (hasSubtasks) {
      const subtasksWrap = mainCol.createDiv({ cls: 'study-flow-subtasks-wrapper' });
      task.subtasks!.forEach((sub) => {
        const subItem = subtasksWrap.createDiv({ cls: 'study-flow-subtask-item' });
        const subCb = subItem.createEl('input', { type: 'checkbox', cls: 'study-flow-subtask-cb' });
        subCb.checked = sub.completed;
        subCb.addEventListener('change', async (e) => {
          e.stopPropagation();
          await toggleSubtaskInFile(this.app, task.sourceFile, sub.text, subCb.checked);
          sub.completed = subCb.checked;
          new Notice(subCb.checked ? t('tasks.subtaskCompletedNotice') : t('tasks.subtaskUnmarkedNotice'));
          if (this.container) await this.render(this.container);
        });

        const subSpan = subItem.createEl('span', {
          text: sub.text,
          cls: `study-flow-subtask-text ${sub.completed ? 'is-strikethrough' : ''}`,
        });
        subSpan.addEventListener('click', () => {
          subCb.checked = !subCb.checked;
          subCb.dispatchEvent(new Event('change'));
        });
      });
    }

    // Card Right-Side Actions Toolbar
    const actionsToolbar = itemCard.createDiv({ cls: 'study-flow-task-actions-toolbar' });

    if (!task.completed && !task.isIdea) {
      // Link to Pomodoro
      const linkPomodoroBtn = actionsToolbar.createEl('button', {
        cls: 'study-flow-icon-action-btn clickable-icon study-flow-task-primary-action',
        attr: { 'aria-label': t('tasks.focusPomodoroTooltip') },
      });
      setIcon(linkPomodoroBtn, 'timer');
      linkPomodoroBtn.addEventListener('click', async (e) => {
        e.stopPropagation();
        this.plugin.pomodoro.setActiveTask({
          id: task.id,
          text: task.text,
          sourceFile: task.sourceFile,
          originalLine: task.originalLine,
          lineNumber: task.lineNumber,
          lineHash: task.lineHash,
        });
        this.onSwitchTab('pomodoro');
      });

      // Add subtask quick button
      const addSubBtn = actionsToolbar.createEl('button', {
        cls: 'study-flow-icon-action-btn clickable-icon study-flow-task-hover-action',
        attr: { 'aria-label': t('tasks.addSubtaskTooltip') },
      });
      setIcon(addSubBtn, 'list-plus');
      addSubBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        new PromptModal(
          this.app,
          t('tasks.newSubtaskTitle', { text: task.text }),
          t('tasks.newSubtaskPlaceholder'),
          async (subtaskText) => {
            await addSubtaskToFile(this.app, task, subtaskText);
            new Notice(t('tasks.subtaskAddedNotice'));
            if (this.container) await this.render(this.container);
          }
        ).open();
      });
    }

    if (task.isIdea) {
      const promoteBtn = actionsToolbar.createEl('button', {
        cls: 'study-flow-promote-btn clickable-icon',
        attr: { 'aria-label': t('tasks.promoteTooltip') },
      });
      const pIcon = promoteBtn.createSpan({ cls: 'study-flow-btn-icon' });
      setIcon(pIcon, 'zap');
      promoteBtn.createSpan({ text: t('tasks.promoteBtn') });
      promoteBtn.addEventListener('click', async (e) => {
        e.stopPropagation();
        await promoteIdeaToTaskInFile(this.app, task);
        new Notice(t('tasks.promotedToTaskNotice', { text: task.text }));
        if (this.container) await this.render(this.container);
      });
    }

    // Edit inline button
    const editBtn = actionsToolbar.createEl('button', {
      cls: 'study-flow-icon-action-btn clickable-icon study-flow-task-hover-action',
      attr: { 'aria-label': t('tasks.editTooltip') },
    });
    setIcon(editBtn, 'pencil');
    editBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      this.editingTaskId = this.editingTaskId === task.id ? null : task.id;
      if (this.container) void this.render(this.container);
    });

    // Context Menu Trigger Button ("...")
    const moreBtn = actionsToolbar.createEl('button', {
      cls: 'study-flow-icon-action-btn clickable-icon study-flow-task-more-btn',
      attr: { 'aria-label': t('tasks.menuMoreActions') },
    });
    setIcon(moreBtn, 'more-vertical');
    moreBtn.addEventListener('click', (e: MouseEvent) => {
      e.stopPropagation();
      showTaskContextMenu(e);
    });
  }

  public onTasksChanged(): void {
    if (this.plugin.taskIndex) {
      this.tasks = this.plugin.taskIndex.getAllTasks();
    }
    if (this.container) {
      void this.render(this.container);
    }
  }

  destroy(): void {
    this.container = null;
  }
}
