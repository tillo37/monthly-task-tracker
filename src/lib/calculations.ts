import type { MonthData, MonthStats, Task, TaskStats } from '../types';
import { monthKeyOfDate, type MonthKey } from './date';

/**
 * Completions counted for a task. When a month key is supplied, dates outside
 * that month are ignored so a corrupted or hand-edited import cannot inflate a
 * month's numbers.
 */
export function countCompleted(task: Task, month?: MonthKey): number {
  if (!month) return task.completedDates.length;
  return task.completedDates.reduce(
    (total, date) => (monthKeyOfDate(date) === month ? total + 1 : total),
    0,
  );
}

/**
 * `completed / target * 100`, deliberately uncapped so exceeding a target is
 * visible (e.g. 125%). A target of 0 yields 0 rather than Infinity.
 */
export function completionPercentage(completed: number, target: number): number {
  if (target <= 0) return 0;
  return (completed / target) * 100;
}

export function taskStats(task: Task, month?: MonthKey): TaskStats {
  const completed = countCompleted(task, month);
  const target = task.target;
  return {
    completed,
    target,
    percentage: completionPercentage(completed, target),
    exceeded: target > 0 && completed > target,
  };
}

/**
 * Month totals. The overall percentage is weighted by target — it sums
 * completions and targets across tasks rather than averaging task percentages.
 */
export function monthStats(data: MonthData, month?: MonthKey): MonthStats {
  const tasks = data.tasks;
  let totalCompleted = 0;
  let totalTarget = 0;
  let best: MonthStats['best'] = null;
  let worst: MonthStats['worst'] = null;

  for (const task of tasks) {
    const stats = taskStats(task, month);
    totalCompleted += stats.completed;
    totalTarget += stats.target;

    if (!best || stats.percentage > best.stats.percentage) best = { task, stats };
    if (!worst || stats.percentage < worst.stats.percentage) worst = { task, stats };
  }

  // A single task is neither the best nor the worst performer worth comparing.
  if (tasks.length < 2) {
    best = null;
    worst = null;
  }

  return {
    taskCount: tasks.length,
    totalCompleted,
    totalTarget,
    percentage: completionPercentage(totalCompleted, totalTarget),
    best,
    worst,
  };
}

/**
 * Percentages rendered for humans: whole numbers stay whole, everything else
 * keeps one decimal (75%, 83.3%, 125%).
 */
export function formatPercentage(value: number): string {
  const rounded = Math.round(value * 10) / 10;
  return Number.isInteger(rounded) ? `${rounded}%` : `${rounded.toFixed(1)}%`;
}
