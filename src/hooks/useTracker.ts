import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { MonthData, TimeSession, TrackerData } from '../types';
import { addMonths, currentMonthKey, type DateKey, type MonthKey } from '../lib/date';
import { monthStats, monthTimeStats } from '../lib/calculations';
import {
  addSession as addSessionTo,
  clearSessions,
  deleteSession as deleteSessionFrom,
  pruneOrphanSessions,
} from '../lib/sessions';
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
import { emptyTrackerData } from '../lib/validation';
import { createLocalPersistence } from '../data/localPersistence';
import type { TrackerOp, TrackerPersistence } from '../data/ops';
import { useSyncQueue } from '../data/useSyncQueue';

const EMPTY_MONTH: MonthData = emptyMonth();

const defaultPersistence = createLocalPersistence();

/** What one mutation produced: the new document and how to describe the change. */
interface Change {
  next: TrackerData;
  op: TrackerOp;
}

/**
 * Owns all tracker state: the persisted document, the selected month and every
 * mutation. Components stay presentational and never touch persistence directly.
 *
 * State is still updated optimistically from the same pure functions as before.
 * What changed with the move to the cloud is that each mutation now also names
 * itself, so the backend can write one row instead of the whole document.
 *
 * `persistence` must be stable: the document is re-read whenever it changes
 * identity, which is how switching accounts works and is not something to do on
 * every render.
 */
