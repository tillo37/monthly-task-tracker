import type { TrackerData } from '../types';
import type { TrackerClient } from '../lib/supabase';
import { rowsToTrackerData, trackerDataToRows } from './mapping';
import type { TrackerOp, TrackerPersistence } from './ops';

/**
 * The cloud backend.
 *
 * Each op becomes the smallest statement that expresses it, so a tick of one
 * day is one row rather than a re-upload of the document. Ownership is never
 * asserted here — `user_id` is stamped on writes because the column is NOT
 * NULL, but it is Row Level Security in Postgres that actually enforces it.
 */

// PostgREST rejects very large payloads, and a first import can be thousands of
// completions, so bulk writes go up in chunks.
const CHUNK = 500;

async function inChunks<T>(rows: T[], write: (chunk: T[]) => Promise<void>): Promise<void> {
  for (let index = 0; index < rows.length; index += CHUNK) {
    await write(rows.slice(index, index + CHUNK));
  }
}

/** Turns a PostgREST error into something worth showing a user. */
function fail(context: string, error: { message: string } | null): void {
  if (error) throw new Error(`${context}: ${error.message}`);
}

export function createSupabasePersistence(
  client: TrackerClient,
  userId: string,
): TrackerPersistence {
  const load = async (): Promise<TrackerData> => {
    // Three flat reads, each filtered by RLS to this user; the document is
    // reassembled on the client because that is the shape the app thinks in.
    const [tasks, completions, sessions] = await Promise.all([
      client.from('tasks').select('*').eq('user_id', userId),
      client.from('task_completions').select('*').eq('user_id', userId),
      client.from('time_sessions').select('*').eq('user_id', userId),
    ]);

    fail('Could not load tasks', tasks.error);
    fail('Could not load completions', completions.error);
    fail('Could not load sessions', sessions.error);

    return rowsToTrackerData({
      tasks: tasks.data ?? [],
      completions: completions.data ?? [],
      sessions: sessions.data ?? [],
    });
  };

  const replaceAll = async (data: TrackerData): Promise<void> => {
    const rows = trackerDataToRows(data);

    // Completions and sessions cascade from tasks, so one delete clears
    // everything this user owns.
    fail('Could not clear existing data', (await client.from('tasks').delete().eq('user_id', userId)).error);

    await inChunks(rows.tasks, async (chunk) => {
      fail(
        'Could not import tasks',
        (
          await client.from('tasks').insert(
            chunk.map(({ id, month, task }) => ({
              id,
              user_id: userId,
              month,
              name: task.name,
              target: task.target,
              color: task.color,
              icon: task.icon,
              created_at: task.createdAt,
            })),
          )
        ).error,
      );
    });

    await inChunks(rows.completions, async (chunk) => {
      fail(
        'Could not import completions',
        (
          await client
            .from('task_completions')
            .insert(chunk.map(({ taskId, date }) => ({ user_id: userId, task_id: taskId, date })))
        ).error,
      );
    });

    await inChunks(rows.sessions, async (chunk) => {
      fail(
        'Could not import sessions',
        (
          await client.from('time_sessions').insert(
            chunk.map(({ session }) => ({
              id: session.id,
              user_id: userId,
              task_id: session.taskId,
              start_time: session.startTime,
              end_time: session.endTime,
              created_at: session.createdAt,
            })),
          )
        ).error,
      );
    });
  };

  const commit = async (op: TrackerOp): Promise<void> => {
    switch (op.type) {
      case 'addTask': {
        const { task } = op;
        fail(
          'Could not save the task',
          (
            await client.from('tasks').insert({
              id: task.id,
              user_id: userId,
              month: op.month,
              name: task.name,
              target: task.target,
              color: task.color,
              icon: task.icon,
              created_at: task.createdAt,
            })
          ).error,
        );
        return;
      }

      case 'updateTask': {
        const patch: { name?: string; target?: number; color?: string; icon?: string } = {};
        if (op.patch.name !== undefined) patch.name = op.patch.name.trim();
        if (op.patch.target !== undefined) patch.target = Math.trunc(op.patch.target);
        if (op.patch.color !== undefined) patch.color = op.patch.color;
        if (op.patch.icon !== undefined) patch.icon = op.patch.icon;
        if (Object.keys(patch).length === 0) return;

        fail(
          'Could not update the task',
          (await client.from('tasks').update(patch).eq('id', op.taskId).eq('user_id', userId)).error,
        );
        return;
      }

      case 'deleteTask': {
        // Completions and sessions for the task cascade away with it.
        fail(
          'Could not delete the task',
          (await client.from('tasks').delete().eq('id', op.taskId).eq('user_id', userId)).error,
        );
        return;
      }

      case 'setCompletion': {
        if (op.completed) {
          fail(
            'Could not save the completion',
            (
              await client
                .from('task_completions')
                .upsert(
                  { user_id: userId, task_id: op.taskId, date: op.date },
                  { onConflict: 'task_id,date', ignoreDuplicates: true },
                )
            ).error,
          );
          return;
        }
        fail(
          'Could not clear the completion',
          (
            await client
              .from('task_completions')
              .delete()
              .eq('task_id', op.taskId)
              .eq('date', op.date)
              .eq('user_id', userId)
          ).error,
        );
        return;
      }

      case 'resetMonth': {
        if (op.taskIds.length === 0) return;
        fail(
          'Could not reset the month',
          (
            await client
              .from('task_completions')
              .delete()
              .eq('user_id', userId)
              .in('task_id', op.taskIds)
          ).error,
        );
        return;
      }

      case 'copyMonth': {
        if (op.tasks.length === 0) return;
        fail(
          'Could not copy the tasks',
          (
            await client.from('tasks').insert(
              op.tasks.map((task) => ({
                id: task.id,
                user_id: userId,
                month: op.month,
                name: task.name,
                target: task.target,
                color: task.color,
                icon: task.icon,
                created_at: task.createdAt,
              })),
            )
          ).error,
        );
        return;
      }

      case 'addSession': {
        const { session } = op;
        // `duration_seconds` is deliberately absent: Postgres generates it from
        // the two instants, so no client can inflate a total.
        fail(
          'Could not save the session',
          (
            await client.from('time_sessions').insert({
              id: session.id,
              user_id: userId,
              task_id: session.taskId,
              start_time: session.startTime,
              end_time: session.endTime,
              created_at: session.createdAt,
            })
          ).error,
        );
        return;
      }

      case 'deleteSession': {
        fail(
          'Could not delete the session',
          (
            await client.from('time_sessions').delete().eq('id', op.sessionId).eq('user_id', userId)
          ).error,
        );
        return;
      }

      case 'clearMonthSessions':
      case 'removeOrphanSessions': {
        if (op.sessionIds.length === 0) return;
        fail(
          'Could not delete the sessions',
          (
            await client.from('time_sessions').delete().eq('user_id', userId).in('id', op.sessionIds)
          ).error,
        );
        return;
      }

      case 'replaceAll': {
        await replaceAll(op.data);
        return;
      }
    }
  };

  return { load, commit };
}
