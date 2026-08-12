import { useCallback, useEffect, useState } from 'react';
import {
  CalendarDays,
  CheckCircle2,
  Clock,
  ListChecks,
  Lock,
  LockOpen,
  ShieldCheck,
  Timer,
  Trash2,
  X,
} from 'lucide-react';
import type {
  AdminSource,
  AdminUserDetail,
  AdminUserMonth,
} from '../../data/adminSource';
import type { ConfirmOptions } from '../ui/ConfirmDialog';
import type { UserRole } from '../../types/database';
import { StatTile } from '../ui/StatTile';
import { formatCount, formatDay, formatHours, formatInstant, ROLE_LABELS } from '../../lib/admin';
import { formatDuration } from '../../lib/time';
import { monthLabel } from '../../lib/date';
import { MAX_DISPLAY_NAME } from '../../auth/context';

interface AdminUserPanelProps {
  source: AdminSource;
  userId: string;
  /** The signed-in administrator, so the panel can refuse to act on itself. */
  currentUserId: string | null;
  onClose(): void;
  /** Something changed; the list behind this panel should reload. */
  onChanged(message: string): void;
  onConfirm(options: ConfirmOptions): void;
  /** Read-only mode, used by the User Activity tab. */
  readOnly?: boolean;
}

/**
 * One account, in full.
 *
 * Everything on this screen is an aggregate: how much, how many, how recently.
 * There is no task list and no session transcript, because inspecting an
 * account for support is not the same as reading somebody's diary.
 */
