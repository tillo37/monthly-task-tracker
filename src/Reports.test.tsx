import { fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import App from './App';
import { STORAGE_KEY } from './storage/monthlyStorage';
import type { TimeSession, TrackerData } from './types';
import { DATA_VERSION } from './lib/validation';

// Freeze the clock on Wednesday 12 August 2026; that week runs Mon 10 → Sun 16.
const TODAY = new Date(2026, 7, 12, 10, 0, 0, 0);

type User = ReturnType<typeof userEvent.setup>;

function at(date: string, hour: number, minute = 0): string {
  const [year, month, day] = date.split('-').map(Number);
  return new Date(year, month - 1, day, hour, minute, 0, 0).toISOString();
}

let seq = 0;
function session(taskId: string, date: string, hour: number, minutes: number): TimeSession {
  const startTime = at(date, hour);
  const endTime = new Date(Date.parse(startTime) + minutes * 60_000).toISOString();
  seq += 1;
  return {
    id: `s${seq}`,
    taskId,
    startTime,
    endTime,
    durationSeconds: minutes * 60,
    createdAt: endTime,
  };
}

/**
 * Korean: 2h10m Mon, 2h45m Wed, 2h50m Sat, 35m Sun = 8h20m this week.
 * Gym: 1h05m Tue, 1h32m Fri = 2h37m this week.
 * Plus one session last week and one later in the month, which must be excluded.
 */
function seeded(): TrackerData {
  return {
    version: DATA_VERSION,
    months: {
      '2026-08': {
        tasks: [
          {
            id: 'korean',
            name: 'Korean',
            target: 20,
            color: '#14b8a6',
            icon: 'languages',
            // 15 completions in August; four of them inside this week.
            completedDates: [
              '2026-08-01',
              '2026-08-02',
              '2026-08-03',
              '2026-08-04',
              '2026-08-05',
              '2026-08-06',
              '2026-08-07',
              '2026-08-08',
              '2026-08-09',
              '2026-08-10',
              '2026-08-11',
              '2026-08-12',
              '2026-08-16',
              '2026-08-20',
              '2026-08-21',
            ],
            createdAt: '2026-08-01T00:00:00.000Z',
          },
          {
            id: 'gym',
            name: 'Gym',
            target: 12,
            color: '#6366f1',
            icon: 'dumbbell',
            completedDates: ['2026-08-10', '2026-08-15'],
            createdAt: '2026-08-01T00:00:00.000Z',
          },
        ],
        sessions: [
          session('korean', '2026-08-10', 19, 130),
          session('korean', '2026-08-12', 19, 165),
          session('korean', '2026-08-15', 19, 170),
          session('korean', '2026-08-16', 21, 35),
          session('gym', '2026-08-11', 7, 65),
          session('gym', '2026-08-14', 7, 92),
          session('korean', '2026-08-05', 19, 300), // last week
          session('gym', '2026-08-20', 7, 60), // later this month
        ],
      },
    },
  };
}

const openReports = (user: User) => user.click(screen.getByRole('link', { name: /reports/i }));

const selectPeriod = (user: User, label: RegExp) =>
  user.selectOptions(screen.getByLabelText(/report period/i), screen.getByRole('option', { name: label }));

/** One statistic tile, so a figure is read from its own labelled group. */
const tile = (label: string) => screen.getByRole('group', { name: label });

/** The activity chart's screen-reader table, which mirrors the bars exactly. */
function activityRows() {
  const table = screen.getByRole('table', { name: /time tracked per/i });
  return within(table)
    .getAllByRole('row')
    .slice(1)
    .map((row) => within(row).getAllByRole('rowheader')[0].textContent?.trim());
}

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  vi.setSystemTime(TODAY);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(seeded()));
});

afterEach(() => {
  vi.useRealTimers();
});

