import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent } from 'react';
import { CheckSquare, CloudOff, Loader2, RefreshCw } from 'lucide-react';
import type { Task, TimeSession, TrackerData } from './types';
import { AppNav } from './components/AppNav';
import { TaskFormDialog } from './components/TaskFormDialog';
import { DataMenu } from './components/DataMenu';
import { ThemeToggle } from './components/ThemeToggle';
import { ProfileMenu } from './components/ProfileMenu';
import { ImportDialog, type PendingImport } from './components/ImportDialog';
import { MigrationDialog } from './components/MigrationDialog';
import { ManualSessionDialog } from './components/time/ManualSessionDialog';
import { ConfirmDialog, type ConfirmOptions } from './components/ui/ConfirmDialog';
import { TasksView } from './views/TasksView';
import { TimeTrackerView } from './views/TimeTrackerView';
import { ReportsView } from './views/ReportsView';
import { LeaderboardView } from './views/LeaderboardView';
import { AuthView } from './views/AuthView';
import { ResetPasswordView } from './views/ResetPasswordView';
import { useOptionalAuth, type Auth } from './auth/context';
import { useTracker } from './hooks/useTracker';
import { useTheme } from './hooks/useTheme';
import { useActiveTimer } from './hooks/useActiveTimer';
import { useRoute, type Section, type TimeTab } from './hooks/useRoute';
import { addMonths, monthLabel } from './lib/date';
import { backupFilename, buildBackup, downloadJson } from './lib/backup';
import { parseTrackerData } from './lib/validation';
import { createDemoData } from './lib/demoData';
import { createSession, type SessionInput } from './lib/sessions';
import { periodForPreset, type ReportPeriod } from './lib/reportRange';
import { describeDuration, formatClock, formatDuration } from './lib/time';
import { getSupabase, isCloudConfigured } from './lib/supabase';
import {
  createMemoryStorage,
  createMonthlyStorage,
  monthlyStorage,
  STORAGE_KEY,
} from './storage/monthlyStorage';
import { createTimerStorage, timerStorage } from './storage/timerStorage';
import { createLocalPersistence } from './data/localPersistence';
import { createSupabasePersistence } from './data/supabasePersistence';
import { createLocalTimerStore, createSupabaseTimerStore, type TimerStore } from './data/timerStore';
import {
  createSupabaseLeaderboardSource,
  type LeaderboardSource,
} from './data/leaderboardSource';
import {
  dismissMigration,
  isMigrationDismissed,
  readLocalData,
  type LocalDataSummary,
} from './data/localMigration';
import type { TrackerPersistence } from './data/ops';
import type { TaskInput } from './lib/tasks';

/** Everything the tracker needs in order to read and write, in one place. */
interface Backend {
  persistence: TrackerPersistence;
  timers: TimerStore;
  /** `null` in local-only and demo mode, where there is nobody to rank against. */
  leaderboard: LeaderboardSource | null;
  isDemo: boolean;
  isCloud: boolean;
}

/** `?demo` runs the app on throwaway in-memory data seeded with example tasks. */
const isDemoMode = () =>
  typeof location !== 'undefined' && new URLSearchParams(location.search).has('demo');

function demoBackend(): Backend {
  const memory = createMemoryStorage();
  memory.setItem(STORAGE_KEY, JSON.stringify(createDemoData()));
  return {
    persistence: createLocalPersistence(createMonthlyStorage(memory)),
    timers: createLocalTimerStore(createTimerStorage(createMemoryStorage())),
    leaderboard: null,
    isDemo: true,
    isCloud: false,
  };
}

function localBackend(): Backend {
  return {
    persistence: createLocalPersistence(monthlyStorage),
    timers: createLocalTimerStore(timerStorage),
    leaderboard: null,
    isDemo: false,
    isCloud: false,
  };
}

/**
 * Chooses what the app is today: a demo, the original local-only tracker when
 * no Supabase credentials are configured, or the signed-in cloud app.
 */
