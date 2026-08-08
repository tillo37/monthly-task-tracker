import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent } from 'react';
import { CheckSquare, CopyPlus, Plus } from 'lucide-react';
import type { Task, TrackerData } from './types';
import { MonthNavigator } from './components/MonthNavigator';
import { MonthSummary } from './components/MonthSummary';
import { TrackerTable } from './components/TrackerTable';
import { EmptyState } from './components/EmptyState';
import { TaskFormDialog } from './components/TaskFormDialog';
import { DataMenu } from './components/DataMenu';
import { ThemeToggle } from './components/ThemeToggle';
import { ImportDialog, type PendingImport } from './components/ImportDialog';
import { ConfirmDialog, type ConfirmOptions } from './components/ui/ConfirmDialog';
import { useTracker } from './hooks/useTracker';
import { useTheme } from './hooks/useTheme';
import { addMonths, monthLabel } from './lib/date';
import { backupFilename, buildBackup, downloadJson } from './lib/backup';
import { parseTrackerData } from './lib/validation';
import { createDemoData } from './lib/demoData';
import {
  createMemoryStorage,
  createMonthlyStorage,
  monthlyStorage,
  STORAGE_KEY,
} from './storage/monthlyStorage';
import type { TaskInput } from './lib/tasks';

/** `?demo` runs the app on throwaway in-memory data seeded with example tasks. */
function useAppStorage() {
  return useMemo(() => {
    const isDemo =
      typeof location !== 'undefined' && new URLSearchParams(location.search).has('demo');
    if (!isDemo) return { storage: monthlyStorage, isDemo: false };

    const memory = createMemoryStorage();
    memory.setItem(STORAGE_KEY, JSON.stringify(createDemoData()));
    return { storage: createMonthlyStorage(memory), isDemo: true };
  }, []);
}

export default function App() {
  const { storage, isDemo } = useAppStorage();
  const tracker = useTracker(storage);
  const { theme, cycleTheme } = useTheme();

  const [formTask, setFormTask] = useState<Task | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [confirm, setConfirm] = useState<ConfirmOptions | null>(null);
  const [pendingImport, setPendingImport] = useState<PendingImport | null>(null);
  const [status, setStatus] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { month, monthData, stats } = tracker;
  const tasks = monthData.tasks;
  const previousMonth = addMonths(month, -1);
  const hasCompletions = tasks.some((task) => task.completedDates.length > 0);

  // Status messages are transient; clear them so the live region does not
  // re-announce stale text.
  useEffect(() => {
    if (!status) return;
    const timer = setTimeout(() => setStatus(''), 4000);
    return () => clearTimeout(timer);
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
      setConfirm({
        title: `Delete "${task.name}"?`,
        description: 'This will remove all completion history for this task.',
        confirmLabel: 'Delete',
        onConfirm: () => {
          tracker.deleteTask(task.id);
          setStatus(`Deleted "${task.name}".`);
        },
      });
    },
    [tracker],
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
      tracker.replaceData(data);
      setStatus('Data imported.');
    },
    [tracker],
  );

  return (
    <div className="min-h-dvh">
      <a
        href="#tracker"
        className="sr-only focus:not-sr-only focus:absolute focus:top-3 focus:left-3 focus:z-50 focus:rounded-lg focus:bg-indigo-600 focus:px-3 focus:py-2 focus:text-sm focus:text-white"
      >
        Skip to tracker
      </a>

      <header className="border-b border-slate-200/80 bg-white/80 backdrop-blur dark:border-slate-800 dark:bg-slate-900/70">
        <div className="mx-auto flex max-w-[1400px] items-center justify-between gap-3 px-4 py-3 sm:px-6">
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

          <div className="flex items-center gap-2">
            <DataMenu
              monthName={monthLabel(month)}
              onExportAll={exportAll}
              onExportMonth={exportMonth}
              onImport={() => fileInputRef.current?.click()}
              onResetMonth={requestReset}
              canReset={hasCompletions}
            />
            <ThemeToggle theme={theme} onCycle={cycleTheme} />
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-[1400px] space-y-4 px-4 py-5 sm:px-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <MonthNavigator
            month={month}
            onPrevious={tracker.goToPreviousMonth}
            onNext={tracker.goToNextMonth}
            onToday={tracker.goToCurrentMonth}
            onSelect={tracker.goToMonth}
          />

          <div className="flex items-center gap-2">
            {tracker.previousMonthTaskCount > 0 && (
              <button type="button" className="btn btn-md btn-subtle" onClick={copyPrevious}>
                <CopyPlus className="h-4 w-4" aria-hidden="true" />
                <span className="hidden sm:inline">Copy previous month</span>
                <span className="sm:hidden">Copy</span>
              </button>
            )}
            <button type="button" className="btn btn-md btn-primary" onClick={openCreateForm}>
              <Plus className="h-4 w-4" aria-hidden="true" />
              Add Task
            </button>
          </div>
        </div>

        {tasks.length > 0 && <MonthSummary stats={stats} monthName={monthLabel(month)} />}

        <div id="tracker">
          {tasks.length === 0 ? (
            <EmptyState
              monthName={monthLabel(month)}
              previousMonthTaskCount={tracker.previousMonthTaskCount}
              previousMonthName={monthLabel(previousMonth)}
              onAddTask={openCreateForm}
              onCopyPrevious={copyPrevious}
            />
          ) : (
            <TrackerTable
              month={month}
              tasks={tasks}
              onToggle={tracker.toggleCompletion}
              onEdit={openEditForm}
              onDelete={requestDelete}
            />
          )}
        </div>

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
