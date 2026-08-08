import type { TrackerData } from '../types';
import { emptyTrackerData, parseTrackerData } from '../lib/validation';

export const STORAGE_KEY = 'monthly-task-tracker:v1';

/**
 * The slice of the Web Storage API this app needs, so tests (and browsers with
 * storage disabled) can supply their own implementation.
 */
export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

/** Keeps the app usable when localStorage is unavailable (e.g. private mode). */
export function createMemoryStorage(): StorageLike {
  const map = new Map<string, string>();
  return {
    getItem: (key) => map.get(key) ?? null,
    setItem: (key, value) => void map.set(key, value),
    removeItem: (key) => void map.delete(key),
  };
}

function defaultStorage(): StorageLike {
  try {
    if (typeof localStorage === 'undefined') return createMemoryStorage();
    const probe = `${STORAGE_KEY}:probe`;
    localStorage.setItem(probe, '1');
    localStorage.removeItem(probe);
    return localStorage;
  } catch {
    return createMemoryStorage();
  }
}

export interface MonthlyStorage {
  load(): TrackerData;
  save(data: TrackerData): void;
  clear(): void;
}

/**
 * The single place that talks to persistent storage. Reads are defensive:
 * unparseable or malformed documents fall back to empty data rather than
 * throwing on startup.
 */
export function createMonthlyStorage(storage: StorageLike = defaultStorage()): MonthlyStorage {
  return {
    load() {
      let raw: string | null = null;
      try {
        raw = storage.getItem(STORAGE_KEY);
      } catch {
        return emptyTrackerData();
      }
      if (!raw) return emptyTrackerData();

      try {
        const result = parseTrackerData(JSON.parse(raw));
        return result.ok ? result.data : emptyTrackerData();
      } catch {
        return emptyTrackerData();
      }
    },

    save(data) {
      try {
        storage.setItem(STORAGE_KEY, JSON.stringify(data));
      } catch (error) {
        // Quota or a locked-down browser — surfaced in the console rather than
        // interrupting the user mid-click.
        console.error('Failed to persist tracker data', error);
      }
    },

    clear() {
      try {
        storage.removeItem(STORAGE_KEY);
      } catch {
        /* nothing useful to do */
      }
    },
  };
}

export const monthlyStorage = createMonthlyStorage();
