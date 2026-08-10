import { iconFor } from '../../lib/appearance';
import { formatPercentage } from '../../lib/calculations';
import type { Report } from '../../lib/reportEngine';
import { formatDurationOrDash } from '../../lib/time';
import { ProgressBar } from '../ui/ProgressBar';

interface TimeReportTableProps {
  report: Report;
  /** Shown under the caption, e.g. `Aug 10 → Aug 16, 2026`. */
  subtitle: string;
}

/**
 * The full picture per task for the selected period.
 *
 * The target column is deliberately labelled as a *monthly* figure: targets are
 * set per month and are never rescaled to the report period, while `Done in
 * period` counts only completions inside the selected range. Keeping both labels
 * explicit is what stops a weekly report reading as "4 / 20 of this week".
 */
export function TimeReportTable({ report, subtitle }: TimeReportTableProps) {
  const header =
    'border-b border-slate-200 px-3 py-2 text-xs font-semibold tracking-wide text-slate-500 uppercase dark:border-slate-800 dark:text-slate-400';
  const cell = 'border-b border-slate-100 px-3 py-2.5 dark:border-slate-800/70';

  // Only say "N months" when a task really drew a target from that many months.
  const span = report.targetMonthSpan;
  const targetLabel = span > 1 ? `Target · ${span} months` : 'Monthly target';

  return (
    <section className="card overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full border-separate border-spacing-0 text-sm">
          <caption className="px-4 pt-4 pb-3 text-left">
            <span className="block text-sm font-semibold">Task breakdown</span>
            <span className="block text-xs text-slate-500 dark:text-slate-400">
              Time and completions for {subtitle}. Targets are monthly and are not scaled to the
              period.
            </span>
          </caption>

          <thead className="bg-slate-50 dark:bg-slate-900/95">
            <tr>
              <th scope="col" className={`${header} text-left`}>
                Task
              </th>
              <th scope="col" className={`${header} text-right`}>
                {targetLabel}
              </th>
              <th scope="col" className={`${header} text-right`}>
                Done in period
              </th>
              <th scope="col" className={`${header} w-[150px] text-left`}>
                Period completion
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
            {report.tasks.map((row) => {
              const Icon = iconFor(row.icon);
              const exceeded = row.monthlyTarget > 0 && row.doneInPeriod > row.monthlyTarget;

              return (
                <tr key={row.key}>
                  <th scope="row" className={`${cell} max-w-[220px] text-left font-medium`}>
                    <span className="flex min-w-0 items-center gap-2">
                      <span
                        className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md"
                        style={{ backgroundColor: `${row.color}1f`, color: row.color }}
                        aria-hidden="true"
                      >
                        <Icon className="h-3.5 w-3.5" />
                      </span>
                      <span className="truncate" title={row.name}>
                        {row.name}
                      </span>
                    </span>
                  </th>
                  <td className={`${cell} text-right tabular-nums`}>{row.monthlyTarget}</td>
                  <td className={`${cell} text-right font-medium tabular-nums`}>
                    {row.doneInPeriod}
                  </td>
                  <td className={cell}>
                    <div className="flex items-center gap-2">
                      <span
                        className={`w-12 shrink-0 text-xs tabular-nums ${
                          exceeded
                            ? 'font-semibold text-emerald-600 dark:text-emerald-400'
                            : 'text-slate-500 dark:text-slate-400'
                        }`}
                      >
                        {formatPercentage(row.periodCompletion)}
                      </span>
                      <span className="min-w-0 flex-1">
                        <ProgressBar
                          value={row.periodCompletion}
                          color={row.color}
                          exceeded={exceeded}
                        />
                      </span>
                    </div>
                  </td>
                  <td className={`${cell} text-right font-semibold tabular-nums`}>
                    {formatDurationOrDash(row.totalSeconds)}
                  </td>
                  <td className={`${cell} text-right tabular-nums`}>
                    {row.sessionCount > 0 ? row.sessionCount : '—'}
                  </td>
                  <td className={`${cell} text-right tabular-nums`}>
                    {formatDurationOrDash(row.averageSeconds)}
                  </td>
                  <td className={`${cell} text-right tabular-nums`}>
                    {formatDurationOrDash(row.secondsPerCompletion)}
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
              <td className="px-3 py-2.5 text-right tabular-nums">
                {report.totals.monthlyTarget}
              </td>
              <td className="px-3 py-2.5 text-right font-medium tabular-nums">
                {report.totals.doneInPeriod}
              </td>
              <td className="px-3 py-2.5 text-left text-xs tabular-nums">
                {formatPercentage(report.totals.periodCompletion)}
              </td>
              <td className="px-3 py-2.5 text-right font-semibold tabular-nums">
                {formatDurationOrDash(report.totalSeconds)}
              </td>
              <td className="px-3 py-2.5 text-right tabular-nums">
                {report.sessionCount > 0 ? report.sessionCount : '—'}
              </td>
              <td className="px-3 py-2.5 text-right tabular-nums">
                {formatDurationOrDash(report.averageSessionSeconds)}
              </td>
              <td className="px-3 py-2.5 text-right tabular-nums">
                {formatDurationOrDash(
                  report.totals.doneInPeriod > 0
                    ? Math.round(report.totalSeconds / report.totals.doneInPeriod)
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