export default function App() {
  const { theme, cycleTheme } = useTheme();
  // Absent in the local-only build and in demo mode, neither of which has, or
  // needs, accounts.
  const auth = useOptionalAuth();
  const demo = useMemo(isDemoMode, []);

  const offlineBackend = useMemo(() => (demo ? demoBackend() : localBackend()), [demo]);

  const cloudBackend = useMemo<Backend | null>(() => {
    const id = auth?.userId;
    if (demo || !isCloudConfigured || !id) return null;
    const client = getSupabase();
    return {
      persistence: createSupabasePersistence(client, id),
      timers: createSupabaseTimerStore(client, id),
      leaderboard: createSupabaseLeaderboardSource(client),
      isDemo: false,
      isCloud: true,
    };
  }, [auth?.userId, demo]);

  // Demo mode and an unconfigured build both skip authentication entirely, so
  // the tracker keeps working exactly as it did before it grew accounts.
  if (demo || !isCloudConfigured || !auth) {
    return (
      <TrackerApp backend={offlineBackend} auth={null} theme={theme} onCycleTheme={cycleTheme} />
    );
  }

  if (auth.status === 'loading') {
    return (
      <div className="flex min-h-dvh items-center justify-center" role="status" aria-live="polite">
        <Loader2 className="h-5 w-5 animate-spin text-indigo-500" aria-hidden="true" />
        <span className="sr-only">Checking your session…</span>
      </div>
    );
  }

  if (auth.status === 'signedOut') {
    return <AuthView theme={theme} onCycleTheme={cycleTheme} />;
  }

  // A recovery link signs the user in, so this has to come before the tracker.
  if (auth.recovering) return <ResetPasswordView />;

  if (!cloudBackend) return null;
  return (
    <TrackerApp
      key={auth.userId ?? 'anonymous'}
      backend={cloudBackend}
      auth={auth}
      theme={theme}
      onCycleTheme={cycleTheme}
    />
  );
}

interface TrackerAppProps {
  backend: Backend;
  /** `null` in local-only and demo mode. */
  auth: Auth | null;
  theme: ReturnType<typeof useTheme>['theme'];
  onCycleTheme: () => void;
}

