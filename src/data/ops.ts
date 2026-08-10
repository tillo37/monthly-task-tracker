import type { Task, TimeSession, TrackerData } from '../types';
import type { DateKey, MonthKey } from '../lib/date';
import type { TaskInput } from '../lib/tasks';

/**
 * Every way the tracker document can change, described once.
 *
 * The app still computes its next state with the same pure functions it always
 * used; an op is the *description* of that change, handed to persistence. A
 * local backend ignores it and writes the whole document, while the cloud
 * backend turns it into one targeted statement instead of re-uploading
 * everything on every keystroke.
 */
export type TrackerOp =
  | { type: 'addTask'; month: MonthKey; task: Task }
  | { type: 'updateTask'; month: MonthKey; taskId: string; patch: Partial<TaskInput> }
  | { type: 'deleteTask'; month: MonthKey; taskId: string }
  | { type: 'setCompletion'; month: MonthKey; taskId: string; date: DateKey; completed: boolean }
  | { type: 'resetMonth'; month: MonthKey; taskIds: string[] }
  | { type: 'copyMonth'; month: MonthKey; tasks: Task[] }
  | { type: 'addSession'; month: MonthKey; session: TimeSession }
  | { type: 'deleteSession'; month: MonthKey; sessionId: string }
  | { type: 'clearMonthSessions'; month: MonthKey; sessionIds: string[] }
  | { type: 'removeOrphanSessions'; sessionIds: string[] }
  | { type: 'replaceAll'; data: TrackerData };

/**
 * Where the tracker document lives.
 *
 * `loadSync` exists only for backends that genuinely are synchronous — the
 * local one — so the offline app keeps rendering its first frame with data
 * already in hand rather than flashing a spinner it does not need.
 */
export interface TrackerPersistence {
  loadSync?(): TrackerData;
  load(): Promise<TrackerData>;
  /** Persists one change. `next` is the resulting document, for whole-document backends. */
  commit(op: TrackerOp, next: TrackerData): Promise<void>;
}

/** A short, human description of an op, used in sync error messages. */
export function describeOp(op: TrackerOp): string {
  switch (op.type) {
    case 'addTask':
      return `adding "${op.task.name}"`;
    case 'updateTask':
      return 'updating a task';
    case 'deleteTask':
      return 'deleting a task';
    case 'setCompletion':
      return op.completed ? 'ticking a day' : 'clearing a day';
    case 'resetMonth':
      return 'resetting the month';
    case 'copyMonth':
      return 'copying tasks forward';
    case 'addSession':
      return 'saving a session';
    case 'deleteSession':
      return 'deleting a session';
    case 'clearMonthSessions':
      return 'clearing tracked time';
    case 'removeOrphanSessions':
      return 'removing orphaned sessions';
    case 'replaceAll':
      return 'replacing your data';
  }
}
