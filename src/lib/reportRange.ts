/**
 * Report periods.
 *
 * Every report is ultimately a pair of inclusive day keys. Presets exist only to
 * produce that pair, so there is one code path for daily, weekly, monthly,
 * yearly and custom reports — and no date arithmetic in the components.
 *
 * Weeks run Monday to Sunday.
 */

import {
  addDays,
  addMonths,
  compactDateLabel,
  dateKey,
  daysBetween,
  daysInMonth,
  monthKeyOfDate,
  monthLabel,
  parseMonthKey,
  todayKey,
  weekdayOf,
  type DateKey,
  type MonthKey,
} from './date';

/** Inclusive day range. `start` is never after `end`. */
export interface DateRange {
  start: DateKey;
  end: DateKey;
}

/** The unit a period spans. Presets are (kind, anchor) pairs. */
export type ReportKind = 'day' | 'week' | 'month' | 'year' | 'custom';

export type ReportPreset =
  | 'today'
  | 'yesterday'
  | 'thisWeek'
  | 'lastWeek'
  | 'thisMonth'
  | 'lastMonth'
  | 'thisYear'
  | 'lastYear'
  | 'custom';

/**
 * What the Reports page holds in state. Keeping an anchor day rather than a
 * resolved range is what lets the previous/next buttons step by one unit
 * without special-casing each preset.
 */
export interface ReportPeriod {
  kind: ReportKind;
  /** Any day inside the period; the range is derived from it. */
  anchor: DateKey;
  /** Only meaningful when `kind` is `custom`. */
  custom?: DateRange;
}

export const PRESET_ORDER: ReportPreset[] = [
  'today',
  'yesterday',
  'thisWeek',
  'lastWeek',
  'thisMonth',
  'lastMonth',
  'thisYear',
  'lastYear',
  'custom',
];

export const PRESET_LABELS: Record<ReportPreset, string> = {
  today: 'Today',
  yesterday: 'Yesterday',
  thisWeek: 'This Week',
  lastWeek: 'Last Week',
  thisMonth: 'This Month',
  lastMonth: 'Last Month',
  thisYear: 'This Year',
  lastYear: 'Last Year',
  custom: 'Custom Range',
};

/** Monday-based weekday index: 0 = Monday … 6 = Sunday. */
export function mondayIndex(date: DateKey): number {
  return (weekdayOf(date) + 6) % 7;
}

/** The Monday of the calendar week containing `date`. */
export function getStartOfWeek(date: DateKey): DateKey {
  return addDays(date, -mondayIndex(date));
}

/** The Sunday of the calendar week containing `date`. */
export function getEndOfWeek(date: DateKey): DateKey {
  return addDays(getStartOfWeek(date), 6);
}

/** Monday → Sunday of the week containing `date`. */
export function getWeekRange(date: DateKey): DateRange {
  const start = getStartOfWeek(date);
  return { start, end: addDays(start, 6) };
}

/** The calendar week containing today. */
export function getThisWeekRange(today: DateKey = todayKey()): DateRange {
  return getWeekRange(today);
}

/** The complete calendar week immediately before the current one. */
export function getLastWeekRange(today: DateKey = todayKey()): DateRange {
  return getWeekRange(addDays(getStartOfWeek(today), -1));
}

export function getMonthRange(month: MonthKey): DateRange {
  const { year, month: monthNumber } = parseMonthKey(month);
  return {
    start: dateKey(year, monthNumber, 1),
    end: dateKey(year, monthNumber, daysInMonth(year, monthNumber)),
  };
}

export function getYearRange(year: number): DateRange {
  return { start: dateKey(year, 1, 1), end: dateKey(year, 12, 31) };
}

/** Normalises a range whose ends were entered the wrong way round. */
export function orderRange(range: DateRange): DateRange {
  return range.start <= range.end ? range : { start: range.end, end: range.start };
}

/** The inclusive day range a period covers. */
export function getReportRange(period: ReportPeriod): DateRange {
  switch (period.kind) {
    case 'day':
      return { start: period.anchor, end: period.anchor };
    case 'week':
      return getWeekRange(period.anchor);
    case 'month':
      return getMonthRange(monthKeyOfDate(period.anchor));
    case 'year':
      return getYearRange(Number(period.anchor.slice(0, 4)));
    case 'custom':
      return orderRange(period.custom ?? { start: period.anchor, end: period.anchor });
  }
}

