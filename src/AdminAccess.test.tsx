import { render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Auth } from './auth/context';
import type { Profile, UserRole } from './types';

/**
 * Who gets to see `#/admin`.
 *
 * These cover the *first* of the three gates: what the app renders. They are
 * deliberately not the proof that the panel is safe — a determined visitor can
 * edit any of this in a debugger. The proof is in `supabase/tests/admin.test.ts`,
 * which asks the database the same questions with a real anon key.
 */

const rpcCalls: string[] = [];

function queryStub() {
  const settled = Promise.resolve({ data: [], error: null });
  const builder: Record<string, unknown> = {};
  for (const method of [
    'select', 'eq', 'in', 'order', 'limit', 'insert', 'update', 'delete', 'upsert',
    'maybeSingle', 'single',
  ]) {
    builder[method] = () => builder;
  }
  builder.then = settled.then.bind(settled);
  return builder;
}

vi.mock('./lib/supabase', () => {
  const channel: Record<string, unknown> = {};
  channel.on = () => channel;
  channel.subscribe = () => channel;
  channel.send = () => Promise.resolve('ok');

  return {
    isCloudConfigured: true,
    redirectTo: (hash: string) => hash,
    getSupabase: () => ({
      from: () => queryStub(),
      rpc: (fn: string) => {
        rpcCalls.push(fn);
        return Promise.resolve({ data: fn === 'registration_enabled' ? true : [], error: null });
      },
      channel: () => channel,
      removeChannel: () => Promise.resolve('ok'),
    }),
  };
});

const { default: App } = await import('./App');
const { AuthContext } = await import('./auth/context');

function authFor(role: UserRole | null): Auth {
  const profile: Profile | null =
    role === null
      ? null
      : {
          id: 'user-1',
          displayName: 'Islom',
          email: 'islom@example.com',
          role,
          disabledAt: null,
          createdAt: '2026-01-01T00:00:00.000Z',
        };

  return {
    status: role === null ? 'signedOut' : 'signedIn',
    session: role === null ? null : ({ user: { id: 'user-1' } } as Auth['session']),
    profile,
    recovering: false,
    userId: role === null ? null : 'user-1',
    isAdmin: role === 'admin',
    isDisabled: false,
    signUp: vi.fn(),
    signIn: vi.fn(),
    signOut: vi.fn(),
    requestPasswordReset: vi.fn(),
    updatePassword: vi.fn(),
    updateDisplayName: vi.fn(),
    dismissRecovery: vi.fn(),
  };
}

const renderAt = (hash: string, role: UserRole | null) => {
  location.hash = hash;
  return render(<AuthContext.Provider value={authFor(role)}>
    <App />
  </AuthContext.Provider>);
};

describe('access to /admin', () => {
  beforeEach(() => {
    rpcCalls.length = 0;
  });

  afterEach(() => {
    location.hash = '';
  });

  it('sends an unauthenticated visitor to the sign-in screen', async () => {
    renderAt('#/admin', null);

    // The tracker is never rendered while signed out, on any route.
    expect(await screen.findByRole('heading', { name: 'Sign in' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Admin' })).not.toBeInTheDocument();
    expect(rpcCalls).not.toContain('admin_stats');
  });

  it('shows a normal user a forbidden state and asks the database for nothing', async () => {
    renderAt('#/admin', 'user');

    expect(await screen.findByRole('heading', { name: 'Forbidden' })).toBeInTheDocument();
    expect(screen.getByRole('alert')).toHaveTextContent(/not an administrator/i);
    expect(screen.queryByRole('heading', { name: 'Overview' })).not.toBeInTheDocument();

    // No admin query is even attempted — and if one were, the database would
    // refuse it.
    await waitFor(() => expect(rpcCalls).not.toContain('admin_stats'));
    expect(rpcCalls).not.toContain('admin_list_users');
    expect(rpcCalls).not.toContain('admin_note_session');
  });

  it('hides the Admin nav item from a normal user', async () => {
    renderAt('#/tasks', 'user');

    const nav = await screen.findByRole('navigation', { name: 'Sections' });
    expect(within(nav).queryByRole('link', { name: 'Admin' })).not.toBeInTheDocument();
    for (const label of ['Tasks', 'Time Tracker', 'Reports', 'Leaderboard']) {
      expect(within(nav).getByRole('link', { name: label })).toBeInTheDocument();
    }
  });

  it('lets an administrator in, and shows them the Admin nav item', async () => {
    renderAt('#/admin', 'admin');

    expect(await screen.findByRole('heading', { name: 'Admin' })).toBeInTheDocument();
    expect(await screen.findByRole('heading', { name: 'Overview' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Forbidden' })).not.toBeInTheDocument();

    const nav = screen.getByRole('navigation', { name: 'Sections' });
    expect(within(nav).getByRole('link', { name: 'Admin' })).toBeInTheDocument();
    for (const label of ['Tasks', 'Time Tracker', 'Reports', 'Leaderboard']) {
      expect(within(nav).getByRole('link', { name: label })).toBeInTheDocument();
    }

    await waitFor(() => expect(rpcCalls).toContain('admin_stats'));
    expect(rpcCalls).toContain('admin_note_session');
  });
});
