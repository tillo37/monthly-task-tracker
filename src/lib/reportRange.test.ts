import { describe, expect, it } from 'vitest';
import {
  getEndOfWeek,
  getLastWeekRange,
  getReportRange,
  getStartOfWeek,
  getThisWeekRange,
  getWeekRange,
  mondayIndex,
  orderRange,
  periodForPreset,
  presetOf,
  rangeDayCount,
  rangeLabel,
  shiftPeriod,
  stepLabel,
  type ReportPeriod,
} from './reportRange';

// August 2026: the 10th is a Monday, so the calendar week is 10 → 16.
const MONDAY = '2026-08-10';
const WEDNESDAY = '2026-08-12';
const SUNDAY = '2026-08-16';

describe('week boundaries', () => {
  it('treats Monday as the first day of the week', () => {
    expect(mondayIndex(MONDAY)).toBe(0);
    expect(mondayIndex(SUNDAY)).toBe(6);
  });

  it('runs Monday to Sunday', () => {
    expect(getWeekRange(WEDNESDAY)).toEqual({ start: MONDAY, end: SUNDAY });
  });

  it.each([
    ['Monday', MONDAY],
    ['Tuesday', '2026-08-11'],
    ['Wednesday', WEDNESDAY],
    ['Thursday', '2026-08-13'],
    ['Friday', '2026-08-14'],
    ['Saturday', '2026-08-15'],
    ['Sunday', SUNDAY],
  ])('anchors the same week from %s', (_name, date) => {
    expect(getStartOfWeek(date)).toBe(MONDAY);
    expect(getEndOfWeek(date)).toBe(SUNDAY);
  });

  it('is exactly seven days long', () => {
    expect(rangeDayCount(getWeekRange(WEDNESDAY))).toBe(7);
  });

  it('crosses a month boundary correctly', () => {
    // 31 August 2026 is a Monday; that week runs into September.
    expect(getWeekRange('2026-09-02')).toEqual({ start: '2026-08-31', end: '2026-09-06' });
  });

  it('crosses a year boundary correctly', () => {
    expect(getWeekRange('2027-01-01')).toEqual({ start: '2026-12-28', end: '2027-01-03' });
  });
});

describe('this week', () => {
  it('is the current calendar week when today is Monday', () => {
    expect(getThisWeekRange(MONDAY)).toEqual({ start: MONDAY, end: SUNDAY });
  });

  it('is the current calendar week when today is Wednesday', () => {
    expect(getThisWeekRange(WEDNESDAY)).toEqual({ start: MONDAY, end: SUNDAY });
  });

  it('is the current calendar week when today is Sunday', () => {
    expect(getThisWeekRange(SUNDAY)).toEqual({ start: MONDAY, end: SUNDAY });
  });

  it('is not the trailing seven days', () => {
    // A rolling window from Wednesday would start on 6 August.
    expect(getThisWeekRange(WEDNESDAY).start).not.toBe('2026-08-06');
  });
});

describe('last week', () => {
  it('is the complete calendar week before the current one', () => {
    expect(getLastWeekRange(MONDAY)).toEqual({ start: '2026-08-03', end: '2026-08-09' });
    expect(getLastWeekRange(WEDNESDAY)).toEqual({ start: '2026-08-03', end: '2026-08-09' });
    expect(getLastWeekRange(SUNDAY)).toEqual({ start: '2026-08-03', end: '2026-08-09' });
  });

  it('ends the day before this week starts', () => {
    const thisWeek = getThisWeekRange(WEDNESDAY);
    const lastWeek = getLastWeekRange(WEDNESDAY);
    expect(rangeDayCount(lastWeek)).toBe(7);
    expect(lastWeek.end < thisWeek.start).toBe(true);
  });
});

