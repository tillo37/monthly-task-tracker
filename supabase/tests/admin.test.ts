import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  addCompletion,
  addSession,
  addTask,
  anonymousClient,
  createUser,
  deleteUsers,
  hasCredentials,
  makeAdmin,
  type TestUser,
} from './helpers';

/**
 * The Admin Panel, checked where it actually lives.
 *
 * Every client below holds a real user JWT and the public anon key — the same
 * two things a browser has. Nothing here renders a component, because the
 * question is not what the app draws: it is what Postgres answers when someone
 * asks for something that is not theirs. A hidden button proves nothing.
 *
 * The suite expects a database with no administrator of its own, which is what
 * `npm run supabase:reset` gives you; it creates its own and removes them again.
 */

/** PostgREST hands back `{ data: null, error }` — this is the shape of a refusal. */
const wasRefused = (result: { error: { message: string } | null }) => {
  expect(result.error).not.toBeNull();
  return result.error!.message;
};

/**
 * The role as the database holds it, read back through an administrator rather
 * than through the service role: the service key bypasses everything, so an
 * assertion made with it would prove nothing about the policies.
 */
async function roleOf(admin: TestUser, userId: string): Promise<string | undefined> {
  const { data } = await admin.client.from('profiles').select('role').eq('id', userId).maybeSingle();
  return data?.role;
}

