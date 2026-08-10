import type { ActiveTimer } from '../types';
import { isValidMonthKey } from '../lib/date';
import { createMemoryStorage, type StorageLike } from './monthlyStorage';

export const TIMER_STORAGE_KEY = 'monthly-task-tracker:timer:v1';

/**
 * The running timer is kept apart from the tracker document on purpose: it is
 * transient device state, not data worth exporting, and it must survive a reload
 * without ever ending up inside a backup file.
 */
export interface TimerStorage {
  load(): ActiveTimer | null;
  save(timer: ActiveTimer): void;
  clear(): void;
}

function defaultStorage(): StorageLike {
  try {
    if (typeof localStorage === 'undefined') return createMemoryStorage();
    const probe = `${TIMER_STORAGE_KEY}:probe`;
    localStorage.setItem(probe, '1');
    localStorage.removeItem(probe);
    return localStorage;
  } catch {
    return createMemoryStorage();
  }
}

/** Rejects anything that would not resolve to a real task in a real month. */
export function parseActiveTimer(value: unknown): ActiveTimer | null {
  if (typeof value !== 'object' || value === null) return null;
  const candidate = value as Record<string, unknown>;

  const { taskId, startTime, month } = candidate;
  if (typeof taskId !== 'string' || !taskId) return null;
  if (typeof startTime !== 'string' || Number.isNaN(Date.parse(startTime))) return null;
  if (!isValidMonthKey(month)) return null;

  return { taskId, startTime, month };
}

export function createTimerStorage(storage: StorageLike = defaultStorage()): TimerStorage {
  return {
    load() {
      try {
        const raw = storage.getItem(TIMER_STORAGE_KEY);
        return raw ? parseActiveTimer(JSON.parse(raw)) : null;
      } catch {
        return null;
      }
    },

    save(timer) {
      try {
        storage.setItem(TIMER_STORAGE_KEY, JSON.stringify(timer));
      } catch (error) {
        // The timer still runs in memory; it just will not survive a reload.
        console.error('Failed to persist the running timer', error);
      }
    },

    clear() {
      try {
        storage.removeItem(TIMER_STORAGE_KEY);
      } catch {
        /* nothing useful to do */
      }
    },
  };
}

export const timerStorage = createTimerStorage();
