import { useCallback, useEffect, useState } from 'react';
import { UserPlus } from 'lucide-react';
import type { AdminSource } from '../../data/adminSource';

/**
 * System settings.
 *
 * There is exactly one, and it is enforced where it matters: with registration
 * off, the trigger on `auth.users` rejects the insert. Hiding the sign-up form
 * would be a suggestion; this is a rule.
 */
export function AdminSettings({
  source,
  onStatus,
}: {
  source: AdminSource;
  onStatus(message: string): void;
}) {
  const [enabled, setEnabled] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      setEnabled(await source.registrationEnabled());
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'Could not read the settings.');
    }
  }, [source]);

  useEffect(() => {
    void load();
  }, [load]);

  const toggle = useCallback(async () => {
    if (enabled === null) return;
    setBusy(true);
    setError(null);
    try {
      await source.setRegistrationEnabled(!enabled);
      setEnabled(!enabled);
      onStatus(enabled ? 'New registrations are now blocked.' : 'Registration is open again.');
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'Could not save the setting.');
    } finally {
      setBusy(false);
    }
  }, [enabled, onStatus, source]);

  return (
    <section className="space-y-4">
      <header>
        <h2 className="text-sm font-semibold tracking-tight">Settings</h2>
        <p className="text-xs text-slate-500 dark:text-slate-400">
          Stored in the database and changeable only by an administrator.
        </p>
      </header>

      {error && (
        <p role="alert" className="card p-4 text-sm text-red-600 dark:text-red-400">
          {error}
        </p>
      )}

      <div className="card flex flex-wrap items-center justify-between gap-3 p-4">
        <div className="flex items-start gap-3">
          <span
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-indigo-50 text-indigo-600 dark:bg-indigo-500/15 dark:text-indigo-300"
            aria-hidden="true"
          >
            <UserPlus className="h-4.5 w-4.5" />
          </span>
          <div>
            <h3 className="text-sm font-semibold">Registration</h3>
            <p className="mt-0.5 max-w-prose text-xs text-slate-500 dark:text-slate-400">
              When this is off, new accounts cannot be created — the database refuses the sign-up.
              Everyone who already has an account can still sign in as normal.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <span
            className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${
              enabled === false
                ? 'bg-red-100 text-red-700 dark:bg-red-500/15 dark:text-red-300'
                : 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300'
            }`}
          >
            {enabled === null ? 'Loading…' : enabled ? 'Enabled' : 'Disabled'}
          </span>
          <button
            type="button"
            className="btn btn-md btn-subtle"
            disabled={busy || enabled === null}
            aria-pressed={enabled === true}
            onClick={() => void toggle()}
          >
            {enabled ? 'Disable registration' : 'Enable registration'}
          </button>
        </div>
      </div>
    </section>
  );
}
