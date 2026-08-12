import { useCallback, useEffect, useRef, useState } from 'react';
import { RefreshCw, Search } from 'lucide-react';
import type { AdminSource, AdminUserSummary } from '../../data/adminSource';
import type { ConfirmOptions } from '../ui/ConfirmDialog';
import { AdminUserPanel } from './AdminUserPanel';
import { formatDay, formatCount, relativeSince, ROLE_LABELS } from '../../lib/admin';
import { formatDuration } from '../../lib/time';

const PAGE_SIZE = 25;

interface AdminUsersProps {
  source: AdminSource;
  currentUserId: string | null;
  onStatus(message: string): void;
  onConfirm(options: ConfirmOptions): void;
  /** The Activity tab reuses this table without the management controls. */
  readOnly?: boolean;
}

/**
 * The user table.
 *
 * Searching, paging and every per-user total happen in `admin_list_users`,
 * which returns one row per user. A thousand accounts are a thousand rows, not
 * a thousand histories.
 */
export function AdminUsers({
  source,
  currentUserId,
  onStatus,
  onConfirm,
  readOnly = false,
}: AdminUsersProps) {
  const [search, setSearch] = useState('');
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(0);
  const [users, setUsers] = useState<AdminUserSummary[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);

  // Typing should not fire a query per keystroke.
  useEffect(() => {
    const timeout = setTimeout(() => {
      setQuery(search);
      setPage(0);
    }, 250);
    return () => clearTimeout(timeout);
  }, [search]);

  const requestId = useRef(0);

  const load = useCallback(async () => {
    const id = ++requestId.current;
    setLoading(true);
    setError(null);
    try {
      const result = await source.listUsers({
        search: query,
        limit: PAGE_SIZE,
        offset: page * PAGE_SIZE,
      });
      if (requestId.current !== id) return;
      setUsers(result.users);
      setTotal(result.total);
    } catch (failure) {
      if (requestId.current !== id) return;
      setError(failure instanceof Error ? failure.message : 'Could not load the users.');
    } finally {
      if (requestId.current === id) setLoading(false);
    }
  }, [page, query, source]);

  useEffect(() => {
    void load();
  }, [load]);

  const handleChanged = useCallback(
    (message: string) => {
      onStatus(message);
      void load();
    },
    [load, onStatus],
  );

  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <section className="space-y-4">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold tracking-tight">
            {readOnly ? 'User activity' : 'Users'}
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            {loading
              ? 'Loading…'
              : `${formatCount(total)} account${total === 1 ? '' : 's'}${
                  query ? ` matching “${query}”` : ''
                }`}
          </p>
        </div>

        <div className="flex items-center gap-2">
          <div className="relative">
            <Search
              className="pointer-events-none absolute top-1/2 left-2.5 h-3.5 w-3.5 -translate-y-1/2 text-slate-400"
              aria-hidden="true"
            />
            <input
              type="search"
              className="field h-9 w-56 pl-8"
              placeholder="Search name or email"
              aria-label="Search users"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
          </div>
          <button
            type="button"
            className="btn btn-icon btn-subtle"
            aria-label="Refresh the user list"
            onClick={() => void load()}
          >
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} aria-hidden="true" />
          </button>
        </div>
      </header>

      {error && (
        <p role="alert" className="card p-4 text-sm text-red-600 dark:text-red-400">
          {error}
        </p>
      )}

      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <caption className="sr-only">Registered accounts, newest first</caption>
            <thead>
              <tr className="border-b border-slate-200 text-left text-[11px] font-semibold tracking-wide text-slate-500 uppercase dark:border-slate-800 dark:text-slate-400">
                <th scope="col" className="px-4 py-2.5">Display name</th>
                <th scope="col" className="px-4 py-2.5">Email</th>
                <th scope="col" className="px-4 py-2.5">Role</th>
                <th scope="col" className="px-4 py-2.5">Created</th>
                <th scope="col" className="px-4 py-2.5">Last active</th>
                <th scope="col" className="px-4 py-2.5">Status</th>
                <th scope="col" className="px-4 py-2.5 text-right">Tracked</th>
                <th scope="col" className="px-4 py-2.5 text-right">
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {users.map((user) => (
                <tr
                  key={user.userId}
                  className={`border-b border-slate-100 last:border-0 dark:border-slate-800/60 ${
                    selected === user.userId ? 'bg-indigo-50/60 dark:bg-indigo-500/10' : ''
                  }`}
                >
                  <td className="px-4 py-2.5 font-medium">
                    {user.displayName}
                    {user.userId === currentUserId && (
                      <span className="ml-1.5 rounded-full bg-indigo-100 px-1.5 py-0.5 text-[10px] font-semibold text-indigo-700 dark:bg-indigo-500/20 dark:text-indigo-300">
                        You
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-2.5 text-slate-600 dark:text-slate-400">{user.email}</td>
                  <td className="px-4 py-2.5">
                    <span
                      className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                        user.role === 'admin'
                          ? 'bg-indigo-100 text-indigo-700 dark:bg-indigo-500/20 dark:text-indigo-300'
                          : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300'
                      }`}
                    >
                      {ROLE_LABELS[user.role]}
                    </span>
                  </td>
                  <td className="px-4 py-2.5 text-slate-600 dark:text-slate-400">
                    {formatDay(user.createdAt)}
                  </td>
                  <td className="px-4 py-2.5 text-slate-600 dark:text-slate-400">
                    {relativeSince(user.lastActiveAt)}
                  </td>
                  <td className="px-4 py-2.5">
                    <span
                      className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                        user.disabledAt
                          ? 'bg-red-100 text-red-700 dark:bg-red-500/15 dark:text-red-300'
                          : 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300'
                      }`}
                    >
                      {user.disabledAt ? 'Disabled' : 'Active'}
                    </span>
                  </td>
                  <td className="px-4 py-2.5 text-right tabular-nums">
                    {formatDuration(user.totalSeconds)}
                  </td>
                  <td className="px-4 py-2.5 text-right">
                    <button
                      type="button"
                      className="btn btn-md btn-subtle h-8"
                      aria-expanded={selected === user.userId}
                      onClick={() =>
                        setSelected((current) => (current === user.userId ? null : user.userId))
                      }
                    >
                      View
                    </button>
                  </td>
                </tr>
              ))}

              {users.length === 0 && !loading && (
                <tr>
                  <td
                    colSpan={8}
                    className="px-4 py-10 text-center text-sm text-slate-500 dark:text-slate-400"
                  >
                    No accounts match that search.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {pages > 1 && (
        <div className="flex items-center justify-between gap-2 text-xs text-slate-500 dark:text-slate-400">
          <span>
            Page {page + 1} of {pages}
          </span>
          <div className="flex gap-1">
            <button
              type="button"
              className="btn btn-md btn-subtle"
              disabled={page === 0}
              onClick={() => setPage((current) => Math.max(0, current - 1))}
            >
              Previous
            </button>
            <button
              type="button"
              className="btn btn-md btn-subtle"
              disabled={page + 1 >= pages}
              onClick={() => setPage((current) => current + 1)}
            >
              Next
            </button>
          </div>
        </div>
      )}

      {selected && (
        <AdminUserPanel
          key={selected}
          source={source}
          userId={selected}
          currentUserId={currentUserId}
          readOnly={readOnly}
          onClose={() => setSelected(null)}
          onChanged={handleChanged}
          onConfirm={onConfirm}
        />
      )}
    </section>
  );
}
