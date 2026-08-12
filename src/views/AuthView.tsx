import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import { BarChart3, CheckSquare, Clock, Trophy } from 'lucide-react';
import {
  useAuth,
  validateDisplayName,
  validateEmail,
  validatePassword,
} from '../auth/context';
import { ThemeToggle } from '../components/ThemeToggle';
import { getSupabase, isCloudConfigured } from '../lib/supabase';
import type { Theme } from '../types';

type Mode = 'signIn' | 'signUp' | 'forgot';

interface Errors {
  displayName?: string;
  email?: string;
  password?: string;
}

const HIGHLIGHTS = [
  { icon: CheckSquare, title: 'Monthly targets', body: 'Tick off each day and watch the month fill in.' },
  { icon: Clock, title: 'Time tracking', body: 'A timer that survives reloads, plus manual entries.' },
  { icon: BarChart3, title: 'Reports', body: 'Daily, weekly, monthly, yearly or any custom range.' },
  { icon: Trophy, title: 'Leaderboard', body: 'Compare tracked time and completions with everyone else.' },
];

/**
 * The only thing an unauthenticated visitor can reach. It doubles as the
 * landing page, so the private tracker is never rendered — not even briefly —
 * before a session exists.
 */
export function AuthView({ theme, onCycleTheme }: { theme: Theme; onCycleTheme: () => void }) {
  const { signIn, signUp, requestPasswordReset } = useAuth();

  const [mode, setMode] = useState<Mode>('signIn');
  const [displayName, setDisplayName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [errors, setErrors] = useState<Errors>({});
  const [formError, setFormError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  // Whether sign-up is open. The database is what actually enforces it — this
  // only saves the visitor from filling in a form that would be refused.
  const [registrationOpen, setRegistrationOpen] = useState(true);

  useEffect(() => {
    if (!isCloudConfigured) return;
    let cancelled = false;
    void getSupabase()
      .rpc('registration_enabled')
      .then(({ data, error }) => {
        if (cancelled || error) return;
        setRegistrationOpen(data !== false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const switchMode = useCallback((next: Mode) => {
    setMode(next);
    setErrors({});
    setFormError('');
    setNotice('');
  }, []);

  const validate = useCallback((): Errors => {
    const next: Errors = {};
    const emailProblem = validateEmail(email);
    if (emailProblem) next.email = emailProblem;

    if (mode !== 'forgot') {
      const passwordProblem = validatePassword(password);
      if (passwordProblem) next.password = passwordProblem;
    }
    if (mode === 'signUp') {
      const nameProblem = validateDisplayName(displayName);
      if (nameProblem) next.displayName = nameProblem;
    }
    return next;
  }, [displayName, email, mode, password]);

  const submit = useCallback(
    async (event: FormEvent) => {
      event.preventDefault();
      setFormError('');
      setNotice('');

      const found = validate();
      setErrors(found);
      if (Object.keys(found).length > 0) return;

      setBusy(true);
      try {
        if (mode === 'signIn') {
          await signIn({ email, password });
        } else if (mode === 'signUp') {
          await signUp({ email, password, displayName });
          // With email confirmation on, no session appears yet; with it off the
          // auth listener takes over and this screen unmounts.
          setNotice('Account created. If confirmation is required, check your inbox.');
        } else {
          await requestPasswordReset(email);
          setNotice('If that address has an account, a reset link is on its way.');
        }
      } catch (error) {
        setFormError(error instanceof Error ? error.message : 'Something went wrong.');
      } finally {
        setBusy(false);
      }
    },
    [displayName, email, mode, password, requestPasswordReset, signIn, signUp, validate],
  );

  const heading = useMemo(() => {
    if (mode === 'signIn') return 'Sign in';
    if (mode === 'signUp') return 'Create an account';
    return 'Reset your password';
  }, [mode]);

  return (
    <div className="min-h-dvh">
      <header className="border-b border-slate-200/80 bg-white/80 backdrop-blur dark:border-slate-800 dark:bg-slate-900/70">
        <div className="mx-auto flex max-w-[1100px] items-center justify-between gap-3 px-4 py-3 sm:px-6">
          <div className="flex items-center gap-2">
            <span
              className="flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-600 text-white"
              aria-hidden="true"
            >
              <CheckSquare className="h-4 w-4" />
            </span>
            <span className="text-sm font-semibold tracking-tight">Monthly Task Tracker</span>
          </div>
          <ThemeToggle theme={theme} onCycle={onCycleTheme} />
        </div>
      </header>

      <main className="mx-auto grid max-w-[1100px] gap-8 px-4 py-10 sm:px-6 lg:grid-cols-[1.1fr_minmax(0,380px)] lg:py-16">
        <section>
          <h1 className="text-3xl font-semibold tracking-tight text-balance sm:text-4xl">
            Track the month, not just the day.
          </h1>
          <p className="mt-3 max-w-xl text-sm text-slate-600 dark:text-slate-400">
            Set a monthly target for each habit, tick off the days, and time the work as you do it.
            Your tasks, completions and sessions are private to your account.
          </p>

          <ul className="mt-8 grid gap-3 sm:grid-cols-2">
            {HIGHLIGHTS.map(({ icon: Icon, title, body }) => (
              <li key={title} className="card p-4">
                <div className="flex items-center gap-2">
                  <Icon className="h-4 w-4 text-indigo-500" aria-hidden="true" />
                  <span className="text-sm font-semibold">{title}</span>
                </div>
                <p className="mt-1.5 text-xs text-slate-600 dark:text-slate-400">{body}</p>
              </li>
            ))}
          </ul>
        </section>

        <section className="card h-fit p-5">
          <h2 className="text-lg font-semibold tracking-tight">{heading}</h2>
          <p className="mt-1 text-xs text-slate-600 dark:text-slate-400">
            {mode === 'forgot'
              ? 'We will email you a link to choose a new password.'
              : 'Your data is tied to your account and visible only to you.'}
          </p>

          {mode === 'signUp' && !registrationOpen && (
            <p
              role="status"
              className="mt-4 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:bg-amber-500/10 dark:text-amber-300"
            >
              New registrations are closed at the moment. If you already have an account, sign in.
            </p>
          )}

          <form className="mt-5 space-y-4" onSubmit={submit} noValidate>
            {mode === 'signUp' && (
              <div>
                <label className="label" htmlFor="auth-display-name">
                  Display name
                </label>
                <input
                  id="auth-display-name"
                  className="field"
                  value={displayName}
                  autoComplete="nickname"
                  maxLength={40}
                  onChange={(event) => setDisplayName(event.target.value)}
                  aria-invalid={Boolean(errors.displayName)}
                  aria-describedby={errors.displayName ? 'auth-display-name-error' : undefined}
                />
                <p className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">
                  Shown on the leaderboard. Your email never is.
                </p>
                {errors.displayName && (
                  <p id="auth-display-name-error" className="mt-1 text-xs text-red-600 dark:text-red-400">
                    {errors.displayName}
                  </p>
                )}
              </div>
            )}

            <div>
              <label className="label" htmlFor="auth-email">
                Email
              </label>
              <input
                id="auth-email"
                className="field"
                type="email"
                value={email}
                autoComplete="email"
                onChange={(event) => setEmail(event.target.value)}
                aria-invalid={Boolean(errors.email)}
                aria-describedby={errors.email ? 'auth-email-error' : undefined}
              />
              {errors.email && (
                <p id="auth-email-error" className="mt-1 text-xs text-red-600 dark:text-red-400">
                  {errors.email}
                </p>
              )}
            </div>

            {mode !== 'forgot' && (
              <div>
                <label className="label" htmlFor="auth-password">
                  Password
                </label>
                <input
                  id="auth-password"
                  className="field"
                  type="password"
                  value={password}
                  autoComplete={mode === 'signUp' ? 'new-password' : 'current-password'}
                  onChange={(event) => setPassword(event.target.value)}
                  aria-invalid={Boolean(errors.password)}
                  aria-describedby={errors.password ? 'auth-password-error' : undefined}
                />
                {errors.password && (
                  <p id="auth-password-error" className="mt-1 text-xs text-red-600 dark:text-red-400">
                    {errors.password}
                  </p>
                )}
              </div>
            )}

            {formError && (
              <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700 dark:bg-red-500/10 dark:text-red-300">
                {formError}
              </p>
            )}
            {notice && (
              <p role="status" className="rounded-lg bg-emerald-50 px-3 py-2 text-xs text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300">
                {notice}
              </p>
            )}

            <button
              type="submit"
              className="btn btn-md btn-primary w-full"
              disabled={busy || (mode === 'signUp' && !registrationOpen)}
            >
              {busy
                ? 'Working…'
                : mode === 'signIn'
                  ? 'Sign in'
                  : mode === 'signUp'
                    ? 'Create account'
                    : 'Send reset link'}
            </button>
          </form>

          <div className="mt-4 flex flex-wrap items-center justify-between gap-2 text-xs">
            {mode === 'signIn' ? (
              <>
                <button type="button" className="text-indigo-600 hover:underline dark:text-indigo-400" onClick={() => switchMode('forgot')}>
                  Forgot password?
                </button>
                <button type="button" className="text-indigo-600 hover:underline dark:text-indigo-400" onClick={() => switchMode('signUp')}>
                  Create an account
                </button>
              </>
            ) : (
              <button type="button" className="text-indigo-600 hover:underline dark:text-indigo-400" onClick={() => switchMode('signIn')}>
                Back to sign in
              </button>
            )}
          </div>
        </section>
      </main>
    </div>
  );
}
