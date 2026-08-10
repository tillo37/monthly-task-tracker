import { AlertTriangle, BarChart3, CalendarDays, Clock, ListChecks, Timer } from 'lucide-react';
import type { MonthData, MonthStats, MonthTimeStats } from '../types';
import { MonthNavigator } from '../components/MonthNavigator';
import { DailyTimeChart } from '../components/time/DailyTimeChart';
import { TimeByTaskChart } from '../components/time/TimeByTaskChart';
import { TimeReportTable } from '../components/time/TimeReportTable';
import { StatTile } from '../components/ui/StatTile';
import { formatPercentage } from '../lib/calculations';
import { monthLabel, shortDateLabel, type MonthKey } from '../lib/date';
import { formatDurationOrDash } from '../lib/time';

interface ReportsViewProps {
  month: MonthKey;
  monthData: MonthData;
  stats: MonthStats;
  timeStats: MonthTimeStats;
  onPreviousMonth: () => void;
  onNextMonth: () => void;
  onCurrentMonth: () => void;
  onSelectMonth: (month: MonthKey) => void;
  onRemoveOrphans: () => void;
}

/** Completion and time analytics for one month, in one place. */
export function ReportsView({
  month,
  monthData,
  stats,
  timeStats,
  onPreviousMonth,
  onNextMonth,
  onCurrentMonth,
  onSelectMonth,
  onRemoveOrphans,
}: ReportsViewProps) {
  const trackedDays = Object.keys(timeStats.byDay).length;

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <MonthNavigator
          month={month}
          onPrevious={onPreviousMonth}
          onNext={onNextMonth}
          onToday={onCurrentMonth}
          onSelect={onSelectMonth}
        />
        <p className="text-xs text-slate-500 dark:text-slate-400">
          Completion and time report for {monthLabel(month)}
        </p>
      </div>

      {monthData.tasks.length === 0 ? (
        <section className="card flex flex-col items-center px-6 py-14 text-center">
          <span
            className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-indigo-50 text-indigo-600 dark:bg-indigo-500/10 dark:text-indigo-400"
            aria-hidden="true"
          >
            <BarChart3 className="h-6 w-6" />
          </span>
          <h2 className="text-base font-semibold">Nothing to report for {monthLabel(month)}</h2>
          <p className="mt-1 max-w-sm text-sm text-slate-600 dark:text-slate-400">
            Reports are built from the tasks and time recorded in this month.
          </p>
        </section>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-2.5 lg:grid-cols-4">
            <StatTile
              label="Time tracked"
              value={formatDurationOrDash(timeStats.totalSeconds)}
              hint={`${timeStats.sessionCount} session${
                timeStats.sessionCount === 1 ? '' : 's'
              }`}
              icon={Timer}
            />
            <StatTile
              label="Completion"
              value={formatPercentage(stats.percentage)}
              hint={`${stats.totalCompleted} / ${stats.totalTarget} completed`}
              icon={ListChecks}
              tone={
                stats.totalTarget > 0 && stats.totalCompleted > stats.totalTarget
                  ? 'positive'
                  : 'default'
              }
            />
            <StatTile
              label="Per session"
              value={formatDurationOrDash(timeStats.averageSeconds)}
              hint={
                trackedDays > 0
                  ? `${formatDurationOrDash(
                      Math.round(timeStats.totalSeconds / trackedDays),
                    )} per active day`
                  : undefined
              }
              icon={Clock}
            />
            <StatTile
              label="Busiest day"
              value={
                timeStats.busiestDay ? shortDateLabel(timeStats.busiestDay.date) : '—'
              }
              hint={
                timeStats.busiestDay
                  ? formatDurationOrDash(timeStats.busiestDay.seconds)
                  : `${trackedDays} active day${trackedDays === 1 ? '' : 's'}`
              }
              icon={CalendarDays}
              tone={timeStats.busiestDay ? 'default' : 'muted'}
            />
          </div>

          {timeStats.orphanSessionCount > 0 && (
            <div className="card flex flex-wrap items-center justify-between gap-3 border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-200">
              <p className="flex items-start gap-2">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                <span>
                  {timeStats.orphanSessionCount} session
                  {timeStats.orphanSessionCount === 1 ? '' : 's'} belong to a task that no longer
                  exists, so they are left out of these totals.
                </span>
              </p>
              <button type="button" className="btn btn-md btn-subtle" onClick={onRemoveOrphans}>
                Remove them
              </button>
            </div>
          )}

          <div className="grid gap-4 lg:grid-cols-2">
            <TimeByTaskChart ranked={timeStats.ranked} totalSeconds={timeStats.totalSeconds} />
            <DailyTimeChart month={month} byDay={timeStats.byDay} />
          </div>

          <TimeReportTable month={month} timeStats={timeStats} stats={stats} />
        </>
      )}
    </>
  );
}
