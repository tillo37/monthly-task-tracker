import { describe, expect, it } from 'vitest';
import {
  leaderboardMonthLabel,
  metricValue,
  monthForPreset,
  normaliseMonth,
  presetForMonth,
  type LeaderboardEntry,
} from './leaderboard';

const at = (iso: string) => new Date(iso);

describe('leaderboard periods', () => {
  it('defaults to the current calendar month', () => {
    expect(monthForPreset('thisMonth', at('2026-08-11T12:00:00'))).toBe('2026-08');
  });

  it('treats the previous period as the whole previous calendar month', () => {
    // Never a rolling thirty days: on 1 August, "last month" is all of July.
    expect(monthForPreset('lastMonth', at('2026-08-01T00:30:00'))).toBe('2026-07');
    expect(monthForPreset('lastMonth', at('2026-08-31T23:30:00'))).toBe('2026-07');
  });

  it('crosses the year boundary correctly', () => {
    expect(monthForPreset('lastMonth', at('2026-01-15T12:00:00'))).toBe('2025-12');
    expect(monthForPreset('thisMonth', at('2026-01-01T00:00:00'))).toBe('2026-01');
  });

  it('names the preset a month corresponds to', () => {
    const now = at('2026-08-11T12:00:00');
    expect(presetForMonth('2026-08', now)).toBe('thisMonth');
    expect(presetForMonth('2026-07', now)).toBe('lastMonth');
    expect(presetForMonth('2026-03', now)).toBe('custom');
    expect(presetForMonth('2026-09', now)).toBe('custom');
  });

  it('falls back to the current month for an unusable key', () => {
    const now = at('2026-08-11T12:00:00');
    expect(normaliseMonth('2026-13', now)).toBe('2026-08');
    expect(normaliseMonth('nonsense', now)).toBe('2026-08');
    expect(normaliseMonth('2026-02', now)).toBe('2026-02');
  });

  it('labels a month for the heading', () => {
    expect(leaderboardMonthLabel('2026-08')).toBe('August 2026');
  });
});

describe('metricValue', () => {
  const entry: LeaderboardEntry = {
    rank: 1,
    userId: 'u1',
    displayName: 'Alex',
    totalSeconds: 152280,
    sessionCount: 31,
    completionCount: 83,
  };

  it('reads the figure the ranking was computed from', () => {
    expect(metricValue(entry, 'time')).toBe(152280);
    expect(metricValue(entry, 'completions')).toBe(83);
  });
});
