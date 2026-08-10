import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent } from 'react';
import { CheckSquare } from 'lucide-react';
import type { Task, TimeSession, TrackerData } from './types';
import { AppNav } from './components/AppNav';
import { TaskFormDialog } from './components/TaskFormDialog';
import { DataMenu } from './components/DataMenu';
import { ThemeToggle } from './components/ThemeToggle';
import { ImportDialog, type PendingImport } from './components/ImportDialog';
import { ManualSessionDialog } from './components/time/ManualSessionDialog';
import { ConfirmDialog, type ConfirmOptions } from './components/ui/ConfirmDialog';
import { TasksView } from './views/TasksView';
import { TimeTrackerView } from './views/TimeTrackerView';
import { ReportsView } from './views/ReportsView';
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
import {
  createMemoryStorage,
  createMonthlyStorage,
  monthlyStorage,
  STORAGE_KEY,
} from './storage/monthlyStorage';
import { createTimerStorage, timerStorage } from './storage/timerStorage';
import type { TaskInput } from './lib/tasks';

/** `?demo` runs the app on throwaway in-memory data seeded with example tasks. */
function useAppStorage() {
  return useMemo(() => {
    const isDemo =
      typeof location !== 'undefined' && new URLSearchParams(location.search).has('demo');
    if (!isDemo) return { storage: monthlyStorage, timers: timerStorage, isDemo: false };

    const memory = createMemoryStorage();
    memory.setItem(STORAGE_KEY, JSON.stringify(createDemoData()));
    return {
      storage: createMonthlyStorage(memory),
      timers: createTimerStorage(createMemoryStorage()),
      isDemo: true,
    };
  }, []);
}

export default function App() {
  const { storage, timers, isDemo } = useAppStorage();
  const tracker = useTracker(storage);
  const { theme, cycleTheme } = useTheme();
  const { route, navigate } = useRoute();
  const timer = useActiveTimer(timers);

  const [formTask, setFormTask] = useState<Task | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [manualOpen, setManualOpen] = useState(false);
  const [confirm, setConfirm] = useState<ConfirmOptions | null>(null);
  const [pendingImport, setPendingImport] = useState<PendingImport | null>(null);
  const [status, setStatus] = useState('');
  const [selectedTaskId, setSelectedTaskId] = useState('');
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
  const isTiming = timer.timer !== null;
  const discardTimerNow = timer.discard;
  useEffect(() => {
    if (isTiming && !runningTask) discardTimerNow();
  }, [discardTimerNow, isTiming, runningTask]);

  // Status messages are transient; clear them so the live region does not
  // re-announce stale text.
  useEffect(() => {
    if (!status) return;
    const timeout = setTimeout(() => setStatus(''), 4000);
    return () => clearTimeout(timeout);
  }, [status]);

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
          setStatus(`Deleted "${task.name}".`);
        },
      });
    },
    [timeStats, tracker],
  );

  const requestReset = useCallback(() => {
    setConfirm({
      title: `Reset progress for ${monthLabel(month)}?`,
      description: 'Every completed day this month is cleared. Your tasks and targets are kept.',
      confirmLabel: 'Reset progress',
      onConfirm: () => {
        tracker.resetMonth();
        setStatus(`Cleared completions for ${monthLabel(month)}.`);
      },
    });
  }, [month, tracker]);

  const requestClearSessions = useCallback(() => {
    setConfirm({
      title: `Clear tracked time for ${monthLabel(month)}?`,
      description: `All ${timeStats.sessionCount} recorded session${
        timeStats.sessionCount === 1 ? '' : 's'
      } this month are deleted. Completions and targets are kept.`,
      confirmLabel: 'Clear time',
      onConfirm: () => {
        tracker.clearMonthSessions();
        setStatus(`Cleared tracked time for ${monthLabel(month)}.`);
      },
    });
  }, [month, timeStats.sessionCount, tracker]);

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
      setStatus('Data imported.');
    },
    [timer, tracker],
  );

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
    const name = runningTask?.name ?? 'task';
    setStatus(`Saved ${formatDuration(stopped.session.durationSeconds)} for "${name}".`);
  }, [runningTask, timer, tracker]);

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
      const task = tasks.find((candidate) => candidate.id === input.taskId);
      setStatus(
        `Added ${formatDuration(session.durationSeconds)}${task ? ` to "${task.name}"` : ''}.`,
      );
    },
    [month, tasks, tracker],
  );

  const deleteSession = useCallback(
    (session: TimeSession) => {
      setConfirm({
        title: 'Delete this session?',
        description: `${formatDuration(session.durationSeconds)} will be removed from this month.`,
        confirmLabel: 'Delete',
        onConfirm: () => {
          tracker.deleteSession(session.id, month);
          setStatus('Session deleted.');
        },
      });
    },
    [month, tracker],
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
            <ThemeToggle theme={theme} onCycle={cycleTheme} />
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-[1400px] space-y-4 px-4 py-5 sm:px-6">
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
            onToggle={tracker.toggleCompletion}
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

        <p className="pb-6 text-center text-xs text-slate-500 dark:text-slate-400">
          Everything is stored locally in your browser. Export a backup from the Data menu.
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