export function useTracker(persistence: TrackerPersistence = defaultPersistence) {
  // A synchronous backend (the local one) hands over its document immediately,
  // so the offline app never renders a loading state it does not need.
  const [data, setData] = useState<TrackerData>(
    () => persistence.loadSync?.() ?? emptyTrackerData(),
  );
  const [loading, setLoading] = useState(() => persistence.loadSync === undefined);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [month, setMonth] = useState<MonthKey>(() => currentMonthKey());

  const sync = useSyncQueue(persistence);

  // Mutations read the current document from here rather than from a functional
  // update, because the op has to be derived from the same snapshot the new
  // state is derived from — and deriving it inside a setState updater would run
  // twice under StrictMode.
  const dataRef = useRef(data);
  dataRef.current = data;

  const hydrate = useCallback(async () => {
    if (persistence.loadSync) {
      setData(persistence.loadSync());
      return;
    }
    setLoading(true);
    setLoadError(null);
    try {
      const loaded = await persistence.load();
      setData(loaded);
      dataRef.current = loaded;
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : 'Could not load your data.');
    } finally {
      setLoading(false);
    }
  }, [persistence]);

  useEffect(() => {
    void hydrate();
  }, [hydrate]);

  const monthData = data.months[month] ?? EMPTY_MONTH;
  const stats = useMemo(() => monthStats(monthData, month), [monthData, month]);
  const timeStats = useMemo(() => monthTimeStats(monthData, month), [monthData, month]);

  const previousMonth = addMonths(month, -1);
  const previousMonthTaskCount = data.months[previousMonth]?.tasks.length ?? 0;

  /** Applies a change locally and queues it for the backend. */
  const apply = useCallback(
    (compute: (current: TrackerData) => Change | null) => {
      const change = compute(dataRef.current);
      if (!change) return;
      dataRef.current = change.next;
      setData(change.next);
      sync.enqueue(change.op, change.next);
    },
    [sync],
  );

  /** Applies a pure month transform and writes the result back into the document. */
  const withMonth = useCallback(
    (
      target: MonthKey,
      transform: (current: MonthData) => MonthData,
      describe: (before: MonthData, after: MonthData) => TrackerOp | null,
    ) =>
      apply((current) => {
        const existing = current.months[target] ?? emptyMonth();
        const updated = transform(existing);
        const op = describe(existing, updated);
        if (!op) return null;
        return {
          next: { ...current, months: { ...current.months, [target]: updated } },
          op,
        };
      }),
    [apply],
  );

  const addTask = useCallback(
    (input: TaskInput) => {
      const task = createTask(input);
      withMonth(
        month,
        (current) => addTaskTo(current, task),
        () => ({ type: 'addTask', month, task }),
      );
    },
    [month, withMonth],
  );

  const updateTask = useCallback(
    (id: string, patch: Partial<TaskInput>) =>
      withMonth(
        month,
        (current) => updateTaskIn(current, id, patch),
        () => ({ type: 'updateTask', month, taskId: id, patch }),
      ),
    [month, withMonth],
  );

  const deleteTask = useCallback(
    (id: string) =>
      withMonth(
        month,
        (current) => deleteTaskFrom(current, id),
        () => ({ type: 'deleteTask', month, taskId: id }),
      ),
    [month, withMonth],
  );

  const toggleCompletion = useCallback(
    (id: string, date: DateKey) =>
      withMonth(
        month,
        (current) => toggleCompletionIn(current, id, date),
        (before) => {
          const task = before.tasks.find((candidate) => candidate.id === id);
          if (!task) return null;
          return {
            type: 'setCompletion',
            month,
            taskId: id,
            date,
            // The toggle flips whatever was there, so the op records the result.
            completed: !task.completedDates.includes(date),
          };
        },
      ),
    [month, withMonth],
  );

  const resetMonth = useCallback(
    () =>
      withMonth(
        month,
        (current) => resetProgress(current),
        (before) => ({
          type: 'resetMonth',
          month,
          taskIds: before.tasks.map((task) => task.id),
        }),
      ),
    [month, withMonth],
  );

  const copyPreviousMonth = useCallback(() => {
    apply((current) => {
      const source = current.months[addMonths(month, -1)];
      if (!source || source.tasks.length === 0) return null;

      const copied = copyTaskDefinitions(source);
      const existing = current.months[month] ?? emptyMonth();
      return {
        next: {
          ...current,
          months: {
            ...current.months,
            [month]: { ...existing, tasks: [...existing.tasks, ...copied.tasks] },
          },
        },
        op: { type: 'copyMonth', month, tasks: copied.tasks },
      };
    });
  }, [apply, month]);

  /**
   * Adds a recorded session. The month is explicit because a timer stopped just
   * after midnight belongs to the month it started in, not the one on screen.
   */
  const addSession = useCallback(
    (session: TimeSession, target: MonthKey = month) =>
      withMonth(
        target,
        (current) => addSessionTo(current, session),
        () => ({ type: 'addSession', month: target, session }),
      ),
    [month, withMonth],
  );

  const deleteSession = useCallback(
    (id: string, target: MonthKey = month) =>
      withMonth(
        target,
        (current) => deleteSessionFrom(current, id),
        () => ({ type: 'deleteSession', month: target, sessionId: id }),
      ),
    [month, withMonth],
  );

  const clearMonthSessions = useCallback(
    () =>
      withMonth(
        month,
        (current) => clearSessions(current),
        (before) => ({
          type: 'clearMonthSessions',
          month,
          sessionIds: before.sessions.map((session) => session.id),
        }),
      ),
    [month, withMonth],
  );

  /**
   * Prunes orphaned sessions in every month, not just the visible one: reports
   * can cover a range that spans months, so a month-scoped cleanup would leave
   * the warning on screen after the user acted on it.
   *
   * Cloud data cannot contain orphans — a session's task is a foreign key that
   * cascades — so this only ever has work to do for imported local data.
   */
  const removeOrphanSessions = useCallback(() => {
    apply((current) => {
      const months: TrackerData['months'] = {};
      const removed: string[] = [];

      for (const [key, monthValue] of Object.entries(current.months)) {
        const pruned = pruneOrphanSessions(monthValue);
        months[key] = pruned;
        if (pruned.sessions.length === monthValue.sessions.length) continue;
        const kept = new Set(pruned.sessions.map((session) => session.id));
        for (const session of monthValue.sessions) {
          if (!kept.has(session.id)) removed.push(session.id);
        }
      }

      if (removed.length === 0) return null;
      return { next: { ...current, months }, op: { type: 'removeOrphanSessions', sessionIds: removed } };
    });
  }, [apply]);

  /** Wholesale replacement used by import and by the local-data migration. */
  const replaceData = useCallback(
    (next: TrackerData) => apply(() => ({ next, op: { type: 'replaceAll', data: next } })),
    [apply],
  );

  const goToMonth = useCallback((next: MonthKey) => setMonth(next), []);
  const goToPreviousMonth = useCallback(() => setMonth((current) => addMonths(current, -1)), []);
  const goToNextMonth = useCallback(() => setMonth((current) => addMonths(current, 1)), []);
  const goToCurrentMonth = useCallback(() => setMonth(currentMonthKey()), []);

  return {
    data,
    loading,
    loadError,
    reload: hydrate,
    sync,
    month,
    monthData,
    stats,
    timeStats,
    previousMonthTaskCount,
    addTask,
    updateTask,
    deleteTask,
    toggleCompletion,
    resetMonth,
    copyPreviousMonth,
    addSession,
    deleteSession,
    clearMonthSessions,
    removeOrphanSessions,
    replaceData,
    goToMonth,
    goToPreviousMonth,
    goToNextMonth,
    goToCurrentMonth,
  };
}

export type Tracker = ReturnType<typeof useTracker>;
