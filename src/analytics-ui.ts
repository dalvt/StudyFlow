import { App, Notice, setIcon, TFile } from 'obsidian';
import type StudyFlowPlugin from './main';
import {
  buildAnalyticsSummary,
  formatMinutesHuman,
  syncHistoricalSessionsFromVault,
} from './analytics';
import { loadHabitsFromFile } from './habits';
import { extractAllTasksFromContent, TaskRecord } from './tasks';
import { getDailyNotePath } from './utils';

/**
 * Loads tasks from inbox and today's daily note to calculate task completion metrics.
 */
async function loadAllCurrentTasks(app: App, plugin: StudyFlowPlugin): Promise<TaskRecord[]> {
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
        // Skip pomodoro completion lines
        if (t.text.includes('Pomodoro completado a las')) continue;
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
  const sessions = plugin.settings.focusHistory || [];
  const summary = buildAnalyticsSummary(sessions, habits, tasks);

  // 2. Header bar with sync action
  const headerCard = rootWrapper.createDiv({ cls: 'study-flow-analytics-header' });
  const titleBlock = headerCard.createDiv({ cls: 'study-flow-analytics-title-block' });
  
  const titleEl = titleBlock.createEl('h3', { text: 'Métricas & Rendimiento de Estudio' });
  const headerIcon = titleEl.createSpan({ cls: 'study-flow-analytics-header-icon' });
  setIcon(headerIcon, 'bar-chart-2');
  
  titleBlock.createEl('p', {
    text: 'Visualizá tus horas netas de foco, la constancia en tus hábitos y la tasa de resolución de tareas.',
    cls: 'study-flow-analytics-subtitle',
  });

  const headerActions = headerCard.createDiv({ cls: 'study-flow-analytics-actions' });
  
  const syncBtn = headerActions.createEl('button', {
    cls: 'study-flow-btn study-flow-btn-ghost',
    attr: { 'aria-label': 'Sincronizar sesiones históricas desde notas diarias' },
  });
  const syncIcon = syncBtn.createSpan();
  setIcon(syncIcon, 'refresh-cw');
  syncBtn.createSpan({ text: 'Sincronizar' });
  syncBtn.addEventListener('click', async () => {
    syncBtn.addClass('is-loading');
    const added = await syncHistoricalSessionsFromVault(app, plugin.settings);
    await plugin.saveSettings();
    syncBtn.removeClass('is-loading');
    new Notice(`Sincronización completa: ${added} sesiones históricas añadidas.`);
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
  kpiTodayHeader.createSpan({ text: 'Foco Hoy', cls: 'study-flow-kpi-title' });
  const kpiTodayIcon = kpiTodayHeader.createSpan({ cls: 'study-flow-kpi-icon is-primary' });
  setIcon(kpiTodayIcon, 'timer');
  kpiToday.createDiv({
    text: formatMinutesHuman(summary.todayFocusMinutes),
    cls: 'study-flow-kpi-value',
  });
  kpiToday.createDiv({
    text: `${summary.todaySessionCount} ${summary.todaySessionCount === 1 ? 'sesión' : 'sesiones'} completadas`,
    cls: 'study-flow-kpi-subtext',
  });

  // KPI 2: Foco Semana
  const kpiWeek = kpiGrid.createDiv({ cls: 'study-flow-kpi-card' });
  const kpiWeekHeader = kpiWeek.createDiv({ cls: 'study-flow-kpi-card-header' });
  kpiWeekHeader.createSpan({ text: 'Últimos 7 días', cls: 'study-flow-kpi-title' });
  const kpiWeekIcon = kpiWeekHeader.createSpan({ cls: 'study-flow-kpi-icon is-accent' });
  setIcon(kpiWeekIcon, 'trending-up');
  kpiWeek.createDiv({
    text: formatMinutesHuman(summary.weekFocusMinutes),
    cls: 'study-flow-kpi-value',
  });
  kpiWeek.createDiv({
    text: `Promedio: ${formatMinutesHuman(summary.dailyAverageMinutes)} / día`,
    cls: 'study-flow-kpi-subtext',
  });

  // KPI 3: Hábitos
  const kpiHabits = kpiGrid.createDiv({ cls: 'study-flow-kpi-card' });
  const kpiHabitsHeader = kpiHabits.createDiv({ cls: 'study-flow-kpi-card-header' });
  kpiHabitsHeader.createSpan({ text: 'Consistencia Hábitos', cls: 'study-flow-kpi-title' });
  const kpiHabitsIcon = kpiHabitsHeader.createSpan({ cls: 'study-flow-kpi-icon is-warning' });
  setIcon(kpiHabitsIcon, 'flame');
  kpiHabits.createDiv({
    text: `${summary.habits.weeklyCompletionRate}%`,
    cls: 'study-flow-kpi-value',
  });
  kpiHabits.createDiv({
    text: `Hoy: ${summary.habits.completedTodayCount} de ${summary.habits.totalHabits} completados`,
    cls: 'study-flow-kpi-subtext',
  });

  // KPI 4: Tareas
  const kpiTasks = kpiGrid.createDiv({ cls: 'study-flow-kpi-card' });
  const kpiTasksHeader = kpiTasks.createDiv({ cls: 'study-flow-kpi-card-header' });
  kpiTasksHeader.createSpan({ text: 'Resolución de Tareas', cls: 'study-flow-kpi-title' });
  const kpiTasksIcon = kpiTasksHeader.createSpan({ cls: 'study-flow-kpi-icon is-success' });
  setIcon(kpiTasksIcon, 'check-circle-2');
  kpiTasks.createDiv({
    text: `${summary.tasks.completionRate}%`,
    cls: 'study-flow-kpi-value',
  });
  kpiTasks.createDiv({
    text: `${summary.tasks.totalCompleted} resueltas / ${summary.tasks.totalPending} pendientes`,
    cls: 'study-flow-kpi-subtext',
  });

  // 4. Weekly Focus Bar Chart Card
  const chartCard = rootWrapper.createDiv({ cls: 'study-flow-card study-flow-chart-card' });
  const chartHeader = chartCard.createDiv({ cls: 'study-flow-chart-header' });
  const chartTitleLeft = chartHeader.createDiv({ cls: 'study-flow-chart-title-left' });
  const chartIcon = chartTitleLeft.createSpan({ cls: 'study-flow-chart-icon' });
  setIcon(chartIcon, 'activity');
  chartTitleLeft.createEl('h4', { text: 'Horas de Foco Diario (Últimos 7 días)' });

  chartHeader.createDiv({
    cls: 'study-flow-chart-badge',
    text: `Total semanal: ${formatMinutesHuman(summary.weekFocusMinutes)}`,
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
      label.createSpan({ text: 'Hoy', cls: 'study-flow-bar-today-pill' });
    }
  }

  // 5. Two-Column Lower Grid: Tag Distribution & Breakdown
  const subGrid = rootWrapper.createDiv({ cls: 'study-flow-analytics-subgrid' });

  // Left: Distribution by tag/subject
  const tagCard = subGrid.createDiv({ cls: 'study-flow-card' });
  const tagHeader = tagCard.createDiv({ cls: 'study-flow-card-header-row' });
  const tagTitleLeft = tagHeader.createDiv({ cls: 'study-flow-chart-title-left' });
  const tagIcon = tagTitleLeft.createSpan({ cls: 'study-flow-chart-icon' });
  setIcon(tagIcon, 'tag');
  tagTitleLeft.createEl('h4', { text: 'Distribución por Materia / Etiqueta' });

  if (summary.tagDistribution.length === 0) {
    const emptyBox = tagCard.createDiv({ cls: 'study-flow-empty-state' });
    emptyBox.createEl('p', {
      text: 'Aún no hay etiquetas registradas en tus pomodoros.',
    });
    emptyBox.createEl('small', {
      text: 'Consejo: Asigná tareas con #etiqueta (ej. #algebra, #programacion) o [[Nota]] al temporizador para categorizar tu tiempo automáticamente.',
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
  healthTitleLeft.createEl('h4', { text: 'Estado de Tareas & Hábitos' });

  // Priority distribution pills
  const taskSection = healthCard.createDiv({ cls: 'study-flow-health-section' });
  taskSection.createEl('h5', { text: 'Tareas Pendientes por Prioridad', cls: 'study-flow-subheading' });
  const priorityPills = taskSection.createDiv({ cls: 'study-flow-priority-pills' });

  const pHigh = priorityPills.createSpan({ cls: 'study-flow-priority-pill is-high' });
  pHigh.createSpan({ text: '⏫ Alta: ' });
  pHigh.createEl('strong', { text: String(summary.tasks.byPriority.high) });

  const pMed = priorityPills.createSpan({ cls: 'study-flow-priority-pill is-medium' });
  pMed.createSpan({ text: '🔼 Media: ' });
  pMed.createEl('strong', { text: String(summary.tasks.byPriority.medium) });

  const pLow = priorityPills.createSpan({ cls: 'study-flow-priority-pill is-low' });
  pLow.createSpan({ text: '🔽 Baja: ' });
  pLow.createEl('strong', { text: String(summary.tasks.byPriority.low) });

  const pNone = priorityPills.createSpan({ cls: 'study-flow-priority-pill is-none' });
  pNone.createSpan({ text: 'Normal: ' });
  pNone.createEl('strong', { text: String(summary.tasks.byPriority.none) });

  // Habit consistency list
  const habitSection = healthCard.createDiv({ cls: 'study-flow-health-section' });
  habitSection.createEl('h5', { text: 'Rachas de Hábitos Activos', cls: 'study-flow-subheading' });

  if (habits.length === 0) {
    habitSection.createEl('p', {
      text: 'No tenés hábitos creados todavía en Habits.md.',
      cls: 'study-flow-text-muted',
    });
  } else {
    const habitList = habitSection.createDiv({ cls: 'study-flow-analytics-habit-list' });
    for (const h of habits.slice(0, 5)) {
      const row = habitList.createDiv({ cls: 'study-flow-analytics-habit-row' });
      row.createSpan({ text: h.name, cls: 'study-flow-analytics-habit-name' });
      
      const badge = row.createSpan({ cls: 'study-flow-analytics-streak-badge' });
      badge.createSpan({ text: `🔥 ${h.streak} días` });

      const todayPill = row.createSpan({
        cls: `study-flow-analytics-today-status ${h.completedToday ? 'is-done' : 'is-pending'}`,
        text: h.completedToday ? '✓ Listo hoy' : '○ Pendiente',
      });
    }
  }
}
