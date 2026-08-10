import type { BucketUnit, ReportBucket } from '../../lib/reportEngine';
import { formatDuration, formatDurationOrDash } from '../../lib/time';

interface ActivityChartProps {
  buckets: ReportBucket[];
  unit: BucketUnit;
  /** Shown under the heading, e.g. `Aug 10 → Aug 16, 2026`. */
  subtitle: string;
}

const UNIT_HEADING: Record<BucketUnit, string> = {
  day: 'Daily activity',
  week: 'Weekly activity',
  month: 'Monthly activity',
};

const UNIT_NOUN: Record<BucketUnit, string> = { day: 'day', week: 'week', month: 'month' };

/**
 * Time tracked per bucket — days for short ranges, weeks or months for long ones.
 *
 * One measure, so one hue: bar height carries the whole message. Sparse ranges
 * (a week) also label each bar with its value; dense ones fall back to the
 * tooltip and the screen-reader table, which is always present.
 */
export function ActivityChart({ buckets, unit, subtitle }: ActivityChartProps) {
  const max = buckets.reduce((highest, bucket) => Math.max(highest, bucket.seconds), 0);
  const active = buckets.filter((bucket) => bucket.seconds > 0).length;
  // Up to ten bars there is room for a value above each one.
  const labelled = buckets.length <= 10;

  return (
    <section className="card p-5" aria-label={`Time tracked per ${UNIT_NOUN[unit]}`}>
      <div className="flex flex-wrap items-baseline justify-between gap-x-3">
        <h2 className="text-sm font-semibold">{UNIT_HEADING[unit]}</h2>
        <p className="text-xs text-slate-500 dark:text-slate-400">{subtitle}</p>
      </div>
      <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
        {active} of {buckets.length} {UNIT_NOUN[unit]}
        {buckets.length === 1 ? '' : 's'} with tracked time
        {max > 0 && ` · busiest ${formatDuration(max)}`}
      </p>

      <div className="mt-4 overflow-x-auto">
        <div
          className={`flex items-end ${labelled ? 'gap-2' : 'gap-[2px]'} ${
            buckets.length > 14 ? 'min-w-[520px]' : ''
          }`}
        >
          {buckets.map((bucket) => {
            // A tracked bucket always shows at least a sliver so it is never invisible.
            const height =
              max > 0 && bucket.seconds > 0 ? Math.max((bucket.seconds / max) * 100, 4) : 0;

            return (
              <div key={bucket.key} className="flex flex-1 flex-col items-center gap-1">
                {labelled && (
                  <span
                    className={`text-[10px] tabular-nums ${
                      bucket.seconds > 0
                        ? 'font-medium text-slate-600 dark:text-slate-300'
                        : 'text-slate-400 dark:text-slate-600'
                    }`}
                  >
                    {formatDurationOrDash(bucket.seconds)}
                  </span>
                )}

                <div className="flex h-[100px] w-full items-end">
                  <div
                    className={`w-full rounded-md transition-[height] duration-300 ease-out ${
                      bucket.seconds > 0
                        ? 'bg-indigo-500 dark:bg-indigo-400'
                        : 'bg-slate-100 dark:bg-slate-800/70'
                    }`}
                    style={{ height: bucket.seconds > 0 ? `${height}%` : 2 }}
                    title={`${bucket.title}: ${
                      bucket.seconds > 0 ? formatDuration(bucket.seconds) : 'nothing tracked'
                    }`}
                  />
                </div>

                <span
                  className={`text-[10px] leading-tight tabular-nums ${
                    bucket.isToday
                      ? 'font-semibold text-indigo-600 dark:text-indigo-400'
                      : bucket.isWeekend
                        ? 'text-slate-400 dark:text-slate-600'
                        : 'text-slate-500 dark:text-slate-400'
                  }`}
                >
                  {bucket.label}
                  {bucket.sublabel && (
                    <>
                      <br />
                      {bucket.sublabel}
                    </>
                  )}
                </span>
              </div>
            );
          })}
        </div>
      </div>

      <table className="sr-only">
        <caption>Time tracked per {UNIT_NOUN[unit]}: {subtitle}</caption>
        <thead>
          <tr>
            <th scope="col">{UNIT_HEADING[unit].replace(' activity', '')}</th>
            <th scope="col">Time tracked</th>
          </tr>
        </thead>
        <tbody>
          {buckets.map((bucket) => (
            <tr key={bucket.key}>
              <th scope="row">{bucket.title}</th>
              <td>{formatDuration(bucket.seconds)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
