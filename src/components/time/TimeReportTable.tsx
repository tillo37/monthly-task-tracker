import type { MonthStats, MonthTimeStats } from '../../types';
import { formatPercentage, taskStats } from '../../lib/calculations';
import { monthLabel, type MonthKey } from '../../lib/date';
import { formatDurationOrDash } from '../../lib/time';
import { ProgressBar } from '../ui/ProgressBar';
import { TaskTimeChip } from './TaskTimeChip';

interface TimeReportTableProps {
  month: MonthKey;
  timeStats: MonthTimeStats;
  stats: MonthStats;
}

/**
 * The full monthly picture per task: target, completions, completion rate and
 * time spent side by side. Also the table view for the charts above it.
 */
export function TimeReportTable({ month, timeStats, stats }: TimeReportTableProps) {
  const header =
    'border-b border-slate-200 px-3 py-2 text-xs font-semibold tracking-wide text-slate-500 uppercase dark:border-slate-800 dark:text-slate-400';
  const cell = 'border-b border-slate-100 px-3 py-2.5 dark:border-slate-800/70';

  return (
    <section className="card overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full border-separate border-spacing-0 text-sm">
          <caption className="px-4 pt-4 pb-3 text-left">
            <span className="block text-sm font-semibold">Task breakdown</span>
            <span className="block text-xs text-slate-500 dark:text-slate-400">
              Completion and time spent for {monthLabel(month)}.
            </span>
          </caption>

          <thead className="bg-slate-50 dark:bg-slate-900/95">
            <tr>
              <th scope="col" className={`${header} text-left`}>
                Task
              </th>
              <th scope="col" className={`${header} text-right`}>
                Target
              </th>
              <th scope="col" className={`${header} text-right`}>
                Done
              </th>
              <th scope="col" className={`${header} w-[150px] text-left`}>
                Completion
              </th>
              <th scope="col" className={`${header} text-right`}>
                Time spent
              </th>
              <th scope="col" className={`${header} text-right`}>
                Sessions
              </th>
              <th scope="col" className={`${header} text-right`}>
                Per session
              </th>
              <th scope="col" className={`${header} text-right`}>
                Per completion
              </th>
            </tr>
          </thead>

          <tbody>
            {timeStats.ranked.map(({ task, time }) => {
              const progress = taskStats(task, month);

              return (
                <tr key={task.id}>
                  <th scope="row" className={`${cell} max-w-[220px] text-left font-medium`}>
                    <TaskTimeChip task={task} size="sm" />
                  </th>
                  <td className={`${cell} text-right tabular-nums`}>{progress.target}</td>
                  <td className={`${cell} text-right tabular-nums`}>{progress.completed}</td>
                  <td className={cell}>
                    <div className="flex items-center gap-2">
                      <span
                        className={`w-12 shrink-0 text-xs tabular-nums ${
                          progress.exceeded
                            ? 'font-semibold text-emerald-600 dark:text-emerald-400'
                            : 'text-slate-500 dark:text-slate-400'
                        }`}
                      >
                        {formatPercentage(progress.percentage)}
                      </span>
                      <span className="min-w-0 flex-1">
                        <ProgressBar
                          value={progress.percentage}
                          color={task.color}
                          exceeded={progress.exceeded}
                        />
                      </span>
                    </div>
                  </td>
                  <td className={`${cell} text-right font-semibold tabular-nums`}>
                    {formatDurationOrDash(time.totalSeconds)}
                  </td>
                  <td className={`${cell} text-right tabular-nums`}>
                    {time.sessionCount > 0 ? time.sessionCount : '—'}
                  </td>
                  <td className={`${cell} text-right tabular-nums`}>
                    {formatDurationOrDash(time.averageSeconds)}
                  </td>
                  <td className={`${cell} text-right tabular-nums`}>
                    {formatDurationOrDash(time.secondsPerCompletion)}
                  </td>
                </tr>
              );
            })}
          </tbody>

          <tfoot>
            <tr className="bg-slate-50/70 dark:bg-slate-950/40">
              <th scope="row" className="px-3 py-2.5 text-left text-xs font-semibold uppercase">
                Total
              </th>
              <td className="px-3 py-2.5 text-right tabular-nums">{stats.totalTarget}</td>
              <td className="px-3 py-2.5 text-right tabular-nums">{stats.totalCompleted}</td>
              <td className="px-3 py-2.5 text-left text-xs tabular-nums">
                {formatPercentage(stats.percentage)}
              </td>
              <td className="px-3 py-2.5 text-right font-semibold tabular-nums">
                {formatDurationOrDash(timeStats.totalSeconds)}
              </td>
              <td className="px-3 py-2.5 text-right tabular-nums">
                {timeStats.sessionCount > 0 ? timeStats.sessionCount : '—'}
              </td>
              <td className="px-3 py-2.5 text-right tabular-nums">
                {formatDurationOrDash(timeStats.averageSeconds)}
              </td>
              <td className="px-3 py-2.5 text-right tabular-nums">
                {formatDurationOrDash(
                  stats.totalCompleted > 0
                    ? Math.round(timeStats.totalSeconds / stats.totalCompleted)
                    : 0,
                )}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>
    </section>
  );
}
