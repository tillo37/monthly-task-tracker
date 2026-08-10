import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '../types/database';

/**
 * The Supabase connection.
 *
 * Only the URL and the anon (publishable) key ever reach the browser — both are
 * public by design, and every table they can touch is guarded by Row Level
 * Security. A service-role key must never appear in this file or in any `VITE_`
 * variable, because Vite inlines those into the built bundle.
 */

const url = import.meta.env.VITE_SUPABASE_URL?.trim() ?? '';
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY?.trim() ?? '';

/**
 * Whether the app has cloud credentials. When it does not, the tracker falls
 * back to the local-only mode it shipped with rather than showing a broken
 * sign-in screen.
 */
export const isCloudConfigured = Boolean(url && anonKey);

export type TrackerClient = SupabaseClient<Database>;

let client: TrackerClient | null = null;

/** The shared client, created lazily so local-only mode never needs one. */
export function getSupabase(): TrackerClient {
  if (!isCloudConfigured) {
    throw new Error(
      'Supabase is not configured. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.',
    );
  }
  client ??= createClient<Database>(url, anonKey, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      // The reset-password link arrives as a URL fragment, which is also where
      // this app keeps its routes; supabase-js consumes it before we route.
      detectSessionInUrl: true,
      flowType: 'pkce',
    },
  });
  return client;
}

/** Where Supabase should send the user back to after an email link. */
export function redirectTo(hash: string): string {
  if (typeof location === 'undefined') return hash;
  return `${location.origin}${location.pathname}${hash}`;
}
