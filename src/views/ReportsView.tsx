import { useMemo } from 'react';
import { AlertTriangle, BarChart3, CalendarDays, Clock, ListChecks, Timer } from 'lucide-react';
import type { TrackerData } from '../types';
import { ActivityChart } from '../components/time/ActivityChart';
import { ReportPeriodPicker } from '../components/time/ReportPeriodPicker';
import { TimeByTaskChart } from '../components/time/TimeByTaskChart';
import { TimeReportTable } from '../components/time/TimeReportTable';
import { StatTile } from '../components/ui/StatTile';
import { formatPercentage } from '../lib/calculations';
import { shortDateLabel, todayKey, type DateKey } from '../lib/date';
import { buildReport } from '../lib/reportEngine';
import {
  getReportRange,
  periodTitle,
  rangeLabel,
  type ReportPeriod,
} from '../lib/reportRange';
import { describeDuration, formatDurationOrDash } from '../lib/time';

interface ReportsViewProps {
  data: TrackerData;
  period: ReportPeriod;
  onPeriodChange: (period: ReportPeriod) => void;
  onRemoveOrphans: () => void;
  today?: DateKey;
}

/**
 * Completion and time analytics for any period.
 *
 * Every preset — daily, weekly, monthly, yearly, custom — resolves to a day
 * range and goes through the same report engine, so there is no separate weekly
 * code path. The period lives here rather than in the tracker's month state, so
 * browsing reports never moves the task grid.
 */
export function ReportsView({
  data,
  period,
  onPeriodChange,
  onRemoveOrphans,
  today = todayKey(),
}: ReportsViewProps) {
  const range = useMemo(() => getReportRange(period), [period]);
  const report = useMemo(() => buildReport(data, range, today), [data, range, today]);

  const label = rangeLabel(range);
  const busiest = report.busiestDays;
  const tied = busiest.length > 1;

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight sm:text-2xl">
            {periodTitle(period)}
          </h1>
          <p className="text-xs text-slate-500 tabular-nums dark:text-slate-400" aria-live="polite">
            {label} · {report.dayCount} day{report.dayCount === 1 ? '' : 's'}
          </p>
        </div>
        <ReportPeriodPicker period={period} onChange={onPeriodChange} today={today} />
      </div>

      {report.tasks.length === 0 ? (
        <section className="card flex flex-col items-center px-6 py-14 text-center">
          <span
            className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-indigo-50 text-indigo-600 dark:bg-indigo-500/10 dark:text-indigo-400"
            aria-hidden="true"
          >
            <BarChart3 className="h-6 w-6" />
          </span>
          <h2 className="text-base font-semibold">Nothing to report for {label}</h2>
          <p className="mt-1 max-w-sm text-sm text-slate-600 dark:text-slate-400">
            Reports are built from the tasks and time recorded in the selected period.
          </p>
        </section>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-5">
            <StatTile
              label="Total time"
              value={formatDurationOrDash(report.totalSeconds)}
              hint={report.totalSeconds > 0 ? describeDuration(report.totalSeconds) : undefined}
              icon={Timer}
            />
            <StatTile
              label="Average / day"
              value={formatDurationOrDash(report.averageSecondsPerDay)}
              hint={`across ${report.dayCount} day${report.dayCount === 1 ? '' : 's'}`}
              icon={Clock}
            />
            <StatTile
              label="Sessions"
              value={String(report.sessionCount)}
              hint={
                report.sessionCount > 0
                  ? `${formatDurationOrDash(report.averageSessionSeconds)} each`
                  : undefined
              }
              icon={ListChecks}
            />
            <StatTile
              label="Busiest day"
              value={busiest.length > 0 ? shortDateLabel(busiest[0].date) : '—'}
              hint={
                busiest.length > 0
                  ? `${formatDurationOrDash(busiest[0].seconds)}${
                      tied ? ` · tied with ${busiest.length - 1} more` : ''
                    }`
                  : 'nothing tracked'
              }
              icon={CalendarDays}
              tone={busiest.length > 0 ? 'default' : 'muted'}
            />
            <StatTile
              label="Done in period"
              value={`${report.totals.doneInPeriod} / ${report.totals.monthlyTarget}`}
              hint={`${formatPercentage(report.totals.periodCompletion)} of the monthly target`}
              icon={ListChecks}
              tone={
                report.totals.monthlyTarget > 0 &&
                report.totals.doneInPeriod > report.totals.monthlyTarget
                  ? 'positive'
                  : 'default'
              }
            />
          </div>

          {report.orphanSessionCount > 0 && (
            <div className="card flex flex-wrap items-center justify-between gap-3 border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-200">
              <p className="flex items-start gap-2">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                <span>
                  {report.orphanSessionCount} session
                  {report.orphanSessionCount === 1 ? '' : 's'} in this period belong to a task that
                  no longer exists, so they are left out of these totals.
                </span>
              </p>
              <button type="button" className="btn btn-md btn-subtle" onClick={onRemoveOrphans}>
                Remove them
              </button>
            </div>
          )}

          <div className="grid gap-4 lg:grid-cols-2">
            <TimeByTaskChart
              tasks={report.tasks}
              totalSeconds={report.totalSeconds}
              subtitle={label}
            />
            <ActivityChart buckets={report.buckets} unit={report.bucketUnit} subtitle={label} />
          </div>

          <TimeReportTable report={report} subtitle={label} />
        </>
      )}
    </>
  );
}
