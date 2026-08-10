import { Clock, ListChecks, Plus, Timer as TimerIcon } from 'lucide-react';
import type { MonthData, MonthTimeStats, Task, TimeSession } from '../types';
import { MonthNavigator } from '../components/MonthNavigator';
import { SessionList } from '../components/time/SessionList';
import { TimerPanel } from '../components/time/TimerPanel';
import { StatTile } from '../components/ui/StatTile';
import { dateKeyOfInstant, monthLabel, todayKey, type MonthKey } from '../lib/date';
import { recentSessions } from '../lib/sessions';
import { formatDurationOrDash } from '../lib/time';
import { hashFor, type TimeTab } from '../hooks/useRoute';

interface TimeTrackerViewProps {
  month: MonthKey;
  monthData: MonthData;
  timeStats: MonthTimeStats;
  tab: TimeTab;
  onSelectTab: (tab: TimeTab) => void;
  onPreviousMonth: () => void;
  onNextMonth: () => void;
  onCurrentMonth: () => void;
  onSelectMonth: (month: MonthKey) => void;
  selectedTaskId: string;
  onSelectTask: (taskId: string) => void;
  runningTask: Task | null;
  runningMonth: MonthKey | null;
  elapsed: number;
  onStart: () => void;
  onStop: () => void;
  onDiscard: () => void;
  onAddManual: () => void;
  onDeleteSession: (session: TimeSession) => void;
  onGoToTasks: () => void;
}

const RECENT_PREVIEW = 5;

const TABS: { tab: TimeTab; label: string; icon: typeof TimerIcon }[] = [
  { tab: 'timer', label: 'Timer', icon: TimerIcon },
  { tab: 'sessions', label: 'Recent Sessions', icon: ListChecks },
];

