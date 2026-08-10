import type { MonthData, Task, TimeSession, TrackerData } from '../types';
import { DEFAULT_COLOR, DEFAULT_ICON, isValidColor, TASK_ICONS } from './appearance';
import { isValidDateKey, isValidMonthKey, monthKeyOfDate, monthKeyOfInstant } from './date';
import { createId } from './id';
import { sortSessions } from './sessions';
import { MAX_NAME_LENGTH, MAX_TARGET } from './tasks';
import { durationBetween, MAX_SESSION_SECONDS } from './time';

/**
 * Version 2 added `months[].sessions`. Version 1 documents load unchanged — a
 * missing session list simply reads as an empty one.
 */
export const DATA_VERSION = 2;

export const emptyTrackerData = (): TrackerData => ({ version: DATA_VERSION, months: {} });

export type ParseResult =
  | { ok: true; data: TrackerData; warnings: string[] }
  | { ok: false; error: string };

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/**
 * Sanitises one task. Returns `null` when the entry is too broken to keep;
 * repairable fields (missing colour, unknown icon) fall back to defaults and
 * are reported as warnings rather than failing the whole import.
 */
function parseTask(value: unknown, month: string, warnings: string[]): Task | null {
  if (!isObject(value)) {
    warnings.push(`${month}: skipped a task entry that was not an object.`);
    return null;
  }

  const name = typeof value.name === 'string' ? value.name.trim() : '';
  if (!name) {
    warnings.push(`${month}: skipped a task with no name.`);
    return null;
  }

  const rawTarget = typeof value.target === 'number' ? value.target : Number(value.target);
  if (!Number.isFinite(rawTarget) || rawTarget < 1) {
    warnings.push(`${month}: skipped "${name}" because its target was not a positive number.`);
    return null;
  }
  const target = Math.min(Math.max(Math.trunc(rawTarget), 1), MAX_TARGET);

  const rawDates = Array.isArray(value.completedDates) ? value.completedDates : [];
  const completedDates = Array.from(
    new Set(
      rawDates.filter(
        (date): date is string => isValidDateKey(date) && monthKeyOfDate(date) === month,
      ),
    ),
  ).sort();

  if (completedDates.length !== rawDates.length) {
    warnings.push(`${month}: dropped invalid or out-of-month dates from "${name}".`);
  }

  const icon = typeof value.icon === 'string' && value.icon in TASK_ICONS ? value.icon : DEFAULT_ICON;
  const color = isValidColor(value.color) ? value.color : DEFAULT_COLOR;
  const createdAt =
    typeof value.createdAt === 'string' && !Number.isNaN(Date.parse(value.createdAt))
      ? value.createdAt
      : new Date().toISOString();

  return {
    id: typeof value.id === 'string' && value.id ? value.id : createId(),
    name: name.slice(0, MAX_NAME_LENGTH),
    target,
    color,
    icon,
    completedDates,
    createdAt,
  };
}

/**
 * Sanitises one time session. The duration is always recomputed from the two
 * instants, so a hand-edited or buggy `durationSeconds` cannot inflate totals.
 */
