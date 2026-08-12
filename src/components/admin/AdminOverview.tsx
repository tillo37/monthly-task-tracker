import { useCallback, useEffect, useState } from 'react';
import {
  Activity,
  CalendarRange,
  CheckCircle2,
  Clock,
  ListChecks,
  RefreshCw,
  Timer,
  Users,
} from 'lucide-react';
import type { AdminActivityEntry, AdminSource, AdminStats } from '../../data/adminSource';
import { StatTile } from '../ui/StatTile';
import { formatCount, formatHours, formatTimeOfDay } from '../../lib/admin';

/**
 * System totals.
 *
 * Two RPCs, nine numbers and a short feed — the browser never receives a single
 * session row to add up. `admin_stats()` does the aggregation in Postgres.
 */
export function AdminOverview({ source }: { source: AdminSource }) {
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [activity, setActivity] = useState<AdminActivityEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [next, feed] = await Promise.all([source.stats(), source.recentActivity(10)]);
      setStats(next);
      setActivity(feed);
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'Could not load the statistics.');
    } finally {
      setLoading(false);
    }
  }, [source]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <section className="space-y-4">
      <header className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold tracking-tight">Overview</h2>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Totals across every account, aggregated in the database.
          </p>
        </div>
        <button
          type="button"
          className="btn btn-icon btn-subtle"
          aria-label="Refresh the statistics"
          onClick={() => void load()}
        >
          <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} aria-hidden="true" />
        </button>
      </header>

      {error && (
        <p role="alert" className="card p-4 text-sm text-red-600 dark:text-red-400">
          {error}
        </p>
      )}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <StatTile
          label="Users"
          icon={Users}
          value={formatCount(stats?.totalUsers ?? 0)}
          hint={`${formatCount(stats?.adminCount ?? 0)} admin${
            stats?.adminCount === 1 ? '' : 's'
          }${stats?.disabledUsers ? ` · ${formatCount(stats.disabledUsers)} disabled` : ''}`}
        />
        <StatTile
          label="Active today"
          icon={Activity}
          value={formatCount(stats?.activeToday ?? 0)}
          hint="Tracked or completed something today"
        />
        <StatTile
          label="Active this month"
          icon={CalendarRange}
          value={formatCount(stats?.activeThisMonth ?? 0)}
          hint="Since the first of the month"
        />
        <StatTile
          label="Tracked time"
          icon={Clock}
          value={formatHours(stats?.totalSeconds ?? 0)}
          hint="All accounts, all time"
        />
        <StatTile
          label="Sessions"
          icon={Timer}
          value={formatCount(stats?.totalSessions ?? 0)}
          hint={`${formatCount(stats?.totalTasks ?? 0)} tasks defined`}
        />
        <StatTile
          label="Completions"
          icon={CheckCircle2}
          value={formatCount(stats?.totalCompletions ?? 0)}
          hint="Days ticked off"
        />
      </div>

      <div className="card overflow-hidden">
        <h3 className="flex items-center gap-1.5 border-b border-slate-200 px-4 py-2.5 text-xs font-semibold tracking-wide text-slate-500 uppercase dark:border-slate-800 dark:text-slate-400">
          <ListChecks className="h-3.5 w-3.5" aria-hidden="true" />
          Recent activity
        </h3>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <caption className="sr-only">The most recent activity across all accounts</caption>
            <thead>
              <tr className="border-b border-slate-200 text-left text-[11px] font-semibold tracking-wide text-slate-500 uppercase dark:border-slate-800 dark:text-slate-400">
                <th scope="col" className="px-4 py-2.5">
                  User
                </th>
                <th scope="col" className="px-4 py-2.5">
                  Action
                </th>
                <th scope="col" className="px-4 py-2.5 text-right">
                  Time
                </th>
              </tr>
            </thead>
            <tbody>
              {activity.map((entry) => (
                <tr
                  key={`${entry.userId}-${entry.at}-${entry.action}`}
                  className="border-b border-slate-100 last:border-0 dark:border-slate-800/60"
                >
                  {/* Display name only: the feed says that something happened,
                      never which task it was about. */}
                  <td className="px-4 py-2.5 font-medium">{entry.displayName}</td>
                  <td className="px-4 py-2.5 text-slate-600 dark:text-slate-400">
                    {entry.action}
                    {entry.detail && (
                      <span className="ml-1.5 tabular-nums text-slate-500 dark:text-slate-500">
                        {entry.detail}
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-2.5 text-right tabular-nums text-slate-500 dark:text-slate-400">
                    {formatTimeOfDay(entry.at)}
                  </td>
                </tr>
              ))}

              {activity.length === 0 && !loading && (
                <tr>
                  <td
                    colSpan={3}
                    className="px-4 py-10 text-center text-sm text-slate-500 dark:text-slate-400"
                  >
                    Nothing has been tracked yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}
