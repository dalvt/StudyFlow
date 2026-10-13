import { App, Notice, setIcon } from 'obsidian';
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
import { matchesSubjectTag } from '../subject-analytics';
import {
  getSpacedRepetitionQueue,
  reviewSpacedNote,
  type SpacedRepetitionNoteItem,
} from '../spaced-repetition';
import { t } from '../i18n/index.ts';

export class TasksTab implements TabComponent {
  private app: App;
  private plugin: StudyFlowPlugin;
  private container: HTMLElement | null = null;
  private onSwitchTab: (tab: ActiveTab) => void;

  private tasks: TaskRecord[] = [];
  private spacedNotesQueue: SpacedRepetitionNoteItem[] = [];
  private taskFilter: 'inbox' | 'today' | 'subjects' | 'spaced' | 'icebox' | 'completed' | 'all' = 'inbox';
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

    try {
      this.spacedNotesQueue = await getSpacedRepetitionQueue(this.app);
    } catch (e) {
      this.spacedNotesQueue = [];
    }

    const card = container.createDiv({ cls: 'study-flow-card study-flow-tasks-main-card' });

    const pendingTasks = this.tasks.filter((t) => !t.completed && !t.isIdea);
    const inboxTasks = this.tasks.filter((t) => !t.completed && !t.isIdea && (!t.tags || t.tags.length === 0));
    const subjectTasks = this.tasks.filter((t) => !t.completed && !t.isIdea && t.tags && t.tags.length > 0);
    const todayTasks = pendingTasks.filter(
      (t) => (t.daysRemaining !== undefined && t.daysRemaining <= 0) || t.dueDate === formatDateKey(new Date())
    );
    const dueSpacedNotes = this.spacedNotesQueue.filter((n) => n.isDueToday);
    const iceboxTasks = this.tasks.filter((t) => !t.completed && t.isIdea);
    const completedTasks = this.tasks.filter((t) => t.completed && !t.isIdea);
    const totalActionableTasks = this.tasks.filter((t) => !t.isIdea).length;

    // 1. Segmented Views Tabs (At top, replaces redundant stats bar)
    const filterRow = card.createDiv({ cls: 'study-flow-segmented-control study-flow-tasks-nav' });
    const filters: Array<{
      id: 'inbox' | 'today' | 'subjects' | 'spaced' | 'icebox' | 'completed' | 'all';
      label: string;
      count: number;
      icon: string;
    }> = [
      { id: 'inbox', label: t('tasks.filterInbox'), count: inboxTasks.length, icon: 'inbox' },
      { id: 'today', label: t('tasks.filterToday'), count: todayTasks.length, icon: 'calendar-check' },
      { id: 'subjects', label: t('tasks.filterSubjects'), count: subjectTasks.length, icon: 'book-open' },
      { id: 'spaced', label: t('tasks.filterSpaced'), count: dueSpacedNotes.length, icon: 'repeat' },
      { id: 'icebox', label: t('tasks.filterIcebox'), count: iceboxTasks.length, icon: 'snowflake' },
      { id: 'completed', label: t('tasks.filterCompleted'), count: completedTasks.length, icon: 'check-circle' },
      { id: 'all', label: t('tasks.filterAll'), count: totalActionableTasks, icon: 'layers' },
    ];

