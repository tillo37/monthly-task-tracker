import type { MonthData, Task, TrackerData } from '../types';
import { DEFAULT_COLOR, DEFAULT_ICON, isValidColor, TASK_ICONS } from './appearance';
import { isValidDateKey, isValidMonthKey, monthKeyOfDate } from './date';
import { createId } from './id';
import { MAX_NAME_LENGTH, MAX_TARGET } from './tasks';

export const DATA_VERSION = 1;

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
  return { tasks };
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
export function summarise(data: TrackerData): { months: number; tasks: number; completions: number } {
  const monthList = Object.values(data.months);
  return {
    months: monthList.length,
    tasks: monthList.reduce((total, month) => total + month.tasks.length, 0),
    completions: monthList.reduce(
      (total, month) =>
        total + month.tasks.reduce((sum, task) => sum + task.completedDates.length, 0),
      0,
    ),
  };
}
