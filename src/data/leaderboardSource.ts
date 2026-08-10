import type { MonthKey } from '../lib/date';
import type { LeaderboardEntry, LeaderboardMetric } from '../lib/leaderboard';
import type { TrackerClient } from '../lib/supabase';

/**
 * Reading the leaderboard.
 *
 * Totals are never sent up from a browser and never computed in one: the two
 * RPCs aggregate `time_sessions.duration_seconds` (a generated column) and
 * `task_completions` inside Postgres and return one row per user. The browser
 * receives a handful of rows for the month rather than anybody's history.
 */
export interface LeaderboardSource {
  fetch(metric: LeaderboardMetric, month: MonthKey): Promise<LeaderboardEntry[]>;
  /**
   * Notifies when someone's totals may have changed. Implemented with a
   * broadcast channel rather than table replication, because a user cannot —
   * and must not — receive another user's session rows.
   */
  subscribe?(onChanged: () => void): () => void;
  /** Tells other viewers that this user just recorded something. */
  announce?(): void;
}

const CHANNEL = 'leaderboard';

export function createSupabaseLeaderboardSource(client: TrackerClient): LeaderboardSource {
  // One shared channel, created lazily and reused by both subscribe and
  // announce so a page holds a single socket subscription.
  let channel: ReturnType<TrackerClient['channel']> | null = null;
  const listeners = new Set<() => void>();

  const ensureChannel = () => {
    channel ??= client
      .channel(CHANNEL, { config: { broadcast: { self: false } } })
      .on('broadcast', { event: 'changed' }, () => {
        for (const listener of listeners) listener();
      })
      .subscribe();
    return channel;
  };

  return {
    async fetch(metric, month) {
      if (metric === 'time') {
        const { data, error } = await client.rpc('leaderboard_time', { p_month: month });
        if (error) throw new Error(`Could not load the leaderboard: ${error.message}`);
        return (data ?? []).map((row) => ({
          rank: Number(row.rank),
          userId: row.user_id,
          displayName: row.display_name,
          totalSeconds: Number(row.total_seconds),
          sessionCount: Number(row.session_count),
          completionCount: 0,
        }));
      }

      const { data, error } = await client.rpc('leaderboard_completions', { p_month: month });
      if (error) throw new Error(`Could not load the leaderboard: ${error.message}`);
      return (data ?? []).map((row) => ({
        rank: Number(row.rank),
        userId: row.user_id,
        displayName: row.display_name,
        totalSeconds: 0,
        sessionCount: 0,
        completionCount: Number(row.completion_count),
      }));
    },

    subscribe(onChanged) {
      listeners.add(onChanged);
      ensureChannel();
      return () => {
        listeners.delete(onChanged);
        if (listeners.size === 0 && channel) {
          void client.removeChannel(channel);
          channel = null;
        }
      };
    },

    announce() {
      // Fire and forget. A dropped notice only means a viewer sees the new
      // numbers on their next refresh; the numbers themselves always come from
      // the authoritative query.
      void ensureChannel().send({ type: 'broadcast', event: 'changed', payload: {} });
    },
  };
}