describe.skipIf(!hasCredentials)('admin panel', () => {
  let owner: TestUser; // the bootstrapped administrator
  let second: TestUser; // promoted and demoted during the role tests
  let mallory: TestUser; // an ordinary user who tries things
  let ownerTask: string;
  let malloryTask: string;

  beforeAll(async () => {
    owner = await createUser('Owner');
    second = await createUser('Second');
    mallory = await createUser('Mallory');

    ownerTask = await addTask(owner, { month: '2026-08', name: "Owner's habit" });
    malloryTask = await addTask(mallory, { month: '2026-08', name: "Mallory's private habit" });

    await addSession(owner, ownerTask, '2026-08-03T09:00:00.000Z', 3600);
    await addCompletion(owner, ownerTask, '2026-08-03');
    await addSession(mallory, malloryTask, '2026-08-04T09:00:00.000Z', 1800);

    await makeAdmin(owner);
  });

  afterAll(async () => {
    await deleteUsers([owner, second, mallory]);
  });

  // -------------------------------------------------------------------------
  // What a normal user can reach
  // -------------------------------------------------------------------------

  describe('a normal authenticated user', () => {
    it('cannot call any admin function', async () => {
      for (const call of [
        mallory.client.rpc('admin_stats'),
        mallory.client.rpc('admin_list_users', { p_search: null, p_limit: 25, p_offset: 0 }),
        mallory.client.rpc('admin_recent_activity', { p_limit: 5 }),
        mallory.client.rpc('admin_user_detail', { p_user_id: owner.id }),
        mallory.client.rpc('admin_user_activity', { p_user_id: owner.id, p_months: 3 }),
      ]) {
        expect(wasRefused(await call)).toMatch(/administrator privileges required/i);
      }
    });

    it('cannot read admin-only tables', async () => {
      const settings = await mallory.client.from('app_settings').select('*');
      expect(settings.data ?? []).toEqual([]);

      const log = await mallory.client.from('admin_audit_log').select('*');
      expect(log.data ?? []).toEqual([]);
    });

    it('cannot promote themselves', async () => {
      // Exactly the request a hostile client would send: the column is not in
      // the generated Update type, so this has to be cast to express it at all.
      const result = await (mallory.client.from('profiles') as never as {
        update(patch: { role: string }): {
          eq(column: string, value: string): Promise<{ error: { message: string } | null }>;
        };
      })
        .update({ role: 'admin' })
        .eq('id', mallory.id);

      expect(wasRefused(result)).toBeTruthy();
      expect(await roleOf(owner, mallory.id)).toBe('user');
    });

    it('cannot change anybody else\'s role', async () => {
      const result = await (mallory.client.from('profiles') as never as {
        update(patch: { role: string }): {
          eq(column: string, value: string): Promise<{ error: { message: string } | null }>;
        };
      })
        .update({ role: 'user' })
        .eq('id', owner.id);

      expect(result.error).not.toBeNull();
      expect(await roleOf(owner, owner.id)).toBe('admin');
    });

    it('cannot use the admin functions to change a role either', async () => {
      expect(
        wasRefused(
          await mallory.client.rpc('admin_set_role', { p_user_id: mallory.id, p_role: 'admin' }),
        ),
      ).toMatch(/administrator privileges required/i);
    });

    it('still cannot read another user\'s tasks', async () => {
      const { data } = await mallory.client.from('tasks').select('*').eq('user_id', owner.id);
      expect(data).toEqual([]);
    });

    it('still cannot read another user\'s time sessions', async () => {
      const { data } = await mallory.client
        .from('time_sessions')
        .select('*')
        .eq('user_id', owner.id);
      expect(data).toEqual([]);
    });

    it('cannot write to the audit log', async () => {
      const table = mallory.client.from('admin_audit_log') as never as {
        insert(row: Record<string, unknown>): Promise<{ error: { message: string } | null }>;
        update(row: Record<string, unknown>): {
          neq(column: string, value: string): Promise<{ error: { message: string } | null }>;
        };
        delete(): {
          neq(column: string, value: string): Promise<{ error: { message: string } | null }>;
        };
      };

      expect(
        (await table.insert({ action: 'role.changed', admin_email: 'mallory@example.com' })).error,
      ).not.toBeNull();
      expect(
        (await table.update({ action: 'nothing happened' }).neq('action', '')).error,
      ).not.toBeNull();
      expect((await table.delete().neq('action', '')).error).not.toBeNull();

      // And the entries are all still there.
      const { data } = await owner.client.from('admin_audit_log').select('id');
      expect((data ?? []).length).toBeGreaterThan(0);
    });

    it('cannot change a system setting', async () => {
      expect(
        wasRefused(
          await mallory.client.rpc('admin_set_registration_enabled', { p_enabled: false }),
        ),
      ).toMatch(/administrator privileges required/i);
    });
  });

  describe('a signed-out visitor', () => {
    it('cannot call the admin functions at all', async () => {
      const anon = anonymousClient();
      // No grant to `anon`, so this fails before any check inside the function.
      expect((await anon.rpc('admin_stats')).error).not.toBeNull();
      expect((await anon.from('admin_audit_log').select('*')).data ?? []).toEqual([]);
    });
  });

  // -------------------------------------------------------------------------
  // What an administrator can reach
  // -------------------------------------------------------------------------

  describe('an administrator', () => {
    it('can read system statistics, aggregated in the database', async () => {
      const { data, error } = await owner.client.rpc('admin_stats');
      expect(error).toBeNull();

      const stats = data![0];
      expect(Number(stats.total_users)).toBeGreaterThanOrEqual(3);
      expect(Number(stats.admin_count)).toBe(1);
      // 3600 from the owner plus 1800 from Mallory, at least.
      expect(Number(stats.total_seconds)).toBeGreaterThanOrEqual(5400);
      expect(Number(stats.total_sessions)).toBeGreaterThanOrEqual(2);
      expect(Number(stats.total_completions)).toBeGreaterThanOrEqual(1);
    });

    it('can search users and see their totals without their history', async () => {
      const { data, error } = await owner.client.rpc('admin_list_users', {
        p_search: 'Mallory',
        p_limit: 25,
        p_offset: 0,
      });
      expect(error).toBeNull();
      expect(data).toHaveLength(1);

      const row = data![0];
      expect(row.display_name).toBe('Mallory');
      expect(row.email).toBe(mallory.email);
      expect(row.role).toBe('user');
      expect(Number(row.total_seconds)).toBe(1800);
      expect(Number(row.session_count)).toBe(1);
      expect(Number(row.task_count)).toBe(1);
      // Aggregates only — no task name, no session, no date.
      expect(Object.keys(row)).not.toContain('name');
      expect(JSON.stringify(row)).not.toContain("Mallory's private habit");
    });

    it('can read one user\'s aggregate detail', async () => {
      const { data, error } = await owner.client.rpc('admin_user_detail', {
        p_user_id: mallory.id,
      });
      expect(error).toBeNull();

      const detail = data![0];
      expect(detail.display_name).toBe('Mallory');
      expect(Number(detail.total_seconds)).toBe(1800);
      expect(Number(detail.completion_count)).toBe(0);
      expect(detail.created_at).toBeTruthy();
      expect(detail.last_active_at).toBeTruthy();
    });

    it('can see monthly activity for a user', async () => {
      const { data, error } = await owner.client.rpc('admin_user_activity', {
        p_user_id: mallory.id,
        p_months: 12,
      });
      expect(error).toBeNull();
      expect((data ?? []).length).toBe(12);
    });

    it('can read the audit log', async () => {
      const { data, error } = await owner.client.from('admin_audit_log').select('*');
      expect(error).toBeNull();
      // The bootstrap wrote the first entry.
      expect((data ?? []).some((row) => row.action === 'role.changed')).toBe(true);
      // And nothing resembling a secret is in it.
      expect(JSON.stringify(data)).not.toMatch(/password|access_token|refresh_token|secret/i);
    });

    it('cannot rewrite the audit log either', async () => {
      const table = owner.client.from('admin_audit_log') as never as {
        delete(): {
          neq(column: string, value: string): Promise<{ error: { message: string } | null }>;
        };
      };
      expect((await table.delete().neq('action', '')).error).not.toBeNull();
    });

    it('can promote and demote another account', async () => {
      expect(
        (await owner.client.rpc('admin_set_role', { p_user_id: second.id, p_role: 'admin' })).error,
      ).toBeNull();

      // The newly promoted admin really is one, as far as the database is
      // concerned — the proof is that admin-only data now answers them.
      const asSecond = await second.client.rpc('admin_stats');
      expect(asSecond.error).toBeNull();
      expect(Number(asSecond.data![0].admin_count)).toBe(2);

      expect(
        (await owner.client.rpc('admin_set_role', { p_user_id: second.id, p_role: 'user' })).error,
      ).toBeNull();

      // And the demotion takes effect immediately, without a new token.
      expect(wasRefused(await second.client.rpc('admin_stats'))).toMatch(
        /administrator privileges required/i,
      );
    });

    it('writes every role change to the audit log', async () => {
      const { data } = await owner.client
        .from('admin_audit_log')
        .select('*')
        .eq('action', 'role.changed')
        .eq('target_user_id', second.id);

      expect((data ?? []).length).toBe(2);
      expect(data!.map((row) => row.metadata.to).sort()).toEqual(['admin', 'user']);
      expect(data![0].admin_email).toBe(owner.email);
    });
  });

  // -------------------------------------------------------------------------
  // Safeguards
  // -------------------------------------------------------------------------

  describe('the last administrator', () => {
    it('is the only admin at this point', async () => {
      const { data } = await owner.client.rpc('admin_stats');
      expect(Number(data![0].admin_count)).toBe(1);
    });

    it('cannot remove their own admin role', async () => {
      expect(
        wasRefused(await owner.client.rpc('admin_set_role', { p_user_id: owner.id, p_role: 'user' })),
      ).toMatch(/last administrator cannot be demoted/i);
      expect(await roleOf(owner, owner.id)).toBe('admin');
    });

    it('cannot be deleted through the admin panel', async () => {
      expect(wasRefused(await owner.client.rpc('admin_delete_user', { p_user_id: owner.id })))
        .toMatch(/your own account/i);

      // Nor by a second administrator, while they are the last one left.
      await owner.client.rpc('admin_set_role', { p_user_id: second.id, p_role: 'admin' });
      await second.client.rpc('admin_set_role', { p_user_id: owner.id, p_role: 'user' });

      expect(wasRefused(await owner.client.rpc('admin_delete_user', { p_user_id: second.id })))
        .toMatch(/administrator privileges required/i);
      expect(wasRefused(await second.client.rpc('admin_delete_user', { p_user_id: second.id })))
        .toMatch(/your own account/i);

      // Put the owner back, and leave them the only admin again.
      await second.client.rpc('admin_set_role', { p_user_id: owner.id, p_role: 'admin' });
      await owner.client.rpc('admin_set_role', { p_user_id: second.id, p_role: 'user' });

      const { data } = await owner.client.rpc('admin_stats');
      expect(Number(data![0].admin_count)).toBe(1);
    });
  });

  // -------------------------------------------------------------------------
  // Disable, delete and settings
  // -------------------------------------------------------------------------

  describe('disabling an account', () => {
    it('locks the user out of their own rows and lets them back in again', async () => {
      expect(
        (await owner.client.rpc('admin_set_disabled', { p_user_id: mallory.id, p_disabled: true }))
          .error,
      ).toBeNull();

      // Restrictive policies bite straight away, on the existing token.
      const locked = await mallory.client.from('tasks').select('*');
      expect(locked.data ?? []).toEqual([]);
      const write = await mallory.client
        .from('tasks')
        .insert({
          user_id: mallory.id,
          month: '2026-08',
          name: 'while disabled',
          target: 1,
          color: '#6366f1',
          icon: 'target',
        });
      expect(write.error).not.toBeNull();

      // Their data is not destroyed, only unreachable by them.
      const { data: kept } = await owner.client.rpc('admin_user_detail', {
        p_user_id: mallory.id,
      });
      expect(Number(kept![0].task_count)).toBe(1);
      expect(kept![0].disabled_at).not.toBeNull();

      expect(
        (await owner.client.rpc('admin_set_disabled', { p_user_id: mallory.id, p_disabled: false }))
          .error,
      ).toBeNull();

      const restored = await mallory.client.from('tasks').select('*');
      expect(restored.data).toHaveLength(1);
    });

    it('is recorded in the audit log', async () => {
      const { data } = await owner.client
        .from('admin_audit_log')
        .select('action')
        .eq('target_user_id', mallory.id)
        .in('action', ['user.disabled', 'user.enabled']);

      expect((data ?? []).map((row) => row.action).sort()).toEqual([
        'user.disabled',
        'user.enabled',
      ]);
    });
  });

  describe('deleting an account', () => {
    it('takes every row it owns with it and leaves the log intact', async () => {
      const victim = await createUser('Victim');
      const task = await addTask(victim, { month: '2026-08', name: 'Doomed' });
      await addSession(victim, task, '2026-08-05T09:00:00.000Z', 600);
      await addCompletion(victim, task, '2026-08-05');

      expect((await owner.client.rpc('admin_delete_user', { p_user_id: victim.id })).error)
        .toBeNull();

      // Read as the administrator, who has an explicit SELECT policy on each
      // of these tables — so an empty result really means the rows are gone.
      for (const table of ['profiles', 'tasks', 'task_completions', 'time_sessions'] as const) {
        const column = table === 'profiles' ? 'id' : 'user_id';
        const { data } = await owner.client.from(table).select('*').eq(column, victim.id);
        expect(data ?? []).toEqual([]);
      }

      // The audit entry survives the account it describes.
      const { data: log } = await owner.client
        .from('admin_audit_log')
        .select('*')
        .eq('action', 'user.deleted');
      const entry = log!.find((row) => row.metadata.email === victim.email);
      expect(entry).toBeDefined();
      // The foreign key nulled the id, which is why the email is copied in.
      expect(entry!.target_user_id).toBeNull();
    });
  });

  describe('the registration setting', () => {
    it('blocks new accounts while it is off, and lets existing users sign in', async () => {
      expect(
        (await owner.client.rpc('admin_set_registration_enabled', { p_enabled: false })).error,
      ).toBeNull();

      try {
        expect(await owner.client.rpc('registration_enabled').then((r) => r.data)).toBe(false);

        const anon = anonymousClient();
        const signUp = await anon.auth.signUp({
          email: `blocked-${Date.now()}@example.com`,
          password: 'correct horse battery staple',
        });
        expect(signUp.error).not.toBeNull();

        // An existing account is unaffected.
        const signIn = await anon.auth.signInWithPassword({
          email: mallory.email,
          password: 'correct horse battery staple',
        });
        expect(signIn.error).toBeNull();
      } finally {
        await owner.client.rpc('admin_set_registration_enabled', { p_enabled: true });
      }

      expect(await owner.client.rpc('registration_enabled').then((r) => r.data)).toBe(true);
    });
  });

  // -------------------------------------------------------------------------
  // The public leaderboard is unchanged
  // -------------------------------------------------------------------------

  describe('the public leaderboard', () => {
    it('still exposes only rank, display name and aggregates', async () => {
      const { data, error } = await mallory.client.rpc('leaderboard_time', { p_month: '2026-08' });
      expect(error).toBeNull();

      const row = data![0];
      expect(Object.keys(row).sort()).toEqual([
        'display_name',
        'rank',
        'session_count',
        'total_seconds',
        'user_id',
      ]);

      const serialised = JSON.stringify(data);
      expect(serialised).not.toContain(owner.email);
      expect(serialised).not.toContain(mallory.email);
      expect(serialised).not.toContain('@example.com');
      // No role, and no account status, leaks through the board.
      expect(serialised).not.toContain('admin');
      expect(serialised).not.toContain('disabled');
    });

    it('says nothing about who is an administrator', async () => {
      const { data } = await mallory.client.rpc('leaderboard_completions', { p_month: '2026-08' });
      expect(JSON.stringify(data)).not.toContain('role');
    });
  });
});
