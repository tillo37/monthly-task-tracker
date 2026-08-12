import { Lock } from 'lucide-react';

/**
 * What a locked-out account sees.
 *
 * This screen is a courtesy, not the lock itself: restrictive policies mean the
 * database returns nothing for a disabled account, and GoTrue refuses it a new
 * session. Without this the app would simply look empty and broken.
 */
export function DisabledAccountView({ onSignOut }: { onSignOut(): void | Promise<void> }) {
  return (
    <div className="flex min-h-dvh items-center justify-center px-4">
      <section className="card max-w-md space-y-3 p-8 text-center">
        <span
          className="mx-auto flex h-11 w-11 items-center justify-center rounded-xl bg-red-50 text-red-600 dark:bg-red-500/15 dark:text-red-300"
          aria-hidden="true"
        >
          <Lock className="h-5 w-5" />
        </span>
        <h1 className="text-base font-semibold tracking-tight">This account is disabled</h1>
        <p role="alert" className="text-sm text-slate-600 dark:text-slate-400">
          An administrator has disabled this account. Your tasks, completions and tracked time are
          kept. Contact an administrator if you think this is a mistake.
        </p>
        <button
          type="button"
          className="btn btn-md btn-subtle mx-auto w-fit"
          onClick={() => void onSignOut()}
        >
          Sign out
        </button>
      </section>
    </div>
  );
}