describe('presets', () => {
  const range = (period: ReportPeriod) => getReportRange(period);

  it.each([
    ['today', { start: WEDNESDAY, end: WEDNESDAY }],
    ['yesterday', { start: '2026-08-11', end: '2026-08-11' }],
    ['thisWeek', { start: MONDAY, end: SUNDAY }],
    ['lastWeek', { start: '2026-08-03', end: '2026-08-09' }],
    ['thisMonth', { start: '2026-08-01', end: '2026-08-31' }],
    ['lastMonth', { start: '2026-07-01', end: '2026-07-31' }],
    ['thisYear', { start: '2026-01-01', end: '2026-12-31' }],
    ['lastYear', { start: '2025-01-01', end: '2025-12-31' }],
  ] as const)('resolves %s', (preset, expected) => {
    expect(range(periodForPreset(preset, WEDNESDAY))).toEqual(expected);
  });

  it('defaults a custom range to the last 30 days', () => {
    expect(range(periodForPreset('custom', WEDNESDAY))).toEqual({
      start: '2026-07-14',
      end: WEDNESDAY,
    });
  });

  it('honours a supplied custom range', () => {
    const period = periodForPreset('custom', WEDNESDAY, { start: '2026-07-14', end: '2026-08-10' });
    expect(range(period)).toEqual({ start: '2026-07-14', end: '2026-08-10' });
  });

  it('orders a custom range entered backwards', () => {
    expect(orderRange({ start: '2026-08-16', end: '2026-08-10' })).toEqual({
      start: '2026-08-10',
      end: '2026-08-16',
    });
  });

  it('handles a leap February', () => {
    expect(range(periodForPreset('thisMonth', '2024-02-10'))).toEqual({
      start: '2024-02-01',
      end: '2024-02-29',
    });
  });

  it('recognises which preset a period is', () => {
    expect(presetOf(periodForPreset('thisWeek', WEDNESDAY), WEDNESDAY)).toBe('thisWeek');
    expect(presetOf(periodForPreset('lastWeek', WEDNESDAY), WEDNESDAY)).toBe('lastWeek');
    expect(presetOf({ kind: 'week', anchor: '2026-07-06' }, WEDNESDAY)).toBeNull();
  });
});

describe('stepping periods', () => {
  it('steps back from this week into last week', () => {
    const thisWeek = periodForPreset('thisWeek', WEDNESDAY);
    const back = shiftPeriod(thisWeek, -1);

    expect(getReportRange(back)).toEqual({ start: '2026-08-03', end: '2026-08-09' });
    expect(presetOf(back, WEDNESDAY)).toBe('lastWeek');
  });

  it('steps forward from last week back into this week', () => {
    const lastWeek = periodForPreset('lastWeek', WEDNESDAY);
    const forward = shiftPeriod(lastWeek, 1);

    expect(getReportRange(forward)).toEqual({ start: MONDAY, end: SUNDAY });
    expect(presetOf(forward, WEDNESDAY)).toBe('thisWeek');
  });

  it('keeps weeks seven days long when stepping across a month', () => {
    let period = periodForPreset('thisWeek', WEDNESDAY);
    for (let step = 0; step < 8; step += 1) period = shiftPeriod(period, -1);

    const range = getReportRange(period);
    expect(rangeDayCount(range)).toBe(7);
    expect(range).toEqual({ start: '2026-06-15', end: '2026-06-21' });
  });

  it('steps days, months and years by their own unit', () => {
    expect(getReportRange(shiftPeriod(periodForPreset('today', WEDNESDAY), -1))).toEqual({
      start: '2026-08-11',
      end: '2026-08-11',
    });
    expect(getReportRange(shiftPeriod(periodForPreset('thisMonth', WEDNESDAY), -1))).toEqual({
      start: '2026-07-01',
      end: '2026-07-31',
    });
    expect(getReportRange(shiftPeriod(periodForPreset('thisYear', WEDNESDAY), 1))).toEqual({
      start: '2027-01-01',
      end: '2027-12-31',
    });
  });

  it('steps a custom range by its own length', () => {
    const period = periodForPreset('custom', WEDNESDAY, { start: '2026-08-10', end: '2026-08-16' });
    expect(getReportRange(shiftPeriod(period, -1))).toEqual({
      start: '2026-08-03',
      end: '2026-08-09',
    });
  });

  it('labels a stepped period rather than lying about the preset', () => {
    const period = shiftPeriod(shiftPeriod(periodForPreset('thisWeek', WEDNESDAY), -1), -1);
    expect(presetOf(period, WEDNESDAY)).toBeNull();
    expect(stepLabel(period)).toBe('Week of Jul 27');
  });
});

describe('rangeLabel', () => {
  it('renders a week as a range within one year', () => {
    expect(rangeLabel({ start: MONDAY, end: SUNDAY })).toBe('Aug 10 → Aug 16, 2026');
  });

  it('renders last week', () => {
    expect(rangeLabel({ start: '2026-08-03', end: '2026-08-09' })).toBe('Aug 3 → Aug 9, 2026');
  });

  it('renders a single day without an arrow', () => {
    expect(rangeLabel({ start: WEDNESDAY, end: WEDNESDAY })).toBe('Aug 12, 2026');
  });

  it('names a whole month', () => {
    expect(rangeLabel({ start: '2026-08-01', end: '2026-08-31' })).toBe('August 2026');
  });

  it('spells out both years when the range crosses one', () => {
    expect(rangeLabel({ start: '2026-12-28', end: '2027-01-03' })).toBe(
      'Dec 28, 2026 → Jan 3, 2027',
    );
  });

  it('renders a custom range', () => {
    expect(rangeLabel({ start: '2026-07-14', end: '2026-08-10' })).toBe('Jul 14 → Aug 10, 2026');
  });
});
