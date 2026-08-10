import type { TrackerData } from '../types';
import { monthlyStorage, type MonthlyStorage } from '../storage/monthlyStorage';
import type { TrackerPersistence } from './ops';

/**
 * The original local-first backend, now behind the persistence interface. It
 * ignores the op and rewrites the whole document, which is exactly what
 * localStorage wants and what every existing test expects.
 */
export function createLocalPersistence(
  storage: MonthlyStorage = monthlyStorage,
): TrackerPersistence {
  return {
    loadSync: () => storage.load(),
    load: async () => storage.load(),
    commit: async (_op, next: TrackerData) => storage.save(next),
  };
}
