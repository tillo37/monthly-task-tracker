import { useCallback, useEffect, useRef, useState } from 'react';
import { LogOut, UserRound } from 'lucide-react';
import { useAuth, validateDisplayName } from '../auth/context';

/**
 * Account dropdown: shows who is signed in, lets them rename themselves for the
 * leaderboard, and signs them out.
 */
export function ProfileMenu({ onStatus }: { onStatus?: (message: string) => void }) {
  const { profile, session, signOut, updateDisplayName } = useAuth();
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const name = profile?.displayName ?? '…';
  const email = profile?.email ?? session?.user.email ?? '';

  useEffect(() => {
    if (open) {
      setDraft(profile?.displayName ?? '');
      setError('');
    }
  }, [open, profile?.displayName]);

  useEffect(() => {
    if (!open) return;

    const onPointerDown = (event: MouseEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };

    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  const save = useCallback(async () => {
    const problem = validateDisplayName(draft);
    if (problem) {
      setError(problem);
      return;
    }

    setBusy(true);
    try {
      await updateDisplayName(draft);
      setOpen(false);
      onStatus?.(`Display name is now "${draft.trim()}".`);
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'Could not save the display name.');
    } finally {
      setBusy(false);
    }
  }, [draft, onStatus, updateDisplayName]);

  return (
    <div className="relative" ref={containerRef}>
      <button
        type="button"
        className="btn btn-md btn-subtle"
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
      >
        <UserRound className="h-4 w-4" aria-hidden="true" />
        <span className="max-w-[10ch] truncate">{name}</span>
      </button>

      {open && (
        <div
          role="dialog"
          aria-label="Account"
          className="card absolute right-0 z-40 mt-1.5 w-72 p-3 shadow-lg"
        >
          <p className="truncate text-sm font-semibold" title={email}>
            {email}
          </p>
          <p className="mt-0.5 text-[11px] text-slate-500 dark:text-slate-400">
            Only your display name appears on the leaderboard.
          </p>

          <div className="mt-3">
            <label className="label" htmlFor="profile-display-name">
              Display name
            </label>
            <input
              id="profile-display-name"
              className="field"
              value={draft}
              maxLength={40}
              onChange={(event) => setDraft(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') void save();
              }}
            />
            {error && <p className="mt-1 text-xs text-red-600 dark:text-red-400">{error}</p>}
          </div>

          <div className="mt-3 flex items-center justify-between gap-2">
            <button
              type="button"
              className="btn btn-md btn-ghost"
              onClick={() => void signOut()}
            >
              <LogOut className="h-4 w-4" aria-hidden="true" />
              Sign out
            </button>
            <button
              type="button"
              className="btn btn-md btn-primary"
              disabled={busy || draft.trim() === (profile?.displayName ?? '')}
              onClick={() => void save()}
            >
              {busy ? 'Saving…' : 'Save'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
