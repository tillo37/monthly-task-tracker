import { act, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import App from './App';
import { currentMonthKey, todayKey } from './lib/date';

const thisMonth = currentMonthKey();
const todayDay = String(Number(todayKey().slice(8, 10)));

type User = ReturnType<typeof userEvent.setup>;

async function addTask(user: User, name: string, target: number) {
  await user.click(screen.getAllByRole('button', { name: /add task/i })[0]);
  const dialog = screen.getByRole('dialog');
  await user.type(within(dialog).getByLabelText(/task name/i), name);
  await user.type(within(dialog).getByLabelText(/monthly target/i), String(target));
  await user.click(within(dialog).getByRole('button', { name: /add task/i }));
}

const goTo = (user: User, section: RegExp) =>
  user.click(screen.getByRole('link', { name: section }));

/**
 * Runs the fake clock forward. The timer re-renders once a second, so tests use
 * short intervals rather than simulating hours tick by tick.
 */
const runClock = (ms: number) => act(async () => void (await vi.advanceTimersByTimeAsync(ms)));

/** Fills in the manual entry dialog for today. */
async function addManualSession(user: User, taskName: string, duration: string) {
  await user.click(screen.getByRole('button', { name: /add time manually/i }));
  const dialog = screen.getByRole('dialog');
  await user.selectOptions(within(dialog).getByLabelText(/^task$/i), taskName);
  await user.selectOptions(within(dialog).getByLabelText(/^date$/i), todayDay);
  await user.type(within(dialog).getByLabelText(/duration/i), duration);
  await user.click(within(dialog).getByRole('button', { name: /add session/i }));
}

afterEach(() => {
  vi.useRealTimers();
});

describe('navigation', () => {
  it('shows the tracker by default and keeps it working', async () => {
    const user = userEvent.setup();
    render(<App />);

    expect(screen.getByText(new RegExp(`No tasks for`))).toBeInTheDocument();

    await addTask(user, 'Gym', 20);
    expect(screen.getByRole('row', { name: /Gym/ })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /tasks/i })).toHaveAttribute('aria-current', 'page');
  });

  it('moves between the three sections through the hash', async () => {
    const user = userEvent.setup();
    render(<App />);

    await goTo(user, /time tracker/i);
    expect(location.hash).toBe('#/time');
    expect(screen.getByRole('tab', { name: /^timer$/i })).toHaveAttribute('aria-selected', 'true');

    await goTo(user, /reports/i);
    expect(location.hash).toBe('#/reports');
    // Reports open on the current week by default.
    expect(screen.getByRole('heading', { name: 'Weekly report' })).toBeInTheDocument();

    await goTo(user, /^tasks$/i);
    expect(location.hash).toBe('#/tasks');
  });

  it('opens directly on a deep-linked section', () => {
    location.hash = '#/time/sessions';
    render(<App />);
    expect(screen.getByRole('tab', { name: /recent sessions/i })).toHaveAttribute(
      'aria-selected',
      'true',
    );
  });

  it('asks for a task before offering the timer', async () => {
    const user = userEvent.setup();
    render(<App />);

    await goTo(user, /time tracker/i);
    expect(screen.getByText(/nothing to time in/i)).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /go to tasks/i }));
    expect(location.hash).toBe('#/tasks');
  });
});

describe('timer', () => {
  it('records the elapsed time against the chosen task', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    render(<App />);

    await addTask(user, 'Gym', 20);
    await goTo(user, /time tracker/i);

    await user.click(screen.getByRole('button', { name: /start timer/i }));
    await runClock(125_000);

    // The panel clock and the header badge both read the elapsed time.
    expect(screen.getAllByText('00:02:05')).toHaveLength(2);
    expect(screen.getByRole('link', { name: /timer running/i })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /stop & save/i }));

    // The month total and the session list both pick it up.
    expect(screen.getAllByText('2m').length).toBeGreaterThan(0);
    expect(screen.getByRole('button', { name: /start timer/i })).toBeInTheDocument();
  });

  it('discards a running timer after confirmation', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    render(<App />);

    await addTask(user, 'Gym', 20);
    await goTo(user, /time tracker/i);
    await user.click(screen.getByRole('button', { name: /start timer/i }));
    await runClock(30_000);

    await user.click(screen.getByRole('button', { name: /discard the running timer/i }));
    await user.click(screen.getByRole('button', { name: /^discard$/i }));

    expect(screen.getByRole('button', { name: /start timer/i })).toBeInTheDocument();
    expect(screen.getByText(/no time recorded in/i)).toBeInTheDocument();
  });

  it('keeps running across a remount', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    const view = render(<App />);

    await addTask(user, 'Gym', 20);
    await goTo(user, /time tracker/i);
    await user.click(screen.getByRole('button', { name: /start timer/i }));
    await runClock(10_000);
    view.unmount();

    render(<App />);
    expect(screen.getByRole('button', { name: /stop & save/i })).toBeInTheDocument();
  });
});