    filters.forEach((f) => {
      const btn = filterRow.createEl('button', {
        cls: `study-flow-segmented-btn ${this.taskFilter === f.id ? 'is-active' : ''}`,
        attr: { 'aria-label': `${f.label} (${f.count})` },
      });
      const iconSpan = btn.createSpan({ cls: 'study-flow-tab-icon' });
      setIcon(iconSpan, f.icon);
      btn.createSpan({ text: f.label, cls: 'study-flow-segmented-label' });
      btn.createSpan({ text: String(f.count), cls: 'study-flow-count-pill' });
      btn.addEventListener('click', async () => {
        this.taskFilter = f.id;
        this.selectedSubjectTag = null;
        if (this.container) await this.render(this.container);
      });
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
    searchInput.addEventListener('input', () => {
      this.taskSearchQuery = searchInput.value.trim().toLowerCase();
      renderList();
    });

    if (this.taskSearchQuery) {
      const clearBtn = searchWrap.createEl('button', {
        cls: 'study-flow-search-clear-btn',
        attr: { 'aria-label': t('tasks.clearSearch') },
      });
      setIcon(clearBtn, 'x');
      clearBtn.addEventListener('click', () => {
        this.taskSearchQuery = '';
        searchInput.value = '';
        renderList();
      });
    }

    const sortSelect = searchRow.createEl('select', {
      cls: 'study-flow-tasks-sort-select',
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

    const triggerBox = card.createDiv({ cls: 'study-flow-cloud-trigger-bar' });
    const triggerLeft = triggerBox.createDiv({ cls: 'study-flow-trigger-left' });
    const plusSpan = triggerLeft.createSpan({ cls: 'study-flow-trigger-plus' });
    setIcon(plusSpan, 'plus');
    triggerLeft.createSpan({
      text: t('tasks.newTaskPlaceholder'),
      cls: 'study-flow-trigger-label',
    });

    const triggerRight = triggerBox.createDiv({ cls: 'study-flow-trigger-right' });
    const cloudBtn = triggerRight.createEl('button', {
      cls: 'study-flow-trigger-cloud-btn',
      attr: { 'aria-label': t('tasks.openCloudTooltip') },
    });
    const cIcon = cloudBtn.createSpan({ cls: 'study-flow-btn-icon' });
    setIcon(cIcon, 'cloud');
    cloudBtn.createSpan({ text: t('tasks.openCloud') });

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
    cloudBtn.addEventListener('click', (e: MouseEvent) => {
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
    // 0. Spaced view mode
    if (this.taskFilter === 'spaced') {
      let spacedItems = this.spacedNotesQueue.filter((n) => n.isDueToday);
      if (this.taskSearchQuery) {
        const q = this.taskSearchQuery.toLowerCase();
        spacedItems = spacedItems.filter(
          (n) => n.title.toLowerCase().includes(q) || n.path.toLowerCase().includes(q)
        );
      }
      this.renderSpacedRepetitionSection(listContainer, spacedItems);
      return;
    }

    // 0b. Spaced repetition queue section in 'today' view
    if (this.taskFilter === 'today' && !this.selectedSubjectTag) {
      let dueSpaced = this.spacedNotesQueue.filter((n) => n.isDueToday);
      if (this.taskSearchQuery) {
        const q = this.taskSearchQuery.toLowerCase();
        dueSpaced = dueSpaced.filter(
          (n) => n.title.toLowerCase().includes(q) || n.path.toLowerCase().includes(q)
        );
      }
      if (dueSpaced.length > 0) {
        this.renderSpacedRepetitionSection(listContainer, dueSpaced);
      }
    }

    // 1. Filter by view mode
    let filtered = this.tasks.filter((t) => {
      if (this.taskFilter === 'inbox') return !t.completed && !t.isIdea && (!t.tags || t.tags.length === 0);
      if (this.taskFilter === 'today') {
        if (t.completed || t.isIdea) return false;
        const isOverdueOrToday = t.daysRemaining !== undefined && t.daysRemaining <= 0;
        const isTodayDate = t.dueDate === formatDateKey(new Date());
        return isOverdueOrToday || isTodayDate;
      }
      if (this.taskFilter === 'subjects') return !t.completed && !t.isIdea && Boolean(t.tags && t.tags.length > 0);
      if (this.taskFilter === 'icebox') return !t.completed && t.isIdea;
      if (this.taskFilter === 'completed') return t.completed && !t.isIdea;
      return !t.isIdea; // 'all' only includes actionable tasks
    });

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
      filtered = filtered.filter((t) => t.tags && t.tags.includes(this.selectedSubjectTag!));
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
      if (this.taskFilter === 'icebox') {
        setIcon(emptyIcon, 'snowflake');
        emptyState.createEl('h4', { text: t('tasks.emptyIceboxTitle') });
        emptyState.createEl('p', { text: t('tasks.emptyIceboxDesc') });
      } else if (this.taskFilter === 'today') {
        setIcon(emptyIcon, 'calendar-check');
        emptyState.createEl('h4', { text: t('tasks.emptyTodayTitle') });
        emptyState.createEl('p', { text: t('tasks.emptyTodayDesc') });
      } else if (this.taskFilter === 'completed') {
        setIcon(emptyIcon, 'check-circle-2');
        emptyState.createEl('h4', { text: t('tasks.emptyCompletedTitle') });
        emptyState.createEl('p', { text: t('tasks.emptyCompletedDesc') });
      } else if (this.taskFilter === 'subjects') {
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
    if (this.taskFilter === 'subjects' && !this.selectedSubjectTag) {
      const groups = new Map<string, TaskRecord[]>();
      filtered.forEach((task) => {
        const tags = (task.tags && task.tags.length > 0) ? task.tags : ['#general'];
        tags.forEach((tag) => {
          const groupName = tag.startsWith('#') ? tag : `#${tag}`;
          if (!groups.has(groupName)) {
            groups.set(groupName, []);
          }
          groups.get(groupName)!.push(task);
        });
      });

      groups.forEach((tasksInGroup, groupTag) => {
        const matchedSubject = (this.plugin.settings.subjects || []).find((s) =>
          matchesSubjectTag(s.tag, [groupTag])
        );
        const groupCard = listContainer.createDiv({ cls: 'study-flow-subject-group-box' });
        const groupHeader = groupCard.createDiv({ cls: 'study-flow-subject-group-header' });
        const headerLeft = groupHeader.createDiv({ cls: 'study-flow-subject-header-left' });
        const gIcon = headerLeft.createSpan({ cls: 'study-flow-subject-icon' });
        setIcon(gIcon, 'book-open');
        if (matchedSubject?.color) {
          gIcon.style.color = matchedSubject.color;
        }
        const titleEl = headerLeft.createEl('h4', {
          text: (matchedSubject ? matchedSubject.name : groupTag).toUpperCase(),
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
      const banner = listContainer.createDiv({ cls: 'study-flow-subject-active-banner' });
      const bIcon = banner.createSpan({ cls: 'study-flow-banner-icon' });
      setIcon(bIcon, 'book-open');
      banner.createSpan({ text: t('tasks.filteringBy', { tag: this.selectedSubjectTag }) });
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

  private renderSpacedRepetitionSection(container: HTMLElement, items: SpacedRepetitionNoteItem[]): void {
    const card = container.createDiv({ cls: 'study-flow-spaced-card' });
    const header = card.createDiv({ cls: 'study-flow-spaced-header' });
    const headerLeft = header.createDiv({ cls: 'study-flow-spaced-header-left' });
    const icon = headerLeft.createSpan({ cls: 'study-flow-spaced-icon' });
    setIcon(icon, 'repeat');
    headerLeft.createEl('h4', { text: t('spaced.todayQueue') });
    header.createSpan({
      text: t('spaced.dueCount', { count: String(items.length) }),
      cls: 'study-flow-count-pill',
    });

    if (items.length === 0) {
      const emptyDiv = card.createDiv({ cls: 'study-flow-spaced-empty' });
      emptyDiv.createEl('p', { text: t('spaced.emptyQueueTitle'), cls: 'study-flow-spaced-empty-title' });
      emptyDiv.createEl('span', { text: t('spaced.emptyQueueDesc'), cls: 'study-flow-card-sub' });
      return;
    }

    const list = card.createDiv({ cls: 'study-flow-spaced-list' });
    for (const item of items) {
      const row = list.createDiv({ cls: 'study-flow-spaced-item' });
      const rowLeft = row.createDiv({ cls: 'study-flow-spaced-item-left' });
      const docIcon = rowLeft.createSpan({ cls: 'study-flow-spaced-doc-icon' });
      setIcon(docIcon, 'file-text');

      const titleLink = rowLeft.createSpan({
        text: item.title,
        cls: 'study-flow-spaced-title-link',
        attr: { 'aria-label': item.path },
      });
      titleLink.addEventListener('click', () => {
        void this.app.workspace.openLinkText(item.path, '', false);
      });

      const badges = rowLeft.createDiv({ cls: 'study-flow-spaced-badges' });
      badges.createSpan({
        text: t('spaced.intervalBadge', { interval: String(item.interval) }),
        cls: 'study-flow-spaced-interval-badge',
      });

      if (item.daysOverdue > 0) {
        badges.createSpan({
          text: t('spaced.overdueBadge', { days: String(item.daysOverdue) }),
          cls: 'study-flow-spaced-overdue-badge',
        });
      } else {
        badges.createSpan({
          text: t('spaced.todayBadge'),
          cls: 'study-flow-spaced-today-badge',
        });
      }

      const actions = row.createDiv({ cls: 'study-flow-spaced-actions' });
      const hardBtn = actions.createEl('button', {
        text: t('spaced.hardBtn'),
        cls: 'study-flow-spaced-btn-hard',
      });
      hardBtn.addEventListener('click', async (e) => {
        e.stopPropagation();
        try {
          await reviewSpacedNote(this.app, item.file, 'dificil');
          new Notice(t('spaced.reviewedHardNotice', { title: item.title }));
          if (this.container) await this.render(this.container);
        } catch (err) {
          console.error('Error reviewing spaced note (dificil):', err);
        }
      });

      const easyBtn = actions.createEl('button', {
        text: t('spaced.easyBtn'),
        cls: 'study-flow-btn-primary study-flow-spaced-btn-easy',
      });
      easyBtn.addEventListener('click', async (e) => {
        e.stopPropagation();
        try {
          const res = await reviewSpacedNote(this.app, item.file, 'facil');
          new Notice(t('spaced.reviewedEasyNotice', { title: item.title, next: res.nextReviewDate }));
          if (this.container) await this.render(this.container);
        } catch (err) {
          console.error('Error reviewing spaced note (facil):', err);
        }
      });
    }
  }

  private renderTaskCardItem(container: HTMLElement, task: TaskRecord, rootContainer: HTMLElement): void {
    const isEditing = this.editingTaskId === task.id;
    const itemCard = container.createDiv({
      cls: `study-flow-task-card ${task.completed ? 'is-done' : ''} ${isEditing ? 'is-editing' : ''}`,
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
        await toggleTaskCompletionInFile(this.app, task, cb!.checked);
        task.completed = cb!.checked;
        new Notice(cb!.checked ? t('tasks.markedCompletedNotice') : t('tasks.unmarkedNotice'));
        if (this.container) await this.render(this.container);
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
              this.taskFilter = 'subjects';
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
              this.taskFilter = 'subjects';
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
          if (task.daysRemaining !== undefined) {
            if (task.daysRemaining < 0) badgeCls += ' is-overdue';
            else if (task.daysRemaining === 0) badgeCls += ' is-today';
            else if (task.daysRemaining <= 3) badgeCls += ' is-soon';
          }
          const dlBadge = badgesRow.createSpan({ cls: badgeCls });
          const dlIcon = dlBadge.createSpan({ cls: 'study-flow-badge-icon' });
          setIcon(dlIcon, 'calendar');
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
      // Quick Pomodoro decrement (if at least 1 completed)
      if ((task.completedPomodoros || 0) > 0) {
        const minusPomoBtn = actionsToolbar.createEl('button', {
          cls: 'study-flow-icon-action-btn study-flow-pomo-minus-btn',
          attr: { 'aria-label': t('tasks.decrementPomodoroTooltip') },
        });
        const mIcon = minusPomoBtn.createSpan({ cls: 'study-flow-btn-icon' });
        setIcon(mIcon, 'minus');
        minusPomoBtn.createSpan({ text: '1' });
        minusPomoBtn.addEventListener('click', async (e) => {
          e.stopPropagation();
          const res = await decrementTaskPomodoroInFile(this.app, task);
          if (res) {
            new Notice(t('tasks.pomodoroDecrementedNotice', { text: task.text }));
            if (this.container) await this.render(this.container);
          }
        });
      }

      // Quick Pomodoro increment
      const addPomoBtn = actionsToolbar.createEl('button', {
        cls: 'study-flow-icon-action-btn study-flow-pomo-step-btn',
        attr: { 'aria-label': t('tasks.incrementPomodoroTooltip') },
      });
      const aIcon = addPomoBtn.createSpan({ cls: 'study-flow-btn-icon' });
      setIcon(aIcon, 'plus');
      addPomoBtn.createSpan({ text: '1' });
      addPomoBtn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const res = await incrementTaskPomodoroInFile(this.app, task);
        if (res) {
          new Notice(t('tasks.pomodoroIncrementedNotice', { text: task.text }));
          if (this.container) await this.render(this.container);
        }
      });

      // Link to Pomodoro
      const linkPomodoroBtn = actionsToolbar.createEl('button', {
        cls: 'study-flow-icon-action-btn',
        attr: { 'aria-label': t('tasks.focusPomodoroTooltip') },
      });
      setIcon(linkPomodoroBtn, 'timer');
      linkPomodoroBtn.addEventListener('click', async (e) => {
        e.stopPropagation();
        this.plugin.pomodoro.setActiveTask({
          id: task.id,
          text: task.text,
          sourceFile: task.sourceFile,
        });
        this.onSwitchTab('pomodoro');
      });

      // Add subtask quick button
      const addSubBtn = actionsToolbar.createEl('button', {
        cls: 'study-flow-icon-action-btn',
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
        cls: 'study-flow-promote-btn',
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
      cls: 'study-flow-icon-action-btn',
      attr: { 'aria-label': t('tasks.editTooltip') },
    });
    setIcon(editBtn, 'pencil');
    editBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      this.editingTaskId = this.editingTaskId === task.id ? null : task.id;
      if (this.container) void this.render(this.container);
    });

    // Delete button
    const delBtn = actionsToolbar.createEl('button', {
      cls: 'study-flow-icon-action-btn study-flow-delete-btn',
      attr: { 'aria-label': t('tasks.deleteTooltip') },
    });
    setIcon(delBtn, 'trash-2');
    delBtn.addEventListener('click', async (e) => {
      e.stopPropagation();
      await deleteTaskFromFile(this.app, task);
      new Notice(t('tasks.entryDeletedNotice'));
      if (this.container) await this.render(this.container);
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
