import { createContext, useContext } from 'react';
import type { Session } from '@supabase/supabase-js';
import type { Profile } from '../types';

/**
 * The authentication contract and its shared validation, kept apart from the
 * provider component so both can be imported without dragging the other in.
 */

/** What the app knows about the current viewer. */
export interface AuthState {
  /** `loading` until the stored session has been checked. */
  status: 'loading' | 'signedOut' | 'signedIn';
  session: Session | null;
  profile: Profile | null;
  /** True once a password-recovery link has been followed. */
  recovering: boolean;
}

export interface AuthActions {
  signUp(input: { email: string; password: string; displayName: string }): Promise<void>;
  signIn(input: { email: string; password: string }): Promise<void>;
  signOut(): Promise<void>;
  requestPasswordReset(email: string): Promise<void>;
  updatePassword(password: string): Promise<void>;
  updateDisplayName(displayName: string): Promise<void>;
  dismissRecovery(): void;
}

export type Auth = AuthState &
  AuthActions & {
    userId: string | null;
    /**
     * Whether to *offer* the Admin Panel. It mirrors `profiles.role`, which the
     * client cannot write. Every admin query is authorised again in Postgres,
     * so flipping this in a debugger changes what is drawn and nothing else.
     */
    isAdmin: boolean;
    /** True while the account is locked out by an administrator. */
    isDisabled: boolean;
  };

export const AuthContext = createContext<Auth | null>(null);

export const MAX_DISPLAY_NAME = 40;

/** The shortest password Supabase is configured to accept. */
export const MIN_PASSWORD_LENGTH = 8;

/** Shared validation so the form and the write path agree. */
export function validateDisplayName(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) return 'Display name is required.';
  if (trimmed.length > MAX_DISPLAY_NAME) {
    return `Keep the display name under ${MAX_DISPLAY_NAME} characters.`;
  }
  return null;
}

export function validateEmail(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) return 'Email is required.';
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) return 'Enter a valid email address.';
  return null;
}

export function validatePassword(value: string): string | null {
  if (!value) return 'Password is required.';
  if (value.length < MIN_PASSWORD_LENGTH) {
    return `Use at least ${MIN_PASSWORD_LENGTH} characters.`;
  }
  return null;
}

export function useAuth(): Auth {
  const value = useOptionalAuth();
  if (!value) throw new Error('useAuth must be used inside an AuthProvider.');
  return value;
}

/**
 * For the parts of the tree that also run without accounts — the local-only
 * build and the `?demo` mode, neither of which mounts a provider.
 */
export function useOptionalAuth(): Auth | null {
  return useContext(AuthContext);
}