export function AdminUserPanel({
  source,
  userId,
  currentUserId,
  onClose,
  onChanged,
  onConfirm,
  readOnly = false,
}: AdminUserPanelProps) {
  const [detail, setDetail] = useState<AdminUserDetail | null>(null);
  const [months, setMonths] = useState<AdminUserMonth[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [next, activity] = await Promise.all([
        source.userDetail(userId),
        source.userActivity(userId, 6),
      ]);
      setDetail(next);
      setName(next?.displayName ?? '');
      setMonths(activity);
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'Could not load that user.');
    } finally {
      setLoading(false);
    }
  }, [source, userId]);

  useEffect(() => {
    void load();
  }, [load]);

  const run = useCallback(
    async (action: () => Promise<void>, message: string) => {
      setBusy(true);
      setError(null);
      try {
        await action();
        await load();
        onChanged(message);
      } catch (failure) {
        setError(failure instanceof Error ? failure.message : 'That did not work.');
      } finally {
        setBusy(false);
      }
    },
    [load, onChanged],
  );

  const isSelf = detail?.userId === currentUserId;

  const changeRole = useCallback(
    (role: UserRole) => {
      if (!detail || role === detail.role) return;
      void run(
        () => source.setRole(detail.userId, role),
        `${detail.displayName} is now ${role === 'admin' ? 'an administrator' : 'a normal user'}.`,
      );
    },
    [detail, run, source],
  );

  const toggleDisabled = useCallback(() => {
    if (!detail) return;
    const disable = detail.disabledAt === null;
    onConfirm({
      title: disable ? `Disable ${detail.displayName}?` : `Enable ${detail.displayName}?`,
      description: disable
        ? 'They will be signed out and blocked from signing in again. Their data is kept.'
        : 'They will be able to sign in and use their account again.',
      confirmLabel: disable ? 'Disable' : 'Enable',
      tone: disable ? 'danger' : 'primary',
      onConfirm: () =>
        void run(
          () => source.setDisabled(detail.userId, disable),
          `${detail.displayName} was ${disable ? 'disabled' : 'enabled'}.`,
        ),
    });
  }, [detail, onConfirm, run, source]);

  const requestDelete = useCallback(() => {
    if (!detail) return;
    onConfirm({
      title: 'Delete account?',
      description:
        "This will permanently delete the user's tasks, completion history, and time tracking data.",
      confirmLabel: 'Delete',
      onConfirm: () =>
        void run(async () => {
          await source.deleteUser(detail.userId);
          onClose();
        }, `Deleted ${detail.displayName}.`),
    });
  }, [detail, onClose, onConfirm, run, source]);

  const saveName = useCallback(() => {
    if (!detail) return;
    const trimmed = name.trim();
    if (!trimmed || trimmed === detail.displayName) return;
    void run(
      () => source.setDisplayName(detail.userId, trimmed),
      `Renamed to “${trimmed}”.`,
    );
  }, [detail, name, run, source]);

  return (
    <section
      aria-label="User detail"
      className="card space-y-4 p-4"
    >
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-base font-semibold tracking-tight">
            {detail?.displayName ?? (loading ? 'Loading…' : 'Unknown user')}
          </h3>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            {detail?.email ?? ''}
            {detail && (
              <>
                {' · '}
                {ROLE_LABELS[detail.role]}
                {detail.disabledAt && ' · Disabled'}
              </>
            )}
          </p>
        </div>
        <button type="button" className="btn btn-icon btn-subtle" aria-label="Close user detail" onClick={onClose}>
          <X className="h-4 w-4" aria-hidden="true" />
        </button>
      </header>

      <p className="rounded-lg bg-amber-50 px-3 py-2 text-[11px] text-amber-800 dark:bg-amber-500/10 dark:text-amber-300">
        Administrator-only view. It shows this account&rsquo;s email and totals; it does not show
        their task names, their completions or their individual sessions.
      </p>

      {error && (
        <p role="alert" className="text-sm text-red-600 dark:text-red-400">
          {error}
        </p>
      )}

      {detail && (
        <>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <StatTile label="Tracked time" icon={Clock} value={formatDuration(detail.totalSeconds)} />
            <StatTile label="Sessions" icon={Timer} value={formatCount(detail.sessionCount)} />
            <StatTile
              label="Completions"
              icon={CheckCircle2}
              value={formatCount(detail.completionCount)}
            />
            <StatTile
              label="Tasks"
              icon={ListChecks}
              value={formatCount(detail.taskCount)}
              hint={`across ${formatCount(detail.activeMonths)} month${
                detail.activeMonths === 1 ? '' : 's'
              }`}
            />
            <StatTile label="Created" icon={CalendarDays} value={formatDay(detail.createdAt)} />
            <StatTile
              label="Last activity"
              icon={ShieldCheck}
              value={formatInstant(detail.lastActiveAt)}
              tone={detail.lastActiveAt ? 'default' : 'muted'}
            />
          </div>

          <div className="card overflow-hidden">
            <h4 className="border-b border-slate-200 px-4 py-2.5 text-xs font-semibold tracking-wide text-slate-500 uppercase dark:border-slate-800 dark:text-slate-400">
              Activity by month
            </h4>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <caption className="sr-only">Monthly totals for {detail.displayName}</caption>
                <thead>
                  <tr className="border-b border-slate-200 text-left text-[11px] font-semibold tracking-wide text-slate-500 uppercase dark:border-slate-800 dark:text-slate-400">
                    <th scope="col" className="px-4 py-2">Month</th>
                    <th scope="col" className="px-4 py-2 text-right">Tracked</th>
                    <th scope="col" className="px-4 py-2 text-right">Sessions</th>
                    <th scope="col" className="px-4 py-2 text-right">Completions</th>
                    <th scope="col" className="px-4 py-2 text-right">Tasks</th>
                  </tr>
                </thead>
                <tbody>
                  {months.map((row) => (
                    <tr
                      key={row.month}
                      className="border-b border-slate-100 last:border-0 dark:border-slate-800/60"
                    >
                      <td className="px-4 py-2">{monthLabel(row.month)}</td>
                      <td className="px-4 py-2 text-right tabular-nums">
                        {formatHours(row.trackedSeconds)}
                      </td>
                      <td className="px-4 py-2 text-right tabular-nums">{row.sessionCount}</td>
                      <td className="px-4 py-2 text-right tabular-nums">{row.completionCount}</td>
                      <td className="px-4 py-2 text-right tabular-nums">{row.taskCount}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {!readOnly && (
            <div className="space-y-3 rounded-xl border border-slate-200/80 p-3 dark:border-slate-800">
              <h4 className="text-xs font-semibold tracking-wide text-slate-500 uppercase dark:text-slate-400">
                Manage
              </h4>

              <div className="flex flex-wrap items-end gap-2">
                <div className="min-w-[200px] flex-1">
                  <label className="label" htmlFor="admin-display-name">
                    Display name
                  </label>
                  <input
                    id="admin-display-name"
                    className="field"
                    value={name}
                    maxLength={MAX_DISPLAY_NAME}
                    disabled={busy}
                    onChange={(event) => setName(event.target.value)}
                  />
                </div>
                <button
                  type="button"
                  className="btn btn-md btn-subtle"
                  disabled={busy || !name.trim() || name.trim() === detail.displayName}
                  onClick={saveName}
                >
                  Save name
                </button>
              </div>

              <div className="flex flex-wrap items-end gap-2">
                <div>
                  <label className="label" htmlFor="admin-role">
                    Role
                  </label>
                  <select
                    id="admin-role"
                    className="field"
                    value={detail.role}
                    disabled={busy}
                    onChange={(event) => changeRole(event.target.value as UserRole)}
                  >
                    <option value="user">{ROLE_LABELS.user}</option>
                    <option value="admin">{ROLE_LABELS.admin}</option>
                  </select>
                </div>
                <p className="pb-2 text-[11px] text-slate-500 dark:text-slate-400">
                  {isSelf
                    ? 'You cannot remove your own admin role while you are the only administrator.'
                    : 'Administrators can manage every account and read the audit log.'}
                </p>
              </div>

              <div className="flex flex-wrap gap-2 border-t border-slate-200/80 pt-3 dark:border-slate-800">
                <button
                  type="button"
                  className="btn btn-md btn-subtle"
                  disabled={busy || isSelf}
                  onClick={toggleDisabled}
                  title={isSelf ? 'You cannot disable your own account' : undefined}
                >
                  {detail.disabledAt ? (
                    <LockOpen className="h-4 w-4" aria-hidden="true" />
                  ) : (
                    <Lock className="h-4 w-4" aria-hidden="true" />
                  )}
                  {detail.disabledAt ? 'Enable account' : 'Disable account'}
                </button>
                <button
                  type="button"
                  className="btn btn-md btn-danger"
                  disabled={busy || isSelf}
                  onClick={requestDelete}
                  title={isSelf ? 'You cannot delete your own account here' : undefined}
                >
                  <Trash2 className="h-4 w-4" aria-hidden="true" />
                  Delete account
                </button>
              </div>
            </div>
          )}
        </>
      )}
    </section>
  );
}
