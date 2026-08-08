import { useCallback, useEffect, useMemo, useState } from 'react';
import type { MonthData, TrackerData } from '../types';
import { addMonths, currentMonthKey, type DateKey, type MonthKey } from '../lib/date';
import { monthStats } from '../lib/calculations';
import {
  addTask as addTaskTo,
  copyTaskDefinitions,
  createTask,
  deleteTask as deleteTaskFrom,
  emptyMonth,
  resetProgress,
  toggleCompletion as toggleCompletionIn,
  updateTask as updateTaskIn,
  type TaskInput,
} from '../lib/tasks';
import { monthlyStorage, type MonthlyStorage } from '../storage/monthlyStorage';

const EMPTY_MONTH: MonthData = emptyMonth();

/**
 * Owns all tracker state: the persisted document, the selected month and every
 * mutation. Components stay presentational and never touch storage directly.
 */
export function useTracker(storage: MonthlyStorage = monthlyStorage) {
  const [data, setData] = useState<TrackerData>(() => storage.load());
  const [month, setMonth] = useState<MonthKey>(() => currentMonthKey());

  useEffect(() => {
    storage.save(data);
  }, [data, storage]);

  const monthData = data.months[month] ?? EMPTY_MONTH;
  const stats = useMemo(() => monthStats(monthData, month), [monthData, month]);

  const previousMonth = addMonths(month, -1);
  const previousMonthTaskCount = data.months[previousMonth]?.tasks.length ?? 0;

  /** Applies a pure month transform and writes the result back into the document. */
  const mutateMonth = useCallback(
    (transform: (current: MonthData) => MonthData) => {
      setData((current) => {
        const existing = current.months[month] ?? emptyMonth();
        return { ...current, months: { ...current.months, [month]: transform(existing) } };
      });
    },
    [month],
  );

  const addTask = useCallback(
    (input: TaskInput) => mutateMonth((current) => addTaskTo(current, createTask(input))),
    [mutateMonth],
  );

  const updateTask = useCallback(
    (id: string, patch: Partial<TaskInput>) =>
      mutateMonth((current) => updateTaskIn(current, id, patch)),
    [mutateMonth],
  );

  const deleteTask = useCallback(
    (id: string) => mutateMonth((current) => deleteTaskFrom(current, id)),
    [mutateMonth],
  );

  const toggleCompletion = useCallback(
    (id: string, date: DateKey) => mutateMonth((current) => toggleCompletionIn(current, id, date)),
    [mutateMonth],
  );

  const resetMonth = useCallback(
    () => mutateMonth((current) => resetProgress(current)),
    [mutateMonth],
  );

  const copyPreviousMonth = useCallback(() => {
    setData((current) => {
      const source = current.months[addMonths(month, -1)];
      if (!source || source.tasks.length === 0) return current;
      const copied = copyTaskDefinitions(source);
      const existing = current.months[month] ?? emptyMonth();
      return {
        ...current,
        months: {
          ...current.months,
          [month]: { ...existing, tasks: [...existing.tasks, ...copied.tasks] },
        },
      };
    });
  }, [month]);

  /** Wholesale replacement used by import. */
  const replaceData = useCallback((next: TrackerData) => setData(next), []);

  const goToMonth = useCallback((next: MonthKey) => setMonth(next), []);
  const goToPreviousMonth = useCallback(() => setMonth((current) => addMonths(current, -1)), []);
  const goToNextMonth = useCallback(() => setMonth((current) => addMonths(current, 1)), []);
  const goToCurrentMonth = useCallback(() => setMonth(currentMonthKey()), []);

  return {
    data,
    month,
    monthData,
    stats,
    previousMonthTaskCount,
    addTask,
    updateTask,
    deleteTask,
    toggleCompletion,
    resetMonth,
    copyPreviousMonth,
    replaceData,
    goToMonth,
    goToPreviousMonth,
    goToNextMonth,
    goToCurrentMonth,
  };
}

export type Tracker = ReturnType<typeof useTracker>;
