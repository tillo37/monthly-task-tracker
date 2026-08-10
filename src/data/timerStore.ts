import type { ActiveTimer } from '../types';
import { isValidMonthKey } from '../lib/date';
import type { TrackerClient } from '../lib/supabase';
import { timerStorage as defaultTimerStorage, type TimerStorage } from '../storage/timerStorage';

/**
 * Where the running timer lives.
 *
 * The timer is device state locally but account state in the cloud: a user has
 * at most one, and it must be visible from whichever device they open next.
 * `subscribe` is what makes the second device notice.
 */
export interface TimerStore {
  /** Present only for genuinely synchronous stores, so the local app can restore instantly. */
  loadSync?(): ActiveTimer | null;
  load(): Promise<ActiveTimer | null>;
  /** Returns the authoritative timer, which may differ from what was proposed. */
  save(timer: ActiveTimer): Promise<ActiveTimer>;
  clear(): Promise<void>;
  subscribe?(onChange: (timer: ActiveTimer | null) => void): () => void;
}

export function createLocalTimerStore(storage: TimerStorage = defaultTimerStorage): TimerStore {
  return {
    loadSync: () => storage.load(),
    load: async () => storage.load(),
    save: async (timer) => {
      storage.save(timer);
      return timer;
    },
    clear: async () => storage.clear(),
  };
}

function toTimer(row: { task_id: string; start_time: string; month: string } | null): ActiveTimer | null {
  if (!row) return null;
  if (!isValidMonthKey(row.month)) return null;
  return { taskId: row.task_id, startTime: row.start_time, month: row.month };
}

/**
 * The cloud timer.
 *
 * Starting goes through `start_timer`, which upserts on the user's primary key:
 * two devices racing produce one row, never two, and the start instant is the
 * database's `now()` rather than a client clock.
 */
export function createSupabaseTimerStore(client: TrackerClient, userId: string): TimerStore {
  return {
    async load() {
      const { data, error } = await client
        .from('active_timers')
        .select('task_id, start_time, month')
        .eq('user_id', userId)
        .maybeSingle();
      if (error) throw new Error(`Could not load the running timer: ${error.message}`);
      return toTimer(data);
    },

    async save(timer) {
      const { data, error } = await client.rpc('start_timer', {
        p_task_id: timer.taskId,
        p_month: timer.month,
      });
      if (error) throw new Error(`Could not start the timer: ${error.message}`);
      return toTimer(data) ?? timer;
    },

    async clear() {
      const { error } = await client.from('active_timers').delete().eq('user_id', userId);
      if (error) throw new Error(`Could not stop the timer: ${error.message}`);
    },

    subscribe(onChange) {
      const channel = client
        .channel(`active-timer:${userId}`)
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'active_timers',
            // Belt and braces: RLS already limits the stream to this user's row.
            filter: `user_id=eq.${userId}`,
          },
          (payload) => {
            if (payload.eventType === 'DELETE') {
              onChange(null);
              return;
            }
            const row = payload.new as { task_id: string; start_time: string; month: string };
            onChange(toTimer(row));
          },
        )
        .subscribe();

      return () => void client.removeChannel(channel);
    },
  };
}
