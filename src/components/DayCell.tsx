import { Check } from 'lucide-react';
import type { DayPosition } from '../lib/date';

interface DayCellProps {
  taskName: string;
  color: string;
  day: number;
  label: string;
  completed: boolean;
  position: DayPosition;
  weekend: boolean;
  rowIndex: number;
  columnIndex: number;
  onToggle: () => void;
}

/**
 * One day/task intersection. A toggle button rather than a checkbox input so
 * the whole cell is the hit target while still exposing pressed state.
 */
export function DayCell({
  taskName,
  color,
  day,
  label,
  completed,
  position,
  weekend,
  rowIndex,
  columnIndex,
  onToggle,
}: DayCellProps) {
  const base =
    'group relative flex h-8 w-8 items-center justify-center rounded-md border text-[11px] font-medium transition-[background-color,border-color,transform] duration-100 active:scale-[0.92]';

  const idle = weekend
    ? 'border-slate-200 bg-slate-100/70 text-slate-400 hover:border-slate-300 hover:bg-slate-200/70 dark:border-slate-800 dark:bg-slate-800/40 dark:text-slate-600 dark:hover:bg-slate-800'
    : 'border-slate-200 bg-white text-slate-300 hover:border-slate-300 hover:bg-slate-100 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-700 dark:hover:bg-slate-800';

  return (
    <td className="p-0.5 text-center">
      <button
        type="button"
        onClick={onToggle}
        aria-pressed={completed}
        aria-label={`${taskName} — ${label}${completed ? ', completed' : ', not completed'}`}
        data-row={rowIndex}
        data-column={columnIndex}
        data-day-cell="true"
        className={`${base} ${completed ? 'border-transparent text-white' : idle} ${
          position === 'today' ? 'ring-2 ring-indigo-500 ring-offset-1 ring-offset-white dark:ring-offset-slate-900' : ''
        } ${position === 'future' && !completed ? 'opacity-70' : ''}`}
        style={completed ? { backgroundColor: color } : undefined}
      >
        {completed ? (
          <Check className="h-4 w-4" strokeWidth={3} aria-hidden="true" />
        ) : (
          <span aria-hidden="true">{day}</span>
        )}
      </button>
    </td>
  );
}
