import { useCallback, type KeyboardEvent } from 'react';
import { Pencil, Trash2 } from 'lucide-react';
import type { MonthTimeStats, Task } from '../types';
import { formatPercentage, taskStats } from '../lib/calculations';
import { formatDurationOrDash } from '../lib/time';
import { iconFor } from '../lib/appearance';
import {
  dayPosition,
  daysOfMonth,
  isWeekend,
  monthLabel,
  todayKey,
  weekdayInitial,
  type DateKey,
  type MonthKey,
} from '../lib/date';
import { DayCell } from './DayCell';
import { ProgressBar } from './ui/ProgressBar';

interface TrackerTableProps {
  month: MonthKey;
  tasks: Task[];
  /** Time totals for the same month, shown alongside completion progress. */
  timeStats: MonthTimeStats;
  onToggle: (taskId: string, date: DateKey) => void;
  onEdit: (task: Task) => void;
  onDelete: (task: Task) => void;
}

/** Widths shared by the sticky columns and their header cells. */
const TASK_COL = 'w-[170px] min-w-[170px] sm:w-[210px] sm:min-w-[210px]';
const PROGRESS_COL = 'w-[124px] min-w-[124px]';
const TIME_COL = 'w-[86px] min-w-[86px]';
const STICKY_PROGRESS_OFFSET = 'sm:left-[170px] lg:left-[210px]';
const STICKY_TIME_OFFSET = 'sm:left-[294px] lg:left-[334px]';

const stickyBg = 'bg-white dark:bg-slate-900';
const headerBg = 'bg-slate-50 dark:bg-slate-900/95';