describe('report period selector', () => {
  it('offers every preset and defaults to this week', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    render(<App />);
    await openReports(user);

    const select = screen.getByLabelText(/report period/i);
    expect(
      within(select)
        .getAllByRole('option')
        .map((option) => option.textContent),
    ).toEqual([
      'Today',
      'Yesterday',
      'This Week',
      'Last Week',
      'This Month',
      'Last Month',
      'This Year',
      'Last Year',
      'Custom Range',
    ]);
    expect(select).toHaveValue('thisWeek');
    expect(screen.getByRole('heading', { name: 'Weekly report' })).toBeInTheDocument();
  });

  it('does not move the tracker month when the report period changes', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    render(<App />);
    await openReports(user);
    await selectPeriod(user, /last year/i);

    await user.click(screen.getByRole('link', { name: /^tasks$/i }));
    expect(screen.getByRole('heading', { name: 'August 2026' })).toBeInTheDocument();
  });
});

describe('this week', () => {
  beforeEach(async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    render(<App />);
    await openReports(user);
  });

  it('shows the calendar week range, not the trailing seven days', () => {
    expect(screen.getByText('Aug 10 → Aug 16, 2026 · 7 days')).toBeInTheDocument();
  });

  it('shows exactly seven days including empty ones', () => {
    expect(activityRows()).toEqual([
      'Mon Aug 10',
      'Tue Aug 11',
      'Wed Aug 12',
      'Thu Aug 13',
      'Fri Aug 14',
      'Sat Aug 15',
      'Sun Aug 16',
    ]);
  });

  it('totals only this week and averages over all seven days', () => {
    // 8h 20m Korean + 2h 37m Gym = 10h 57m, and 10h 57m / 7 days = 1h 33m.
    expect(tile('Total time')).toHaveTextContent('10h 57m');
    expect(tile('Average / day')).toHaveTextContent('1h 33m');
    expect(tile('Average / day')).toHaveTextContent('across 7 days');
    expect(tile('Sessions')).toHaveTextContent('6');
  });

  it('names the busiest day of the week', () => {
    const busiest = tile('Busiest day');
    expect(busiest).toHaveTextContent('Sat 15 Aug');
    expect(busiest).toHaveTextContent('2h 50m');
  });

  it('breaks tasks down for the week only', () => {
    const korean = screen.getByRole('row', { name: /Korean/ });
    expect(within(korean).getByText('8h 20m')).toBeInTheDocument();

    const gym = screen.getByRole('row', { name: /Gym/ });
    expect(within(gym).getByText('2h 37m')).toBeInTheDocument();
  });

  it('counts completions inside the week against the monthly target', () => {
    const korean = screen.getByRole('row', { name: /Korean/ });
    const cells = within(korean).getAllByRole('cell');
    // Monthly target, then done in period, then the period percentage.
    expect(cells[0]).toHaveTextContent('20');
    expect(cells[1]).toHaveTextContent('4');
    expect(cells[2]).toHaveTextContent('20%');
  });

  it('labels the target as monthly so it cannot be read as weekly', () => {
    expect(screen.getByRole('columnheader', { name: /monthly target/i })).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: /done in period/i })).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: /period completion/i })).toBeInTheDocument();
  });
});

describe('last week', () => {
  it('shifts back exactly one calendar week', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    render(<App />);
    await openReports(user);
    await selectPeriod(user, /last week/i);

    expect(screen.getByText('Aug 3 → Aug 9, 2026 · 7 days')).toBeInTheDocument();
    expect(activityRows()).toHaveLength(7);
    // Only the 5h session from last week falls in range.
    expect(tile('Total time')).toHaveTextContent('5h 0m');

    // Aug 3 → 9 holds seven Korean completions.
    const korean = screen.getByRole('row', { name: /Korean/ });
    expect(within(korean).getAllByRole('cell')[1]).toHaveTextContent('7');
  });

  it('is reachable with the previous-period button', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    render(<App />);
    await openReports(user);

    await user.click(screen.getByRole('button', { name: /previous period/i }));
    expect(screen.getByText('Aug 3 → Aug 9, 2026 · 7 days')).toBeInTheDocument();
    expect(screen.getByLabelText(/report period/i)).toHaveValue('lastWeek');

    await user.click(screen.getByRole('button', { name: /next period/i }));
    expect(screen.getByText('Aug 10 → Aug 16, 2026 · 7 days')).toBeInTheDocument();
    expect(screen.getByLabelText(/report period/i)).toHaveValue('thisWeek');
  });

  it('keeps stepping by whole weeks past the named presets', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    render(<App />);
    await openReports(user);

    const previous = screen.getByRole('button', { name: /previous period/i });
    await user.click(previous);
    await user.click(previous);

    expect(screen.getByText('Jul 27 → Aug 2, 2026 · 7 days')).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Week of Jul 27' })).toBeInTheDocument();
  });
});

