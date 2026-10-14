import test from 'node:test';
import assert from 'node:assert/strict';
import { validateSettingNumber, DEFAULT_SETTINGS } from '../src/settings-utils.ts';
import {
  getCalendarMonthMatrix,
  getWeekDays,
  SHORT_DAY_NAMES_ES,
  SHORT_DAY_NAMES_SUN_FIRST_ES,
  formatMonthYearHeader,
  formatLongDate,
} from '../src/calendar-utils.ts';

test('validateSettingNumber validates required numbers and boundaries accurately', () => {
  // Empty, null, undefined
  assert.equal(validateSettingNumber('', 1, 100).valid, false);
  assert.equal(validateSettingNumber('   ', 1, 100).valid, false);
  assert.equal(validateSettingNumber(null, 1, 100).valid, false);
  assert.equal(validateSettingNumber(undefined, 1, 100).valid, false);

  // Non-numeric strings
  const nanRes = validateSettingNumber('abc', 1, 100, 'Trabajo');
  assert.equal(nanRes.valid, false);
  assert.ok(nanRes.error?.includes('Trabajo'));

  // Floating point values
  const floatRes = validateSettingNumber('25.5', 1, 100);
  assert.equal(floatRes.valid, false);
  assert.ok(floatRes.error?.includes('entero'));

  // Out of range (below min)
  const lowRes = validateSettingNumber('0', 1, 60, 'Descanso');
  assert.equal(lowRes.valid, false);
  assert.ok(lowRes.error?.includes('entre 1 y 60'));

  // Out of range (above max)
  const highRes = validateSettingNumber('121', 1, 120, 'Descanso largo');
  assert.equal(highRes.valid, false);
  assert.ok(highRes.error?.includes('entre 1 y 120'));

  // Valid values
  const validMin = validateSettingNumber('1', 1, 180);
  assert.equal(validMin.valid, true);
  assert.equal(validMin.value, 1);

  const validMax = validateSettingNumber(180, 1, 180);
  assert.equal(validMax.valid, true);
  assert.equal(validMax.value, 180);

  const validMid = validateSettingNumber('25', 1, 180);
  assert.equal(validMid.valid, true);
  assert.equal(validMid.value, 25);
});

test('DEFAULT_SETTINGS contains all required settings and defaults', () => {
  assert.equal(DEFAULT_SETTINGS.schemaVersion, 2);
  assert.equal(DEFAULT_SETTINGS.pomodoroWorkDuration, 25);
  assert.equal(DEFAULT_SETTINGS.pomodoroBreakDuration, 5);
  assert.equal(DEFAULT_SETTINGS.pomodoroLongBreakDuration, 15);
  assert.equal(DEFAULT_SETTINGS.pomodoroLongBreakInterval, 4);
  assert.equal(DEFAULT_SETTINGS.autoStartNextPhase, false);
  assert.equal(DEFAULT_SETTINGS.tasksSectionHeader, '## Tareas');
  assert.equal(DEFAULT_SETTINGS.iceboxSectionHeader, '## Icebox');
  assert.deepEqual(DEFAULT_SETTINGS.taskIncludedFolders, []);
  assert.deepEqual(DEFAULT_SETTINGS.taskExcludedFolders, ['Templates', 'templates']);
  assert.equal(DEFAULT_SETTINGS.weekStartDay, 'monday');
  assert.equal(DEFAULT_SETTINGS.language, 'auto');
  assert.deepEqual(DEFAULT_SETTINGS.subjects, []);
  assert.equal(DEFAULT_SETTINGS.weeklyReviewsFolder, 'StudyFlow/Reviews');
  assert.ok(DEFAULT_SETTINGS.weeklyReviewTemplate.includes('Revisión Semanal'));
});