/** Timer and session history for the selected month. */
export function TimeTrackerView({
  month,
  monthData,
  timeStats,
  tab,
  onSelectTab,
  onPreviousMonth,
  onNextMonth,
  onCurrentMonth,
  onSelectMonth,
  selectedTaskId,
  onSelectTask,
  runningTask,
  runningMonth,
  elapsed,
  onStart,
  onStop,
  onDiscard,
  onAddManual,
  onDeleteSession,
  onGoToTasks,
}: TimeTrackerViewProps) {
  const tasks = monthData.tasks;
  const tasksById = new Map(tasks.map((task) => [task.id, task]));
  const today = todayKey();

  const todaySeconds = monthData.sessions.reduce(
    (total, session) =>
      dateKeyOfInstant(session.startTime) === today ? total + session.durationSeconds : total,
    0,
  );
  const mostTracked = timeStats.ranked.find((entry) => entry.time.totalSeconds > 0) ?? null;

  const tabButtons = (
    <div
      role="tablist"
      aria-label="Time tracker pages"
      className="inline-flex rounded-lg border border-slate-200 bg-white p-0.5 dark:border-slate-800 dark:bg-slate-900"
    >
      {TABS.map((item) => {
        const active = item.tab === tab;
        const Icon = item.icon;

        return (
          <a
            key={item.tab}
            role="tab"
            href={hashFor('time', item.tab)}
            aria-selected={active}
            onClick={(event) => {
              if (event.metaKey || event.ctrlKey || event.shiftKey || event.button !== 0) return;
              event.preventDefault();
              onSelectTab(item.tab);
            }}
            className={`btn h-8 px-3 text-xs ${
              active
                ? 'bg-indigo-50 text-indigo-700 dark:bg-indigo-500/15 dark:text-indigo-300'
                : 'btn-ghost'
            }`}
          >
            <Icon className="h-3.5 w-3.5" aria-hidden="true" />
            {item.label}
          </a>
        );
      })}
    </div>
  );

  if (tasks.length === 0) {
    return (
      <>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <MonthNavigator
            month={month}
            onPrevious={onPreviousMonth}
            onNext={onNextMonth}
            onToday={onCurrentMonth}
            onSelect={onSelectMonth}
          />
          {tabButtons}
        </div>

        <section className="card flex flex-col items-center px-6 py-14 text-center">
          <span
            className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-indigo-50 text-indigo-600 dark:bg-indigo-500/10 dark:text-indigo-400"
            aria-hidden="true"
          >
            <Clock className="h-6 w-6" />
          </span>
          <h2 className="text-base font-semibold">Nothing to time in {monthLabel(month)}</h2>
          <p className="mt-1 max-w-sm text-sm text-slate-600 dark:text-slate-400">
            The time tracker records against the tasks you already track. Add a task for this month
            first.
          </p>
          <button type="button" className="btn btn-md btn-primary mt-5" onClick={onGoToTasks}>
            <Plus className="h-4 w-4" aria-hidden="true" />
            Go to Tasks
          </button>
        </section>
      </>
    );
  }

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <MonthNavigator
          month={month}
          onPrevious={onPreviousMonth}
          onNext={onNextMonth}
          onToday={onCurrentMonth}
          onSelect={onSelectMonth}
        />
        {tabButtons}
      </div>

      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
        <StatTile label="Today" value={formatDurationOrDash(todaySeconds)} icon={Clock} />
        <StatTile
          label="This month"
          value={formatDurationOrDash(timeStats.totalSeconds)}
          icon={TimerIcon}
        />
        <StatTile
          label="Sessions"
          value={String(timeStats.sessionCount)}
          hint={
            timeStats.sessionCount > 0
              ? `${formatDurationOrDash(timeStats.averageSeconds)} on average`
              : undefined
          }
          icon={ListChecks}
        />
        <StatTile
          label="Most tracked"
          value={mostTracked ? mostTracked.task.name : '—'}
          hint={mostTracked ? formatDurationOrDash(mostTracked.time.totalSeconds) : undefined}
          icon={TimerIcon}
          tone={mostTracked ? 'default' : 'muted'}
        />
      </div>

      {tab === 'timer' ? (
        <>
          <TimerPanel
            month={month}
            tasks={tasks}
            timeStats={timeStats}
            selectedTaskId={selectedTaskId}
            onSelectTask={onSelectTask}
            runningTask={runningTask}
            runningMonth={runningMonth}
            elapsed={elapsed}
            onStart={onStart}
            onStop={onStop}
            onDiscard={onDiscard}
            onAddManual={onAddManual}
          />

          <div className="flex items-center justify-between gap-3">
            <h2 className="text-sm font-semibold">Recent sessions</h2>
            {monthData.sessions.length > RECENT_PREVIEW && (
              <button
                type="button"
                className="btn btn-md btn-ghost text-xs"
                onClick={() => onSelectTab('sessions')}
              >
                See all {monthData.sessions.length}
              </button>
            )}
          </div>

          <SessionList
            sessions={recentSessions(monthData, RECENT_PREVIEW)}
            tasksById={tasksById}
            onDelete={onDeleteSession}
            emptyMessage={`No time recorded in ${monthLabel(
              month,
            )} yet. Start the timer or add an entry by hand.`}
          />
        </>
      ) : (
        <>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-sm font-semibold">All sessions in {monthLabel(month)}</h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                {timeStats.sessionCount} session{timeStats.sessionCount === 1 ? '' : 's'} ·{' '}
                {formatDurationOrDash(timeStats.totalSeconds)} tracked
              </p>
            </div>
            <button type="button" className="btn btn-md btn-subtle" onClick={onAddManual}>
              <Plus className="h-4 w-4" aria-hidden="true" />
              Add time manually
            </button>
          </div>

          <SessionList
            sessions={recentSessions(monthData)}
            tasksById={tasksById}
            onDelete={onDeleteSession}
            emptyMessage={`No time recorded in ${monthLabel(month)} yet.`}
          />
        </>
      )}
    </>
  );
}
