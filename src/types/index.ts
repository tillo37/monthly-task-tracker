/** A single tracked to-do / habit within one month. */
export interface Task {
  id: string;
  name: string;
  /** How many times the task should be completed during the month. */
  target: number;
  /** Hex colour used for the task accent, e.g. `#6366f1`. */
  color: string;
  /** Key into the icon registry, e.g. `dumbbell`. */
  icon: string;
  /** Completed days as `YYYY-MM-DD`, unique and sorted. */
  completedDates: string[];
  createdAt: string;
}

/**
 * One stretch of time spent working on a task, either recorded by the timer or
 * entered by hand. Sessions live in the month their `startTime` falls in and
 * always point at a task in that same month.
 */
export interface TimeSession {
  id: string;
  /** `Task.id` within the same month. */
  taskId: string;
  /** ISO instant the session began. */
  startTime: string;
  /** ISO instant the session ended; never before `startTime`. */
  endTime: string;
  /** Whole seconds between start and end. */
  durationSeconds: number;
  createdAt: string;
}

/** Everything tracked for one calendar month. */
export interface MonthData {
  tasks: Task[];
  /** Time sessions recorded this month, sorted by `startTime`. */
  sessions: TimeSession[];
}

/** Root persisted document. Months are keyed by `YYYY-MM`. */
export interface TrackerData {
  version: number;
  months: Record<string, MonthData>;
}

/** Derived, never-persisted stats for a single task. */
export interface TaskStats {
  completed: number;
  target: number;
  /** `completed / target * 100`, uncapped. `0` when target is 0. */
  percentage: number;
  exceeded: boolean;
}

/** Derived, never-persisted stats for a whole month. */
export interface MonthStats {
  taskCount: number;
  totalCompleted: number;
  totalTarget: number;
  /** Weighted by target — not the average of task percentages. */
  percentage: number;
  best: { task: Task; stats: TaskStats } | null;
  worst: { task: Task; stats: TaskStats } | null;
}

/** Derived, never-persisted time totals for a single task. */
export interface TaskTimeStats {
  taskId: string;
  totalSeconds: number;
  sessionCount: number;
  /** ISO start of the most recent session, or `null` when there are none. */
  lastSessionAt: string | null;
  /** Average seconds per recorded session. `0` with no sessions. */
  averageSeconds: number;
  /** Seconds per completion, so effort per tick is comparable across tasks. */
  secondsPerCompletion: number;
}

/** Derived, never-persisted time totals for a whole month. */
export interface MonthTimeStats {
  totalSeconds: number;
  sessionCount: number;
  averageSeconds: number;
  /** Keyed by `Task.id`; every task in the month is present, even at zero. */
  byTask: Record<string, TaskTimeStats>;
  /** Tasks ordered by time spent, descending. */
  ranked: { task: Task; time: TaskTimeStats }[];
  /** Seconds per day key, only for days that have sessions. */
  byDay: Record<string, number>;
  busiestDay: { date: string; seconds: number } | null;
  /** Sessions whose task no longer exists — surfaced so they can be cleaned up. */
  orphanSessionCount: number;
}

/** A timer the user has started but not yet stopped. */
export interface ActiveTimer {
  taskId: string;
  /** ISO instant the timer was started. */
  startTime: string;
  /** Month the resulting session belongs to, so it survives month navigation. */
  month: string;
}

export type Theme = 'light' | 'dark' | 'system';
