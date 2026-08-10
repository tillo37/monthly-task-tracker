import { addMonths, currentMonthKey, isValidMonthKey, monthLabel, type MonthKey } from './date';

/**
 * Leaderboard periods.
 *
 * Always whole calendar months — August is 1 to 31 August, and "last month" is
 * the complete month before this one, never a rolling thirty days. The month
 * key is the only thing sent to the server, so the board cannot be sliced
 * finely enough to reconstruct anyone's schedule.
 */

export type LeaderboardMetric = 'time' | 'completions';

export type LeaderboardPreset = 'thisMonth' | 'lastMonth' | 'custom';

/** One row as the table renders it. Deliberately free of anything private. */
export interface LeaderboardEntry {
  rank: number;
  userId: string;
  displayName: string;
  /** Tracked seconds in the month; `0` on the completions board. */
  totalSeconds: number;
  /** Recorded sessions in the month; `0` on the completions board. */
  sessionCount: number;
  /** Days ticked in the month; `0` on the time board. */
  completionCount: number;
}

export const METRIC_LABELS: Record<LeaderboardMetric, string> = {
  time: 'Time',
  completions: 'Completions',
};

/** The month a preset selects, relative to `today`. */
export function monthForPreset(
  preset: Exclude<LeaderboardPreset, 'custom'>,
  now: Date = new Date(),
): MonthKey {
  const current = currentMonthKey(now);
  return preset === 'thisMonth' ? current : addMonths(current, -1);
}

/** The preset a month corresponds to, or `custom` once the user steps away. */
export function presetForMonth(month: MonthKey, now: Date = new Date()): LeaderboardPreset {
  if (month === monthForPreset('thisMonth', now)) return 'thisMonth';
  if (month === monthForPreset('lastMonth', now)) return 'lastMonth';
  return 'custom';
}

/** Rejects anything the RPC would have to guess about. */
export function normaliseMonth(value: string, now: Date = new Date()): MonthKey {
  return isValidMonthKey(value) ? value : currentMonthKey(now);
}

/** e.g. `August 2026`, reusing the tracker's own month formatting. */
export function leaderboardMonthLabel(month: MonthKey): string {
  return monthLabel(month);
}

/**
 * The value a row is ranked by. Ranks themselves come from Postgres — this is
 * only for rendering the number the rank was computed from.
 */
export function metricValue(entry: LeaderboardEntry, metric: LeaderboardMetric): number {
  return metric === 'time' ? entry.totalSeconds : entry.completionCount;
}
