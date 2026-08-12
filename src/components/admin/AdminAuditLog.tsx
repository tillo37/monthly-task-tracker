import { useCallback, useEffect, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import type { AdminSource, AuditEntry } from '../../data/adminSource';
import { auditActionLabel, describeMetadata, formatInstant } from '../../lib/admin';

/**
 * The record of what administrators did.
 *
 * Append-only by construction: `authenticated` holds SELECT on the table and
 * nothing else, and the only INSERT path is a SECURITY DEFINER function. Not
 * even an administrator can edit or delete an entry — including their own.
 */
export function AdminAuditLog({ source }: { source: AdminSource }) {
  const [entries, setEntries] = useState<AuditEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setEntries(await source.auditLog(100));
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'Could not load the audit log.');
    } finally {
      setLoading(false);
    }
  }, [source]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <section className="space-y-4">
      <header className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold tracking-tight">Audit log</h2>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Administrative actions only. Never passwords, tokens or session data.
          </p>
        </div>
        <button
          type="button"
          className="btn btn-icon btn-subtle"
          aria-label="Refresh the audit log"
          onClick={() => void load()}
        >
          <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} aria-hidden="true" />
        </button>
      </header>

      {error && (
        <p role="alert" className="card p-4 text-sm text-red-600 dark:text-red-400">
          {error}
        </p>
      )}

      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <caption className="sr-only">Administrative actions, newest first</caption>
            <thead>
              <tr className="border-b border-slate-200 text-left text-[11px] font-semibold tracking-wide text-slate-500 uppercase dark:border-slate-800 dark:text-slate-400">
                <th scope="col" className="px-4 py-2.5">When</th>
                <th scope="col" className="px-4 py-2.5">Administrator</th>
                <th scope="col" className="px-4 py-2.5">Action</th>
                <th scope="col" className="px-4 py-2.5">Target</th>
                <th scope="col" className="px-4 py-2.5">Details</th>
              </tr>
            </thead>
            <tbody>
              {entries.map((entry) => (
                <tr
                  key={entry.id}
                  className="border-b border-slate-100 last:border-0 dark:border-slate-800/60"
                >
                  <td className="px-4 py-2.5 whitespace-nowrap tabular-nums text-slate-600 dark:text-slate-400">
                    {formatInstant(entry.createdAt)}
                  </td>
                  <td className="px-4 py-2.5">{entry.adminEmail ?? '—'}</td>
                  <td className="px-4 py-2.5 font-medium">{auditActionLabel(entry.action)}</td>
                  <td className="px-4 py-2.5 text-slate-600 dark:text-slate-400">
                    {entry.targetEmail ?? '—'}
                  </td>
                  <td className="px-4 py-2.5 text-xs text-slate-500 dark:text-slate-400">
                    {describeMetadata(entry.metadata) || '—'}
                  </td>
                </tr>
              ))}

              {entries.length === 0 && !loading && (
                <tr>
                  <td
                    colSpan={5}
                    className="px-4 py-10 text-center text-sm text-slate-500 dark:text-slate-400"
                  >
                    No administrative actions have been recorded yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}
