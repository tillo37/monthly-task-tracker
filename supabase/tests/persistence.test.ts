import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createSupabasePersistence } from '../../src/data/supabasePersistence';
import { createSupabaseTimerStore } from '../../src/data/timerStore';
import { createTask } from '../../src/lib/tasks';
import { createSession } from '../../src/lib/sessions';
import { emptyTrackerData } from '../../src/lib/validation';
import type { TrackerData } from '../../src/types';
import { createUser, deleteUsers, hasCredentials, type TestUser } from './helpers';

/**
 * The repository against the real database.
 *
 * The unit tests cover the shape of the translation; this covers whether
 * Postgres accepts it — constraints, foreign keys, cascades and the generated
 * duration all included.
 */

const AUGUST = '2026-08';

describe.skipIf(!hasCredentials)('supabase persistence', () => {
  const users: TestUser[] = [];
  let user: TestUser;
  let persistence: ReturnType<typeof createSupabasePersistence>;

  beforeAll(async () => {
    user = await createUser('Repo');
    users.push(user);
    persistence = createSupabasePersistence(user.client, user.id);
  });

  afterAll(async () => {
    await deleteUsers(users);
  });

  it('starts empty', async () => {
    expect((await persistence.load()).months).toEqual({});
  });

  it('round-trips a task, a completion and a session', async () => {
    const task = createTask({ name: 'Gym', target: 12, color: '#ef4444', icon: 'dumbbell' });
    await persistence.commit({ type: 'addTask', month: AUGUST, task }, emptyTrackerData());
    await persistence.commit(
      { type: 'setCompletion', month: AUGUST, taskId: task.id, date: '2026-08-03', completed: true },
      emptyTrackerData(),
    );

    const session = createSession({
      taskId: task.id,
      startTime: '2026-08-03T09:00:00.000Z',
      endTime: '2026-08-03T10:30:00.000Z',
    });
    await persistence.commit({ type: 'addSession', month: AUGUST, session }, emptyTrackerData());

    const loaded = await persistence.load();
    expect(loaded.months[AUGUST].tasks[0]).toMatchObject({
      id: task.id,
      name: 'Gym',
      target: 12,
      color: '#ef4444',
      icon: 'dumbbell',
      completedDates: ['2026-08-03'],
    });
    expect(loaded.months[AUGUST].sessions[0]).toMatchObject({
      id: session.id,
      taskId: task.id,
      // Computed by Postgres, not carried over from the client.
      durationSeconds: 5400,
    });
  });

  it('clears a completion without touching the task', async () => {
    const loaded = await persistence.load();
    const task = loaded.months[AUGUST].tasks[0];

    await persistence.commit(
      { type: 'setCompletion', month: AUGUST, taskId: task.id, date: '2026-08-03', completed: false },
      loaded,
    );

    const after = await persistence.load();
    expect(after.months[AUGUST].tasks[0].completedDates).toEqual([]);
    expect(after.months[AUGUST].tasks[0].name).toBe('Gym');
  });

  it('updates a task in place', async () => {
    const loaded = await persistence.load();
    const task = loaded.months[AUGUST].tasks[0];

    await persistence.commit(
      { type: 'updateTask', month: AUGUST, taskId: task.id, patch: { name: 'Gym & swim', target: 20 } },
      loaded,
    );

    const after = await persistence.load();
    expect(after.months[AUGUST].tasks[0]).toMatchObject({ name: 'Gym & swim', target: 20 });
  });

  it('takes a task\'s sessions with it when it is deleted', async () => {
    const loaded = await persistence.load();
    const task = loaded.months[AUGUST].tasks[0];

    await persistence.commit({ type: 'deleteTask', month: AUGUST, taskId: task.id }, loaded);

    const after = await persistence.load();
    expect(after.months).toEqual({});
  });

  it('replaces everything on import, including across months', async () => {
    const july = createTask({ name: 'July habit', target: 5 });
    const august = createTask({ name: 'August habit', target: 8 });
    const session = createSession({
      taskId: august.id,
      startTime: '2026-08-05T09:00:00.000Z',
      endTime: '2026-08-05T09:45:00.000Z',
    });

    const document: TrackerData = {
      version: 2,
      months: {
        '2026-07': { tasks: [{ ...july, completedDates: ['2026-07-02'] }], sessions: [] },
        '2026-08': { tasks: [august], sessions: [session] },
      },
    };

    await persistence.commit({ type: 'replaceAll', data: document }, document);

    const loaded = await persistence.load();
    expect(Object.keys(loaded.months).sort()).toEqual(['2026-07', '2026-08']);
    expect(loaded.months['2026-07'].tasks[0].completedDates).toEqual(['2026-07-02']);
    expect(loaded.months['2026-08'].sessions[0].durationSeconds).toBe(2700);
  });

  it('rewrites legacy ids so old local data can be imported', async () => {
    const document: TrackerData = {
      version: 2,
      months: {
        '2026-09': {
          tasks: [
            {
              id: 't_legacy_1',
              name: 'Legacy habit',
              target: 4,
              color: '#6366f1',
              icon: 'target',
              completedDates: ['2026-09-01'],
              createdAt: '2026-09-01T08:00:00.000Z',
            },
          ],
          sessions: [
            {
              id: 't_legacy_session',
              taskId: 't_legacy_1',
              startTime: '2026-09-01T08:00:00.000Z',
              endTime: '2026-09-01T09:00:00.000Z',
              durationSeconds: 3600,
              createdAt: '2026-09-01T09:00:00.000Z',
            },
          ],
        },
      },
    };

    await persistence.commit({ type: 'replaceAll', data: document }, document);

    const loaded = await persistence.load();
    const task = loaded.months['2026-09'].tasks[0];
    expect(task.id).not.toBe('t_legacy_1');
    expect(task.completedDates).toEqual(['2026-09-01']);
    // The session still points at the task it belonged to.
    expect(loaded.months['2026-09'].sessions[0].taskId).toBe(task.id);
  });

  it('leaves another account untouched when one imports', async () => {
    const bystander = await createUser('Bystander');
    users.push(bystander);

    const theirs = createSupabasePersistence(bystander.client, bystander.id);
    const theirTask = createTask({ name: 'Untouched', target: 3 });
    await theirs.commit({ type: 'addTask', month: AUGUST, task: theirTask }, emptyTrackerData());

    await persistence.commit(
      { type: 'replaceAll', data: emptyTrackerData() },
      emptyTrackerData(),
    );

    const after = await theirs.load();
    expect(after.months[AUGUST].tasks[0].name).toBe('Untouched');
  });
});

