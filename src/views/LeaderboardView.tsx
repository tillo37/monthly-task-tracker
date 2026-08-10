import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, RefreshCw, Trophy } from 'lucide-react';
import type { LeaderboardSource } from '../data/leaderboardSource';
import { addMonths, currentMonthKey, monthLabel, type MonthKey } from '../lib/date';
import {
  METRIC_LABELS,
  presetForMonth,
  type LeaderboardEntry,
  type LeaderboardMetric,
} from '../lib/leaderboard';
import { formatDuration } from '../lib/time';

interface LeaderboardViewProps {
  source: LeaderboardSource;
  /** Highlights the viewer's own row; never used to filter what is shown. */
  currentUserId: string | null;
}

const MEDALS = ['🥇', '🥈', '🥉'];

/**
 * The one screen where data crosses between users — and it shows nothing but a
 * display name, a rank and a total. Task names, dates and individual sessions
 * stay behind Row Level Security; the numbers here are aggregated in Postgres
 * and arrive already ranked.
 */
export function LeaderboardView({ source, currentUserId }: LeaderboardViewProps) {
  const [metric, setMetric] = useState<LeaderboardMetric>('time');
  const [month, setMonth] = useState<MonthKey>(() => currentMonthKey());
  const [entries, setEntries] = useState<LeaderboardEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Only the newest request may write to state, so a slow month never lands on
  // top of a fast one the user asked for afterwards.
  const requestId = useRef(0);

  const load = useCallback(async () => {
    const id = ++requestId.current;
    setLoading(true);
    setError(null);
    try {
      const rows = await source.fetch(metric, month);
      if (requestId.current !== id) return;
      setEntries(rows);
    } catch (failure) {
      if (requestId.current !== id) return;
      setError(failure instanceof Error ? failure.message : 'Could not load the leaderboard.');
    } finally {
      if (requestId.current === id) setLoading(false);
    }
  }, [metric, month, source]);

  useEffect(() => {
    void load();
  }, [load]);

  // Someone finishing a session changes the standings, so the board refreshes
  // itself rather than going stale while it is on screen.
  useEffect(() => {
    if (!source.subscribe) return;
    return source.subscribe(() => void load());
  }, [load, source]);

  const preset = useMemo(() => presetForMonth(month), [month]);
  const isCurrentMonth = preset === 'thisMonth';

  const heading = metric === 'time' ? 'Total time' : 'Completions';

  return (
    <section className="space-y-4">
      <header className="card flex flex-wrap items-center justify-between gap-3 p-4">
        <div className="flex items-center gap-2">
          <span
            className="flex h-9 w-9 items-center justify-center rounded-xl bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300"
            aria-hidden="true"
          >
            <Trophy className="h-4.5 w-4.5" />
          </span>
          <div>
            <h1 className="text-base font-semibold tracking-tight">Leaderboard</h1>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              {monthLabel(month)} · everyone who tracked something
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div
            role="group"
            aria-label="Ranking metric"
            className="flex rounded-lg border border-slate-200 p-0.5 dark:border-slate-700"
          >
            {(['time', 'completions'] as const).map((option) => (
              <button
                key={option}
                type="button"
                aria-pressed={metric === option}
                onClick={() => setMetric(option)}
                className={`btn h-8 px-3 ${
                  metric === option
                    ? 'bg-indigo-600 text-white'
                    : 'text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800'
                }`}
              >
                {METRIC_LABELS[option]}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-1">
            <button
              type="button"
              className="btn btn-icon btn-subtle"
              aria-label={`Show ${monthLabel(addMonths(month, -1))}`}
              onClick={() => setMonth((current) => addMonths(current, -1))}
            >
              <ChevronLeft className="h-4 w-4" aria-hidden="true" />
            </button>
            <button
              type="button"
              className="btn btn-md btn-subtle"
              disabled={isCurrentMonth}
              onClick={() => setMonth(currentMonthKey())}
            >
              This month
            </button>
            <button
              type="button"
              className="btn btn-icon btn-subtle"
              aria-label={`Show ${monthLabel(addMonths(month, 1))}`}
              disabled={isCurrentMonth}
              onClick={() => setMonth((current) => addMonths(current, 1))}
            >
              <ChevronRight className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>

          <button
            type="button"
            className="btn btn-icon btn-subtle"
            aria-label="Refresh the leaderboard"
            onClick={() => void load()}
          >
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} aria-hidden="true" />
          </button>
        </div>
      </header>

      {error && (
        <p role="alert" className="card p-4 text-sm text-red-600 dark:text-red-400">
          {error}
        </p>
      )}

      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <caption className="sr-only">
              {heading} for {monthLabel(month)}, highest first
            </caption>
            <thead>
              <tr className="border-b border-slate-200 text-left text-[11px] font-semibold tracking-wide text-slate-500 uppercase dark:border-slate-800 dark:text-slate-400">
                <th scope="col" className="px-4 py-2.5 w-16">
                  Rank
                </th>
                <th scope="col" className="px-4 py-2.5">
                  User
                </th>
                <th scope="col" className="px-4 py-2.5 text-right">
                  {heading}
                </th>
                {metric === 'time' && (
                  <th scope="col" className="px-4 py-2.5 text-right">
                    Sessions
                  </th>
                )}
              </tr>
            </thead>
            <tbody>
              {entries.map((entry) => {
                const isViewer = entry.userId === currentUserId;
                return (
                  <tr
                    key={entry.userId}
                    className={`border-b border-slate-100 last:border-0 dark:border-slate-800/60 ${
                      isViewer ? 'bg-indigo-50/60 dark:bg-indigo-500/10' : ''
                    }`}
                  >
                    <td className="px-4 py-2.5 font-semibold tabular-nums">
                      <span aria-hidden="true">{MEDALS[entry.rank - 1] ?? ''}</span>{' '}
                      {entry.rank}
                    </td>
                    <td className="px-4 py-2.5">
                      <span className="font-medium">{entry.displayName}</span>
                      {isViewer && (
                        <span className="ml-1.5 rounded-full bg-indigo-100 px-1.5 py-0.5 text-[10px] font-semibold text-indigo-700 dark:bg-indigo-500/20 dark:text-indigo-300">
                          You
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-2.5 text-right font-semibold tabular-nums">
                      {metric === 'time'
                        ? formatDuration(entry.totalSeconds)
                        : entry.completionCount}
                    </td>
                    {metric === 'time' && (
                      <td className="px-4 py-2.5 text-right tabular-nums text-slate-600 dark:text-slate-400">
                        {entry.sessionCount}
                      </td>
                    )}
                  </tr>
                );
              })}

              {entries.length === 0 && !loading && (
                <tr>
                  <td
                    colSpan={metric === 'time' ? 4 : 3}
                    className="px-4 py-10 text-center text-sm text-slate-500 dark:text-slate-400"
                  >
                    Nobody has tracked anything in {monthLabel(month)} yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <p className="text-center text-xs text-slate-500 dark:text-slate-400">
        Only display names and monthly totals are shared. Tasks, dates and individual sessions stay
        private to each account.
      </p>
    </section>
  );
}