describe('manual sessions', () => {
  it('adds, lists and deletes a session', async () => {
    const user = userEvent.setup();
    render(<App />);

    await addTask(user, 'Korean', 20);
    await goTo(user, /time tracker/i);
    await addManualSession(user, 'Korean', '45');

    await user.click(screen.getByRole('tab', { name: /recent sessions/i }));
    const list = screen.getByRole('region', { name: new RegExp(todayKey()) });
    expect(within(list).getByText('45m')).toBeInTheDocument();

    await user.click(within(list).getByRole('button', { name: /delete 45m session/i }));
    await user.click(screen.getByRole('button', { name: /^delete$/i }));

    expect(screen.getByText(/no time recorded in/i)).toBeInTheDocument();
  });

  it('validates the entry', async () => {
    const user = userEvent.setup();
    render(<App />);

    await addTask(user, 'Korean', 20);
    await goTo(user, /time tracker/i);
    await user.click(screen.getByRole('button', { name: /add time manually/i }));

    const dialog = screen.getByRole('dialog');
    await user.type(within(dialog).getByLabelText(/duration/i), '25h');
    await user.click(within(dialog).getByRole('button', { name: /add session/i }));

    expect(screen.getByText(/cannot be longer than 24 hours/i)).toBeInTheDocument();
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  it('sums several sessions for one task', async () => {
    const user = userEvent.setup();
    render(<App />);

    await addTask(user, 'Gym', 20);
    await goTo(user, /time tracker/i);
    await addManualSession(user, 'Gym', '1h 30m');
    await addManualSession(user, 'Gym', '45');

    await goTo(user, /reports/i);
    const row = screen.getByRole('row', { name: /Gym/ });
    expect(within(row).getByText('2h 15m')).toBeInTheDocument();
    expect(within(row).getByText('1h 7m')).toBeInTheDocument();
  });
});

describe('tracked time in the tracker and reports', () => {
  it('shows time spent next to completion for the same task', async () => {
    const user = userEvent.setup();
    render(<App />);

    await addTask(user, 'Gym', 20);
    await goTo(user, /time tracker/i);
    await addManualSession(user, 'Gym', '2h');

    await goTo(user, /^tasks$/i);
    const row = screen.getByRole('row', { name: /Gym/ });
    expect(within(row).getByText('2h 0m')).toBeInTheDocument();
    expect(screen.getByText('1 session')).toBeInTheDocument();
  });

  it('keeps months separate', async () => {
    const user = userEvent.setup();
    render(<App />);

    await addTask(user, 'Gym', 20);
    await goTo(user, /time tracker/i);
    await addManualSession(user, 'Gym', '30');

    await user.click(screen.getByRole('button', { name: 'Next month' }));
    expect(screen.getByText(/nothing to time in/i)).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Previous month' }));
    expect(screen.getAllByText('30m').length).toBeGreaterThan(0);
  });

  it('removes a task along with its tracked time', async () => {
    const user = userEvent.setup();
    render(<App />);

    await addTask(user, 'Gym', 20);
    await goTo(user, /time tracker/i);
    await addManualSession(user, 'Gym', '30');

    await goTo(user, /^tasks$/i);
    await user.click(screen.getByRole('button', { name: /delete gym/i }));
    expect(screen.getByRole('dialog')).toHaveTextContent('30m of tracked time');
    await user.click(screen.getByRole('button', { name: /^delete$/i }));

    await goTo(user, /reports/i);
    expect(screen.getByText(/nothing to report/i)).toBeInTheDocument();
  });

  it('clears a month of tracked time from the Data menu', async () => {
    const user = userEvent.setup();
    render(<App />);

    await addTask(user, 'Gym', 20);
    await goTo(user, /time tracker/i);
    await addManualSession(user, 'Gym', '30');

    await user.click(screen.getByRole('button', { name: /^data$/i }));
    await user.click(screen.getByRole('menuitem', { name: /clear this month's tracked time/i }));
    await user.click(screen.getByRole('button', { name: /clear time/i }));

    expect(screen.getByText(/no time recorded in/i)).toBeInTheDocument();
    // The task itself survives.
    await goTo(user, /^tasks$/i);
    expect(screen.getByRole('row', { name: /Gym/ })).toBeInTheDocument();
  });

  it('persists sessions across a remount', async () => {
    const user = userEvent.setup();
    const view = render(<App />);

    await addTask(user, 'Gym', 20);
    await goTo(user, /time tracker/i);
    await addManualSession(user, 'Gym', '1h 15m');
    view.unmount();

    location.hash = `#/reports`;
    render(<App />);
    expect(screen.getByRole('row', { name: /Gym/ })).toHaveTextContent('1h 15m');
    expect(screen.getByRole('heading', { name: 'Weekly report' })).toBeInTheDocument();
    expect(thisMonth).toBe(currentMonthKey());
  });
});
