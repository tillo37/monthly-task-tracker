import {
  dayPosition,
  daysOfMonth,
  isWeekend,
  monthLabel,
  shortDateLabel,
  todayKey,
  type MonthKey,
} from '../../lib/date';
import { formatDuration } from '../../lib/time';

interface DailyTimeChartProps {
  month: MonthKey;
  /** Seconds keyed by date, as produced by `monthTimeStats`. */
  byDay: Record<string, number>;
}

/**
 * Time tracked per day of the month. One measure, so one hue: the bar height is
 * the whole message and the accompanying table view carries the exact numbers.
 */
export function DailyTimeChart({ month, byDay }: DailyTimeChartProps) {
  const days = daysOfMonth(month);
  const today = todayKey();
  const max = days.reduce((highest, date) => Math.max(highest, byDay[date] ?? 0), 0);
  const tracked = days.filter((date) => (byDay[date] ?? 0) > 0).length;

  return (
    <section className="card p-5" aria-label={`Time tracked each day of ${monthLabel(month)}`}>
      <div className="flex items-baseline justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold">Daily activity</h2>
          <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
            {tracked} day{tracked === 1 ? '' : 's'} with tracked time
            {max > 0 && ` · busiest ${formatDuration(max)}`}
          </p>
        </div>
      </div>

      <div className="mt-4 overflow-x-auto">
        <div className="flex min-w-[520px] items-end gap-[2px]" style={{ height: 132 }}>
          {days.map((date, index) => {
            const seconds = byDay[date] ?? 0;
            // A tracked day always shows at least a sliver so it is never invisible.
            const height = max > 0 && seconds > 0 ? Math.max((seconds / max) * 100, 4) : 0;
            const isToday = dayPosition(date, today) === 'today';

            return (
              <div key={date} className="flex flex-1 flex-col items-center gap-1">
                <div className="flex h-[100px] w-full items-end">
                  <div
                    className={`w-full rounded-md transition-[height] duration-300 ease-out ${
                      seconds > 0
                        ? 'bg-indigo-500 dark:bg-indigo-400'
                        : 'bg-slate-100 dark:bg-slate-800/70'
                    }`}
                    style={{ height: seconds > 0 ? `${height}%` : 2 }}
                    title={`${shortDateLabel(date)}: ${
                      seconds > 0 ? formatDuration(seconds) : 'nothing tracked'
                    }`}
                  />
                </div>
                <span
                  className={`text-[10px] tabular-nums ${
                    isToday
                      ? 'font-semibold text-indigo-600 dark:text-indigo-400'
                      : isWeekend(date)
                        ? 'text-slate-400 dark:text-slate-600'
                        : 'text-slate-500 dark:text-slate-400'
                  }`}
                >
                  {index + 1}
                </span>
              </div>
            );
          })}
        </div>
      </div>

      <table className="sr-only">
        <caption>Time tracked each day of {monthLabel(month)}</caption>
        <thead>
          <tr>
            <th scope="col">Day</th>
            <th scope="col">Time tracked</th>
          </tr>
        </thead>
        <tbody>
          {days.map((date) => (
            <tr key={date}>
              <th scope="row">{shortDateLabel(date)}</th>
              <td>{formatDuration(byDay[date] ?? 0)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
