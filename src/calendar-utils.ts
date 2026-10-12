export interface CalendarDayCell {
  dateStr: string; // YYYY-MM-DD
  dayNumber: number;
  month: number; // 0-11
  year: number;
  isCurrentMonth: boolean;
  isToday: boolean;
}

export const MONTH_NAMES_ES = [
  'Enero',
  'Febrero',
  'Marzo',
  'Abril',
  'Mayo',
  'Junio',
  'Julio',
  'Agosto',
  'Septiembre',
  'Octubre',
  'Noviembre',
  'Diciembre',
];

export const DAY_NAMES_ES = [
  'Domingo',
  'Lunes',
  'Martes',
  'Miércoles',
  'Jueves',
  'Viernes',
  'Sábado',
];

export const SHORT_DAY_NAMES_ES = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];

/**
 * Returns YYYY-MM-DD representation of a local Date.
 */
export function formatDateKey(d: Date): string {
  const yyyy = String(d.getFullYear());
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

/**
 * Formats "Mes Año" header string in Spanish (e.g. "Octubre 2026").
 */
export function formatMonthYearHeader(year: number, month: number): string {
  const mName = MONTH_NAMES_ES[month] || '';
  return `${mName} ${year}`;
}

/**
 * Formats full human date in Spanish (e.g. "Lunes 12 de Octubre, 2026").
 */
export function formatLongDate(dateStr: string): string {
  const parts = dateStr.split('-').map(Number);
  if (parts.length !== 3 || parts.some(isNaN)) return dateStr;
  const d = new Date(parts[0], parts[1] - 1, parts[2]);
  const dayName = DAY_NAMES_ES[d.getDay()] || '';
  const monthName = MONTH_NAMES_ES[d.getMonth()] || '';
  return `${dayName} ${d.getDate()} de ${monthName}, ${d.getFullYear()}`;
}

/**
 * Computes calendar grid cells for a given month and year starting on Monday.
 */
export function getCalendarMonthMatrix(
  year: number,
  month: number,
  referenceDate: Date = new Date()
): CalendarDayCell[] {
  const todayStr = formatDateKey(referenceDate);

  // First day of target month
  const firstDay = new Date(year, month, 1);
  // Total days in target month
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  // Convert getDay() (0=Sun..6=Sat) to Monday-based index (0=Mon..6=Sun)
  const startDayOfWeek = (firstDay.getDay() + 6) % 7;

  const cells: CalendarDayCell[] = [];

  // Previous month padding
  const daysInPrevMonth = new Date(year, month, 0).getDate();
  for (let i = startDayOfWeek - 1; i >= 0; i--) {
    const prevDayNum = daysInPrevMonth - i;
    const prevDate = new Date(year, month - 1, prevDayNum);
    const dateStr = formatDateKey(prevDate);
    cells.push({
      dateStr,
      dayNumber: prevDayNum,
      month: prevDate.getMonth(),
      year: prevDate.getFullYear(),
      isCurrentMonth: false,
      isToday: dateStr === todayStr,
    });
  }

  // Current month days
  for (let d = 1; d <= daysInMonth; d++) {
    const currDate = new Date(year, month, d);
    const dateStr = formatDateKey(currDate);
    cells.push({
      dateStr,
      dayNumber: d,
      month,
      year,
      isCurrentMonth: true,
      isToday: dateStr === todayStr,
    });
  }

  // Next month padding to complete rows of 7
  const remaining = (7 - (cells.length % 7)) % 7;
  for (let i = 1; i <= remaining; i++) {
    const nextDate = new Date(year, month + 1, i);
    const dateStr = formatDateKey(nextDate);
    cells.push({
      dateStr,
      dayNumber: i,
      month: nextDate.getMonth(),
      year: nextDate.getFullYear(),
      isCurrentMonth: false,
      isToday: dateStr === todayStr,
    });
  }

  return cells;
}

/**
 * Computes the 7 days of the current week containing referenceDate (Monday to Sunday).
 */
export function getWeekDays(
  referenceDate: Date = new Date()
): Array<{ dateStr: string; dayNumber: number; shortDay: string; isToday: boolean }> {
  const todayStr = formatDateKey(new Date());
  const dayOfWeek = (referenceDate.getDay() + 6) % 7; // 0=Mon..6=Sun

  // Start Monday
  const monday = new Date(referenceDate);
  monday.setDate(referenceDate.getDate() - dayOfWeek);

  const days: Array<{ dateStr: string; dayNumber: number; shortDay: string; isToday: boolean }> = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    const dateStr = formatDateKey(d);
    days.push({
      dateStr,
      dayNumber: d.getDate(),
      shortDay: SHORT_DAY_NAMES_ES[i],
      isToday: dateStr === todayStr,
    });
  }

  return days;
}

/**
 * Calculates duration in minutes between HH:mm and HH:mm.
 */
export function calculateBlockDurationMinutes(startTime: string, endTime: string): number {
  const [sh, sm] = startTime.split(':').map(Number);
  const [eh, em] = endTime.split(':').map(Number);
  if (isNaN(sh) || isNaN(sm) || isNaN(eh) || isNaN(em)) return 0;
  const startMins = sh * 60 + sm;
  const endMins = eh * 60 + em;
  return Math.max(0, endMins - startMins);
}
