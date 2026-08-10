import { describe, expect, it } from 'vitest';
import {
  addSeconds,
  describeDuration,
  durationBetween,
  formatClock,
  formatDuration,
  formatDurationOrDash,
  formatTimeRange,
  localInstant,
  parseDurationInput,
} from './time';

describe('durationBetween', () => {
  it('measures whole seconds between instants', () => {
    expect(durationBetween('2026-08-09T10:00:00.000Z', '2026-08-09T11:30:00.000Z')).toBe(5400);
  });

  it('rounds sub-second remainders', () => {
    expect(durationBetween('2026-08-09T10:00:00.000Z', '2026-08-09T10:00:00.600Z')).toBe(1);
  });

  it('is negative when the interval is inverted', () => {
    expect(durationBetween('2026-08-09T11:00:00.000Z', '2026-08-09T10:00:00.000Z')).toBe(-3600);
  });

  it.each(['', 'not-a-date', '2026-13-40T00:00:00Z'])('rejects %s', (value) => {
    expect(durationBetween(value, '2026-08-09T10:00:00.000Z')).toBeNull();
  });
});

describe('formatDuration', () => {
  it.each([
    [0, '0s'],
    [45, '45s'],
    [59, '59s'],
    [60, '1m'],
    [125, '2m'],
    [3600, '1h 0m'],
    [52_500, '14h 35m'],
    [76_200, '21h 10m'],
  ])('formats %i seconds as %s', (seconds, expected) => {
    expect(formatDuration(seconds)).toBe(expected);
  });

  it('never renders a negative duration', () => {
    expect(formatDuration(-90)).toBe('0s');
  });

  it('renders a dash for nothing tracked', () => {
    expect(formatDurationOrDash(0)).toBe('—');
    expect(formatDurationOrDash(60)).toBe('1m');
  });
});

describe('formatClock', () => {
  it.each([
    [0, '00:00:00'],
    [59, '00:00:59'],
    [3661, '01:01:01'],
    [360_000, '100:00:00'],
  ])('formats %i seconds as %s', (seconds, expected) => {
    expect(formatClock(seconds)).toBe(expected);
  });
});

describe('describeDuration', () => {
  it('spells out hours and minutes for screen readers', () => {
    expect(describeDuration(5400)).toBe('1 hour 30 minutes');
    expect(describeDuration(60)).toBe('1 minute');
    expect(describeDuration(5)).toBe('5 seconds');
  });
});

describe('parseDurationInput', () => {
  it.each([
    ['45', 2700],
    ['90', 5400],
    ['1:30', 5400],
    ['1h', 3600],
    ['1h 30m', 5400],
    ['1h30m', 5400],
    ['30m', 1800],
    ['  2h 5m  ', 7500],
  ])('reads %s as %i seconds', (input, expected) => {
    expect(parseDurationInput(input)).toBe(expected);
  });

  it.each(['', 'abc', '1:60', '-5', '1h 30', 'h', '1.5h'])('rejects %s', (input) => {
    expect(parseDurationInput(input)).toBeNull();
  });
});

describe('localInstant', () => {
  it('builds an instant on the requested local day', () => {
    const iso = localInstant('2026-08-09', '14:35');
    expect(iso).not.toBeNull();
    const value = new Date(iso as string);
    expect(value.getFullYear()).toBe(2026);
    expect(value.getMonth()).toBe(7);
    expect(value.getDate()).toBe(9);
    expect(value.getHours()).toBe(14);
    expect(value.getMinutes()).toBe(35);
  });

  it.each([
    ['2026-02-30', '10:00'],
    ['2026-08-09', '24:00'],
    ['2026-08-09', '10:75'],
    ['09-08-2026', '10:00'],
    ['2026-08-09', ''],
  ])('rejects %s %s', (date, time) => {
    expect(localInstant(date, time)).toBeNull();
  });
});

describe('addSeconds', () => {
  it('shifts an instant forward', () => {
    expect(addSeconds('2026-08-09T10:00:00.000Z', 5400)).toBe('2026-08-09T11:30:00.000Z');
  });
});

describe('formatTimeRange', () => {
  it('renders local start and end times', () => {
    const start = localInstant('2026-08-09', '14:35') as string;
    expect(formatTimeRange(start, addSeconds(start, 5400))).toBe('14:35 – 16:05');
  });
});
