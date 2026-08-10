import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { LeaderboardSource } from '../data/leaderboardSource';
import type { LeaderboardEntry } from '../lib/leaderboard';
import { LeaderboardView } from './LeaderboardView';

const TIME: LeaderboardEntry[] = [
  { rank: 1, userId: 'u1', displayName: 'Alex', totalSeconds: 152280, sessionCount: 31, completionCount: 0 },
  { rank: 2, userId: 'u2', displayName: 'Islom', totalSeconds: 139320, sessionCount: 27, completionCount: 0 },
  { rank: 3, userId: 'u3', displayName: 'Daniel', totalSeconds: 123300, sessionCount: 29, completionCount: 0 },
];

const COMPLETIONS: LeaderboardEntry[] = [
  { rank: 1, userId: 'u1', displayName: 'Alex', totalSeconds: 0, sessionCount: 0, completionCount: 83 },
  { rank: 2, userId: 'u2', displayName: 'Islom', totalSeconds: 0, sessionCount: 0, completionCount: 71 },
];

function fakeSource(overrides: Partial<LeaderboardSource> = {}) {
  const fetch = vi.fn(async (metric: 'time' | 'completions') =>
    metric === 'time' ? TIME : COMPLETIONS,
  );
  return { fetch, subscribe: undefined, announce: undefined, ...overrides } as LeaderboardSource & {
    fetch: typeof fetch;
  };
}

describe('LeaderboardView', () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.setSystemTime(new Date(2026, 7, 11, 12, 0, 0));
  });

  afterEach(() => vi.useRealTimers());

  it('defaults to the current calendar month', async () => {
    const source = fakeSource();
    render(<LeaderboardView source={source} currentUserId="u2" />);

    await waitFor(() => expect(source.fetch).toHaveBeenCalledWith('time', '2026-08'));
    expect((await screen.findAllByText(/August 2026/)).length).toBeGreaterThan(0);
  });

  it('lists rank, name, total time and session count', async () => {
    render(<LeaderboardView source={fakeSource()} currentUserId="u2" />);

    const row = (await screen.findByText('Alex')).closest('tr');
    expect(row).not.toBeNull();
    const cells = within(row!).getAllByRole('cell');
    expect(cells[0]).toHaveTextContent('1');
    // 152280 seconds is 42h 18m.
    expect(within(row!).getByText('42h 18m')).toBeInTheDocument();
    expect(within(row!).getByText('31')).toBeInTheDocument();
  });

  it('marks the viewer without revealing anything extra about them', async () => {
    render(<LeaderboardView source={fakeSource()} currentUserId="u2" />);

    const row = (await screen.findByText('Islom')).closest('tr');
    expect(within(row!).getByText('You')).toBeInTheDocument();
  });

  it('shows no email, task name or session detail', async () => {
    const { container } = render(<LeaderboardView source={fakeSource()} currentUserId="u2" />);
    await screen.findByText('Alex');

    expect(container.textContent).not.toContain('@');
    expect(screen.queryByText(/session at/i)).not.toBeInTheDocument();
  });

  it('switches to the completions ranking', async () => {
    const user = userEvent.setup();
    const source = fakeSource();
    render(<LeaderboardView source={source} currentUserId="u2" />);
    await screen.findByText('Alex');

    await user.click(screen.getByRole('button', { name: 'Completions' }));

    await waitFor(() => expect(source.fetch).toHaveBeenCalledWith('completions', '2026-08'));
    expect(await screen.findByText('83')).toBeInTheDocument();
    // The sessions column belongs to the time board only.
    expect(screen.queryByRole('columnheader', { name: 'Sessions' })).not.toBeInTheDocument();
  });

  it('steps back a whole calendar month, never a rolling window', async () => {
    const user = userEvent.setup();
    const source = fakeSource();
    render(<LeaderboardView source={source} currentUserId="u2" />);
    await screen.findByText('Alex');

    await user.click(screen.getByRole('button', { name: /Show July 2026/ }));

    await waitFor(() => expect(source.fetch).toHaveBeenCalledWith('time', '2026-07'));
  });

  it('does not offer a month that has not happened yet', async () => {
    render(<LeaderboardView source={fakeSource()} currentUserId="u2" />);
    await screen.findByText('Alex');

    expect(screen.getByRole('button', { name: /Show September 2026/ })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'This month' })).toBeDisabled();
  });

  it('explains an empty month rather than showing a blank table', async () => {
    const source = fakeSource({ fetch: vi.fn(async () => []) });
    render(<LeaderboardView source={source} currentUserId="u2" />);

    expect(await screen.findByText(/Nobody has tracked anything in August 2026/)).toBeInTheDocument();
  });

  it('surfaces a failure instead of showing stale standings', async () => {
    const source = fakeSource({ fetch: vi.fn(async () => { throw new Error('network down'); }) });
    render(<LeaderboardView source={source} currentUserId="u2" />);

    expect(await screen.findByRole('alert')).toHaveTextContent('network down');
  });

  it('refetches when told the standings moved', async () => {
    let notify = () => {};
    const source = fakeSource({
      subscribe: (onChanged) => {
        notify = onChanged;
        return () => {};
      },
    });

    render(<LeaderboardView source={source} currentUserId="u2" />);
    await screen.findByText('Alex');
    expect(source.fetch).toHaveBeenCalledTimes(1);

    notify();

    // The numbers always come from the authoritative query, never the message.
    await waitFor(() => expect(source.fetch).toHaveBeenCalledTimes(2));
  });
});
