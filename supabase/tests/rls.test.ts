import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  addCompletion,
  addSession,
  addTask,
  anonymousClient,
  createUser,
  deleteUsers,
  hasCredentials,
  type TestUser,
} from './helpers';

/**
 * Ownership, checked from the outside.
 *
 * These run as real signed-in users against real policies. Hiding a button is
 * not security; the only question that matters is what the database returns
 * when someone asks for a row that is not theirs.
 */

describe.skipIf(!hasCredentials)('row level security', () => {
  let alice: TestUser;
  let bob: TestUser;
  let aliceTask: string;
  let bobTask: string;
  let aliceSession: string;

  beforeAll(async () => {
    alice = await createUser('Alice');
    bob = await createUser('Bob');

    aliceTask = await addTask(alice, { month: '2026-08', name: "Alice's private habit" });
    bobTask = await addTask(bob, { month: '2026-08', name: "Bob's private habit" });

    await addCompletion(alice, aliceTask, '2026-08-03');
    await addSession(alice, aliceTask, '2026-08-03T09:00:00.000Z', 3600);

    const { data } = await alice.client.from('time_sessions').select('id').single();
    aliceSession = data!.id;
  });

  afterAll(async () => {
    await deleteUsers([alice, bob]);
  });

  describe('tasks', () => {
    it('a user reads only their own', async () => {
      const { data } = await bob.client.from('tasks').select('*');
      expect(data?.map((row) => row.name)).toEqual(["Bob's private habit"]);
    });

    it('selecting another user\'s task by id returns nothing, in both directions', async () => {
      const { data, error } = await bob.client.from('tasks').select('*').eq('id', aliceTask);
      expect(error).toBeNull();
      // Not a permission error — the row simply does not exist for Bob.
      expect(data).toEqual([]);

      // Isolation is not one-sided: the first account is no more privileged.
      const reverse = await alice.client.from('tasks').select('*').eq('id', bobTask);
      expect(reverse.error).toBeNull();
      expect(reverse.data).toEqual([]);
    });

    it('updating another user\'s task changes nothing', async () => {
      const { data } = await bob.client
        .from('tasks')
        .update({ name: 'hijacked' })
        .eq('id', aliceTask)
        .select();
      expect(data).toEqual([]);

      const { data: after } = await alice.client.from('tasks').select('name').eq('id', aliceTask);
      expect(after?.[0].name).toBe("Alice's private habit");
    });

    it('deleting another user\'s task removes nothing', async () => {
      await bob.client.from('tasks').delete().eq('id', aliceTask);

      const { data } = await alice.client.from('tasks').select('id').eq('id', aliceTask);
      expect(data).toHaveLength(1);
    });

    it('a task cannot be inserted on behalf of someone else', async () => {
      const { error } = await bob.client.from('tasks').insert({
        user_id: alice.id,
        month: '2026-08',
        name: 'planted',
        target: 5,
        color: '#6366f1',
        icon: 'target',
      });

      expect(error).not.toBeNull();
      const { data } = await alice.client.from('tasks').select('name').eq('name', 'planted');
      expect(data).toEqual([]);
    });
  });

  describe('time sessions', () => {
    it('a user reads only their own', async () => {
      const { data } = await bob.client.from('time_sessions').select('*');
      expect(data).toEqual([]);
    });

    it('another user cannot delete them', async () => {
      await bob.client.from('time_sessions').delete().eq('id', aliceSession);

      const { data } = await alice.client.from('time_sessions').select('id');
      expect(data).toHaveLength(1);
    });

    it('another user cannot lengthen them', async () => {
      const { data } = await bob.client
        .from('time_sessions')
        .update({ end_time: '2027-01-01T00:00:00.000Z' })
        .eq('id', aliceSession)
        .select();
      expect(data).toEqual([]);

      const { data: after } = await alice.client
        .from('time_sessions')
        .select('duration_seconds')
        .eq('id', aliceSession);
      expect(after?.[0].duration_seconds).toBe(3600);
    });

    it('a session cannot be attached to another user\'s task', async () => {
      // Bob owns the row, so RLS is satisfied — the ownership trigger is what
      // stops him pointing it at Alice's task.
      const { error } = await bob.client.from('time_sessions').insert({
        user_id: bob.id,
        task_id: aliceTask,
        start_time: '2026-08-04T09:00:00.000Z',
        end_time: '2026-08-04T10:00:00.000Z',
      });

      expect(error).not.toBeNull();
      expect(error?.message).toContain('belongs to a different user');
    });
  });

  describe('completions', () => {
    it('a user reads only their own', async () => {
      const { data } = await bob.client.from('task_completions').select('*');
      expect(data).toEqual([]);
    });

    it('another user cannot tick a day on someone else\'s task', async () => {
      const { error } = await bob.client
        .from('task_completions')
        .insert({ user_id: bob.id, task_id: aliceTask, date: '2026-08-05' });

      expect(error).not.toBeNull();
    });

    it('another user cannot delete a completion', async () => {
      await bob.client.from('task_completions').delete().eq('task_id', aliceTask);

      const { data } = await alice.client.from('task_completions').select('date');
      expect(data?.map((row) => row.date)).toEqual(['2026-08-03']);
    });
  });

  describe('active timers', () => {
    beforeAll(async () => {
      await alice.client.rpc('start_timer', { p_task_id: aliceTask, p_month: '2026-08' });
    });

    it('are invisible to everyone else', async () => {
      const { data } = await bob.client.from('active_timers').select('*');
      expect(data).toEqual([]);
    });

    it('cannot be stopped by anyone else', async () => {
      await bob.client.from('active_timers').delete().eq('user_id', alice.id);

      const { data } = await alice.client.from('active_timers').select('user_id');
      expect(data).toHaveLength(1);
    });

    it('are limited to one per user', async () => {
      const second = await addTask(alice, { month: '2026-08', name: 'Second habit' });
      await alice.client.rpc('start_timer', { p_task_id: second, p_month: '2026-08' });

      const { data } = await alice.client.from('active_timers').select('task_id');
      expect(data).toHaveLength(1);
      // Starting a new one replaces the old rather than running two.
      expect(data?.[0].task_id).toBe(second);

      await alice.client.from('active_timers').delete().eq('user_id', alice.id);
      await alice.client.from('tasks').delete().eq('id', second);
    });
  });

  describe('profiles', () => {
    it('a user reads only their own row, so emails stay private', async () => {
      const { data } = await bob.client.from('profiles').select('*');

      expect(data).toHaveLength(1);
      expect(data?.[0].id).toBe(bob.id);
      expect(data?.map((row) => row.email)).not.toContain(alice.email);
    });

    it('another user cannot rename you', async () => {
      const { data } = await bob.client
        .from('profiles')
        .update({ display_name: 'Impostor' })
        .eq('id', alice.id)
        .select();
      expect(data).toEqual([]);

      const { data: after } = await alice.client.from('profiles').select('display_name');
      expect(after?.[0].display_name).toBe('Alice');
    });

    it('a user can rename themselves', async () => {
      const { error } = await alice.client
        .from('profiles')
        .update({ display_name: 'Alice A.' })
        .eq('id', alice.id);
      expect(error).toBeNull();

      const { data } = await alice.client.from('profiles').select('display_name');
      expect(data?.[0].display_name).toBe('Alice A.');

      await alice.client.from('profiles').update({ display_name: 'Alice' }).eq('id', alice.id);
    });
  });

  describe('signed-out visitors', () => {
    it('read nothing at all', async () => {
      const anon = anonymousClient();

      for (const table of ['tasks', 'task_completions', 'time_sessions', 'active_timers', 'profiles'] as const) {
        const { data } = await anon.from(table).select('*');
        expect(data ?? []).toEqual([]);
      }
    });

    it('cannot read the leaderboard', async () => {
      const anon = anonymousClient();
      const { error } = await anon.rpc('leaderboard_time', { p_month: '2026-08' });
      expect(error).not.toBeNull();
    });
  });
});