describe('the other presets still work', () => {
  it('reports a single day', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    render(<App />);
    await openReports(user);
    await selectPeriod(user, /^today$/i);

    expect(screen.getByRole('heading', { name: 'Daily report' })).toBeInTheDocument();
    expect(screen.getByText('Aug 12, 2026 · 1 day')).toBeInTheDocument();
    expect(activityRows()).toEqual(['Wed Aug 12']);
    expect(tile('Total time')).toHaveTextContent('2h 45m');
  });

  it('reports yesterday', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    render(<App />);
    await openReports(user);
    await selectPeriod(user, /yesterday/i);

    expect(screen.getByText('Aug 11, 2026 · 1 day')).toBeInTheDocument();
    expect(tile('Total time')).toHaveTextContent('1h 5m');
  });

  it('reports the whole month', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    render(<App />);
    await openReports(user);
    await selectPeriod(user, /this month/i);

    expect(screen.getByRole('heading', { name: 'Monthly report' })).toBeInTheDocument();
    expect(screen.getByText('August 2026 · 31 days')).toBeInTheDocument();
    expect(activityRows()).toHaveLength(31);
    // Every session in the month: 10h 57m + 5h + 1h = 16h 57m.
    expect(tile('Total time')).toHaveTextContent('16h 57m');

    const korean = screen.getByRole('row', { name: /Korean/ });
    expect(within(korean).getAllByRole('cell')[1]).toHaveTextContent('15');
  });

  it('reports last month as empty rather than crashing', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    render(<App />);
    await openReports(user);
    await selectPeriod(user, /last month/i);

    expect(screen.getByText('July 2026 · 31 days')).toBeInTheDocument();
    expect(screen.getByText(/nothing to report for July 2026/i)).toBeInTheDocument();
  });

  it('reports the year, bucketed by month', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    render(<App />);
    await openReports(user);
    await selectPeriod(user, /this year/i);

    expect(screen.getByRole('heading', { name: 'Yearly report' })).toBeInTheDocument();
    expect(screen.getByText('Jan 1 → Dec 31, 2026 · 365 days')).toBeInTheDocument();
    expect(activityRows()).toHaveLength(12);
    expect(screen.getByRole('heading', { name: /monthly activity/i })).toBeInTheDocument();
  });

  it('reports last year', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    render(<App />);
    await openReports(user);
    await selectPeriod(user, /last year/i);

    expect(screen.getByText('Jan 1 → Dec 31, 2025 · 365 days')).toBeInTheDocument();
  });

  it('reports a custom range and lets both ends be edited', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    render(<App />);
    await openReports(user);
    await selectPeriod(user, /custom range/i);

    expect(screen.getByRole('heading', { name: 'Custom report' })).toBeInTheDocument();
    expect(screen.getByText('Jul 14 → Aug 12, 2026 · 30 days')).toBeInTheDocument();

    // A date input takes a whole value at once rather than keystrokes.
    fireEvent.change(screen.getByLabelText(/^from$/i), { target: { value: '2026-08-10' } });
    fireEvent.change(screen.getByLabelText(/^to$/i), { target: { value: '2026-08-16' } });

    expect(screen.getByText('Aug 10 → Aug 16, 2026 · 7 days')).toBeInTheDocument();
    expect(tile('Total time')).toHaveTextContent('10h 57m');
  });
});
