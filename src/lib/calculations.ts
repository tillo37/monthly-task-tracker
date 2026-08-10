import type {
  MonthData,
  MonthStats,
  MonthTimeStats,
  Task,
  TaskStats,
  TaskTimeStats,
} from '../types';
import { dateKeyOfInstant, monthKeyOfDate, type MonthKey } from './date';

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

const emptyTaskTime = (taskId: string): TaskTimeStats => ({
  taskId,
  totalSeconds: 0,
  sessionCount: 0,
  lastSessionAt: null,
  averageSeconds: 0,
  secondsPerCompletion: 0,
});

/**
 * Time totals for one month, derived from its sessions.
 *
 * Every task gets an entry even with no sessions, so the reports table can list
 * the whole month without the caller filling in blanks. Sessions pointing at a
 * task that has since been deleted are counted only as orphans — they never
 * inflate the month total.
 */
export function monthTimeStats(data: MonthData, month?: MonthKey): MonthTimeStats {
  const byTask: Record<string, TaskTimeStats> = {};
  for (const task of data.tasks) byTask[task.id] = emptyTaskTime(task.id);

  const byDay: Record<string, number> = {};
  let totalSeconds = 0;
  let sessionCount = 0;
  let orphanSessionCount = 0;

  for (const session of data.sessions) {
    const entry = byTask[session.taskId];
    if (!entry) {
      orphanSessionCount += 1;
      continue;
    }

    const seconds = Math.max(0, Math.round(session.durationSeconds));
    entry.totalSeconds += seconds;
    entry.sessionCount += 1;
    if (!entry.lastSessionAt || session.startTime > entry.lastSessionAt) {
      entry.lastSessionAt = session.startTime;
    }

    totalSeconds += seconds;
    sessionCount += 1;

    const day = dateKeyOfInstant(session.startTime);
    if (day) byDay[day] = (byDay[day] ?? 0) + seconds;
  }

  for (const task of data.tasks) {
    const entry = byTask[task.id];
    entry.averageSeconds =
      entry.sessionCount > 0 ? Math.round(entry.totalSeconds / entry.sessionCount) : 0;
    const completed = countCompleted(task, month);
    entry.secondsPerCompletion = completed > 0 ? Math.round(entry.totalSeconds / completed) : 0;
  }

  const ranked = data.tasks
    .map((task) => ({ task, time: byTask[task.id] }))
    .sort((a, b) => b.time.totalSeconds - a.time.totalSeconds);

  let busiestDay: MonthTimeStats['busiestDay'] = null;
  for (const [date, seconds] of Object.entries(byDay)) {
    if (!busiestDay || seconds > busiestDay.seconds) busiestDay = { date, seconds };
  }

  return {
    totalSeconds,
    sessionCount,
    averageSeconds: sessionCount > 0 ? Math.round(totalSeconds / sessionCount) : 0,
    byTask,
    ranked,
    byDay,
    busiestDay,
    orphanSessionCount,
  };
}

/** Time recorded for one task, whether or not the month has any sessions. */
export function taskTimeStats(data: MonthData, taskId: string, month?: MonthKey): TaskTimeStats {
  return monthTimeStats(data, month).byTask[taskId] ?? emptyTaskTime(taskId);
}

/**
 * Percentages rendered for humans: whole numbers stay whole, everything else
 * keeps one decimal (75%, 83.3%, 125%).
 */
export function formatPercentage(value: number): string {
  const rounded = Math.round(value * 10) / 10;
  return Number.isInteger(rounded) ? `${rounded}%` : `${rounded.toFixed(1)}%`;
}
