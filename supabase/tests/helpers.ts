import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '../../src/types/database';

/**
 * Test harness for the real database.
 *
 * Every client here is a *user* client holding a real JWT — never the service
 * role — because a policy that only holds for a privileged connection is not a
 * policy. The service-role client is used solely to create accounts and to
 * clean up between suites.
 */

const url = process.env.SUPABASE_URL ?? 'http://127.0.0.1:54321';
const anonKey = process.env.SUPABASE_ANON_KEY ?? '';
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';

export const hasCredentials = Boolean(anonKey && serviceKey);

export type Client = SupabaseClient<Database>;

export function serviceClient(): Client {
  return createClient<Database>(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export interface TestUser {
  id: string;
  email: string;
  displayName: string;
  /** Authenticated as this user; subject to exactly the policies a browser is. */
  client: Client;
}

let counter = 0;

/** Creates a confirmed account and returns a client signed in as it. */
export async function createUser(displayName: string): Promise<TestUser> {
  const admin = serviceClient();
  const email = `test-${Date.now()}-${counter++}@example.com`;
  const password = 'correct horse battery staple';

  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { display_name: displayName },
  });
  if (error || !data.user) throw new Error(`Could not create ${displayName}: ${error?.message}`);

  const client = createClient<Database>(url, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const signIn = await client.auth.signInWithPassword({ email, password });
  if (signIn.error) throw new Error(`Could not sign in ${displayName}: ${signIn.error.message}`);

  return { id: data.user.id, email, displayName, client };
}

/** Removes every account created by a suite, cascading away all their rows. */
export async function deleteUsers(users: TestUser[]): Promise<void> {
  const admin = serviceClient();
  for (const user of users) {
    await admin.auth.admin.deleteUser(user.id);
  }
}

/** An anonymous client, for checking what a signed-out visitor can reach. */
export function anonymousClient(): Client {
  return createClient<Database>(url, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export interface SeedTask {
  month: string;
  name: string;
  target?: number;
}

/** Inserts a task as the user themselves and returns its id. */
export async function addTask(user: TestUser, task: SeedTask): Promise<string> {
  const { data, error } = await user.client
    .from('tasks')
    .insert({
      user_id: user.id,
      month: task.month,
      name: task.name,
      target: task.target ?? 10,
      color: '#6366f1',
      icon: 'target',
    })
    .select('id')
    .single();

  if (error || !data) throw new Error(`Could not add task: ${error?.message}`);
  return data.id;
}

/** Records a session of `seconds` starting at `startsAt`. */
export async function addSession(
  user: TestUser,
  taskId: string,
  startsAt: string,
  seconds: number,
): Promise<void> {
  const start = new Date(startsAt);
  const end = new Date(start.getTime() + seconds * 1000);

  const { error } = await user.client.from('time_sessions').insert({
    user_id: user.id,
    task_id: taskId,
    start_time: start.toISOString(),
    end_time: end.toISOString(),
  });
  if (error) throw new Error(`Could not add session: ${error.message}`);
}

export async function addCompletion(
  user: TestUser,
  taskId: string,
  date: string,
): Promise<void> {
  const { error } = await user.client
    .from('task_completions')
    .insert({ user_id: user.id, task_id: taskId, date });
  if (error) throw new Error(`Could not add completion: ${error.message}`);
}
