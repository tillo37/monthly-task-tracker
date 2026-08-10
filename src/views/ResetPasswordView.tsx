import { useCallback, useState, type FormEvent } from 'react';
import { KeyRound } from 'lucide-react';
import { useAuth, validatePassword } from '../auth/context';

/**
 * Shown when the user arrives from a recovery email. Supabase has already
 * exchanged the link for a session by this point, so the only thing left is to
 * choose the new password.
 */
export function ResetPasswordView() {
  const { updatePassword, signOut } = useAuth();
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = useCallback(
    async (event: FormEvent) => {
      event.preventDefault();
      setError('');

      const problem = validatePassword(password);
      if (problem) {
        setError(problem);
        return;
      }
      if (password !== confirmation) {
        setError('The two passwords do not match.');
        return;
      }

      setBusy(true);
      try {
        await updatePassword(password);
      } catch (failure) {
        setError(failure instanceof Error ? failure.message : 'Could not update the password.');
      } finally {
        setBusy(false);
      }
    },
    [confirmation, password, updatePassword],
  );

  return (
    <div className="flex min-h-dvh items-center justify-center px-4 py-10">
      <div className="card w-full max-w-sm p-5">
        <div className="flex items-center gap-2">
          <span
            className="flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-600 text-white"
            aria-hidden="true"
          >
            <KeyRound className="h-4 w-4" />
          </span>
          <h1 className="text-lg font-semibold tracking-tight">Choose a new password</h1>
        </div>

        <form className="mt-5 space-y-4" onSubmit={submit} noValidate>
          <div>
            <label className="label" htmlFor="reset-password">
              New password
            </label>
            <input
              id="reset-password"
              className="field"
              type="password"
              autoComplete="new-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
            />
          </div>

          <div>
            <label className="label" htmlFor="reset-confirm">
              Confirm password
            </label>
            <input
              id="reset-confirm"
              className="field"
              type="password"
              autoComplete="new-password"
              value={confirmation}
              onChange={(event) => setConfirmation(event.target.value)}
            />
          </div>

          {error && (
            <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700 dark:bg-red-500/10 dark:text-red-300">
              {error}
            </p>
          )}

          <button type="submit" className="btn btn-md btn-primary w-full" disabled={busy}>
            {busy ? 'Saving…' : 'Update password'}
          </button>
        </form>

        <button
          type="button"
          className="mt-4 w-full text-xs text-indigo-600 hover:underline dark:text-indigo-400"
          onClick={() => void signOut()}
        >
          Cancel and sign out
        </button>
      </div>
    </div>
  );
}
