export function getLocalDateString(date: Date = new Date()): string {
  const yyyy = String(date.getFullYear());
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const dd = String(date.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

export function formatDailyNoteFileName(
  dateFormat: string,
  targetDateOrOffset: number | string | Date = 0,
  referenceDate: Date = new Date()
): string {
  let targetDate: Date;

  if (typeof targetDateOrOffset === 'number') {
    targetDate = new Date(referenceDate);
    targetDate.setDate(targetDate.getDate() + targetDateOrOffset);
  } else if (targetDateOrOffset instanceof Date) {
    targetDate = targetDateOrOffset;
  } else if (typeof targetDateOrOffset === 'string') {
    const cleanStr = targetDateOrOffset.replace(/\.md$/, '').trim();
    const parts = cleanStr.split('-').map(Number);
    if (parts.length === 3 && !parts.some(isNaN)) {
      targetDate = new Date(parts[0], parts[1] - 1, parts[2]);
    } else {
      targetDate = new Date(cleanStr);
    }
  } else {
    targetDate = new Date(referenceDate);
  }

  const yyyy = String(targetDate.getFullYear());
  const mm = String(targetDate.getMonth() + 1).padStart(2, '0');
  const dd = String(targetDate.getDate()).padStart(2, '0');

  // Simple replacement for standard formats
  let formatted = dateFormat
    .replace('YYYY', yyyy)
    .replace('MM', mm)
    .replace('DD', dd);

  return formatted.endsWith('.md') ? formatted : `${formatted}.md`;
}
