import type { TrackerData } from '../types';
import { monthlyStorage, type MonthlyStorage } from '../storage/monthlyStorage';
import { summarise } from '../lib/validation';

/**
 * Bringing data over from the local-only version.
 *
 * Nothing here uploads anything. It only reports what is sitting in this
 * browser so the app can *offer* to import it — private data is never sent to
 * an account without the user saying yes — and it never deletes the local copy,
 * which stays put as a backup.
 */

const DISMISSED_KEY = 'monthly-task-tracker:migration-dismissed:v1';

export interface LocalDataSummary {
  data: TrackerData;
  months: number;
  tasks: number;
  completions: number;
  sessions: number;
  trackedSeconds: number;
}

/** Whether a document holds anything worth offering to import. */
export function hasContent(data: TrackerData): boolean {
  return Object.values(data.months).some(
    (month) => month.tasks.length > 0 || month.sessions.length > 0,
  );
}

/** The local document and its headline counts, or `null` when there is nothing. */
export function readLocalData(storage: MonthlyStorage = monthlyStorage): LocalDataSummary | null {
  const data = storage.load();
  if (!hasContent(data)) return null;
  return { data, ...summarise(data) };
}

/**
 * Whether the offer has already been declined for an account. Recorded per user
 * so signing in on a shared browser does not resurface someone else's prompt,
 * and so declining once does not nag on every reload.
 */
export function isMigrationDismissed(userId: string): boolean {
  try {
    const raw = localStorage.getItem(DISMISSED_KEY);
    if (!raw) return false;
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) && parsed.includes(userId);
  } catch {
    return false;
  }
}

export function dismissMigration(userId: string): void {
  try {
    const raw = localStorage.getItem(DISMISSED_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    const list = Array.isArray(parsed) ? parsed.filter((id): id is string => typeof id === 'string') : [];
    if (!list.includes(userId)) list.push(userId);
    localStorage.setItem(DISMISSED_KEY, JSON.stringify(list));
  } catch {
    // Not being able to remember the choice only means asking again later.
  }
}