export function TrackerTable({
  month,
  tasks,
  timeStats,
  onToggle,
  onEdit,
  onDelete,
}: TrackerTableProps) {
  const days = daysOfMonth(month);
  const today = todayKey();

  /**
   * Arrow keys move between day cells so a month can be filled in without
   * tabbing through every button.
   */
  const handleKeyDown = useCallback((event: KeyboardEvent<HTMLTableSectionElement>) => {
    const target = event.target as HTMLElement;
    if (target.dataset.dayCell !== 'true') return;

    const deltas: Record<string, [number, number]> = {
      ArrowLeft: [0, -1],
      ArrowRight: [0, 1],
      ArrowUp: [-1, 0],
      ArrowDown: [1, 0],
    };
    const delta = deltas[event.key];
    if (!delta) return;

    const row = Number(target.dataset.row) + delta[0];
    const column = Number(target.dataset.column) + delta[1];
    const next = event.currentTarget.querySelector<HTMLElement>(
      `[data-row="${row}"][data-column="${column}"]`,
    );
    if (!next) return;

    event.preventDefault();
    next.focus();
  }, []);

  return (
    <div className="card overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full border-separate border-spacing-0 text-sm">
          <caption className="sr-only">
            Daily completion tracker for {monthLabel(month)}. Each cell toggles that day for that
            task.
          </caption>

          <thead>
            <tr>
              <th
                scope="col"
                className={`sticky left-0 z-20 ${TASK_COL} ${headerBg} border-b border-slate-200 px-3 py-2 text-left text-xs font-semibold tracking-wide text-slate-500 uppercase dark:border-slate-800 dark:text-slate-400`}
              >
                Task
              </th>
              <th
                scope="col"
                className={`sm:sticky ${STICKY_PROGRESS_OFFSET} z-20 ${PROGRESS_COL} ${headerBg} border-b border-slate-200 px-3 py-2 text-left text-xs font-semibold tracking-wide text-slate-500 uppercase dark:border-slate-800 dark:text-slate-400`}
              >
                Progress
              </th>
              <th
                scope="col"
                className={`sm:sticky ${STICKY_TIME_OFFSET} z-20 ${TIME_COL} ${headerBg} border-b border-slate-200 px-3 py-2 text-right text-xs font-semibold tracking-wide text-slate-500 uppercase dark:border-slate-800 dark:text-slate-400`}
              >
                Time
              </th>

              {days.map((date, index) => {
                const position = dayPosition(date, today);
                return (
                  <th
                    key={date}
                    scope="col"
                    className={`${headerBg} border-b border-slate-200 px-0 py-1.5 text-center font-medium dark:border-slate-800 ${
                      isWeekend(date) ? 'text-slate-400 dark:text-slate-600' : 'text-slate-500 dark:text-slate-400'
                    }`}
                  >
                    <span className="sr-only">{`Day ${index + 1}`}</span>
                    <span
                      aria-hidden="true"
                      className={`mx-auto flex h-8 w-8 flex-col items-center justify-center rounded-md text-[11px] leading-tight ${
                        position === 'today'
                          ? 'bg-indigo-600 font-semibold text-white'
                          : position === 'future'
                            ? 'opacity-60'
                            : ''
                      }`}
                    >
                      <span className="text-[9px] uppercase opacity-70">{weekdayInitial(date)}</span>
                      <span className="tabular-nums">{index + 1}</span>
                    </span>
                  </th>
                );
              })}

              <th
                scope="col"
                className={`sticky right-0 z-20 w-[76px] min-w-[76px] ${headerBg} border-b border-l border-slate-200 px-2 py-2 text-right text-xs font-semibold tracking-wide text-slate-500 uppercase dark:border-slate-800 dark:text-slate-400`}
              >
                <span className="sr-only">Actions</span>
                <span aria-hidden="true">···</span>
              </th>
            </tr>
          </thead>

          <tbody onKeyDown={handleKeyDown}>
            {tasks.map((task, rowIndex) => {
              const stats = taskStats(task, month);
              const Icon = iconFor(task.icon);
              const completed = new Set(task.completedDates);

              return (
                <tr key={task.id} className="group/row">
                  <th
                    scope="row"
                    className={`sticky left-0 z-10 ${TASK_COL} ${stickyBg} border-b border-slate-100 px-3 py-2 text-left font-medium dark:border-slate-800/70`}
                  >
                    <span className="flex items-center gap-2">
                      <span
                        className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md"
                        style={{ backgroundColor: `${task.color}1f`, color: task.color }}
                        aria-hidden="true"
                      >
                        <Icon className="h-3.5 w-3.5" />
                      </span>
                      <span className="truncate" title={task.name}>
                        {task.name}
                      </span>
                    </span>
                  </th>

                  <td
                    className={`sm:sticky ${STICKY_PROGRESS_OFFSET} z-10 ${PROGRESS_COL} ${stickyBg} border-b border-slate-100 px-3 py-2 dark:border-slate-800/70`}
                  >
                    <div className="flex items-baseline justify-between gap-2 text-xs tabular-nums">
                      <span className="font-medium">
                        {stats.completed}
                        <span className="text-slate-400 dark:text-slate-500"> / {stats.target}</span>
                      </span>
                      <span
                        className={
                          stats.exceeded
                            ? 'font-semibold text-emerald-600 dark:text-emerald-400'
                            : 'text-slate-500 dark:text-slate-400'
                        }
                      >
                        {formatPercentage(stats.percentage)}
                      </span>
                    </div>
                    <div className="mt-1.5">
                      <ProgressBar
                        value={stats.percentage}
                        color={task.color}
                        exceeded={stats.exceeded}
                      />
                    </div>
                  </td>

                  <td
                    className={`sm:sticky ${STICKY_TIME_OFFSET} z-10 ${TIME_COL} ${stickyBg} border-b border-r border-slate-100 px-3 py-2 text-right text-xs tabular-nums dark:border-slate-800/70`}
                  >
                    <span
                      className={
                        (timeStats.byTask[task.id]?.totalSeconds ?? 0) > 0
                          ? 'font-medium'
                          : 'text-slate-400 dark:text-slate-600'
                      }
                    >
                      {formatDurationOrDash(timeStats.byTask[task.id]?.totalSeconds ?? 0)}
                    </span>
                  </td>

                  {days.map((date, columnIndex) => (
                    <DayCell
                      key={date}
                      taskName={task.name}
                      color={task.color}
                      day={columnIndex + 1}
                      label={`${columnIndex + 1} ${monthLabel(month)}`}
                      completed={completed.has(date)}
                      position={dayPosition(date, today)}
                      weekend={isWeekend(date)}
                      rowIndex={rowIndex}
                      columnIndex={columnIndex}
                      onToggle={() => onToggle(task.id, date)}
                    />
                  ))}

                  <td
                    className={`sticky right-0 z-10 ${stickyBg} border-b border-l border-slate-100 px-2 py-2 dark:border-slate-800/70`}
                  >
                    <div className="flex items-center justify-end gap-0.5">
                      <button
                        type="button"
                        onClick={() => onEdit(task)}
                        className="btn h-8 w-8 btn-ghost"
                        aria-label={`Edit ${task.name}`}
                      >
                        <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
                      </button>
                      <button
                        type="button"
                        onClick={() => onDelete(task)}
                        className="btn h-8 w-8 btn-ghost hover:text-red-600 dark:hover:text-red-400"
                        aria-label={`Delete ${task.name}`}
                      >
                        <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
