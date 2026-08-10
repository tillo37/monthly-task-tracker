import { CopyPlus, Plus } from 'lucide-react';
import type { MonthStats, MonthTimeStats, Task } from '../types';
import { EmptyState } from '../components/EmptyState';
import { MonthNavigator } from '../components/MonthNavigator';
import { MonthSummary } from '../components/MonthSummary';
import { TrackerTable } from '../components/TrackerTable';
import { monthLabel, type DateKey, type MonthKey } from '../lib/date';

interface TasksViewProps {
  month: MonthKey;
  tasks: Task[];
  stats: MonthStats;
  timeStats: MonthTimeStats;
  previousMonth: MonthKey;
  previousMonthTaskCount: number;
  onPreviousMonth: () => void;
  onNextMonth: () => void;
  onCurrentMonth: () => void;
  onSelectMonth: (month: MonthKey) => void;
  onToggle: (taskId: string, date: DateKey) => void;
  onAddTask: () => void;
  onEditTask: (task: Task) => void;
  onDeleteTask: (task: Task) => void;
  onCopyPrevious: () => void;
}

/** The original monthly tracker: month navigation, summary and the day grid. */
export function TasksView({
  month,
  tasks,
  stats,
  timeStats,
  previousMonth,
  previousMonthTaskCount,
  onPreviousMonth,
  onNextMonth,
  onCurrentMonth,
  onSelectMonth,
  onToggle,
  onAddTask,
  onEditTask,
  onDeleteTask,
  onCopyPrevious,
}: TasksViewProps) {
  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <MonthNavigator
          month={month}
          onPrevious={onPreviousMonth}
          onNext={onNextMonth}
          onToday={onCurrentMonth}
          onSelect={onSelectMonth}
        />

        <div className="flex items-center gap-2">
          {previousMonthTaskCount > 0 && (
            <button type="button" className="btn btn-md btn-subtle" onClick={onCopyPrevious}>
              <CopyPlus className="h-4 w-4" aria-hidden="true" />
              <span className="hidden sm:inline">Copy previous month</span>
              <span className="sm:hidden">Copy</span>
            </button>
          )}
          <button type="button" className="btn btn-md btn-primary" onClick={onAddTask}>
            <Plus className="h-4 w-4" aria-hidden="true" />
            Add Task
          </button>
        </div>
      </div>

      {tasks.length > 0 && (
        <MonthSummary
          stats={stats}
          monthName={monthLabel(month)}
          trackedSeconds={timeStats.totalSeconds}
          sessionCount={timeStats.sessionCount}
        />
      )}

      <div id="tracker">
        {tasks.length === 0 ? (
          <EmptyState
            monthName={monthLabel(month)}
            previousMonthTaskCount={previousMonthTaskCount}
            previousMonthName={monthLabel(previousMonth)}
            onAddTask={onAddTask}
            onCopyPrevious={onCopyPrevious}
          />
        ) : (
          <TrackerTable
            month={month}
            tasks={tasks}
            timeStats={timeStats}
            onToggle={onToggle}
            onEdit={onEditTask}
            onDelete={onDeleteTask}
          />
        )}
      </div>
    </>
  );
}
