import type { MonthData, Task } from '../types';
import { DEFAULT_COLOR, DEFAULT_ICON } from './appearance';
import { monthKeyOfDate, type DateKey, type MonthKey } from './date';
import { createId } from './id';

export const MAX_TARGET = 999;
export const MAX_NAME_LENGTH = 60;

export interface TaskInput {
  name: string;
  target: number;
  color?: string;
  icon?: string;
}

export const emptyMonth = (): MonthData => ({ tasks: [] });

/** Validation shared by the task form and the import validator. */
export function validateTaskInput(input: {
  name: string;
  target: unknown;
}): { name?: string; target?: string } {
  const errors: { name?: string; target?: string } = {};

  const name = input.name.trim();
  if (!name) errors.name = 'Task name is required.';
  else if (name.length > MAX_NAME_LENGTH)
    errors.name = `Keep the name under ${MAX_NAME_LENGTH} characters.`;

  const target = Number(input.target);
  if (input.target === '' || input.target === null || Number.isNaN(target)) {
    errors.target = 'Target is required.';
  } else if (!Number.isInteger(target)) {
    errors.target = 'Target must be a whole number.';
  } else if (target < 1) {
    errors.target = 'Target must be at least 1.';
  } else if (target > MAX_TARGET) {
    errors.target = `Target must be ${MAX_TARGET} or less.`;
  }

  return errors;
}

export function createTask(input: TaskInput, now: Date = new Date()): Task {
  return {
    id: createId(),
    name: input.name.trim(),
    target: Math.trunc(input.target),
    color: input.color ?? DEFAULT_COLOR,
    icon: input.icon ?? DEFAULT_ICON,
    completedDates: [],
    createdAt: now.toISOString(),
  };
}

export function addTask(data: MonthData, task: Task): MonthData {
  return { ...data, tasks: [...data.tasks, task] };
}

/**
 * Applies a partial edit. Completion history is intentionally untouched —
 * changing a target re-derives the percentage but never discards progress.
 */
export function updateTask(data: MonthData, id: string, patch: Partial<TaskInput>): MonthData {
  return {
    ...data,
    tasks: data.tasks.map((task) =>
      task.id === id
        ? {
            ...task,
            ...(patch.name !== undefined ? { name: patch.name.trim() } : {}),
            ...(patch.target !== undefined ? { target: Math.trunc(patch.target) } : {}),
            ...(patch.color !== undefined ? { color: patch.color } : {}),
            ...(patch.icon !== undefined ? { icon: patch.icon } : {}),
          }
        : task,
    ),
  };
}

export function deleteTask(data: MonthData, id: string): MonthData {
  return { ...data, tasks: data.tasks.filter((task) => task.id !== id) };
}

/** Flips one day of one task, keeping `completedDates` unique and sorted. */
export function toggleCompletion(data: MonthData, id: string, date: DateKey): MonthData {
  return {
    ...data,
    tasks: data.tasks.map((task) => {
      if (task.id !== id) return task;
      const isComplete = task.completedDates.includes(date);
      const completedDates = isComplete
        ? task.completedDates.filter((existing) => existing !== date)
        : [...task.completedDates, date].sort();
      return { ...task, completedDates };
    }),
  };
}

/** Clears completion history for every task, leaving the definitions intact. */
export function resetProgress(data: MonthData): MonthData {
  return { ...data, tasks: data.tasks.map((task) => ({ ...task, completedDates: [] })) };
}

/**
 * Copies task definitions into a fresh month: new ids, no completion history.
 */
export function copyTaskDefinitions(source: MonthData, now: Date = new Date()): MonthData {
  return {
    tasks: source.tasks.map((task) => ({
      ...task,
      id: createId(),
      completedDates: [],
      createdAt: now.toISOString(),
    })),
  };
}

/** Drops any completion dates that fall outside the month holding the task. */
export function pruneToMonth(data: MonthData, month: MonthKey): MonthData {
  return {
    ...data,
    tasks: data.tasks.map((task) => ({
      ...task,
      completedDates: task.completedDates.filter((date) => monthKeyOfDate(date) === month),
    })),
  };
}
