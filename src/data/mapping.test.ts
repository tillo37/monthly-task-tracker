import { describe, expect, it } from 'vitest';
import { rowsToTrackerData, trackerDataToRows } from './mapping';
import type { TaskCompletionRow, TaskRow, TimeSessionRow } from '../types/database';
import type { TrackerData } from '../types';

const USER = '00000000-0000-4000-8000-000000000001';
const TASK = '00000000-0000-4000-8000-0000000000a1';
const OTHER_TASK = '00000000-0000-4000-8000-0000000000a2';

const task = (over: Partial<TaskRow> = {}): TaskRow => ({
  id: TASK,
  user_id: USER,
  month: '2026-08',
  name: 'Gym',
  target: 12,
  color: '#6366f1',
  icon: 'dumbbell',
  created_at: '2026-08-01T09:00:00.000Z',
  updated_at: '2026-08-01T09:00:00.000Z',
  ...over,
});

const completion = (over: Partial<TaskCompletionRow> = {}): TaskCompletionRow => ({
  id: '00000000-0000-4000-8000-0000000000c1',
  user_id: USER,
  task_id: TASK,
  date: '2026-08-03',
  created_at: '2026-08-03T09:00:00.000Z',
  ...over,
});

const session = (over: Partial<TimeSessionRow> = {}): TimeSessionRow => ({
  id: '00000000-0000-4000-8000-0000000000d1',
  user_id: USER,
  task_id: TASK,
  start_time: '2026-08-03T09:00:00.000Z',
  end_time: '2026-08-03T10:00:00.000Z',
  duration_seconds: 3600,
  created_at: '2026-08-03T10:00:00.000Z',
  updated_at: '2026-08-03T10:00:00.000Z',
  ...over,
});

describe('rowsToTrackerData', () => {
  it('groups tasks into their month and attaches completions', () => {
    const data = rowsToTrackerData({
      tasks: [task()],
      completions: [completion(), completion({ id: 'c2', date: '2026-08-01' })],
      sessions: [],
    });

    expect(Object.keys(data.months)).toEqual(['2026-08']);
    expect(data.months['2026-08'].tasks[0]).toMatchObject({
      id: TASK,
      name: 'Gym',
      target: 12,
      // Sorted and de-duplicated, matching what the grid expects.
      completedDates: ['2026-08-01', '2026-08-03'],
    });
  });

  it('files a session under the month its start instant falls in', () => {
    const data = rowsToTrackerData({
      tasks: [task({ month: '2026-07' })],
      completions: [],
      sessions: [session()],
    });

    // The task lives in July but the work happened in August.
    expect(data.months['2026-07'].tasks).toHaveLength(1);
    expect(data.months['2026-08'].sessions).toHaveLength(1);
  });

  it('keeps the duration the database computed', () => {
    const data = rowsToTrackerData({
      tasks: [task()],
      completions: [],
      // A row whose stored duration disagrees with the instants cannot exist:
      // the column is generated. Whatever Postgres says is what is used.
      sessions: [session({ duration_seconds: 3600 })],
    });

    expect(data.months['2026-08'].sessions[0].durationSeconds).toBe(3600);
  });

  it('sorts sessions by start time', () => {
    const data = rowsToTrackerData({
      tasks: [task()],
      completions: [],
      sessions: [
        session({ id: 'late', start_time: '2026-08-03T18:00:00.000Z', end_time: '2026-08-03T19:00:00.000Z' }),
        session({ id: 'early', start_time: '2026-08-03T06:00:00.000Z', end_time: '2026-08-03T07:00:00.000Z' }),
      ],
    });

    expect(data.months['2026-08'].sessions.map((entry) => entry.id)).toEqual(['early', 'late']);
  });

  it('returns an empty document when the user has nothing', () => {
    expect(rowsToTrackerData({ tasks: [], completions: [], sessions: [] }).months).toEqual({});
  });
});

describe('trackerDataToRows', () => {
  const document = (over?: Partial<TrackerData>): TrackerData => ({
    version: 2,
    months: {
      '2026-08': {
        tasks: [
          {
            id: TASK,
            name: 'Gym',
            target: 12,
            color: '#6366f1',
            icon: 'dumbbell',
            completedDates: ['2026-08-01'],
            createdAt: '2026-08-01T09:00:00.000Z',
          },
        ],
        sessions: [
          {
            id: '00000000-0000-4000-8000-0000000000d1',
            taskId: TASK,
            startTime: '2026-08-03T09:00:00.000Z',
            endTime: '2026-08-03T10:00:00.000Z',
            durationSeconds: 3600,
            createdAt: '2026-08-03T10:00:00.000Z',
          },
        ],
      },
    },
    ...over,
  });

  it('flattens tasks, completions and sessions', () => {
    const rows = trackerDataToRows(document());

    expect(rows.tasks).toHaveLength(1);
    expect(rows.tasks[0].month).toBe('2026-08');
    expect(rows.completions).toEqual([{ taskId: TASK, date: '2026-08-01' }]);
    expect(rows.sessions).toHaveLength(1);
  });

  it('rewrites legacy non-UUID ids consistently across tables', () => {
    const legacy = document();
    legacy.months['2026-08'].tasks[0].id = 't_abc_123';
    legacy.months['2026-08'].sessions[0].taskId = 't_abc_123';
    legacy.months['2026-08'].sessions[0].id = 't_def_456';

    const rows = trackerDataToRows(legacy);
    const newTaskId = rows.tasks[0].id;

    expect(newTaskId).not.toBe('t_abc_123');
    expect(newTaskId).toMatch(/^[0-9a-f-]{36}$/);
    // The session must still point at the same task after the rewrite.
    expect(rows.sessions[0].session.taskId).toBe(newTaskId);
    expect(rows.completions[0].taskId).toBe(newTaskId);
    expect(rows.sessions[0].session.id).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('drops a session whose task is not in the document', () => {
    const orphaned = document();
    orphaned.months['2026-08'].sessions[0].taskId = OTHER_TASK;

    expect(trackerDataToRows(orphaned).sessions).toHaveLength(0);
  });

  it('survives a round trip through the row shape', () => {
    const rows = trackerDataToRows(document());
    const restored = rowsToTrackerData({
      tasks: rows.tasks.map(({ id, month, task: entry }) => ({
        id,
        user_id: USER,
        month,
        name: entry.name,
        target: entry.target,
        color: entry.color,
        icon: entry.icon,
        created_at: entry.createdAt,
        updated_at: entry.createdAt,
      })),
      completions: rows.completions.map(({ taskId, date }, index) => ({
        id: `c${index}`,
        user_id: USER,
        task_id: taskId,
        date,
        created_at: date,
      })),
      sessions: rows.sessions.map(({ session: entry }) => ({
        id: entry.id,
        user_id: USER,
        task_id: entry.taskId,
        start_time: entry.startTime,
        end_time: entry.endTime,
        duration_seconds: entry.durationSeconds,
        created_at: entry.createdAt,
        updated_at: entry.createdAt,
      })),
    });

    expect(restored.months['2026-08']).toEqual(document().months['2026-08']);
  });
});