function TrackerApp({ backend, auth, theme, onCycleTheme }: TrackerAppProps) {
  const { persistence, timers, leaderboard, isDemo, isCloud } = backend;
  const tracker = useTracker(persistence);
  const { route, navigate } = useRoute();
  const timer = useActiveTimer(timers);
  const userId = auth?.userId ?? null;

  const [formTask, setFormTask] = useState<Task | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [manualOpen, setManualOpen] = useState(false);
  const [confirm, setConfirm] = useState<ConfirmOptions | null>(null);
  const [pendingImport, setPendingImport] = useState<PendingImport | null>(null);
  const [status, setStatus] = useState('');
  const [selectedTaskId, setSelectedTaskId] = useState('');
  const [localData, setLocalData] = useState<LocalDataSummary | null>(null);
  const [migrating, setMigrating] = useState(false);
  // The report period is deliberately separate from the tracker's month, so
  // browsing reports never moves the task grid.
  const [reportPeriod, setReportPeriod] = useState<ReportPeriod>(() =>
    periodForPreset('thisWeek'),
  );
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { month, monthData, stats, timeStats } = tracker;
  const tasks = monthData.tasks;
  const previousMonth = addMonths(month, -1);
  const hasCompletions = tasks.some((task) => task.completedDates.length > 0);

  /** Tells other viewers their standings moved. Never carries any data. */
  const announce = useCallback(() => leaderboard?.announce?.(), [leaderboard]);

  // The timed task may live in a month the user is not currently looking at.
  const runningTask = timer.timer
    ? (tracker.data.months[timer.timer.month]?.tasks.find(
        (task) => task.id === timer.timer?.taskId,
      ) ?? null)
    : null;

  // Keep the timer's task selection valid as tasks and months change.
  useEffect(() => {
    if (selectedTaskId && tasks.some((task) => task.id === selectedTaskId)) return;
    setSelectedTaskId(tasks[0]?.id ?? '');
  }, [selectedTaskId, tasks]);

  // A timer whose task was deleted underneath it has nothing left to record.
  // Keyed on the timer itself rather than the controller, which is new each tick.
  // While the document is still loading the task simply is not here yet, which
  // is not the same thing as it being gone.
  const isTiming = timer.timer !== null;
  const discardTimerNow = timer.discard;
  useEffect(() => {
    if (tracker.loading) return;
    if (isTiming && !runningTask) discardTimerNow();
  }, [discardTimerNow, isTiming, runningTask, tracker.loading]);

  // Status messages are transient; clear them so the live region does not
  // re-announce stale text.
  useEffect(() => {
    if (!status) return;
    const timeout = setTimeout(() => setStatus(''), 4000);
    return () => clearTimeout(timeout);
  }, [status]);

  // Offer to bring across data from the local-only version, once per account.
  useEffect(() => {
    if (!isCloud || tracker.loading || !userId) return;
    if (isMigrationDismissed(userId)) return;
    setLocalData((current) => current ?? readLocalData());
  }, [userId, isCloud, tracker.loading]);

  const openCreateForm = useCallback(() => {
    setFormTask(null);
    setFormOpen(true);
  }, []);

  const openEditForm = useCallback((task: Task) => {
    setFormTask(task);
    setFormOpen(true);
  }, []);

  const submitTask = useCallback(
    (input: TaskInput) => {
      if (formTask) {
        tracker.updateTask(formTask.id, input);
        setStatus(`Updated "${input.name}".`);
      } else {
        tracker.addTask(input);
        setStatus(`Added "${input.name}".`);
      }
    },
    [formTask, tracker],
  );

  const requestDelete = useCallback(
    (task: Task) => {
      const tracked = timeStats.byTask[task.id]?.totalSeconds ?? 0;
      setConfirm({
        title: `Delete "${task.name}"?`,
        description: tracked > 0
          ? `This will remove all completion history for this task, along with ${formatDuration(
              tracked,
            )} of tracked time.`
          : 'This will remove all completion history for this task.',
        confirmLabel: 'Delete',
        onConfirm: () => {
          tracker.deleteTask(task.id);
          announce();
          setStatus(`Deleted "${task.name}".`);
        },
      });
    },
    [announce, timeStats, tracker],
  );

  const requestReset = useCallback(() => {
    setConfirm({
      title: `Reset progress for ${monthLabel(month)}?`,
      description: 'Every completed day this month is cleared. Your tasks and targets are kept.',
      confirmLabel: 'Reset progress',
      onConfirm: () => {
        tracker.resetMonth();
        announce();
        setStatus(`Cleared completions for ${monthLabel(month)}.`);
      },
    });
  }, [announce, month, tracker]);

  const requestClearSessions = useCallback(() => {
    setConfirm({
      title: `Clear tracked time for ${monthLabel(month)}?`,
      description: `All ${timeStats.sessionCount} recorded session${
        timeStats.sessionCount === 1 ? '' : 's'
      } this month are deleted. Completions and targets are kept.`,
      confirmLabel: 'Clear time',
      onConfirm: () => {
        tracker.clearMonthSessions();
        announce();
        setStatus(`Cleared tracked time for ${monthLabel(month)}.`);
      },
    });
  }, [announce, month, timeStats.sessionCount, tracker]);

  const copyPrevious = useCallback(() => {
    const count = tracker.previousMonthTaskCount;
    const run = () => {
      tracker.copyPreviousMonth();
      setStatus(`Copied ${count} task${count === 1 ? '' : 's'} from ${monthLabel(previousMonth)}.`);
    };

    if (tasks.length === 0) {
      run();
      return;
    }
    setConfirm({
      title: `Copy tasks from ${monthLabel(previousMonth)}?`,
      description: `${count} task definition${count === 1 ? '' : 's'} will be added alongside the ${
        tasks.length
      } already here. Completion history is not copied.`,
      confirmLabel: 'Copy tasks',
      tone: 'primary',
      onConfirm: run,
    });
  }, [previousMonth, tasks.length, tracker]);

  const exportAll = useCallback(() => {
    downloadJson(backupFilename(), buildBackup(tracker.data));
    setStatus('Exported all data.');
  }, [tracker.data]);

  const exportMonth = useCallback(() => {
    downloadJson(backupFilename(month), buildBackup(tracker.data, [month]));
    setStatus(`Exported ${monthLabel(month)}.`);
  }, [month, tracker.data]);

  const handleFile = useCallback(async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    // Reset immediately so re-picking the same file fires another change event.
    event.target.value = '';
    if (!file) return;

    try {
      const result = parseTrackerData(JSON.parse(await file.text()));
      if (!result.ok) {
        setStatus(`Import failed: ${result.error}`);
        return;
      }
      setPendingImport({ filename: file.name, data: result.data, warnings: result.warnings });
    } catch {
      setStatus('Import failed: the file is not valid JSON.');
    }
  }, []);

  const applyImport = useCallback(
    (data: TrackerData) => {
      // The imported document knows nothing about a timer started before it.
      timer.discard();
      tracker.replaceData(data);
      announce();
      setStatus('Data imported.');
    },
    [announce, timer, tracker],
  );

  const importLocalData = useCallback(
    (data: TrackerData) => {
      setMigrating(true);
      timer.discard();
      tracker.replaceData(data);
      announce();
      if (userId) dismissMigration(userId);
      setLocalData(null);
      setMigrating(false);
      setStatus('Imported the data stored in this browser.');
    },
    [announce, userId, timer, tracker],
  );

  const dismissLocalData = useCallback(() => {
    if (userId) dismissMigration(userId);
    setLocalData(null);
  }, [userId]);

  const startTimer = useCallback(() => {
    if (!selectedTaskId) return;
    const task = tasks.find((candidate) => candidate.id === selectedTaskId);
    timer.start(selectedTaskId, month);
    setStatus(task ? `Timing "${task.name}".` : 'Timer started.');
  }, [month, selectedTaskId, tasks, timer]);

  const stopTimer = useCallback(() => {
    const stopped = timer.stop();
    if (stopped.status === 'too-short') {
      setStatus('Session discarded — it was under a second.');
      return;
    }
    if (stopped.status === 'idle') return;

    tracker.addSession(stopped.session, stopped.month);
    announce();
    const name = runningTask?.name ?? 'task';
    setStatus(`Saved ${formatDuration(stopped.session.durationSeconds)} for "${name}".`);
  }, [announce, runningTask, timer, tracker]);

  const discardTimer = useCallback(() => {
    setConfirm({
      title: 'Discard the running timer?',
      description: `${describeDuration(timer.elapsed)} will not be recorded.`,
      confirmLabel: 'Discard',
      onConfirm: () => {
        timer.discard();
        setStatus('Timer discarded.');
      },
    });
  }, [timer]);

  const addManualSession = useCallback(
    (input: SessionInput) => {
      const session = createSession(input);
      tracker.addSession(session, month);
      announce();
      const task = tasks.find((candidate) => candidate.id === input.taskId);
      setStatus(
        `Added ${formatDuration(session.durationSeconds)}${task ? ` to "${task.name}"` : ''}.`,
      );
    },
    [announce, month, tasks, tracker],
  );

  const deleteSession = useCallback(
    (session: TimeSession) => {
      setConfirm({
        title: 'Delete this session?',
        description: `${formatDuration(session.durationSeconds)} will be removed from this month.`,
        confirmLabel: 'Delete',
        onConfirm: () => {
          tracker.deleteSession(session.id, month);
          announce();
          setStatus('Session deleted.');
        },
      });
    },
    [announce, month, tracker],
  );

  const toggleCompletion = useCallback(
    (taskId: string, date: string) => {
      tracker.toggleCompletion(taskId, date);
      announce();
    },
    [announce, tracker],
  );

  const removeOrphans = useCallback(() => {
    tracker.removeOrphanSessions();
    setStatus('Removed sessions with no task.');
  }, [tracker]);

  const goTo = useCallback((section: Section, tab?: TimeTab) => navigate(section, tab), [navigate]);

  return (
    <div className="min-h-dvh">
      <a
        href="#tracker"
        className="sr-only focus:not-sr-only focus:absolute focus:top-3 focus:left-3 focus:z-50 focus:rounded-lg focus:bg-indigo-600 focus:px-3 focus:py-2 focus:text-sm focus:text-white"
      >
        Skip to tracker
      </a>

      <header className="border-b border-slate-200/80 bg-white/80 backdrop-blur dark:border-slate-800 dark:bg-slate-900/70">
        <div className="mx-auto flex max-w-[1400px] flex-wrap items-center justify-between gap-3 px-4 py-3 sm:px-6">
          <div className="flex items-center gap-2">
            <span
              className="flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-600 text-white"
              aria-hidden="true"
            >
              <CheckSquare className="h-4 w-4" />
            </span>
            <span className="text-sm font-semibold tracking-tight">Monthly Task Tracker</span>
            {isDemo && (
              <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-semibold text-amber-800 dark:bg-amber-500/15 dark:text-amber-300">
                Demo data
              </span>
            )}
          </div>

          <AppNav
            section={route.section}
            onNavigate={(section) => goTo(section)}
            runningLabel={timer.isRunning ? formatClock(timer.elapsed) : undefined}
            showLeaderboard={leaderboard !== null}
          />

          <div className="flex items-center gap-2">
            <DataMenu
              monthName={monthLabel(month)}
              onExportAll={exportAll}
              onExportMonth={exportMonth}
              onImport={() => fileInputRef.current?.click()}
              onResetMonth={requestReset}
              canReset={hasCompletions}
              onClearSessions={requestClearSessions}
              canClearSessions={timeStats.sessionCount > 0}
            />
            {isCloud && <ProfileMenu onStatus={setStatus} />}
            <ThemeToggle theme={theme} onCycle={onCycleTheme} />
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-[1400px] space-y-4 px-4 py-5 sm:px-6">
        {tracker.loadError && (
          <div role="alert" className="card flex flex-wrap items-center justify-between gap-3 p-4">
            <p className="text-sm text-red-600 dark:text-red-400">{tracker.loadError}</p>
            <button type="button" className="btn btn-md btn-subtle" onClick={() => void tracker.reload()}>
              <RefreshCw className="h-4 w-4" aria-hidden="true" />
              Try again
            </button>
          </div>
        )}

        {tracker.sync.error && (
          <div role="alert" className="card flex flex-wrap items-center justify-between gap-3 p-4">
            <p className="flex items-center gap-2 text-sm text-amber-700 dark:text-amber-300">
              <CloudOff className="h-4 w-4 shrink-0" aria-hidden="true" />
              <span>
                {tracker.sync.error} Your {tracker.sync.pending} unsaved change
                {tracker.sync.pending === 1 ? '' : 's'} will be sent when the connection is back.
              </span>
            </p>
            <button type="button" className="btn btn-md btn-subtle" onClick={tracker.sync.retry}>
              <RefreshCw className="h-4 w-4" aria-hidden="true" />
              Retry now
            </button>
          </div>
        )}

        {tracker.loading ? (
          <div className="card flex items-center justify-center gap-2 p-12" role="status" aria-live="polite">
            <Loader2 className="h-4 w-4 animate-spin text-indigo-500" aria-hidden="true" />
            <span className="text-sm text-slate-600 dark:text-slate-400">Loading your data…</span>
          </div>
        ) : (
          <>
            {route.section === 'tasks' && (
              <TasksView
                month={month}
                tasks={tasks}
                stats={stats}
                timeStats={timeStats}
                previousMonth={previousMonth}
                previousMonthTaskCount={tracker.previousMonthTaskCount}
                onPreviousMonth={tracker.goToPreviousMonth}
                onNextMonth={tracker.goToNextMonth}
                onCurrentMonth={tracker.goToCurrentMonth}
                onSelectMonth={tracker.goToMonth}
                onToggle={toggleCompletion}
                onAddTask={openCreateForm}
                onEditTask={openEditForm}
                onDeleteTask={requestDelete}
                onCopyPrevious={copyPrevious}
              />
            )}

            {route.section === 'time' && (
              <TimeTrackerView
                month={month}
                monthData={monthData}
                timeStats={timeStats}
                tab={route.timeTab}
                onSelectTab={(tab) => goTo('time', tab)}
                onPreviousMonth={tracker.goToPreviousMonth}
                onNextMonth={tracker.goToNextMonth}
                onCurrentMonth={tracker.goToCurrentMonth}
                onSelectMonth={tracker.goToMonth}
                selectedTaskId={selectedTaskId}
                onSelectTask={setSelectedTaskId}
                runningTask={runningTask}
                runningMonth={timer.timer?.month ?? null}
                elapsed={timer.elapsed}
                onStart={startTimer}
                onStop={stopTimer}
                onDiscard={discardTimer}
                onAddManual={() => setManualOpen(true)}
                onDeleteSession={deleteSession}
                onGoToTasks={() => goTo('tasks')}
              />
            )}

            {route.section === 'reports' && (
              <ReportsView
                data={tracker.data}
                period={reportPeriod}
                onPeriodChange={setReportPeriod}
                onRemoveOrphans={removeOrphans}
              />
            )}

            {route.section === 'leaderboard' && leaderboard && (
              <LeaderboardView source={leaderboard} currentUserId={userId} />
            )}
          </>
        )}

        <p className="pb-6 text-center text-xs text-slate-500 dark:text-slate-400">
          {isCloud
            ? 'Your tasks, completions and sessions are private to your account. Export a backup from the Data menu.'
            : 'Everything is stored locally in your browser. Export a backup from the Data menu.'}
        </p>
      </main>

      <input
        ref={fileInputRef}
        type="file"
        accept="application/json,.json"
        className="sr-only"
        aria-label="Choose a backup file to import"
        onChange={handleFile}
      />

      <TaskFormDialog
        open={formOpen}
        task={formTask}
        usedColors={tasks.map((task) => task.color)}
        onSubmit={submitTask}
        onClose={() => setFormOpen(false)}
      />

      <ManualSessionDialog
        open={manualOpen}
        month={month}
        tasks={tasks}
        defaultTaskId={selectedTaskId}
        onSubmit={addManualSession}
        onClose={() => setManualOpen(false)}
      />

      <ImportDialog
        pending={pendingImport}
        current={tracker.data}
        onConfirm={applyImport}
        onClose={() => setPendingImport(null)}
      />

      <MigrationDialog
        local={localData}
        cloud={tracker.data}
        busy={migrating}
        onImport={importLocalData}
        onDismiss={dismissLocalData}
      />

      <ConfirmDialog request={confirm} onClose={() => setConfirm(null)} />

      <div role="status" aria-live="polite" className="sr-only">
        {status}
      </div>

      {status && (
        <div className="pointer-events-none fixed inset-x-0 bottom-4 z-40 flex justify-center px-4">
          <div className="card px-3.5 py-2 text-sm shadow-lg">{status}</div>
        </div>
      )}
    </div>
  );
}
