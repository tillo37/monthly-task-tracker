import { describe, expect, it, vi } from 'vitest';
import type { TrackerData } from '../types';
import { createDemoData } from '../lib/demoData';
import { DATA_VERSION } from '../lib/validation';
import { createMemoryStorage, createMonthlyStorage, STORAGE_KEY } from './monthlyStorage';

const sample = (): TrackerData => ({
  version: DATA_VERSION,
  months: {
    '2026-08': {
      tasks: [
        {
          id: 'a',
          name: 'Gym',
          target: 20,
          color: '#6366f1',
          icon: 'dumbbell',
          completedDates: ['2026-08-01', '2026-08-03'],
          createdAt: '2026-08-01T00:00:00.000Z',
        },
      ],
      // Mid-month, mid-day so the instant lands in August in any timezone.
      sessions: [
        {
          id: 's1',
          taskId: 'a',
          startTime: '2026-08-15T12:00:00.000Z',
          endTime: '2026-08-15T13:30:00.000Z',
          durationSeconds: 5400,
          createdAt: '2026-08-15T13:30:00.000Z',
        },
      ],
    },
  },
});

describe('monthlyStorage', () => {
  it('round-trips saved data', () => {
    const storage = createMonthlyStorage(createMemoryStorage());
    storage.save(sample());
    expect(storage.load()).toEqual(sample());
  });

  it('survives a reload by reading from the same backing store', () => {
    const backing = createMemoryStorage();
    createMonthlyStorage(backing).save(createDemoData('2026-08'));

    const reopened = createMonthlyStorage(backing).load();
    expect(Object.keys(reopened.months)).toEqual(['2026-08']);
    expect(reopened.months['2026-08'].tasks.map((task) => task.name)).toEqual([
      'Gym',
      'Study',
      'Korean',
      'Reading',
    ]);
  });

  it('returns empty data when nothing is stored', () => {
    expect(createMonthlyStorage(createMemoryStorage()).load()).toEqual({
      version: DATA_VERSION,
      months: {},
    });
  });

  it('recovers from unparseable JSON instead of throwing', () => {
    const backing = createMemoryStorage();
    backing.setItem(STORAGE_KEY, '{ not json');
    expect(createMonthlyStorage(backing).load().months).toEqual({});
  });

  it('drops malformed months rather than surfacing them', () => {
    const backing = createMemoryStorage();
    backing.setItem(
      STORAGE_KEY,
      JSON.stringify({ months: { 'not-a-month': { tasks: [] }, '2026-08': { tasks: [] } } }),
    );
    // No readable months (the valid one is empty of tasks but still valid).
    expect(Object.keys(createMonthlyStorage(backing).load().months)).toEqual(['2026-08']);
  });

  it('clears stored data', () => {
    const backing = createMemoryStorage();
    const storage = createMonthlyStorage(backing);
    storage.save(sample());
    storage.clear();
    expect(backing.getItem(STORAGE_KEY)).toBeNull();
  });

  it('does not throw when the backing store rejects writes', () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    const storage = createMonthlyStorage({
      getItem: () => null,
      setItem: () => {
        throw new Error('QuotaExceededError');
      },
      removeItem: () => {},
    });

    expect(() => storage.save(sample())).not.toThrow();
    expect(error).toHaveBeenCalled();
    error.mockRestore();
  });
});
