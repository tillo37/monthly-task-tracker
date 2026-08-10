import {
  ArrowDownRight,
  ArrowUpRight,
  ListChecks,
  Target as TargetIcon,
  Timer,
  Trophy,
} from 'lucide-react';
import type { MonthStats } from '../types';
import { formatPercentage } from '../lib/calculations';
import { formatDurationOrDash } from '../lib/time';
import { ProgressRing } from './ui/ProgressRing';
import { StatTile } from './ui/StatTile';

interface MonthSummaryProps {
  stats: MonthStats;
  monthName: string;
  /** Time recorded by the time tracker this month. */
  trackedSeconds: number;
  sessionCount: number;
}

/** Headline month progress plus the supporting statistics. */
export function MonthSummary({
  stats,
  monthName,
  trackedSeconds,
  sessionCount,
}: MonthSummaryProps) {
  const exceeded = stats.totalTarget > 0 && stats.totalCompleted > stats.totalTarget;

  return (
    <section className="card p-5" aria-label={`Progress summary for ${monthName}`}>
      <div className="flex flex-col items-center gap-6 sm:flex-row sm:items-center">
        <div className="flex flex-col items-center gap-2">
          <ProgressRing
            value={stats.percentage}
            label={formatPercentage(stats.percentage)}
            sublabel={`${stats.totalCompleted} / ${stats.totalTarget}`}
            exceeded={exceeded}
          />
          <p className="text-xs text-slate-500 dark:text-slate-400">
            {stats.totalCompleted} / {stats.totalTarget} completed
          </p>
        </div>

        <div className="grid w-full grid-cols-2 gap-2.5 lg:grid-cols-4">
          <StatTile label="Completed" value={String(stats.totalCompleted)} icon={ListChecks} />
          <StatTile label="Target" value={String(stats.totalTarget)} icon={TargetIcon} />
          <StatTile label="Tasks" value={String(stats.taskCount)} icon={ListChecks} />
          <StatTile
            label="Overall"
            value={formatPercentage(stats.percentage)}
            icon={Trophy}
            tone={exceeded ? 'positive' : 'default'}
          />

          <StatTile
            label="Time tracked"
            value={formatDurationOrDash(trackedSeconds)}
            hint={
              sessionCount > 0
                ? `${sessionCount} session${sessionCount === 1 ? '' : 's'}`
                : 'No sessions yet'
            }
            icon={Timer}
          />

          {stats.best && (
            <StatTile
              label="Best task"
              value={stats.best.task.name}
              hint={`${stats.best.stats.completed} / ${stats.best.stats.target} · ${formatPercentage(
                stats.best.stats.percentage,
              )}`}
              icon={ArrowUpRight}
              tone="positive"
            />
          )}
          {stats.worst && (
            <StatTile
              label="Needs work"
              value={stats.worst.task.name}
              hint={`${stats.worst.stats.completed} / ${stats.worst.stats.target} · ${formatPercentage(
                stats.worst.stats.percentage,
              )}`}
              icon={ArrowDownRight}
              tone="muted"
            />
          )}
        </div>
      </div>
    </section>
  );
}