/** The period a preset selects, relative to `today`. */
export function periodForPreset(
  preset: ReportPreset,
  today: DateKey = todayKey(),
  custom?: DateRange,
): ReportPeriod {
  switch (preset) {
    case 'today':
      return { kind: 'day', anchor: today };
    case 'yesterday':
      return { kind: 'day', anchor: addDays(today, -1) };
    case 'thisWeek':
      return { kind: 'week', anchor: getStartOfWeek(today) };
    case 'lastWeek':
      return { kind: 'week', anchor: addDays(getStartOfWeek(today), -7) };
    case 'thisMonth':
      return { kind: 'month', anchor: today };
    case 'lastMonth':
      return { kind: 'month', anchor: getMonthRange(addMonths(monthKeyOfDate(today), -1)).start };
    case 'thisYear':
      return { kind: 'year', anchor: today };
    case 'lastYear':
      return { kind: 'year', anchor: addDays(getYearRange(Number(today.slice(0, 4))).start, -1) };
    case 'custom':
      return {
        kind: 'custom',
        anchor: today,
        custom: custom ?? { start: addDays(today, -29), end: today },
      };
  }
}

/**
 * The preset a period corresponds to, or `null` when the user has stepped away
 * from every named period (e.g. three weeks back). The picker uses this to show
 * the truth rather than a stale preset name.
 */
export function presetOf(period: ReportPeriod, today: DateKey = todayKey()): ReportPreset | null {
  if (period.kind === 'custom') return 'custom';

  const candidates: ReportPreset[] =
    period.kind === 'day'
      ? ['today', 'yesterday']
      : period.kind === 'week'
        ? ['thisWeek', 'lastWeek']
        : period.kind === 'month'
          ? ['thisMonth', 'lastMonth']
          : ['thisYear', 'lastYear'];

  const range = getReportRange(period);
  for (const preset of candidates) {
    const other = getReportRange(periodForPreset(preset, today));
    if (other.start === range.start && other.end === range.end) return preset;
  }
  return null;
}

/**
 * Steps a period by whole units: a day, a calendar week, a calendar month, a
 * calendar year, or — for a custom range — its own length.
 */
export function shiftPeriod(period: ReportPeriod, delta: number): ReportPeriod {
  switch (period.kind) {
    case 'day':
      return { ...period, anchor: addDays(period.anchor, delta) };
    case 'week':
      return { ...period, anchor: addDays(getStartOfWeek(period.anchor), delta * 7) };
    case 'month':
      return {
        ...period,
        anchor: getMonthRange(addMonths(monthKeyOfDate(period.anchor), delta)).start,
      };
    case 'year':
      // Anchor on 1 January so a leap day never shifts into the wrong year.
      return { ...period, anchor: dateKey(Number(period.anchor.slice(0, 4)) + delta, 1, 1) };
    case 'custom': {
      const range = getReportRange(period);
      const length = daysBetween(range.start, range.end) + 1;
      return {
        ...period,
        custom: {
          start: addDays(range.start, delta * length),
          end: addDays(range.end, delta * length),
        },
      };
    }
  }
}

/** Number of calendar days in the range, counting both ends. */
export function rangeDayCount(range: DateRange): number {
  return daysBetween(range.start, range.end) + 1;
}

/** True when the range covers exactly one whole calendar month. */
export function isWholeMonth(range: DateRange): boolean {
  const month = getMonthRange(monthKeyOfDate(range.start));
  return month.start === range.start && month.end === range.end;
}

/**
 * Human range, e.g. `Aug 10 → Aug 16, 2026`. A single day drops the arrow and a
 * whole month names the month, so common periods read naturally.
 */
export function rangeLabel(range: DateRange): string {
  if (range.start === range.end) return compactDateLabel(range.start);
  if (isWholeMonth(range)) return monthLabel(monthKeyOfDate(range.start));

  const startYear = range.start.slice(0, 4);
  const endYear = range.end.slice(0, 4);
  if (startYear === endYear) {
    const start = compactDateLabel(range.start).replace(`, ${startYear}`, '');
    return `${start} → ${compactDateLabel(range.end)}`;
  }
  return `${compactDateLabel(range.start)} → ${compactDateLabel(range.end)}`;
}

/** What kind of report this is, for the page heading. */
export function periodTitle(period: ReportPeriod): string {
  switch (period.kind) {
    case 'day':
      return 'Daily report';
    case 'week':
      return 'Weekly report';
    case 'month':
      return 'Monthly report';
    case 'year':
      return 'Yearly report';
    case 'custom':
      return 'Custom report';
  }
}

/** Label for the option that appears once the user steps off a named preset. */
export function stepLabel(period: ReportPeriod): string {
  const range = getReportRange(period);
  switch (period.kind) {
    case 'day':
      return compactDateLabel(range.start);
    case 'week':
      return `Week of ${rangeLabel(range).split(' → ')[0]}`;
    case 'month':
      return monthLabel(monthKeyOfDate(range.start));
    case 'year':
      return range.start.slice(0, 4);
    case 'custom':
      return PRESET_LABELS.custom;
  }
}

/** True when the range ends today or later — used to stop pointless stepping. */
export function includesOrFollowsToday(range: DateRange, today: DateKey = todayKey()): boolean {
  return range.end >= today;
}
