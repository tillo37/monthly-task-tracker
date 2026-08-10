import type { MonthData, TimeSession } from '../types';
import { createId } from './id';
import {
  MAX_SESSION_SECONDS,
  MIN_SESSION_SECONDS,
  durationBetween,
  parseDurationInput,
} from './time';

export interface SessionInput {
  taskId: string;
  startTime: string;
  endTime: string;
}

export interface SessionFormErrors {
  taskId?: string;
  date?: string;
  startTime?: string;
  duration?: string;
}

/** Keeps sessions in start order so lists and reports never have to re-sort. */
const byStartTime = (a: TimeSession, b: TimeSession) =>
  a.startTime < b.startTime ? -1 : a.startTime > b.startTime ? 1 : 0;

export function sortSessions(sessions: TimeSession[]): TimeSession[] {
  return [...sessions].sort(byStartTime);
}

/**
 * Builds a session from an interval. The duration is always derived from the
 * two instants rather than trusted from the caller, and is clamped to a single
 * day so a timer left running overnight cannot poison a month's totals.
 */
export function createSession(input: SessionInput, now: Date = new Date()): TimeSession {
  const raw = durationBetween(input.startTime, input.endTime) ?? 0;
  const durationSeconds = Math.min(Math.max(raw, 0), MAX_SESSION_SECONDS);

  return {
    id: createId(),
    taskId: input.taskId,
    startTime: input.startTime,
    endTime: input.endTime,
    durationSeconds,
    createdAt: now.toISOString(),
  };
}

export function addSession(data: MonthData, session: TimeSession): MonthData {
  return { ...data, sessions: sortSessions([...data.sessions, session]) };
}

export function deleteSession(data: MonthData, id: string): MonthData {
  return { ...data, sessions: data.sessions.filter((session) => session.id !== id) };
}

/** Clears every recorded session, leaving tasks and completions untouched. */
export function clearSessions(data: MonthData): MonthData {
  return { ...data, sessions: [] };
}

/** Drops sessions belonging to a task that no longer exists in the month. */
export function pruneOrphanSessions(data: MonthData): MonthData {
  const ids = new Set(data.tasks.map((task) => task.id));
  return { ...data, sessions: data.sessions.filter((session) => ids.has(session.taskId)) };
}

export function sessionsForTask(data: MonthData, taskId: string): TimeSession[] {
  return data.sessions.filter((session) => session.taskId === taskId);
}

/** Most recent sessions first, optionally limited for the "recent" list. */
export function recentSessions(data: MonthData, limit?: number): TimeSession[] {
  const ordered = [...data.sessions].sort((a, b) => byStartTime(b, a));
  return limit === undefined ? ordered : ordered.slice(0, limit);
}

/**
 * Validation shared by the manual entry form and the import validator: the
 * task must exist, the interval must be real, and it must fit inside a day.
 */
export function validateSessionForm(input: {
  taskId: string;
  date: string;
  startTime: string;
  duration: string;
  knownTaskIds: string[];
}): SessionFormErrors {
  const errors: SessionFormErrors = {};

  if (!input.taskId) errors.taskId = 'Choose a task.';
  else if (!input.knownTaskIds.includes(input.taskId)) {
    errors.taskId = 'That task is not in this month.';
  }

  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.date)) errors.date = 'Pick a date.';
  if (!/^\d{1,2}:\d{2}$/.test(input.startTime)) errors.startTime = 'Pick a start time.';

  const seconds = parseDurationInput(input.duration);
  if (seconds === null) {
    errors.duration = 'Use minutes (45), hours and minutes (1h 30m) or a clock (1:30).';
  } else if (seconds < MIN_SESSION_SECONDS) {
    errors.duration = 'Duration must be more than zero.';
  } else if (seconds > MAX_SESSION_SECONDS) {
    errors.duration = 'A single session cannot be longer than 24 hours.';
  }

  return errors;
}

export const hasErrors = (errors: SessionFormErrors): boolean =>
  Object.values(errors).some(Boolean);
