import { beforeEach, describe, expect, it } from 'vitest';
import { createMemoryStorage, createMonthlyStorage, STORAGE_KEY } from '../storage/monthlyStorage';
import { dismissMigration, hasContent, isMigrationDismissed, readLocalData } from './localMigration';
import { emptyTrackerData } from '../lib/validation';

const USER_A = 'user-a';
const USER_B = 'user-b';

const documentWith = (over: object = {}) =>
  JSON.stringify({
    version: 2,
    months: {
      '2026-08': {
        tasks: [
          {
            id: 'task-1',
            name: 'Gym',
            target: 12,
            color: '#6366f1',
            icon: 'dumbbell',
            completedDates: ['2026-08-01', '2026-08-02'],
            createdAt: '2026-08-01T09:00:00.000Z',
          },
        ],
        sessions: [
          {
            id: 'session-1',
            taskId: 'task-1',
            startTime: '2026-08-01T09:00:00.000Z',
            endTime: '2026-08-01T10:00:00.000Z',
            durationSeconds: 3600,
            createdAt: '2026-08-01T10:00:00.000Z',
          },
        ],
      },
    },
    ...over,
  });

describe('hasContent', () => {
  it('is false for an empty document', () => {
    expect(hasContent(emptyTrackerData())).toBe(false);
  });

  it('is false for a month with nothing in it', () => {
    expect(hasContent({ version: 2, months: { '2026-08': { tasks: [], sessions: [] } } })).toBe(
      false,
    );
  });

  it('is true once there is a task', () => {
    expect(
      hasContent({
        version: 2,
        months: {
          '2026-08': {
            tasks: [
              {
                id: 't',
                name: 'Gym',
                target: 1,
                color: '#6366f1',
                icon: 'dumbbell',
                completedDates: [],
                createdAt: '2026-08-01T00:00:00.000Z',
              },
            ],
            sessions: [],
          },
        },
      }),
    ).toBe(true);
  });
});

describe('readLocalData', () => {
  it('returns nothing when this browser holds no tracker data', () => {
    expect(readLocalData(createMonthlyStorage(createMemoryStorage()))).toBeNull();
  });

  it('summarises what is available to import', () => {
    const backing = createMemoryStorage();
    backing.setItem(STORAGE_KEY, documentWith());

    const summary = readLocalData(createMonthlyStorage(backing));

    expect(summary).toMatchObject({
      months: 1,
      tasks: 1,
      completions: 2,
      sessions: 1,
      trackedSeconds: 3600,
    });
    // The document itself comes back so the dialog can hand it to the importer.
    expect(summary?.data.months['2026-08'].tasks[0].name).toBe('Gym');
  });
});

describe('migration dismissal', () => {
  beforeEach(() => localStorage.clear());

  it('is not dismissed by default', () => {
    expect(isMigrationDismissed(USER_A)).toBe(false);
  });

  it('remembers a decline per account', () => {
    dismissMigration(USER_A);

    expect(isMigrationDismissed(USER_A)).toBe(true);
    // Someone else signing in on the same browser still gets the offer.
    expect(isMigrationDismissed(USER_B)).toBe(false);
  });

  it('accumulates rather than replacing', () => {
    dismissMigration(USER_A);
    dismissMigration(USER_B);

    expect(isMigrationDismissed(USER_A)).toBe(true);
    expect(isMigrationDismissed(USER_B)).toBe(true);
  });

  it('treats unreadable state as not dismissed', () => {
    localStorage.setItem('monthly-task-tracker:migration-dismissed:v1', '{not json');
    expect(isMigrationDismissed(USER_A)).toBe(false);
  });
});
