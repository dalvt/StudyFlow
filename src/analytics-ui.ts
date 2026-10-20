import { App, Notice, setIcon, TFile } from 'obsidian';
import type StudyFlowPlugin from './main';
import {
  buildAnalyticsSummary,
  formatMinutesHuman,
  computeFocusAllocation,
  getLocalWeekRange,
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
  // 1. Fetch data
  const habits = await loadHabitsFromFile(app, plugin.settings.habitsFilePath || 'Habits.md');
  const tasks = await loadAllCurrentTasks(app, plugin);
  const sessions = await loadFocusSessionsFromFile(app);
  plugin.focusSessions = sessions;
  const summary = buildAnalyticsSummary(sessions, habits, tasks);

  container.empty();
  const rootWrapper = container.createDiv({ cls: 'study-flow-analytics-wrapper' });

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
    const fillPercent = day.totalMinutes > 0
      ? Math.max(6, Math.round((day.totalMinutes / maxDayMinutes) * 100))
      : 0;

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

  // 5. Total Focus Distribution Card (Horizontal Allocation Bar)
  const allocCard = rootWrapper.createDiv({ cls: 'study-flow-card study-flow-allocation-card' });
  const allocHeader = allocCard.createDiv({ cls: 'study-flow-allocation-header' });

  // Title left
  const allocTitleLeft = allocHeader.createDiv({ cls: 'study-flow-allocation-title-wrap' });
  const allocIcon = allocTitleLeft.createSpan({ cls: 'study-flow-allocation-icon' });
  setIcon(allocIcon, 'pie-chart');
  allocTitleLeft.createEl('h4', { text: t('analytics.allocationTitle') });

  // Actions right
  const allocActions = allocHeader.createDiv({ cls: 'study-flow-allocation-actions' });
  const allocTotalBadge = allocActions.createDiv({ cls: 'study-flow-allocation-badge' });

  // Range tabs [ Esta semana | Total acumulado ]
  const tabsWrap = allocActions.createDiv({ cls: 'study-flow-allocation-tabs' });
  const tabWeekBtn = tabsWrap.createEl('button', {
    cls: 'study-flow-allocation-tab-btn',
    text: t('analytics.allocationRangeWeek'),
  });
  const tabTotalBtn = tabsWrap.createEl('button', {
    cls: 'study-flow-allocation-tab-btn is-active',
    text: t('analytics.allocationRangeTotal'),
  });

  const allocBody = allocCard.createDiv();

  let activeRange: 'total' | 'week' = 'total';

  const renderAllocationContent = () => {
    allocBody.empty();

    let targetSessions = sessions;
    if (activeRange === 'week') {
      const weekRange = getLocalWeekRange(new Date(), plugin.settings.weekStartDay || 'monday');
      targetSessions = sessions.filter(
        (s) => s.date >= weekRange.startDateStr && s.date <= weekRange.endDateStr
      );
    }

    const allocation = computeFocusAllocation(
      targetSessions,
      plugin.settings.subjects,
      6,
      t('analytics.allocationGeneralCategory'),
      t('analytics.allocationOthers')
    );

    // Update total badge
    allocTotalBadge.setText(
      t('analytics.allocationTotalBadge', { total: formatMinutesHuman(allocation.totalMinutes) })
    );

    if (allocation.items.length === 0 || allocation.totalMinutes === 0) {
      const emptyState = allocBody.createDiv({ cls: 'study-flow-empty-state' });
      emptyState.createEl('p', {
        text: t('analytics.allocationEmpty'),
        cls: 'study-flow-text-muted',
      });
      return;
    }

    // Horizontal continuous allocation bar
    const bar = allocBody.createDiv({ cls: 'study-flow-allocation-bar' });
    for (const item of allocation.items) {
      const segment = bar.createDiv({ cls: 'study-flow-allocation-segment' });
      const exactPct = (item.totalMinutes / allocation.totalMinutes) * 100;
      segment.style.width = `${exactPct}%`;
      segment.style.backgroundColor = item.color;
      segment.setAttribute(
        'title',
        `${item.name}: ${formatMinutesHuman(item.totalMinutes)} (${item.percentage}%)`
      );
    }

    // Detail items list
    const list = allocBody.createDiv({ cls: 'study-flow-allocation-list' });
    for (const item of allocation.items) {
      const row = list.createDiv({ cls: 'study-flow-allocation-row' });

      // Left: dot, name, session count
      const left = row.createDiv({ cls: 'study-flow-allocation-item-left' });
      const dot = left.createSpan({ cls: 'study-flow-allocation-dot' });
      dot.style.backgroundColor = item.color;

      left.createSpan({ cls: 'study-flow-allocation-name', text: item.name });

      const sessionsText = item.sessionCount === 1
        ? t('analytics.allocationSessionsCount_one', { count: '1' })
        : t('analytics.allocationSessionsCount_other', { count: String(item.sessionCount) });
      left.createSpan({ cls: 'study-flow-allocation-count', text: `(${sessionsText})` });

      // Right: time and percentage badge
      const right = row.createDiv({ cls: 'study-flow-allocation-item-right' });
      right.createSpan({
        cls: 'study-flow-allocation-time',
        text: formatMinutesHuman(item.totalMinutes),
      });

      right.createSpan({
        cls: 'study-flow-allocation-pct-badge',
        text: `${item.percentage}%`,
      });
    }
  };

  tabWeekBtn.addEventListener('click', () => {
    if (activeRange === 'week') return;
    activeRange = 'week';
    tabWeekBtn.addClass('is-active');
    tabTotalBtn.removeClass('is-active');
    renderAllocationContent();
  });

  tabTotalBtn.addEventListener('click', () => {
    if (activeRange === 'total') return;
    activeRange = 'total';
    tabTotalBtn.addClass('is-active');
    tabWeekBtn.removeClass('is-active');
    renderAllocationContent();
  });

  renderAllocationContent();
}

