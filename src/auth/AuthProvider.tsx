import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { Session } from '@supabase/supabase-js';
import type { Profile } from '../types';
import type { ProfileRow } from '../types/database';
import { getSupabase, isCloudConfigured, redirectTo } from '../lib/supabase';
import {
  AuthContext,
  MAX_DISPLAY_NAME,
  validateDisplayName,
  type Auth,
  type AuthActions,
  type AuthState,
} from './context';

type ProfileFields = Pick<
  ProfileRow,
  'id' | 'display_name' | 'email' | 'role' | 'disabled_at' | 'created_at'
>;

/**
 * The role arrives from the database with the rest of the row. It is never
 * inferred from the email address, and never read back from anything the
 * browser could have written.
 */
function toProfile(row: ProfileFields): Profile {
  return {
    id: row.id,
    displayName: row.display_name,
    email: row.email,
    role: row.role === 'admin' ? 'admin' : 'user',
    disabledAt: row.disabled_at,
    createdAt: row.created_at,
  };
}

/**
 * Owns the Supabase session and the matching profile row. Everything below it
 * can assume that a `signedIn` state comes with a usable `userId`.
 */
export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [status, setStatus] = useState<AuthState['status']>('loading');
  const [recovering, setRecovering] = useState(false);
  const userId = session?.user.id ?? null;

  // Guards against a slow profile fetch resolving after the user signed out.
  const loadedFor = useRef<string | null>(null);

  useEffect(() => {
    if (!isCloudConfigured) {
      setStatus('signedOut');
      return;
    }
    const supabase = getSupabase();
    let cancelled = false;

    supabase.auth.getSession().then(({ data }) => {
      if (cancelled) return;
      setSession(data.session);
      setStatus(data.session ? 'signedIn' : 'signedOut');
    });

    const { data: subscription } = supabase.auth.onAuthStateChange((event, next) => {
      if (cancelled) return;
      // Supabase reports recovery links as a normal sign-in; without this the
      // user would land on the tracker with no way to set a new password.
      if (event === 'PASSWORD_RECOVERY') setRecovering(true);
      setSession(next);
      setStatus(next ? 'signedIn' : 'signedOut');
      if (!next) setProfile(null);
    });

    return () => {
      cancelled = true;
      subscription.subscription.unsubscribe();
    };
  }, []);

  // Load (or repair) the profile row for the signed-in user.
  useEffect(() => {
    if (!userId || !isCloudConfigured) {
      loadedFor.current = null;
      return;
    }
    if (loadedFor.current === userId) return;
    loadedFor.current = userId;

    const supabase = getSupabase();
    let cancelled = false;

    void (async () => {
      const { data } = await supabase
        .from('profiles')
        .select('id, display_name, email, role, disabled_at, created_at')
        .eq('id', userId)
        .maybeSingle();

      if (cancelled) return;

      if (data) {
        setProfile(toProfile(data));
        return;
      }

      // The database trigger creates this row; this is a fallback for accounts
      // that predate it, so a missing profile never blocks the leaderboard.
      const email = session?.user.email ?? '';
      const fallback = email.split('@')[0] || 'User';
      const { data: created } = await supabase
        .from('profiles')
        .insert({ id: userId, display_name: fallback.slice(0, MAX_DISPLAY_NAME), email })
        .select('id, display_name, email, role, disabled_at, created_at')
        .maybeSingle();

      if (cancelled || !created) return;
      setProfile(toProfile(created));
    })();

    return () => {
      cancelled = true;
    };
  }, [session?.user.email, userId]);

  const signUp = useCallback<AuthActions['signUp']>(async ({ email, password, displayName }) => {
    const { error } = await getSupabase().auth.signUp({
      email: email.trim(),
      password,
      options: {
        // Read by the `handle_new_user` trigger when it provisions the profile.
        data: { display_name: displayName.trim() },
        emailRedirectTo: redirectTo('#/tasks'),
      },
    });
    if (error) throw new Error(error.message);
  }, []);

  const signIn = useCallback<AuthActions['signIn']>(async ({ email, password }) => {
    const { error } = await getSupabase().auth.signInWithPassword({
      email: email.trim(),
      password,
    });
    if (error) throw new Error(error.message);
  }, []);

  const signOut = useCallback(async () => {
    await getSupabase().auth.signOut();
    setProfile(null);
    setRecovering(false);
  }, []);

  const requestPasswordReset = useCallback<AuthActions['requestPasswordReset']>(async (email) => {
    const { error } = await getSupabase().auth.resetPasswordForEmail(email.trim(), {
      redirectTo: redirectTo('#/auth/reset'),
    });
    if (error) throw new Error(error.message);
  }, []);

  const updatePassword = useCallback<AuthActions['updatePassword']>(async (password) => {
    const { error } = await getSupabase().auth.updateUser({ password });
    if (error) throw new Error(error.message);
    setRecovering(false);
  }, []);

  const updateDisplayName = useCallback<AuthActions['updateDisplayName']>(
    async (displayName) => {
      if (!userId) throw new Error('You are not signed in.');
      const problem = validateDisplayName(displayName);
      if (problem) throw new Error(problem);

      const trimmed = displayName.trim();
      const { error } = await getSupabase()
        .from('profiles')
        .update({ display_name: trimmed })
        .eq('id', userId);
      if (error) throw new Error(error.message);

      setProfile((current) => (current ? { ...current, displayName: trimmed } : current));
    },
    [userId],
  );

  const dismissRecovery = useCallback(() => setRecovering(false), []);

  const value = useMemo<Auth>(
    () => ({
      status,
      session,
      profile,
      recovering,
      userId,
      isAdmin: profile?.role === 'admin' && !profile.disabledAt,
      isDisabled: Boolean(profile?.disabledAt),
      signUp,
      signIn,
      signOut,
      requestPasswordReset,
      updatePassword,
      updateDisplayName,
      dismissRecovery,
    }),
    [
      dismissRecovery,
      profile,
      recovering,
      requestPasswordReset,
      session,
      signIn,
      signOut,
      signUp,
      status,
      updateDisplayName,
      updatePassword,
      userId,
    ],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
