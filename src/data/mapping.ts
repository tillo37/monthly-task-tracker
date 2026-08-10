import type { MonthData, Task, TimeSession, TrackerData } from '../types';
import type { TaskCompletionRow, TaskRow, TimeSessionRow } from '../types/database';
import { monthKeyOfInstant, type MonthKey } from '../lib/date';
import { createId, isUuid } from '../lib/id';
import { sortSessions } from '../lib/sessions';
import { DATA_VERSION } from '../lib/validation';

/**
 * Translation between the relational rows and the month-keyed document the app
 * has always worked with. Keeping this in one place is what allows the views,
 * the report engine and the calculations to stay exactly as they were.
 */

/** Assembles one user's rows into the tracker document. */
export function rowsToTrackerData(input: {
  tasks: TaskRow[];
  completions: TaskCompletionRow[];
  sessions: TimeSessionRow[];
}): TrackerData {
  const datesByTask = new Map<string, string[]>();
  for (const completion of input.completions) {
    const list = datesByTask.get(completion.task_id) ?? [];
    list.push(completion.date);
    datesByTask.set(completion.task_id, list);
  }

  const months: Record<MonthKey, MonthData> = {};
  const monthOfTask = new Map<string, MonthKey>();

  for (const row of input.tasks) {
    monthOfTask.set(row.id, row.month);
    const month = (months[row.month] ??= { tasks: [], sessions: [] });
    month.tasks.push({
      id: row.id,
      name: row.name,
      target: row.target,
      color: row.color,
      icon: row.icon,
      completedDates: [...new Set(datesByTask.get(row.id) ?? [])].sort(),
      createdAt: row.created_at,
    });
  }

  for (const row of input.sessions) {
    // A session belongs to the month its start instant falls in locally, which
    // is the same rule the offline app used and what the reports expect.
    const month = monthKeyOfInstant(row.start_time) ?? monthOfTask.get(row.task_id);
    if (!month) continue;

    const bucket = (months[month] ??= { tasks: [], sessions: [] });
    bucket.sessions.push({
      id: row.id,
      taskId: row.task_id,
      startTime: row.start_time,
      endTime: row.end_time,
      durationSeconds: row.duration_seconds,
      createdAt: row.created_at,
    });
  }

  for (const month of Object.values(months)) {
    month.tasks.sort((a, b) => (a.createdAt < b.createdAt ? -1 : a.createdAt > b.createdAt ? 1 : 0));
    month.sessions = sortSessions(month.sessions);
  }

  return { version: DATA_VERSION, months };
}

export interface CloudRows {
  tasks: { id: string; month: MonthKey; task: Task }[];
  completions: { taskId: string; date: string }[];
  sessions: { session: TimeSession }[];
}

/**
 * Flattens a document into rows ready for upload, rewriting any id that is not
 * a UUID. Data written by older builds used a non-UUID fallback id, and the
 * database columns are `uuid` — remapping here keeps an import from failing
 * halfway through.
 */
export function trackerDataToRows(data: TrackerData): CloudRows {
  const rows: CloudRows = { tasks: [], completions: [], sessions: [] };
  const idMap = new Map<string, string>();
  const mapId = (id: string) => {
    const existing = idMap.get(id);
    if (existing) return existing;
    const next = isUuid(id) ? id : createId();
    idMap.set(id, next);
    return next;
  };

  for (const [month, monthData] of Object.entries(data.months)) {
    for (const task of monthData.tasks) {
      const id = mapId(task.id);
      rows.tasks.push({ id, month, task: { ...task, id } });
      for (const date of task.completedDates) {
        rows.completions.push({ taskId: id, date });
      }
    }
  }

  // Sessions are emitted after every task id is known, so a session recorded in
  // one month against a task defined in another still resolves.
  const knownTaskIds = new Set(rows.tasks.map((row) => row.id));
  for (const monthData of Object.values(data.months)) {
    for (const session of monthData.sessions) {
      const taskId = mapId(session.taskId);
      if (!knownTaskIds.has(taskId)) continue;
      rows.sessions.push({
        session: { ...session, id: isUuid(session.id) ? session.id : createId(), taskId },
      });
    }
  }

  return rows;
}
