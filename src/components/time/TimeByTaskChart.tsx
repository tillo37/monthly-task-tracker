import { iconFor } from '../../lib/appearance';
import type { ReportTaskRow } from '../../lib/reportEngine';
import { formatDuration } from '../../lib/time';

interface TimeByTaskChartProps {
  /** Ranked by time spent, descending. */
  tasks: ReportTaskRow[];
  totalSeconds: number;
  /** Shown under the heading, e.g. `Aug 10 → Aug 16, 2026`. */
  subtitle: string;
}

/**
 * Time per task as horizontal bars, ordered by magnitude.
 *
 * Every bar is directly labelled with its task name and duration, so identity
 * and value never depend on the accent colour alone — the same numbers are also
 * in the report table below.
 */
export function TimeByTaskChart({ tasks, totalSeconds, subtitle }: TimeByTaskChartProps) {
  const max = tasks.reduce((highest, row) => Math.max(highest, row.totalSeconds), 0);

  return (
    <section className="card p-5" aria-label="Time spent per task">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3">
        <h2 className="text-sm font-semibold">Time per task</h2>
        <p className="text-xs text-slate-500 dark:text-slate-400">{subtitle}</p>
      </div>
      <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
        {totalSeconds > 0
          ? `${formatDuration(totalSeconds)} tracked across ${tasks.length} task${
              tasks.length === 1 ? '' : 's'
            }.`
          : 'No time tracked in this period.'}
      </p>

      <ul className="mt-4 space-y-3">
        {tasks.map((row) => {
          const width = max > 0 ? (row.totalSeconds / max) * 100 : 0;
          const share = totalSeconds > 0 ? (row.totalSeconds / totalSeconds) * 100 : 0;
          const Icon = iconFor(row.icon);

          return (
            <li key={row.key}>
              <div className="flex items-baseline justify-between gap-3 text-sm">
                <span className="flex min-w-0 items-center gap-1.5">
                  <Icon
                    className="h-3.5 w-3.5 shrink-0"
                    style={{ color: row.color }}
                    aria-hidden="true"
                  />
                  <span className="truncate font-medium" title={row.name}>
                    {row.name}
                  </span>
                </span>
                <span className="shrink-0 tabular-nums">
                  <span className="font-semibold">{formatDuration(row.totalSeconds)}</span>
                  {share > 0 && (
                    <span className="text-slate-500 dark:text-slate-400">
                      {' '}
                      · {Math.round(share)}%
                    </span>
                  )}
                </span>
              </div>

              <div
                className="mt-1.5 h-2.5 w-full overflow-hidden rounded-md bg-slate-100 dark:bg-slate-800/70"
                aria-hidden="true"
              >
                <div
                  className="h-full rounded-md transition-[width] duration-300 ease-out"
                  style={{ width: `${width}%`, backgroundColor: row.color }}
                />
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
