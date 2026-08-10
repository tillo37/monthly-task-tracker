import { Pause, Play, Plus, Trash2 } from 'lucide-react';
import type { MonthTimeStats, Task } from '../../types';
import { iconFor } from '../../lib/appearance';
import { monthLabel, type MonthKey } from '../../lib/date';
import { describeDuration, formatClock, formatDurationOrDash } from '../../lib/time';

interface TimerPanelProps {
  month: MonthKey;
  tasks: Task[];
  timeStats: MonthTimeStats;
  /** Task the user has picked to time next. */
  selectedTaskId: string;
  onSelectTask: (taskId: string) => void;
  /** The task currently being timed, if any — it may live in another month. */
  runningTask: Task | null;
  runningMonth: MonthKey | null;
  elapsed: number;
  onStart: () => void;
  onStop: () => void;
  onDiscard: () => void;
  onAddManual: () => void;
}

/**
 * The stopwatch. One timer at a time, deliberately: a single running clock is
 * unambiguous about what the user is doing right now.
 */
export function TimerPanel({
  month,
  tasks,
  timeStats,
  selectedTaskId,
  onSelectTask,
  runningTask,
  runningMonth,
  elapsed,
  onStart,
  onStop,
  onDiscard,
  onAddManual,
}: TimerPanelProps) {
  const running = runningTask !== null;
  const accent = runningTask?.color ?? tasks.find((task) => task.id === selectedTaskId)?.color;
  const otherMonth = running && runningMonth !== null && runningMonth !== month;

  return (
    <section className="card p-5" aria-label="Timer">
      <div className="flex flex-col items-center gap-5 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 flex-col items-center gap-1 sm:items-start">
          <p className="text-[11px] font-semibold tracking-wide text-slate-500 uppercase dark:text-slate-400">
            {running ? 'Tracking now' : 'Ready to track'}
          </p>
          <p
            className="text-5xl font-semibold tabular-nums"
            style={running && accent ? { color: accent } : undefined}
            aria-hidden="true"
          >
            {formatClock(elapsed)}
          </p>
          <p className="sr-only" role="timer" aria-live="off">
            {running ? `Timer running: ${describeDuration(elapsed)}` : 'Timer stopped'}
          </p>
          <p className="truncate text-sm text-slate-600 dark:text-slate-400">
            {running ? (
              <>
                {runningTask.name}
                {otherMonth && (
                  <span className="text-slate-500 dark:text-slate-500">
                    {' '}
                    · started in {monthLabel(runningMonth)}
                  </span>
                )}
              </>
            ) : (
              'Pick a task below, then start the timer.'
            )}
          </p>
        </div>

        <div className="flex items-center gap-2">
          {running ? (
            <>
              <button type="button" className="btn btn-md btn-primary px-5" onClick={onStop}>
                <Pause className="h-4 w-4" aria-hidden="true" />
                Stop &amp; save
              </button>
              <button
                type="button"
                className="btn btn-md btn-subtle hover:text-red-600 dark:hover:text-red-400"
                onClick={onDiscard}
                aria-label="Discard the running timer without saving"
              >
                <Trash2 className="h-4 w-4" aria-hidden="true" />
                Discard
              </button>
            </>
          ) : (
            <>
              <button
                type="button"
                className="btn btn-md btn-primary px-5"
                disabled={!selectedTaskId}
                onClick={onStart}
              >
                <Play className="h-4 w-4" aria-hidden="true" />
                Start timer
              </button>
              <button type="button" className="btn btn-md btn-subtle" onClick={onAddManual}>
                <Plus className="h-4 w-4" aria-hidden="true" />
                <span className="hidden sm:inline">Add time manually</span>
                <span className="sm:hidden">Manual</span>
              </button>
            </>
          )}
        </div>
      </div>

      <fieldset className="mt-5" disabled={running}>
        <legend className="label">
          {running ? 'Task being timed' : `Task to time · ${monthLabel(month)}`}
        </legend>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {tasks.map((task) => {
            const Icon = iconFor(task.icon);
            const time = timeStats.byTask[task.id];
            const selected = running ? task.id === runningTask.id : task.id === selectedTaskId;

            return (
              <button
                key={task.id}
                type="button"
                onClick={() => onSelectTask(task.id)}
                aria-pressed={selected}
                className={`flex items-center gap-2.5 rounded-xl border px-3 py-2.5 text-left transition-colors disabled:opacity-60 ${
                  selected
                    ? 'border-transparent bg-slate-50 ring-2 dark:bg-slate-950/40'
                    : 'border-slate-200 hover:bg-slate-50 dark:border-slate-800 dark:hover:bg-slate-800/50'
                }`}
                style={selected ? { boxShadow: `0 0 0 2px ${task.color}` } : undefined}
              >
                <span
                  className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md"
                  style={{ backgroundColor: `${task.color}1f`, color: task.color }}
                  aria-hidden="true"
                >
                  <Icon className="h-4 w-4" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium">{task.name}</span>
                  <span className="block text-xs text-slate-500 tabular-nums dark:text-slate-400">
                    {formatDurationOrDash(time?.totalSeconds ?? 0)} this month
                    {time && time.sessionCount > 0 && ` · ${time.sessionCount} session${
                      time.sessionCount === 1 ? '' : 's'
                    }`}
                  </span>
                </span>
              </button>
            );
          })}
        </div>
      </fieldset>
    </section>
  );
}
