import { useEffect, useState, type FormEvent } from 'react';
import type { Task } from '../../types';
import { daysOfMonth, monthLabel, todayKey, type MonthKey } from '../../lib/date';
import {
  hasErrors,
  validateSessionForm,
  type SessionFormErrors,
  type SessionInput,
} from '../../lib/sessions';
import { addSeconds, formatDuration, localInstant, parseDurationInput } from '../../lib/time';
import { Modal } from '../ui/Modal';

interface ManualSessionDialogProps {
  open: boolean;
  month: MonthKey;
  tasks: Task[];
  /** Pre-selected task, usually whatever the timer panel had focused. */
  defaultTaskId: string;
  onSubmit: (input: SessionInput) => void;
  onClose: () => void;
}

interface FormState {
  taskId: string;
  date: string;
  startTime: string;
  duration: string;
}

/** Defaults to today when the month is the current one, otherwise its first day. */
function defaultDate(month: MonthKey): string {
  const today = todayKey();
  return today.startsWith(month) ? today : daysOfMonth(month)[0];
}

const initialState = (month: MonthKey, defaultTaskId: string): FormState => ({
  taskId: defaultTaskId,
  date: defaultDate(month),
  startTime: '09:00',
  duration: '',
});

/**
 * Adds time that was not caught by the timer. The date is constrained to the
 * month on screen, which is where the resulting session will be stored.
 */
export function ManualSessionDialog({
  open,
  month,
  tasks,
  defaultTaskId,
  onSubmit,
  onClose,
}: ManualSessionDialogProps) {
  const [form, setForm] = useState<FormState>(() => initialState(month, defaultTaskId));
  const [errors, setErrors] = useState<SessionFormErrors>({});
  const [submitted, setSubmitted] = useState(false);

  useEffect(() => {
    if (!open) return;
    setForm(initialState(month, defaultTaskId));
    setErrors({});
    setSubmitted(false);
  }, [open, month, defaultTaskId]);

  const days = daysOfMonth(month);
  const knownTaskIds = tasks.map((task) => task.id);

  const validate = (state: FormState) =>
    validateSessionForm({ ...state, knownTaskIds });

  const update = (patch: Partial<FormState>) => {
    const next = { ...form, ...patch };
    setForm(next);
    if (submitted) setErrors(validate(next));
  };

  const seconds = parseDurationInput(form.duration);
  const startInstant = localInstant(form.date, form.startTime);
  const preview =
    seconds !== null && seconds > 0 && startInstant
      ? `${formatDuration(seconds)} · ends ${new Date(addSeconds(startInstant, seconds))
          .toTimeString()
          .slice(0, 5)}`
      : null;

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    const found = validate(form);
    setErrors(found);
    setSubmitted(true);
    if (hasErrors(found)) return;

    // Validation guarantees both of these; the checks keep TypeScript honest.
    const start = localInstant(form.date, form.startTime);
    const length = parseDurationInput(form.duration);
    if (!start || length === null) return;

    onSubmit({ taskId: form.taskId, startTime: start, endTime: addSeconds(start, length) });
    onClose();
  };

  return (
    <Modal
      open={open}
      size="md"
      title="Add time manually"
      description={`The session is recorded in ${monthLabel(month)}.`}
      onClose={onClose}
    >
      <form onSubmit={handleSubmit} noValidate className="space-y-4">
        <div>
          <label className="label" htmlFor="session-task">
            Task
          </label>
          <select
            id="session-task"
            className="field"
            value={form.taskId}
            aria-invalid={Boolean(errors.taskId)}
            aria-describedby={errors.taskId ? 'session-task-error' : undefined}
            onChange={(event) => update({ taskId: event.target.value })}
          >
            <option value="">Choose a task…</option>
            {tasks.map((task) => (
              <option key={task.id} value={task.id}>
                {task.name}
              </option>
            ))}
          </select>
          {errors.taskId && (
            <p
              id="session-task-error"
              role="alert"
              className="mt-1.5 text-xs text-red-600 dark:text-red-400"
            >
              {errors.taskId}
            </p>
          )}
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label" htmlFor="session-date">
              Date
            </label>
            <select
              id="session-date"
              className="field"
              value={form.date}
              aria-invalid={Boolean(errors.date)}
              onChange={(event) => update({ date: event.target.value })}
            >
              {days.map((day) => (
                <option key={day} value={day}>
                  {Number(day.slice(8, 10))}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="label" htmlFor="session-start">
              Start time
            </label>
            <input
              id="session-start"
              type="time"
              className="field"
              value={form.startTime}
              aria-invalid={Boolean(errors.startTime)}
              aria-describedby={errors.startTime ? 'session-start-error' : undefined}
              onChange={(event) => update({ startTime: event.target.value })}
            />
            {errors.startTime && (
              <p
                id="session-start-error"
                role="alert"
                className="mt-1.5 text-xs text-red-600 dark:text-red-400"
              >
                {errors.startTime}
              </p>
            )}
          </div>
        </div>

        <div>
          <label className="label" htmlFor="session-duration">
            Duration
          </label>
          <input
            id="session-duration"
            className="field"
            inputMode="text"
            autoComplete="off"
            placeholder="e.g. 45, 1h 30m or 1:30"
            value={form.duration}
            aria-invalid={Boolean(errors.duration)}
            aria-describedby={errors.duration ? 'session-duration-error' : 'session-duration-hint'}
            onChange={(event) => update({ duration: event.target.value })}
          />
          {errors.duration ? (
            <p
              id="session-duration-error"
              role="alert"
              className="mt-1.5 text-xs text-red-600 dark:text-red-400"
            >
              {errors.duration}
            </p>
          ) : (
            <p
              id="session-duration-hint"
              className="mt-1.5 text-xs text-slate-500 dark:text-slate-400"
            >
              {preview ?? 'A bare number is read as minutes.'}
            </p>
          )}
        </div>

        <div className="flex justify-end gap-2 pt-1">
          <button type="button" className="btn btn-md btn-subtle" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="btn btn-md btn-primary">
            Add session
          </button>
        </div>
      </form>
    </Modal>
  );
}