test('cloneDefaultSettings produces independent deep copies without shared references', async () => {
  const { cloneDefaultSettings } = await import('../src/settings-utils.ts');
  const clone1 = cloneDefaultSettings();
  const clone2 = cloneDefaultSettings();

  assert.deepEqual(clone1, DEFAULT_SETTINGS);
  assert.notEqual(clone1, DEFAULT_SETTINGS);
  assert.notEqual(clone1.taskIncludedFolders, DEFAULT_SETTINGS.taskIncludedFolders);
  assert.notEqual(clone1.taskExcludedFolders, DEFAULT_SETTINGS.taskExcludedFolders);
  assert.notEqual(clone1.subjects, DEFAULT_SETTINGS.subjects);

  // Mutations on clone1 must not affect clone2 or DEFAULT_SETTINGS
  clone1.taskExcludedFolders.push('ExtraExcluded');
  clone1.taskIncludedFolders.push('ExtraIncluded');
  clone1.subjects.push({ id: 's1', name: 'Math', tag: '#math', color: '#000', weeklyGoalHours: 5 });

  assert.equal(DEFAULT_SETTINGS.taskExcludedFolders.includes('ExtraExcluded'), false);
  assert.equal(DEFAULT_SETTINGS.taskIncludedFolders.length, 0);
  assert.equal(DEFAULT_SETTINGS.subjects.length, 0);

  assert.equal(clone2.taskExcludedFolders.includes('ExtraExcluded'), false);
  assert.equal(clone2.taskIncludedFolders.length, 0);
  assert.equal(clone2.subjects.length, 0);
});

test('getCalendarMonthMatrix supports both Monday and Sunday week starts', () => {
  const ref = new Date('2026-10-13T12:00:00');
  // October 2026: 31 days. Oct 1 is Thursday.

  // 1. Monday start (default): Thursday is 4th day of week -> 3 padding days from previous month (Mon, Tue, Wed)
  const mondayMatrix = getCalendarMonthMatrix(2026, 9, ref, 'monday');
  assert.equal(mondayMatrix.length % 7, 0);
  // Find first current-month cell
  const firstMonIdx = mondayMatrix.findIndex((c) => c.isCurrentMonth);
  assert.equal(firstMonIdx, 3); // 3 previous month days
  assert.equal(mondayMatrix[firstMonIdx].dayNumber, 1);

  // 2. Sunday start: Thursday is 5th day of week -> 4 padding days from previous month (Sun, Mon, Tue, Wed)
  const sundayMatrix = getCalendarMonthMatrix(2026, 9, ref, 'sunday');
  assert.equal(sundayMatrix.length % 7, 0);
  const firstSunIdx = sundayMatrix.findIndex((c) => c.isCurrentMonth);
  assert.equal(firstSunIdx, 4); // 4 previous month days
  assert.equal(sundayMatrix[firstSunIdx].dayNumber, 1);
});

test('getWeekDays produces 7 days with correct day labels for Monday vs Sunday start', () => {
  // Tuesday, October 13, 2026
  const ref = new Date('2026-10-13T12:00:00');

  // Monday start
  const mondayWeek = getWeekDays(ref, 'monday');
  assert.equal(mondayWeek.length, 7);
  assert.equal(mondayWeek[0].shortDay, 'Lun');
  assert.equal(mondayWeek[0].dateStr, '2026-10-12'); // Monday Oct 12
  assert.equal(mondayWeek[6].shortDay, 'Dom');
  assert.equal(mondayWeek[6].dateStr, '2026-10-18'); // Sunday Oct 18

  // Sunday start
  const sundayWeek = getWeekDays(ref, 'sunday');
  assert.equal(sundayWeek.length, 7);
  assert.equal(sundayWeek[0].shortDay, 'Dom');
  assert.equal(sundayWeek[0].dateStr, '2026-10-11'); // Sunday Oct 11
  assert.equal(sundayWeek[6].shortDay, 'Sáb');
  assert.equal(sundayWeek[6].dateStr, '2026-10-17'); // Saturday Oct 17

  // English Monday start
  const mondayWeekEn = getWeekDays(ref, 'monday', 'en');
  assert.equal(mondayWeekEn[0].shortDay, 'Mon');
  assert.equal(mondayWeekEn[6].shortDay, 'Sun');

  // English Sunday start
  const sundayWeekEn = getWeekDays(ref, 'sunday', 'en');
  assert.equal(sundayWeekEn[0].shortDay, 'Sun');
  assert.equal(sundayWeekEn[6].shortDay, 'Sat');
});

test('formatMonthYearHeader and formatLongDate format dates in Spanish and English', () => {
  // Spanish (default)
  assert.equal(formatMonthYearHeader(2026, 9), 'Octubre 2026');
  assert.equal(formatMonthYearHeader(2026, 9, 'es'), 'Octubre 2026');
  assert.equal(formatLongDate('2026-10-12'), 'Lunes 12 de Octubre, 2026');
  assert.equal(formatLongDate('2026-10-12', 'es'), 'Lunes 12 de Octubre, 2026');

  // English
  assert.equal(formatMonthYearHeader(2026, 9, 'en'), 'October 2026');
  assert.equal(formatLongDate('2026-10-12', 'en'), 'Monday, October 12, 2026');
});
