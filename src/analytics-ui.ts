import { App, Notice, setIcon, TFile } from 'obsidian';
import type StudyFlowPlugin from './main';
import {
  buildAnalyticsSummary,
  computeSubjectsAnalyticsSummary,
  formatMinutesHuman,
} from './analytics';
import { loadFocusSessionsFromFile, syncHistoricalSessionsFromVault } from './storage-migration';
import { loadHabitsFromFile } from './habits';
import { extractAllTasksFromContent, TaskRecord } from './tasks';
import { getDailyNotePath } from './utils';
import { t } from './i18n/index.ts';

/**
 * Loads tasks from inbox and today's daily note to calculate task completion metrics.
 */
async function loadAllCurrentTasks(app: App, plugin: StudyFlowPlugin): Promise<TaskRecord[]> {
  if (plugin.taskIndex) {
    return plugin.taskIndex.getAllTasks();
  }

  const allTasks: TaskRecord[] = [];
  const processedKeys = new Set<string>();

  // 1. Inbox tasks
  const inboxPath = plugin.settings.inboxFilePath || 'Inbox.md';
  const inboxFile = app.vault.getAbstractFileByPath(inboxPath);
  if (inboxFile instanceof TFile) {
    try {
      const content = await app.vault.read(inboxFile);
      const inboxTasks = extractAllTasksFromContent(content, inboxFile.path);
      for (const t of inboxTasks) {
        const key = `${t.sourceFile}:${t.text}`;
        if (!processedKeys.has(key)) {
          processedKeys.add(key);
          allTasks.push(t);
        }
      }
    } catch (e) {
      console.error('Error cargando tareas de inbox para métricas', e);
    }
  }

  // 2. Today's daily note tasks
  try {
    const dailyPath = getDailyNotePath(plugin.settings, 0);
    const dailyFile = app.vault.getAbstractFileByPath(dailyPath);
    if (dailyFile instanceof TFile) {
      const content = await app.vault.read(dailyFile);
      const dailyTasks = extractAllTasksFromContent(content, dailyFile.path);
      for (const t of dailyTasks) {
        const key = `${t.sourceFile}:${t.text}`;
        if (!processedKeys.has(key)) {
          processedKeys.add(key);
          allTasks.push(t);
        }
      }
    }
  } catch (e) {
    console.error('Error cargando tareas de nota diaria para métricas', e);
  }

  return allTasks;
}

/**
 * Renders the full Analytics Dashboard into the given container.
 */
