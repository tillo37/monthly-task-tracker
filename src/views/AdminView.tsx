import { useEffect } from 'react';
import { ShieldAlert, ShieldCheck } from 'lucide-react';
import type { AdminSource } from '../data/adminSource';
import type { LeaderboardSource } from '../data/leaderboardSource';
import type { ConfirmOptions } from '../components/ui/ConfirmDialog';
import { AdminOverview } from '../components/admin/AdminOverview';
import { AdminUsers } from '../components/admin/AdminUsers';
import { AdminSettings } from '../components/admin/AdminSettings';
import { AdminAuditLog } from '../components/admin/AdminAuditLog';
import { AdminLeaderboardPanel } from '../components/admin/AdminLeaderboardPanel';
import { hashFor, type AdminTab } from '../hooks/useRoute';

interface AdminViewProps {
  /** `null` for a viewer with no cloud session — there is nothing to call. */
  source: AdminSource | null;
  leaderboard: LeaderboardSource | null;
  tab: AdminTab;
  onSelectTab(tab: AdminTab): void;
  /** Mirrors `profiles.role`. Decides what is drawn, never what is returned. */
  isAdmin: boolean;
  currentUserId: string | null;
  onStatus(message: string): void;
  onConfirm(options: ConfirmOptions): void;
}

const TABS: { tab: AdminTab; label: string }[] = [
  { tab: 'overview', label: 'Overview' },
  { tab: 'users', label: 'Users' },
  { tab: 'activity', label: 'User Activity' },
  { tab: 'leaderboard', label: 'Leaderboard' },
  { tab: 'settings', label: 'Settings' },
  { tab: 'audit', label: 'Audit Log' },
];

/**
 * The Admin Panel.
 *
 * The role check below is the *second* of three. An unauthenticated visitor
 * never gets this far — `App` renders the sign-in screen for every route while
 * signed out. A signed-in non-administrator lands on the forbidden state here.
 * And an attacker who edits either check out of the bundle reaches a database
 * where every admin function begins with `require_admin()` and every admin
 * policy begins with `is_admin()`, and gets nothing.
 */
export function AdminView({
  source,
  leaderboard,
  tab,
  onSelectTab,
  isAdmin,
  currentUserId,
  onStatus,
  onConfirm,
}: AdminViewProps) {
  // Recorded for the audit log; it must never block the panel from opening.
  useEffect(() => {
    if (!isAdmin || !source) return;
    void source.noteSession().catch(() => undefined);
  }, [isAdmin, source]);

  if (!isAdmin || !source) {
    return (
      <section
        aria-labelledby="admin-forbidden-heading"
        className="card mx-auto max-w-lg space-y-3 p-8 text-center"
      >
        <span
          className="mx-auto flex h-11 w-11 items-center justify-center rounded-xl bg-red-50 text-red-600 dark:bg-red-500/15 dark:text-red-300"
          aria-hidden="true"
        >
          <ShieldAlert className="h-5 w-5" />
        </span>
        <h1 id="admin-forbidden-heading" className="text-base font-semibold tracking-tight">
          Forbidden
        </h1>
        <p role="alert" className="text-sm text-slate-600 dark:text-slate-400">
          You do not have permission to view the admin panel. This account is not an administrator.
        </p>
        <a href={hashFor('tasks')} className="btn btn-md btn-primary mx-auto w-fit">
          Back to your tasks
        </a>
      </section>
    );
  }

  return (
    <section className="space-y-4">
      <header className="card flex flex-wrap items-center justify-between gap-3 p-4">
        <div className="flex items-center gap-2">
          <span
            className="flex h-9 w-9 items-center justify-center rounded-xl bg-indigo-50 text-indigo-600 dark:bg-indigo-500/15 dark:text-indigo-300"
            aria-hidden="true"
          >
            <ShieldCheck className="h-4.5 w-4.5" />
          </span>
          <div>
            <h1 className="text-base font-semibold tracking-tight">Admin</h1>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Administrator-only. Every action here is written to the audit log.
            </p>
          </div>
        </div>

        <nav aria-label="Admin sections" className="flex flex-wrap items-center gap-1">
          {TABS.map((item) => {
            const active = item.tab === tab;
            return (
              <a
                key={item.tab}
                href={hashFor('admin', item.tab)}
                aria-current={active ? 'page' : undefined}
                onClick={(event) => {
                  if (event.metaKey || event.ctrlKey || event.shiftKey || event.button !== 0) return;
                  event.preventDefault();
                  onSelectTab(item.tab);
                }}
                className={`btn btn-md ${
                  active
                    ? 'bg-indigo-50 text-indigo-700 dark:bg-indigo-500/15 dark:text-indigo-300'
                    : 'btn-ghost'
                }`}
              >
                {item.label}
              </a>
            );
          })}
        </nav>
      </header>

      {tab === 'overview' && <AdminOverview source={source} />}

      {tab === 'users' && (
        <AdminUsers
          source={source}
          currentUserId={currentUserId}
          onStatus={onStatus}
          onConfirm={onConfirm}
        />
      )}

      {tab === 'activity' && (
        <AdminUsers
          readOnly
          source={source}
          currentUserId={currentUserId}
          onStatus={onStatus}
          onConfirm={onConfirm}
        />
      )}

      {tab === 'leaderboard' &&
        (leaderboard ? (
          <AdminLeaderboardPanel source={leaderboard} currentUserId={currentUserId} />
        ) : (
          <p className="card p-4 text-sm text-slate-600 dark:text-slate-400">
            The leaderboard is unavailable in this mode.
          </p>
        ))}

      {tab === 'settings' && <AdminSettings source={source} onStatus={onStatus} />}

      {tab === 'audit' && <AdminAuditLog source={source} />}
    </section>
  );
}
