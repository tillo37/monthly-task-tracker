import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import App from './App';
import { currentMonthKey, daysInMonth, monthLabel, parseMonthKey } from './lib/date';

const thisMonth = currentMonthKey();

/** Opens the form from the toolbar button and fills it in. */
async function addTask(user: ReturnType<typeof userEvent.setup>, name: string, target: number) {
  await user.click(screen.getAllByRole('button', { name: /add task/i })[0]);
  const dialog = screen.getByRole('dialog');
  await user.type(within(dialog).getByLabelText(/task name/i), name);
  await user.type(within(dialog).getByLabelText(/monthly target/i), String(target));
  await user.click(within(dialog).getByRole('button', { name: /add task/i }));
}

/** The toggle button for a task on a given day of the visible month. */
function dayCell(taskName: string, day: number) {
  return screen.getByRole('button', {
    name: new RegExp(`^${taskName} — ${day} ${monthLabel(thisMonth)}`),
  });
}

describe('App', () => {
  it('shows an empty state for a month with no tasks', () => {
    render(<App />);
    expect(screen.getByText(new RegExp(`No tasks for ${monthLabel(thisMonth)}`))).toBeInTheDocument();
  });

  it('creates a task, tracks days and keeps the percentages in sync', async () => {
    const user = userEvent.setup();
    render(<App />);

    await addTask(user, 'Gym', 20);

    const row = screen.getByRole('row', { name: /Gym/ });
    expect(within(row).getByText('0')).toBeInTheDocument();
    expect(within(row).getByText('0%')).toBeInTheDocument();

    await user.click(dayCell('Gym', 1));
    await user.click(dayCell('Gym', 2));

    expect(within(screen.getByRole('row', { name: /Gym/ })).getByText('10%')).toBeInTheDocument();
    expect(dayCell('Gym', 1)).toHaveAttribute('aria-pressed', 'true');

    // Unmarking reverses it.
    await user.click(dayCell('Gym', 1));
    expect(dayCell('Gym', 1)).toHaveAttribute('aria-pressed', 'false');
    expect(within(screen.getByRole('row', { name: /Gym/ })).getByText('5%')).toBeInTheDocument();
  });

  it('renders exactly one cell per day of the visible month', async () => {
    const user = userEvent.setup();
    render(<App />);
    await addTask(user, 'Gym', 20);

    const { year, month } = parseMonthKey(thisMonth);
    const cells = screen.getAllByRole('button', { name: new RegExp(`^Gym — \\d+ `) });
    expect(cells).toHaveLength(daysInMonth(year, month));
  });

  it('tracks a leap February with 29 days', async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.selectOptions(screen.getByLabelText('Year'), '2024');
    await user.selectOptions(screen.getByLabelText('Month'), '2');
    await addTask(user, 'Gym', 20);

    expect(screen.getByRole('heading', { name: 'February 2024' })).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: /^Gym — \d+ February 2024/ })).toHaveLength(29);
  });

  it('validates the task form', async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getAllByRole('button', { name: /add task/i })[0]);
    const dialog = screen.getByRole('dialog');
    await user.click(within(dialog).getByRole('button', { name: /add task/i }));

    expect(screen.getByText(/task name is required/i)).toBeInTheDocument();
    expect(screen.getByText(/target is required/i)).toBeInTheDocument();
    // The invalid submission did not create a row.
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
  });

  it('edits a task without losing completion history', async () => {
    const user = userEvent.setup();
    render(<App />);

    await addTask(user, 'Korean', 20);
    await user.click(dayCell('Korean', 3));

    await user.click(screen.getByRole('button', { name: /edit korean/i }));
    const targetField = screen.getByLabelText(/monthly target/i);
    await user.clear(targetField);
    await user.type(targetField, '10');
    await user.click(screen.getByRole('button', { name: /save changes/i }));

    const row = screen.getByRole('row', { name: /Korean/ });
    expect(within(row).getByText('10%')).toBeInTheDocument();
    expect(dayCell('Korean', 3)).toHaveAttribute('aria-pressed', 'true');
  });

  it('confirms before deleting a task', async () => {
    const user = userEvent.setup();
    render(<App />);

    await addTask(user, 'Reading', 12);
    await user.click(screen.getByRole('button', { name: /delete reading/i }));

    expect(screen.getByRole('dialog')).toHaveTextContent('Delete "Reading"?');

    await user.click(screen.getByRole('button', { name: /^cancel$/i }));
    expect(screen.getByRole('row', { name: /Reading/ })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /delete reading/i }));
    await user.click(screen.getByRole('button', { name: /^delete$/i }));
    expect(screen.queryByRole('row', { name: /Reading/ })).not.toBeInTheDocument();
  });

  it('navigates months and keeps their data separate', async () => {
    const user = userEvent.setup();
    render(<App />);

    await addTask(user, 'Gym', 20);
    await user.click(screen.getByRole('button', { name: 'Next month' }));

    expect(screen.getByText(/No tasks for/)).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Previous month' }));
    expect(screen.getByRole('row', { name: /Gym/ })).toBeInTheDocument();
  });

  it('copies the previous month without its completions', async () => {
    const user = userEvent.setup();
    render(<App />);

    await addTask(user, 'Gym', 20);
    await user.click(dayCell('Gym', 1));

    await user.click(screen.getByRole('button', { name: 'Next month' }));
    await user.click(screen.getByRole('button', { name: /copy 1 task from/i }));

    const row = screen.getByRole('row', { name: /Gym/ });
    expect(within(row).getByText('0%')).toBeInTheDocument();
  });

  it('resets the month after confirmation', async () => {
    const user = userEvent.setup();
    render(<App />);

    await addTask(user, 'Gym', 20);
    await user.click(dayCell('Gym', 1));

    await user.click(screen.getByRole('button', { name: /^data$/i }));
    await user.click(screen.getByRole('menuitem', { name: /reset this month/i }));
    await user.click(screen.getByRole('button', { name: /reset progress/i }));

    expect(dayCell('Gym', 1)).toHaveAttribute('aria-pressed', 'false');
    expect(screen.getByRole('row', { name: /Gym/ })).toBeInTheDocument();
  });

  it('persists across a remount', async () => {
    const user = userEvent.setup();
    const view = render(<App />);

    await addTask(user, 'Gym', 20);
    await user.click(dayCell('Gym', 5));
    view.unmount();

    render(<App />);
    expect(dayCell('Gym', 5)).toHaveAttribute('aria-pressed', 'true');
  });
});
