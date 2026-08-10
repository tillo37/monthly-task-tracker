import type { MonthTimeStats } from '../../types';
import { iconFor } from '../../lib/appearance';
import { formatDuration } from '../../lib/time';

interface TimeByTaskChartProps {
  ranked: MonthTimeStats['ranked'];
  totalSeconds: number;
}

/**
 * Time per task as horizontal bars, ordered by magnitude.
 *
 * Every bar is directly labelled with its task name and duration, so identity
 * and value never depend on the accent colour alone — the same numbers are also
 * in the report table below.
 */
export function TimeByTaskChart({ ranked, totalSeconds }: TimeByTaskChartProps) {
  const max = ranked.reduce((highest, entry) => Math.max(highest, entry.time.totalSeconds), 0);

  return (
    <section className="card p-5" aria-label="Time spent per task">
      <h2 className="text-sm font-semibold">Time per task</h2>
      <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
        {totalSeconds > 0
          ? `${formatDuration(totalSeconds)} tracked across ${ranked.length} task${
              ranked.length === 1 ? '' : 's'
            }.`
          : 'No time tracked yet this month.'}
      </p>

      <ul className="mt-4 space-y-3">
        {ranked.map(({ task, time }) => {
          const width = max > 0 ? (time.totalSeconds / max) * 100 : 0;
          const share = totalSeconds > 0 ? (time.totalSeconds / totalSeconds) * 100 : 0;
          const Icon = iconFor(task.icon);

          return (
            <li key={task.id}>
              <div className="flex items-baseline justify-between gap-3 text-sm">
                <span className="flex min-w-0 items-center gap-1.5">
                  <Icon className="h-3.5 w-3.5 shrink-0" style={{ color: task.color }} aria-hidden="true" />
                  <span className="truncate font-medium" title={task.name}>
                    {task.name}
                  </span>
                </span>
                <span className="shrink-0 tabular-nums">
                  <span className="font-semibold">{formatDuration(time.totalSeconds)}</span>
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
                  style={{ width: `${width}%`, backgroundColor: task.color }}
                />
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
