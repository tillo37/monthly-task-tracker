import { CopyPlus, Plus, Sparkles } from 'lucide-react';

interface EmptyStateProps {
  monthName: string;
  previousMonthTaskCount: number;
  previousMonthName: string;
  onAddTask: () => void;
  onCopyPrevious: () => void;
}

export function EmptyState({
  monthName,
  previousMonthTaskCount,
  previousMonthName,
  onAddTask,
  onCopyPrevious,
}: EmptyStateProps) {
  return (
    <section className="card flex flex-col items-center px-6 py-14 text-center">
      <span
        className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-indigo-50 text-indigo-600 dark:bg-indigo-500/10 dark:text-indigo-400"
        aria-hidden="true"
      >
        <Sparkles className="h-6 w-6" />
      </span>

      <h2 className="text-base font-semibold">No tasks for {monthName}</h2>
      <p className="mt-1 max-w-sm text-sm text-slate-600 dark:text-slate-400">
        Add your first task to start tracking your progress.
      </p>

      <div className="mt-5 flex flex-wrap items-center justify-center gap-2">
        <button type="button" className="btn btn-md btn-primary" onClick={onAddTask}>
          <Plus className="h-4 w-4" aria-hidden="true" />
          Add Task
        </button>
        {previousMonthTaskCount > 0 && (
          <button type="button" className="btn btn-md btn-subtle" onClick={onCopyPrevious}>
            <CopyPlus className="h-4 w-4" aria-hidden="true" />
            Copy {previousMonthTaskCount} task{previousMonthTaskCount === 1 ? '' : 's'} from{' '}
            {previousMonthName}
          </button>
        )}
      </div>
    </section>
  );
}