export async function renderAnalyticsDashboard(
  container: HTMLElement,
  app: App,
  plugin: StudyFlowPlugin,
  onRefresh?: () => Promise<void>
): Promise<void> {
  container.empty();
  const rootWrapper = container.createDiv({ cls: 'study-flow-analytics-wrapper' });

  // 1. Fetch data
  const habits = await loadHabitsFromFile(app, plugin.settings.habitsFilePath || 'Habits.md');
  const tasks = await loadAllCurrentTasks(app, plugin);
  const sessions =
    plugin.focusSessions && plugin.focusSessions.length > 0
      ? plugin.focusSessions
      : await loadFocusSessionsFromFile(app);
  const summary = buildAnalyticsSummary(sessions, habits, tasks);

  // 2. Header bar with sync action
  const headerCard = rootWrapper.createDiv({ cls: 'study-flow-analytics-header' });
  const titleBlock = headerCard.createDiv({ cls: 'study-flow-analytics-title-block' });
  
  const titleEl = titleBlock.createEl('h3', { text: t('analytics.title') });
  const headerIcon = titleEl.createSpan({ cls: 'study-flow-analytics-header-icon' });
  setIcon(headerIcon, 'bar-chart-2');
  
  titleBlock.createEl('p', {
    text: t('analytics.subtitle'),
    cls: 'study-flow-analytics-subtitle',
  });

  const headerActions = headerCard.createDiv({ cls: 'study-flow-analytics-actions' });
  
  const syncBtn = headerActions.createEl('button', {
    cls: 'study-flow-btn study-flow-btn-ghost',
    attr: { 'aria-label': t('analytics.syncTooltip') },
  });
  const syncIcon = syncBtn.createSpan();
  setIcon(syncIcon, 'refresh-cw');
  syncBtn.createSpan({ text: t('analytics.sync') });
  syncBtn.addEventListener('click', async () => {
    syncBtn.addClass('is-loading');
    const added = await syncHistoricalSessionsFromVault(app, plugin.settings, plugin);
    syncBtn.removeClass('is-loading');
    new Notice(t('analytics.syncCompleteNotice', { count: String(added) }));
    if (onRefresh) {
      await onRefresh();
    } else {
      await renderAnalyticsDashboard(container, app, plugin, onRefresh);
    }
  });

  // 3. KPI Highlights Cards (4 columns)
  const kpiGrid = rootWrapper.createDiv({ cls: 'study-flow-kpi-grid' });

  // KPI 1: Foco Hoy
  const kpiToday = kpiGrid.createDiv({ cls: 'study-flow-kpi-card' });
  const kpiTodayHeader = kpiToday.createDiv({ cls: 'study-flow-kpi-card-header' });
  kpiTodayHeader.createSpan({ text: t('analytics.kpiFocusToday'), cls: 'study-flow-kpi-title' });
  const kpiTodayIcon = kpiTodayHeader.createSpan({ cls: 'study-flow-kpi-icon is-primary' });
  setIcon(kpiTodayIcon, 'timer');
  kpiToday.createDiv({
    text: formatMinutesHuman(summary.todayFocusMinutes),
    cls: 'study-flow-kpi-value',
  });
  kpiToday.createDiv({
    text: summary.todaySessionCount === 1
      ? t('analytics.kpiSessionsCompleted_one', { count: '1' })
      : t('analytics.kpiSessionsCompleted_other', { count: String(summary.todaySessionCount) }),
    cls: 'study-flow-kpi-subtext',
  });

  // KPI 2: Foco Semana
  const kpiWeek = kpiGrid.createDiv({ cls: 'study-flow-kpi-card' });
  const kpiWeekHeader = kpiWeek.createDiv({ cls: 'study-flow-kpi-card-header' });
  kpiWeekHeader.createSpan({ text: t('analytics.kpiLast7Days'), cls: 'study-flow-kpi-title' });
  const kpiWeekIcon = kpiWeekHeader.createSpan({ cls: 'study-flow-kpi-icon is-accent' });
  setIcon(kpiWeekIcon, 'trending-up');
  kpiWeek.createDiv({
    text: formatMinutesHuman(summary.weekFocusMinutes),
    cls: 'study-flow-kpi-value',
  });
  kpiWeek.createDiv({
    text: t('analytics.kpiDailyAverage', { avg: formatMinutesHuman(summary.dailyAverageMinutes) }),
    cls: 'study-flow-kpi-subtext',
  });

  // KPI 3: Hábitos
  const kpiHabits = kpiGrid.createDiv({ cls: 'study-flow-kpi-card' });
  const kpiHabitsHeader = kpiHabits.createDiv({ cls: 'study-flow-kpi-card-header' });
  kpiHabitsHeader.createSpan({ text: t('analytics.kpiHabitConsistency'), cls: 'study-flow-kpi-title' });
  const kpiHabitsIcon = kpiHabitsHeader.createSpan({ cls: 'study-flow-kpi-icon is-warning' });
  setIcon(kpiHabitsIcon, 'flame');
  kpiHabits.createDiv({
    text: `${summary.habits.weeklyCompletionRate}%`,
    cls: 'study-flow-kpi-value',
  });
  kpiHabits.createDiv({
    text: t('analytics.kpiHabitsToday', { completed: String(summary.habits.completedTodayCount), total: String(summary.habits.totalHabits) }),
    cls: 'study-flow-kpi-subtext',
  });

  // KPI 4: Tareas
  const kpiTasks = kpiGrid.createDiv({ cls: 'study-flow-kpi-card' });
  const kpiTasksHeader = kpiTasks.createDiv({ cls: 'study-flow-kpi-card-header' });
  kpiTasksHeader.createSpan({ text: t('analytics.kpiTaskResolution'), cls: 'study-flow-kpi-title' });
  const kpiTasksIcon = kpiTasksHeader.createSpan({ cls: 'study-flow-kpi-icon is-success' });
  setIcon(kpiTasksIcon, 'check-circle-2');
  kpiTasks.createDiv({
    text: `${summary.tasks.completionRate}%`,
    cls: 'study-flow-kpi-value',
  });
  const pomoSubtext = summary.tasks.totalEstimatedPomodoros > 0
    ? t('analytics.kpiPomodorosSubtext', { completed: String(summary.tasks.totalCompletedPomodoros), total: String(summary.tasks.totalEstimatedPomodoros) })
    : '';
  kpiTasks.createDiv({
    text: t('analytics.kpiTasksSubtext', { completed: String(summary.tasks.totalCompleted), pending: String(summary.tasks.totalPending), pomos: pomoSubtext }),
    cls: 'study-flow-kpi-subtext',
  });

  // 4. Weekly Focus Bar Chart Card
  const chartCard = rootWrapper.createDiv({ cls: 'study-flow-card study-flow-chart-card' });
  const chartHeader = chartCard.createDiv({ cls: 'study-flow-chart-header' });
  const chartTitleLeft = chartHeader.createDiv({ cls: 'study-flow-chart-title-left' });
  const chartIcon = chartTitleLeft.createSpan({ cls: 'study-flow-chart-icon' });
  setIcon(chartIcon, 'activity');
  chartTitleLeft.createEl('h4', { text: t('analytics.chartTitle') });

  chartHeader.createDiv({
    cls: 'study-flow-chart-badge',
    text: t('analytics.chartWeeklyTotal', { total: formatMinutesHuman(summary.weekFocusMinutes) }),
  });

  // Render Bar Chart
  const maxDayMinutes = Math.max(
    60,
    ...summary.last7Days.map((d) => d.totalMinutes)
  );

  const barChartContainer = chartCard.createDiv({ cls: 'study-flow-bar-chart' });

  for (const day of summary.last7Days) {
    const col = barChartContainer.createDiv({
      cls: `study-flow-bar-col ${day.isToday ? 'is-today' : ''}`,
    });

    // Time pill
    const valText = day.totalMinutes > 0 ? formatMinutesHuman(day.totalMinutes) : '0m';
    col.createDiv({
      cls: 'study-flow-bar-val',
      text: valText,
    });

    // Track
    const track = col.createDiv({ cls: 'study-flow-bar-track' });
    const fillPercent = Math.max(
      day.totalMinutes > 0 ? 10 : 3,
      Math.round((day.totalMinutes / maxDayMinutes) * 100)
    );

    const fill = track.createDiv({
      cls: `study-flow-bar-fill ${day.isToday ? 'is-today-fill' : ''}`,
    });
    fill.style.height = `${fillPercent}%`;

    // Label
    const label = col.createDiv({ cls: 'study-flow-bar-label' });
    label.createSpan({ text: day.shortDay, cls: 'study-flow-bar-day' });
    label.createSpan({ text: day.date.slice(8, 10), cls: 'study-flow-bar-date' });
    if (day.isToday) {
      label.createSpan({ text: t('analytics.chartTodayPill'), cls: 'study-flow-bar-today-pill' });
    }
  }

  // 5. Weekly Subject Progress Section (Materia)
  const subjectsSummary = computeSubjectsAnalyticsSummary(
    sessions,
    tasks,
    plugin.settings.subjects || []
  );

  const subjectsCard = rootWrapper.createDiv({ cls: 'study-flow-card study-flow-subjects-card' });
  const subHeader = subjectsCard.createDiv({ cls: 'study-flow-chart-header' });
  const subTitleLeft = subHeader.createDiv({ cls: 'study-flow-chart-title-left' });
  const subIcon = subTitleLeft.createSpan({ cls: 'study-flow-chart-icon' });
  setIcon(subIcon, 'book-open');
  subTitleLeft.createEl('h4', { text: t('analytics.subjectsSectionTitle') });

  subHeader.createDiv({
    cls: 'study-flow-chart-badge',
    text: `${subjectsSummary.weekStartDate} — ${subjectsSummary.weekEndDate}`,
  });

  if (subjectsSummary.subjects.length === 0) {
    const emptyBox = subjectsCard.createDiv({ cls: 'study-flow-empty-state' });
    const emptyIcon = emptyBox.createDiv({ cls: 'study-flow-empty-icon' });
    setIcon(emptyIcon, 'book-open');
    emptyBox.createEl('h4', { text: t('analytics.subjectsEmptyTitle') });
    emptyBox.createEl('p', { text: t('analytics.subjectsEmptyDesc') });
    const settingsBtn = emptyBox.createEl('button', {
      cls: 'mod-cta study-flow-btn-sm',
      text: t('analytics.goToSettingsBtn'),
    });
    settingsBtn.addEventListener('click', () => {
      try {
        const settingObj = (app as any).setting;
        if (settingObj?.open) {
          settingObj.open();
          if (settingObj.openTabById && plugin.manifest?.id) {
            settingObj.openTabById(plugin.manifest.id);
          }
        }
      } catch (e) {
        console.error('Error opening settings:', e);
      }
    });
  } else {
    const subList = subjectsCard.createDiv({ cls: 'study-flow-subjects-list' });
    for (const item of subjectsSummary.subjects) {
      const row = subList.createDiv({ cls: 'study-flow-subject-progress-item' });

      // Header row of subject
      const itemHeader = row.createDiv({ cls: 'study-flow-subject-item-header' });
      const titleBox = itemHeader.createDiv({ cls: 'study-flow-subject-item-title-box' });

      const badge = titleBox.createSpan({ cls: 'study-flow-subject-badge' });
      if (item.subject.color) {
        const dot = badge.createSpan({ cls: 'study-flow-subject-dot' });
        dot.style.backgroundColor = item.subject.color;
      }
      const nameEl = badge.createSpan({ text: item.subject.name });
      if (item.subject.color) {
        nameEl.style.color = item.subject.color;
      }

      titleBox.createSpan({
        text: item.subject.tag,
        cls: 'study-flow-subject-item-tag',
      });

      // Goal streak badge (racha de cumplimiento de metas)
      const streakBadge = itemHeader.createSpan({
        cls: `study-flow-subject-streak-badge ${item.goalStreakWeeks > 0 ? '' : 'is-zero'}`,
      });
      const flameIcon = streakBadge.createSpan();
      setIcon(flameIcon, 'flame');
      streakBadge.createSpan({
        text: item.goalStreakWeeks > 0
          ? t('analytics.subjectStreak', { count: String(item.goalStreakWeeks) })
          : t('analytics.subjectStreakNone'),
      });

      // Goal vs Actual Bar row (barra meta vs real)
      const metaRow = row.createDiv({ cls: 'study-flow-subject-meta-row' });
      const goalHours = item.subject.weeklyGoalHours || 0;
      const actualHoursStr = formatMinutesHuman(item.actualMinutes);
      const goalHoursStr = `${goalHours}h`;

      metaRow.createSpan({
        cls: 'study-flow-subject-time-text',
        text: `${actualHoursStr} / ${goalHoursStr} (${item.percentage}%)`,
      });

      if (item.actualMinutes >= item.goalMinutes && item.goalMinutes > 0) {
        const metBadge = metaRow.createSpan({ cls: 'study-flow-subject-goal-met-badge' });
        const checkIcon = metBadge.createSpan();
        setIcon(checkIcon, 'check');
        metBadge.createSpan({ text: t('analytics.subjectGoalMet') });
      }

      // Progress bar track & fill
      const track = row.createDiv({ cls: 'study-flow-subject-track' });
      const fill = track.createDiv({ cls: 'study-flow-subject-fill' });
      fill.style.width = `${Math.min(100, Math.max(0, item.percentage))}%`;
      if (item.subject.color) {
        fill.style.backgroundColor = item.subject.color;
      }

      // Pomodoros row (estimado vs real de pomodoros por materia)
      const pomoRow = row.createDiv({ cls: 'study-flow-subject-pomo-row' });
      const pomoText = item.estimatedPomodoros > 0
        ? t('analytics.subjectPomodorosEstimateVsReal', {
            completed: String(item.completedPomodoros),
            estimated: String(item.estimatedPomodoros),
          })
        : t('analytics.subjectPomodorosCompleted', {
            completed: String(item.completedPomodoros),
          });

      pomoRow.createSpan({ text: pomoText });

      if (item.actualSessionsCount > 0) {
        pomoRow.createSpan({
          text: item.actualSessionsCount === 1
            ? t('analytics.kpiSessionsCompleted_one', { count: '1' })
            : t('analytics.kpiSessionsCompleted_other', { count: String(item.actualSessionsCount) }),
          cls: 'study-flow-text-muted',
        });
      }
    }
  }

  // 6. Two-Column Lower Grid: Tag Distribution & Breakdown
  const subGrid = rootWrapper.createDiv({ cls: 'study-flow-analytics-subgrid' });

  // Left: Distribution by tag/subject
  const tagCard = subGrid.createDiv({ cls: 'study-flow-card' });
  const tagHeader = tagCard.createDiv({ cls: 'study-flow-card-header-row' });
  const tagTitleLeft = tagHeader.createDiv({ cls: 'study-flow-chart-title-left' });
  const tagIcon = tagTitleLeft.createSpan({ cls: 'study-flow-chart-icon' });
  setIcon(tagIcon, 'tag');
  tagTitleLeft.createEl('h4', { text: t('analytics.tagDistributionTitle') });

  if (summary.tagDistribution.length === 0) {
    const emptyBox = tagCard.createDiv({ cls: 'study-flow-empty-state' });
    emptyBox.createEl('p', {
      text: t('analytics.noTagsYet'),
    });
    emptyBox.createEl('small', {
      text: t('analytics.noTagsTip'),
      cls: 'study-flow-text-muted',
    });
  } else {
    const tagList = tagCard.createDiv({ cls: 'study-flow-tag-list' });
    for (const item of summary.tagDistribution) {
      const tagRow = tagList.createDiv({ cls: 'study-flow-tag-row' });
      
      const tagMeta = tagRow.createDiv({ cls: 'study-flow-tag-meta' });
      const tagLabel = tagMeta.createSpan({ cls: 'study-flow-tag-badge', text: item.tag });
      const tagStats = tagMeta.createSpan({
        cls: 'study-flow-tag-time',
        text: `${formatMinutesHuman(item.totalMinutes)} (${item.percentage}%)`,
      });

      const track = tagRow.createDiv({ cls: 'study-flow-tag-track' });
      const fill = track.createDiv({ cls: 'study-flow-tag-fill' });
      fill.style.width = `${item.percentage}%`;
    }
  }

  // Right: Habit & Task detailed health
  const healthCard = subGrid.createDiv({ cls: 'study-flow-card' });
  const healthHeader = healthCard.createDiv({ cls: 'study-flow-card-header-row' });
  const healthTitleLeft = healthHeader.createDiv({ cls: 'study-flow-chart-title-left' });
  const healthIcon = healthTitleLeft.createSpan({ cls: 'study-flow-chart-icon' });
  setIcon(healthIcon, 'check-square');
  healthTitleLeft.createEl('h4', { text: t('analytics.taskHabitHealthTitle') });

  // Priority distribution pills
  const taskSection = healthCard.createDiv({ cls: 'study-flow-health-section' });
  taskSection.createEl('h5', { text: t('analytics.pendingByPriorityTitle'), cls: 'study-flow-subheading' });
  const priorityPills = taskSection.createDiv({ cls: 'study-flow-priority-pills' });

  const pHigh = priorityPills.createSpan({ cls: 'study-flow-priority-pill is-high' });
  const hIcon = pHigh.createSpan({ cls: 'study-flow-pill-icon' });
  setIcon(hIcon, 'chevrons-up');
  pHigh.createSpan({ text: t('analytics.priorityHigh') });
  pHigh.createEl('strong', { text: String(summary.tasks.byPriority.high) });

  const pMed = priorityPills.createSpan({ cls: 'study-flow-priority-pill is-medium' });
  const mIcon = pMed.createSpan({ cls: 'study-flow-pill-icon' });
  setIcon(mIcon, 'chevron-up');
  pMed.createSpan({ text: t('analytics.priorityMedium') });
  pMed.createEl('strong', { text: String(summary.tasks.byPriority.medium) });

  const pLow = priorityPills.createSpan({ cls: 'study-flow-priority-pill is-low' });
  const lIcon = pLow.createSpan({ cls: 'study-flow-pill-icon' });
  setIcon(lIcon, 'chevron-down');
  pLow.createSpan({ text: t('analytics.priorityLow') });
  pLow.createEl('strong', { text: String(summary.tasks.byPriority.low) });

  const pNone = priorityPills.createSpan({ cls: 'study-flow-priority-pill is-none' });
  pNone.createSpan({ text: t('analytics.priorityNormal') });
  pNone.createEl('strong', { text: String(summary.tasks.byPriority.none) });

  if (summary.tasks.totalEstimatedPomodoros > 0) {
    const pPomo = priorityPills.createSpan({ cls: 'study-flow-priority-pill is-pomo' });
    const pomoIcon = pPomo.createSpan({ cls: 'study-flow-pill-icon' });
    setIcon(pomoIcon, 'timer');
    pPomo.createSpan({ text: t('analytics.priorityPomodoros') });
    pPomo.createEl('strong', { text: `${summary.tasks.totalCompletedPomodoros}/${summary.tasks.totalEstimatedPomodoros}` });
  }

  // Habit consistency list
  const habitSection = healthCard.createDiv({ cls: 'study-flow-health-section' });
  habitSection.createEl('h5', { text: t('analytics.activeHabitStreaksTitle'), cls: 'study-flow-subheading' });

  if (habits.length === 0) {
    habitSection.createEl('p', {
      text: t('analytics.noHabitsCreated'),
      cls: 'study-flow-text-muted',
    });
  } else {
    const habitList = habitSection.createDiv({ cls: 'study-flow-analytics-habit-list' });
    for (const h of habits.slice(0, 5)) {
      const row = habitList.createDiv({ cls: 'study-flow-analytics-habit-row' });
      row.createSpan({ text: h.name, cls: 'study-flow-analytics-habit-name' });
      
      const badge = row.createSpan({ cls: 'study-flow-analytics-streak-badge' });
      const fIcon = badge.createSpan({ cls: 'study-flow-streak-icon' });
      setIcon(fIcon, 'flame');
      badge.createSpan({ text: t('analytics.habitStreakDays', { count: String(h.streak) }) });

      const todayPill = row.createSpan({
        cls: `study-flow-analytics-today-status ${h.completedToday ? 'is-done' : 'is-pending'}`,
        text: h.completedToday ? t('analytics.habitDoneToday') : t('analytics.habitPendingToday'),
      });
    }
  }
}
