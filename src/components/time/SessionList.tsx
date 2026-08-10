import { Clock, Trash2 } from 'lucide-react';
import type { Task, TimeSession } from '../../types';
import { dateKeyOfInstant, shortDateLabel, todayKey } from '../../lib/date';
import { formatDuration, formatTimeRange } from '../../lib/time';
import { TaskTimeChip } from './TaskTimeChip';

interface SessionListProps {
  /** Newest first. */
  sessions: TimeSession[];
  tasksById: Map<string, Task>;
  onDelete: (session: TimeSession) => void;
  /** Rendered when there is nothing to list. */
  emptyMessage: string;
}

interface DayGroup {
  date: string;
  sessions: TimeSession[];
  totalSeconds: number;
}

/** Groups an already-sorted list into days, preserving the incoming order. */
function groupByDay(sessions: TimeSession[]): DayGroup[] {
  const groups: DayGroup[] = [];

  for (const session of sessions) {
    const date = dateKeyOfInstant(session.startTime) ?? session.startTime.slice(0, 10);
    const last = groups[groups.length - 1];
    if (last && last.date === date) {
      last.sessions.push(session);
      last.totalSeconds += session.durationSeconds;
    } else {
      groups.push({ date, sessions: [session], totalSeconds: session.durationSeconds });
    }
  }

  return groups;
}

/** Recorded sessions, grouped by the day they started with a per-day total. */
export function SessionList({ sessions, tasksById, onDelete, emptyMessage }: SessionListProps) {
  if (sessions.length === 0) {
    return (
      <div className="card flex flex-col items-center px-6 py-12 text-center">
        <span
          className="mb-3 flex h-11 w-11 items-center justify-center rounded-xl bg-indigo-50 text-indigo-600 dark:bg-indigo-500/10 dark:text-indigo-400"
          aria-hidden="true"
        >
          <Clock className="h-5 w-5" />
        </span>
        <p className="text-sm text-slate-600 dark:text-slate-400">{emptyMessage}</p>
      </div>
    );
  }

  const today = todayKey();

  return (
    <div className="space-y-3">
      {groupByDay(sessions).map((group) => (
        <section key={group.date} className="card overflow-hidden" aria-label={group.date}>
          <header className="flex items-baseline justify-between gap-3 border-b border-slate-100 bg-slate-50/60 px-4 py-2 dark:border-slate-800/70 dark:bg-slate-950/40">
            <h3 className="text-xs font-semibold tracking-wide text-slate-600 uppercase dark:text-slate-400">
              {group.date === today ? 'Today' : shortDateLabel(group.date)}
            </h3>
            <span className="text-xs font-medium text-slate-500 tabular-nums dark:text-slate-400">
              {formatDuration(group.totalSeconds)} · {group.sessions.length} session
              {group.sessions.length === 1 ? '' : 's'}
            </span>
          </header>

          <ul>
            {group.sessions.map((session) => {
              const task = tasksById.get(session.taskId);

              return (
                <li
                  key={session.id}
                  className="flex items-center gap-3 border-b border-slate-100 px-4 py-2.5 last:border-b-0 dark:border-slate-800/70"
                >
                  <div className="min-w-0 flex-1">
                    {task ? (
                      <TaskTimeChip
                        task={task}
                        size="sm"
                        detail={formatTimeRange(session.startTime, session.endTime)}
                      />
                    ) : (
                      <span className="text-sm text-slate-500 italic dark:text-slate-400">
                        Deleted task · {formatTimeRange(session.startTime, session.endTime)}
                      </span>
                    )}
                  </div>

                  <span className="shrink-0 text-sm font-semibold tabular-nums">
                    {formatDuration(session.durationSeconds)}
                  </span>

                  <button
                    type="button"
                    className="btn h-8 w-8 btn-ghost hover:text-red-600 dark:hover:text-red-400"
                    onClick={() => onDelete(session)}
                    aria-label={`Delete ${formatDuration(session.durationSeconds)} session${
                      task ? ` for ${task.name}` : ''
                    } at ${formatTimeRange(session.startTime, session.endTime)}`}
                  >
                    <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                  </button>
                </li>
              );
            })}
          </ul>
        </section>
      ))}
    </div>
  );
}
