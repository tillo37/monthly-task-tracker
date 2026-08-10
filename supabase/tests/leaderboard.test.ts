import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  addCompletion,
  addSession,
  addTask,
  createUser,
  deleteUsers,
  hasCredentials,
  type TestUser,
} from './helpers';

/**
 * Leaderboard aggregation, checked against real data.
 *
 * Ten accounts with deliberately different totals, so the ordering, the tie
 * handling and the calendar boundaries are all exercised rather than assumed.
 */

const NAMES = [
  'Alex',
  'Islom',
  'Daniel',
  'Priya',
  'Mert',
  'Sofia',
  'Kenji',
  'Nadia',
  'Tomas',
  'Zara',
];

// Descending on purpose so the expected ranking is obvious at a glance.
const HOURS = [42, 38, 34, 30, 26, 22, 18, 14, 10, 6];
const COMPLETIONS = [20, 18, 16, 14, 12, 10, 8, 6, 4, 2];

const AUGUST = '2026-08';
const JULY = '2026-07';

describe.skipIf(!hasCredentials)('leaderboard aggregation', () => {
  const users: TestUser[] = [];
  const taskIds: string[] = [];

  beforeAll(async () => {
    for (const name of NAMES) {
      const user = await createUser(name);
      users.push(user);
      taskIds.push(await addTask(user, { month: AUGUST, name: 'Deep work', target: 20 }));
    }

    for (const [index, user] of users.entries()) {
      // Split each total across two sessions so the session count is checkable.
      const seconds = HOURS[index] * 3600;
      await addSession(user, taskIds[index], '2026-08-03T09:00:00.000Z', Math.floor(seconds / 2));
      await addSession(user, taskIds[index], '2026-08-04T09:00:00.000Z', Math.ceil(seconds / 2));

      for (let day = 1; day <= COMPLETIONS[index]; day += 1) {
        await addCompletion(user, taskIds[index], `2026-08-${String(day).padStart(2, '0')}`);
      }
    }
  });

  afterAll(async () => {
    await deleteUsers(users);
  });

  /** Only rows belonging to this suite's accounts; the table is shared. */
  const mine = <T extends { user_id: string }>(rows: T[] | null) =>
    (rows ?? []).filter((row) => users.some((user) => user.id === row.user_id));

  it('ranks by total tracked time, highest first', async () => {
    const { data, error } = await users[0].client.rpc('leaderboard_time', { p_month: AUGUST });
    expect(error).toBeNull();

    const rows = mine(data);
    expect(rows.map((row) => row.display_name)).toEqual(NAMES);
    expect(rows.map((row) => Number(row.total_seconds))).toEqual(HOURS.map((hours) => hours * 3600));
  });

  it('counts the sessions behind each total', async () => {
    const { data } = await users[0].client.rpc('leaderboard_time', { p_month: AUGUST });
    expect(mine(data).map((row) => Number(row.session_count))).toEqual(NAMES.map(() => 2));
  });

  it('numbers the ranks in order', async () => {
    const { data } = await users[0].client.rpc('leaderboard_time', { p_month: AUGUST });
    const rows = mine(data);
    // Ranks are global, so check they ascend rather than pinning to 1..10.
    expect(rows.map((row) => Number(row.rank))).toEqual([...rows.map((row) => Number(row.rank))].sort((a, b) => a - b));
    expect(new Set(rows.map((row) => Number(row.rank))).size).toBe(rows.length);
  });

  it('ranks by completions when asked', async () => {
    const { data, error } = await users[0].client.rpc('leaderboard_completions', {
      p_month: AUGUST,
    });
    expect(error).toBeNull();

    const rows = mine(data);
    expect(rows.map((row) => row.display_name)).toEqual(NAMES);
    expect(rows.map((row) => Number(row.completion_count))).toEqual(COMPLETIONS);
  });

  it('exposes nothing beyond a name, a rank and a total', async () => {
    const { data } = await users[0].client.rpc('leaderboard_time', { p_month: AUGUST });
    const row = mine(data)[0];

    expect(Object.keys(row).sort()).toEqual([
      'display_name',
      'rank',
      'session_count',
      'total_seconds',
      'user_id',
    ]);
    // No email, no task name, no timestamps.
    expect(JSON.stringify(row)).not.toContain('@');
    expect(JSON.stringify(row)).not.toContain('Deep work');
  });

  it('gives every user the same standings', async () => {
    const first = await users[0].client.rpc('leaderboard_time', { p_month: AUGUST });
    const last = await users[9].client.rpc('leaderboard_time', { p_month: AUGUST });

    expect(mine(last.data)).toEqual(mine(first.data));
  });

  it('shares a rank between users on the same total', async () => {
    const tied = users[9];
    // Bring Zara level with Tomas at 10 hours.
    await addSession(tied, taskIds[9], '2026-08-05T09:00:00.000Z', 4 * 3600);

    const { data } = await tied.client.rpc('leaderboard_time', { p_month: AUGUST });
    const rows = mine(data);
    const tomas = rows.find((row) => row.display_name === 'Tomas');
    const zara = rows.find((row) => row.display_name === 'Zara');

    expect(Number(zara?.total_seconds)).toBe(Number(tomas?.total_seconds));
    expect(Number(zara?.rank)).toBe(Number(tomas?.rank));
  });
});

