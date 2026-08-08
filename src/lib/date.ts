/**
 * Calendar helpers.
 *
 * Everything here is pure arithmetic on `YYYY-MM` / `YYYY-MM-DD` strings so the
 * tracker never depends on the browser timezone for anything except "what is
 * today", and month lengths are always derived rather than assumed.
 */

/** Month key, e.g. `2026-08`. */
export type MonthKey = string;
/** Day key, e.g. `2026-08-09`. */
export type DateKey = string;

export interface MonthParts {
  year: number;
  /** 1-12. */
  month: number;
}

const MONTH_LENGTHS = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

const MONTH_NAMES = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

const WEEKDAY_INITIALS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

const MONTH_KEY_PATTERN = /^\d{4}-(0[1-9]|1[0-2])$/;
const DATE_KEY_PATTERN = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;

const pad = (value: number) => String(value).padStart(2, '0');

export function isLeapYear(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

/** Number of days in the given month. Never assumes 31. */
export function daysInMonth(year: number, month: number): number {
  if (month === 2 && isLeapYear(year)) return 29;
  return MONTH_LENGTHS[month - 1];
}

export function monthKey(year: number, month: number): MonthKey {
  return `${String(year).padStart(4, '0')}-${pad(month)}`;
}

export function parseMonthKey(key: MonthKey): MonthParts {
  if (!MONTH_KEY_PATTERN.test(key)) {
    throw new Error(`Invalid month key: ${key}`);
  }
  return { year: Number(key.slice(0, 4)), month: Number(key.slice(5, 7)) };
}

export function isValidMonthKey(value: unknown): value is MonthKey {
  return typeof value === 'string' && MONTH_KEY_PATTERN.test(value);
}

/**
 * True for well-formed date keys that also exist in the calendar, so
 * `2026-02-30` is rejected rather than silently rolling over into March.
 */
export function isValidDateKey(value: unknown): value is DateKey {
  if (typeof value !== 'string' || !DATE_KEY_PATTERN.test(value)) return false;
  const year = Number(value.slice(0, 4));
  const month = Number(value.slice(5, 7));
  const day = Number(value.slice(8, 10));
  return day <= daysInMonth(year, month);
}

export function dateKey(year: number, month: number, day: number): DateKey {
  return `${monthKey(year, month)}-${pad(day)}`;
}

/** `2026-08-09` -> `2026-08`. */
export function monthKeyOfDate(date: DateKey): MonthKey {
  return date.slice(0, 7);
}

/** Every day of the month as date keys, in order. */
export function daysOfMonth(key: MonthKey): DateKey[] {
  const { year, month } = parseMonthKey(key);
  const total = daysInMonth(year, month);
  return Array.from({ length: total }, (_, index) => dateKey(year, month, index + 1));
}

/** Shifts a month key by `delta` months, carrying the year correctly. */
export function addMonths(key: MonthKey, delta: number): MonthKey {
  const { year, month } = parseMonthKey(key);
  const zeroBased = year * 12 + (month - 1) + delta;
  return monthKey(Math.floor(zeroBased / 12), (zeroBased % 12) + 1);
}

/** Day of week for a date, 0 = Sunday. */
export function weekdayOf(date: DateKey): number {
  const year = Number(date.slice(0, 4));
  const month = Number(date.slice(5, 7));
  const day = Number(date.slice(8, 10));
  // 2000 is a leap year, so every valid month/day pair exists in it; anchoring
  // there keeps `setUTCFullYear` from rolling a 29 February into March.
  const anchored = new Date(Date.UTC(2000, month - 1, day));
  anchored.setUTCFullYear(year);
  return anchored.getUTCDay();
}

export function weekdayInitial(date: DateKey): string {
  return WEEKDAY_INITIALS[weekdayOf(date)];
}

export function isWeekend(date: DateKey): boolean {
  const day = weekdayOf(date);
  return day === 0 || day === 6;
}

/** e.g. `August 2026`. */
export function monthLabel(key: MonthKey): string {
  const { year, month } = parseMonthKey(key);
  return `${MONTH_NAMES[month - 1]} ${year}`;
}

export function monthName(month: number): string {
  return MONTH_NAMES[month - 1];
}

export function monthNames(): string[] {
  return [...MONTH_NAMES];
}

/** Today in the user's local timezone, as a date key. */
export function todayKey(now: Date = new Date()): DateKey {
  return dateKey(now.getFullYear(), now.getMonth() + 1, now.getDate());
}

export function currentMonthKey(now: Date = new Date()): MonthKey {
  return monthKey(now.getFullYear(), now.getMonth() + 1);
}

export type DayPosition = 'past' | 'today' | 'future';

export function dayPosition(date: DateKey, today: DateKey = todayKey()): DayPosition {
  if (date === today) return 'today';
  return date < today ? 'past' : 'future';
}
