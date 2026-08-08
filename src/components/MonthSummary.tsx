import { ArrowDownRight, ArrowUpRight, ListChecks, Target as TargetIcon, Trophy } from 'lucide-react';
import type { MonthStats } from '../types';
import { formatPercentage } from '../lib/calculations';
import { ProgressRing } from './ui/ProgressRing';

interface MonthSummaryProps {
  stats: MonthStats;
  monthName: string;
}

interface StatTileProps {
  label: string;
  value: string;
  hint?: string;
  icon: React.ComponentType<{ className?: string }>;
  tone?: 'default' | 'positive' | 'muted';
}

function StatTile({ label, value, hint, icon: Icon, tone = 'default' }: StatTileProps) {
  const valueTone =
    tone === 'positive'
      ? 'text-emerald-600 dark:text-emerald-400'
      : tone === 'muted'
        ? 'text-slate-500 dark:text-slate-400'
        : '';

  return (
    <div className="rounded-xl border border-slate-200/80 bg-slate-50/60 px-3 py-2.5 dark:border-slate-800 dark:bg-slate-950/40">
      <div className="flex items-center gap-1.5 text-[11px] font-semibold tracking-wide text-slate-500 uppercase dark:text-slate-400">
        <Icon className="h-3.5 w-3.5" />
        {label}
      </div>
      <div className={`mt-1 truncate text-lg font-semibold tabular-nums ${valueTone}`} title={value}>
        {value}
      </div>
      {hint && <div className="truncate text-xs text-slate-500 dark:text-slate-400">{hint}</div>}
    </div>
  );
}

/** Headline month progress plus the supporting statistics. */
export function MonthSummary({ stats, monthName }: MonthSummaryProps) {
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
