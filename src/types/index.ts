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

/** Everything tracked for one calendar month. */
export interface MonthData {
  tasks: Task[];
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

export type Theme = 'light' | 'dark' | 'system';
