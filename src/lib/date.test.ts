import { describe, expect, it } from 'vitest';
import {
  addMonths,
  currentMonthKey,
  dateKey,
  dayPosition,
  daysInMonth,
  daysOfMonth,
  isLeapYear,
  isValidDateKey,
  isValidMonthKey,
  isWeekend,
  monthKey,
  monthKeyOfDate,
  monthLabel,
  parseMonthKey,
  todayKey,
  weekdayInitial,
  weekdayOf,
} from './date';

describe('daysInMonth', () => {
  it('handles 31-day months', () => {
    for (const month of [1, 3, 5, 7, 8, 10, 12]) {
      expect(daysInMonth(2026, month)).toBe(31);
    }
  });

  it('handles 30-day months', () => {
    for (const month of [4, 6, 9, 11]) {
      expect(daysInMonth(2026, month)).toBe(30);
    }
  });

  it('handles a 28-day February', () => {
    expect(daysInMonth(2026, 2)).toBe(28);
    expect(daysInMonth(2025, 2)).toBe(28);
  });

  it('handles a 29-day leap February', () => {
    expect(daysInMonth(2024, 2)).toBe(29);
    expect(daysInMonth(2000, 2)).toBe(29);
  });

  it('treats century years correctly', () => {
    expect(daysInMonth(1900, 2)).toBe(28);
    expect(daysInMonth(2100, 2)).toBe(28);
    expect(daysInMonth(2400, 2)).toBe(29);
  });
});

describe('isLeapYear', () => {
  it.each([
    [2024, true],
    [2025, false],
    [2000, true],
    [1900, false],
    [2100, false],
    [2400, true],
  ])('%i -> %s', (year, expected) => {
    expect(isLeapYear(year)).toBe(expected);
  });
});

describe('month keys', () => {
  it('formats and parses', () => {
    expect(monthKey(2026, 8)).toBe('2026-08');
    expect(parseMonthKey('2026-08')).toEqual({ year: 2026, month: 8 });
  });

  it('rejects malformed keys', () => {
    expect(isValidMonthKey('2026-13')).toBe(false);
    expect(isValidMonthKey('2026-00')).toBe(false);
    expect(isValidMonthKey('26-08')).toBe(false);
    expect(isValidMonthKey(20268)).toBe(false);
    expect(() => parseMonthKey('nope')).toThrow();
  });

  it('extracts the month from a date key', () => {
    expect(monthKeyOfDate('2026-08-09')).toBe('2026-08');
  });

  it('labels months', () => {
    expect(monthLabel('2026-08')).toBe('August 2026');
    expect(monthLabel('2024-02')).toBe('February 2024');
  });
});

describe('addMonths', () => {
  it('moves within a year', () => {
    expect(addMonths('2026-08', 1)).toBe('2026-09');
    expect(addMonths('2026-08', -1)).toBe('2026-07');
  });

  it('rolls over year boundaries in both directions', () => {
    expect(addMonths('2026-12', 1)).toBe('2027-01');
    expect(addMonths('2026-01', -1)).toBe('2025-12');
    expect(addMonths('2026-01', -13)).toBe('2024-12');
    expect(addMonths('2026-06', 30)).toBe('2028-12');
  });
});

describe('daysOfMonth', () => {
  it('produces every day of a leap February', () => {
    const days = daysOfMonth('2024-02');
    expect(days).toHaveLength(29);
    expect(days[0]).toBe('2024-02-01');
    expect(days.at(-1)).toBe('2024-02-29');
  });

  it('produces every day of a 31-day month', () => {
    expect(daysOfMonth('2026-08')).toHaveLength(31);
    expect(daysOfMonth('2026-08').at(-1)).toBe('2026-08-31');
  });

  it('produces every day of a 30-day month', () => {
    expect(daysOfMonth('2026-09')).toHaveLength(30);
  });
});

describe('date keys', () => {
  it('zero-pads', () => {
    expect(dateKey(2026, 8, 9)).toBe('2026-08-09');
  });

  it('rejects days that do not exist in the calendar', () => {
    expect(isValidDateKey('2026-02-29')).toBe(false);
    expect(isValidDateKey('2024-02-29')).toBe(true);
    expect(isValidDateKey('2026-04-31')).toBe(false);
    expect(isValidDateKey('2026-08-32')).toBe(false);
    expect(isValidDateKey('2026-8-9')).toBe(false);
    expect(isValidDateKey(null)).toBe(false);
  });
});

describe('weekdays', () => {
  it('knows the day of week', () => {
    expect(weekdayOf('2026-08-09')).toBe(0); // Sunday
    expect(weekdayOf('2026-08-10')).toBe(1);
    expect(weekdayInitial('2026-08-10')).toBe('M');
  });

  it('handles 29 February without rolling into March', () => {
    expect(weekdayOf('2024-02-29')).toBe(4); // Thursday
  });

  it('flags weekends', () => {
    expect(isWeekend('2026-08-08')).toBe(true); // Saturday
    expect(isWeekend('2026-08-09')).toBe(true); // Sunday
    expect(isWeekend('2026-08-10')).toBe(false);
  });
});

describe('today helpers', () => {
  it('derives keys from a local date', () => {
    const date = new Date(2026, 7, 9, 23, 30);
    expect(todayKey(date)).toBe('2026-08-09');
    expect(currentMonthKey(date)).toBe('2026-08');
  });

  it('classifies days relative to today', () => {
    expect(dayPosition('2026-08-08', '2026-08-09')).toBe('past');
    expect(dayPosition('2026-08-09', '2026-08-09')).toBe('today');
    expect(dayPosition('2026-08-10', '2026-08-09')).toBe('future');
  });
});