describe.skipIf(!hasCredentials)('leaderboard calendar boundaries', () => {
  const users: TestUser[] = [];
  let user: TestUser;
  let augustTask: string;
  let julyTask: string;
  let decemberTask: string;

  beforeAll(async () => {
    user = await createUser('Boundary');
    users.push(user);

    augustTask = await addTask(user, { month: AUGUST, name: 'August work' });
    julyTask = await addTask(user, { month: JULY, name: 'July work' });
    decemberTask = await addTask(user, { month: '2025-12', name: 'December work' });

    // The first and last instants of August, and the neighbours either side.
    await addSession(user, augustTask, '2026-08-01T00:00:00.000Z', 3600);
    await addSession(user, augustTask, '2026-08-31T23:00:00.000Z', 3599);
    await addSession(user, julyTask, '2026-07-31T22:00:00.000Z', 3600);

    await addCompletion(user, augustTask, '2026-08-01');
    await addCompletion(user, augustTask, '2026-08-31');
    await addCompletion(user, julyTask, '2026-07-31');
  });

  afterAll(async () => {
    await deleteUsers(users);
  });

  const totalFor = async (month: string) => {
    const { data } = await user.client.rpc('leaderboard_time', { p_month: month });
    const row = (data ?? []).find((entry) => entry.user_id === user.id);
    return row ? Number(row.total_seconds) : 0;
  };

  const completionsFor = async (month: string) => {
    const { data } = await user.client.rpc('leaderboard_completions', { p_month: month });
    const row = (data ?? []).find((entry) => entry.user_id === user.id);
    return row ? Number(row.completion_count) : 0;
  };

  it('counts the whole calendar month and nothing outside it', async () => {
    expect(await totalFor(AUGUST)).toBe(3600 + 3599);
    expect(await totalFor(JULY)).toBe(3600);
  });

  it('counts completions on the first and last day of the month', async () => {
    expect(await completionsFor(AUGUST)).toBe(2);
    expect(await completionsFor(JULY)).toBe(1);
  });

  it('crosses the year boundary without leaking into the next year', async () => {
    await addSession(user, decemberTask, '2025-12-31T20:00:00.000Z', 1800);
    await addCompletion(user, decemberTask, '2025-12-31');

    expect(await totalFor('2025-12')).toBe(1800);
    expect(await totalFor('2026-01')).toBe(0);
    expect(await completionsFor('2025-12')).toBe(1);
    expect(await completionsFor('2026-01')).toBe(0);
  });

  it('reports an empty month rather than failing', async () => {
    expect(await totalFor('2026-03')).toBe(0);
    expect(await completionsFor('2026-03')).toBe(0);
  });

  it('falls back to the current month for a malformed key', async () => {
    const { error } = await user.client.rpc('leaderboard_time', { p_month: 'not-a-month' });
    expect(error).toBeNull();
  });
});

describe.skipIf(!hasCredentials)('totals cannot be forged', () => {
  const users: TestUser[] = [];
  let cheat: TestUser;
  let taskId: string;

  beforeAll(async () => {
    cheat = await createUser('Cheater');
    users.push(cheat);
    taskId = await addTask(cheat, { month: AUGUST, name: 'Honest work' });
  });

  afterAll(async () => {
    await deleteUsers(users);
  });

  it('rejects a client-supplied duration', async () => {
    const { error } = await cheat.client.from('time_sessions').insert({
      user_id: cheat.id,
      task_id: taskId,
      start_time: '2026-08-10T09:00:00.000Z',
      end_time: '2026-08-10T10:00:00.000Z',
      // The column is generated; PostgREST refuses to write it.
      duration_seconds: 100000,
    } as never);

    expect(error).not.toBeNull();
  });

  it('derives the duration from the two instants', async () => {
    await addSession(cheat, taskId, '2026-08-11T09:00:00.000Z', 1800);

    const { data } = await cheat.client.from('time_sessions').select('duration_seconds');
    expect(data?.map((row) => row.duration_seconds)).toEqual([1800]);
  });

  it('refuses a session that ends before it starts', async () => {
    const { error } = await cheat.client.from('time_sessions').insert({
      user_id: cheat.id,
      task_id: taskId,
      start_time: '2026-08-12T10:00:00.000Z',
      end_time: '2026-08-12T09:00:00.000Z',
    });

    expect(error).not.toBeNull();
    expect(error?.message).toContain('time_sessions_ordered');
  });

  it('refuses a session longer than a day', async () => {
    const { error } = await cheat.client.from('time_sessions').insert({
      user_id: cheat.id,
      task_id: taskId,
      start_time: '2026-08-13T09:00:00.000Z',
      end_time: '2026-08-15T09:00:00.000Z',
    });

    expect(error).not.toBeNull();
    expect(error?.message).toContain('time_sessions_max_length');
  });

  it('counts a day only once however often it is ticked', async () => {
    await addCompletion(cheat, taskId, '2026-08-14');
    const { error } = await cheat.client
      .from('task_completions')
      .insert({ user_id: cheat.id, task_id: taskId, date: '2026-08-14' });

    expect(error).not.toBeNull();

    const { data } = await cheat.client.rpc('leaderboard_completions', { p_month: AUGUST });
    const row = (data ?? []).find((entry) => entry.user_id === cheat.id);
    expect(Number(row?.completion_count)).toBe(1);
  });
});
