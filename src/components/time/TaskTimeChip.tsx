import { iconFor } from '../../lib/appearance';
import type { Task } from '../../types';

interface TaskTimeChipProps {
  task: Task;
  /** Rendered next to the name, e.g. `2h 15m`. */
  detail?: string;
  size?: 'sm' | 'md';
}

/** Task identity — swatch, icon, name — reused wherever a task is referenced. */
export function TaskTimeChip({ task, detail, size = 'md' }: TaskTimeChipProps) {
  const Icon = iconFor(task.icon);
  const box = size === 'sm' ? 'h-6 w-6' : 'h-8 w-8';
  const glyph = size === 'sm' ? 'h-3.5 w-3.5' : 'h-4 w-4';

  return (
    <span className="flex min-w-0 items-center gap-2">
      <span
        className={`flex ${box} shrink-0 items-center justify-center rounded-md`}
        style={{ backgroundColor: `${task.color}1f`, color: task.color }}
        aria-hidden="true"
      >
        <Icon className={glyph} />
      </span>
      <span className="min-w-0">
        <span className="block truncate font-medium" title={task.name}>
          {task.name}
        </span>
        {detail && (
          <span className="block truncate text-xs text-slate-500 tabular-nums dark:text-slate-400">
            {detail}
          </span>
        )}
      </span>
    </span>
  );
}