function parseSession(
  value: unknown,
  month: string,
  taskIds: Set<string>,
  warnings: string[],
): TimeSession | null {
  if (!isObject(value)) {
    warnings.push(`${month}: skipped a time session that was not an object.`);
    return null;
  }

  const taskId = typeof value.taskId === 'string' ? value.taskId : '';
  if (!taskIds.has(taskId)) {
    warnings.push(`${month}: skipped a time session for a task that is not in this month.`);
    return null;
  }

  const startTime = typeof value.startTime === 'string' ? value.startTime : '';
  const endTime = typeof value.endTime === 'string' ? value.endTime : '';
  const derived = durationBetween(startTime, endTime);
  if (derived === null) {
    warnings.push(`${month}: skipped a time session with an unreadable start or end time.`);
    return null;
  }
  if (derived < 0) {
    warnings.push(`${month}: skipped a time session that ended before it started.`);
    return null;
  }
  if (monthKeyOfInstant(startTime) !== month) {
    warnings.push(`${month}: skipped a time session that started outside this month.`);
    return null;
  }

  const durationSeconds = Math.min(derived, MAX_SESSION_SECONDS);
  if (durationSeconds !== derived) {
    warnings.push(`${month}: clamped a time session longer than 24 hours.`);
  }

  const createdAt =
    typeof value.createdAt === 'string' && !Number.isNaN(Date.parse(value.createdAt))
      ? value.createdAt
      : new Date(Date.parse(startTime)).toISOString();

  return {
    id: typeof value.id === 'string' && value.id ? value.id : createId(),
    taskId,
    startTime: new Date(Date.parse(startTime)).toISOString(),
    endTime: new Date(Date.parse(endTime)).toISOString(),
    durationSeconds,
    createdAt,
  };
}

function parseMonth(value: unknown, month: string, warnings: string[]): MonthData | null {
  if (!isObject(value) || !Array.isArray(value.tasks)) {
    warnings.push(`${month}: skipped because it had no task list.`);
    return null;
  }

  const seenIds = new Set<string>();
  const tasks: Task[] = [];
  for (const entry of value.tasks) {
    const task = parseTask(entry, month, warnings);
    if (!task) continue;
    // Duplicate ids would make edits and deletes ambiguous.
    if (seenIds.has(task.id)) task.id = createId();
    seenIds.add(task.id);
    tasks.push(task);
  }

  // Absent in version 1 documents, which is not an error.
  const rawSessions = Array.isArray(value.sessions) ? value.sessions : [];
  const seenSessionIds = new Set<string>();
  const sessions: TimeSession[] = [];
  for (const entry of rawSessions) {
    const session = parseSession(entry, month, seenIds, warnings);
    if (!session) continue;
    if (seenSessionIds.has(session.id)) session.id = createId();
    seenSessionIds.add(session.id);
    sessions.push(session);
  }

  return { tasks, sessions: sortSessions(sessions) };
}

/**
 * Validates an unknown value (parsed JSON from storage or an imported file)
 * into tracker data. Nothing is trusted: unknown months, malformed tasks and
 * out-of-range values are dropped instead of reaching the UI.
 */
export function parseTrackerData(value: unknown): ParseResult {
  if (!isObject(value)) return { ok: false, error: 'File does not contain a JSON object.' };
  if (!isObject(value.months)) return { ok: false, error: 'File is missing a "months" object.' };

  const warnings: string[] = [];
  const months: Record<string, MonthData> = {};

  for (const [key, monthValue] of Object.entries(value.months)) {
    if (!isValidMonthKey(key)) {
      warnings.push(`Skipped "${key}" — not a valid YYYY-MM month key.`);
      continue;
    }
    const month = parseMonth(monthValue, key, warnings);
    if (month) months[key] = month;
  }

  if (Object.keys(months).length === 0) {
    return { ok: false, error: 'File contains no readable months.' };
  }

  return { ok: true, data: { version: DATA_VERSION, months }, warnings };
}

/** Counts what an import would bring in, for the confirmation dialog. */
export function summarise(data: TrackerData): {
  months: number;
  tasks: number;
  completions: number;
  sessions: number;
  trackedSeconds: number;
} {
  const monthList = Object.values(data.months);
  return {
    months: monthList.length,
    tasks: monthList.reduce((total, month) => total + month.tasks.length, 0),
    completions: monthList.reduce(
      (total, month) =>
        total + month.tasks.reduce((sum, task) => sum + task.completedDates.length, 0),
      0,
    ),
    sessions: monthList.reduce((total, month) => total + month.sessions.length, 0),
    trackedSeconds: monthList.reduce(
      (total, month) =>
        total + month.sessions.reduce((sum, session) => sum + session.durationSeconds, 0),
      0,
    ),
  };
}