describe.skipIf(!hasCredentials)('supabase timer store', () => {
  const users: TestUser[] = [];
  let user: TestUser;
  let taskId: string;

  beforeAll(async () => {
    user = await createUser('Timer');
    users.push(user);

    const persistence = createSupabasePersistence(user.client, user.id);
    const task = createTask({ name: 'Focus', target: 10 });
    await persistence.commit({ type: 'addTask', month: AUGUST, task }, emptyTrackerData());
    taskId = task.id;
  });

  afterAll(async () => {
    await deleteUsers(users);
  });

  it('has nothing running to begin with', async () => {
    const store = createSupabaseTimerStore(user.client, user.id);
    expect(await store.load()).toBeNull();
  });

  it('restores a running timer, which is what survives a refresh', async () => {
    const store = createSupabaseTimerStore(user.client, user.id);
    await store.save({ taskId, startTime: new Date().toISOString(), month: AUGUST });

    // A second store stands in for a reload, or for another device.
    const reopened = createSupabaseTimerStore(user.client, user.id);
    const restored = await reopened.load();

    expect(restored).toMatchObject({ taskId, month: AUGUST });
    expect(Number.isNaN(Date.parse(restored!.startTime))).toBe(false);
  });

  it('stamps the start from the database rather than the caller', async () => {
    const store = createSupabaseTimerStore(user.client, user.id);
    const proposed = '2020-01-01T00:00:00.000Z';
    const saved = await store.save({ taskId, startTime: proposed, month: AUGUST });

    // A client cannot backdate a start to inflate the elapsed time.
    expect(saved.startTime).not.toBe(proposed);
    expect(Date.parse(saved.startTime)).toBeGreaterThan(Date.parse('2024-01-01T00:00:00.000Z'));
  });

  it('keeps exactly one timer however many times it is started', async () => {
    const store = createSupabaseTimerStore(user.client, user.id);
    await Promise.all([
      store.save({ taskId, startTime: new Date().toISOString(), month: AUGUST }),
      store.save({ taskId, startTime: new Date().toISOString(), month: AUGUST }),
      store.save({ taskId, startTime: new Date().toISOString(), month: AUGUST }),
    ]);

    const { data } = await user.client.from('active_timers').select('user_id');
    expect(data).toHaveLength(1);
  });

  it('clears on stop', async () => {
    const store = createSupabaseTimerStore(user.client, user.id);
    await store.save({ taskId, startTime: new Date().toISOString(), month: AUGUST });
    await store.clear();

    expect(await store.load()).toBeNull();
  });
});
