import { useEffect, useState, type FormEvent } from 'react';
import { Check } from 'lucide-react';
import type { Task } from '../types';
import {
  DEFAULT_COLOR,
  DEFAULT_ICON,
  ICON_KEYS,
  TASK_COLORS,
  iconFor,
  nextColor,
} from '../lib/appearance';
import { MAX_NAME_LENGTH, MAX_TARGET, validateTaskInput, type TaskInput } from '../lib/tasks';
import { Modal } from './ui/Modal';

interface TaskFormDialogProps {
  open: boolean;
  /** Present when editing, absent when creating. */
  task: Task | null;
  /** Colours already in use, so a new task gets a distinct one. */
  usedColors: string[];
  onSubmit: (input: TaskInput) => void;
  onClose: () => void;
}

interface FormState {
  name: string;
  target: string;
  color: string;
  icon: string;
}

const initialState = (task: Task | null, usedColors: string[]): FormState => ({
  name: task?.name ?? '',
  target: task ? String(task.target) : '',
  color: task?.color ?? nextColor(usedColors) ?? DEFAULT_COLOR,
  icon: task?.icon ?? DEFAULT_ICON,
});

export function TaskFormDialog({
  open,
  task,
  usedColors,
  onSubmit,
  onClose,
}: TaskFormDialogProps) {
  const [form, setForm] = useState<FormState>(() => initialState(task, usedColors));
  const [errors, setErrors] = useState<{ name?: string; target?: string }>({});
  const [submitted, setSubmitted] = useState(false);

  // Reset whenever the dialog opens so a cancelled edit leaves nothing behind.
  useEffect(() => {
    if (!open) return;
    setForm(initialState(task, usedColors));
    setErrors({});
    setSubmitted(false);
    // Deliberately keyed on open/task only: `usedColors` seeds the initial
    // colour suggestion and must not re-seed while the user is editing.
  }, [open, task]);

  const validate = (state: FormState) =>
    validateTaskInput({ name: state.name, target: state.target });

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    const found = validate(form);
    setErrors(found);
    setSubmitted(true);
    if (found.name || found.target) return;

    onSubmit({
      name: form.name.trim(),
      target: Number(form.target),
      color: form.color,
      icon: form.icon,
    });
    onClose();
  };

  const update = (patch: Partial<FormState>) => {
    const next = { ...form, ...patch };
    setForm(next);
    if (submitted) setErrors(validate(next));
  };

  return (
    <Modal
      open={open}
      size="md"
      title={task ? 'Edit task' : 'New task'}
      description={
        task
          ? 'Changing the target recalculates progress — completion history is kept.'
          : 'Give the task a name and how many times you want to do it this month.'
      }
      onClose={onClose}
    >
      <form onSubmit={handleSubmit} noValidate className="space-y-4">
        <div>
          <label className="label" htmlFor="task-name">
            Task name
          </label>
          <input
            id="task-name"
            className="field"
            value={form.name}
            maxLength={MAX_NAME_LENGTH}
            placeholder="e.g. Gym"
            autoComplete="off"
            aria-invalid={Boolean(errors.name)}
            aria-describedby={errors.name ? 'task-name-error' : undefined}
            onChange={(event) => update({ name: event.target.value })}
          />
          {errors.name && (
            <p id="task-name-error" role="alert" className="mt-1.5 text-xs text-red-600 dark:text-red-400">
              {errors.name}
            </p>
          )}
        </div>

        <div>
          <label className="label" htmlFor="task-target">
            Monthly target
          </label>
          <input
            id="task-target"
            className="field"
            type="number"
            inputMode="numeric"
            min={1}
            max={MAX_TARGET}
            step={1}
            placeholder="e.g. 20"
            value={form.target}
            aria-invalid={Boolean(errors.target)}
            aria-describedby={errors.target ? 'task-target-error' : 'task-target-hint'}
            onChange={(event) => update({ target: event.target.value })}
          />
          {errors.target ? (
            <p id="task-target-error" role="alert" className="mt-1.5 text-xs text-red-600 dark:text-red-400">
              {errors.target}
            </p>
          ) : (
            <p id="task-target-hint" className="mt-1.5 text-xs text-slate-500 dark:text-slate-400">
              How many times you want to complete this during the month.
            </p>
          )}
        </div>

        <fieldset>
          <legend className="label">Colour</legend>
          <div className="flex flex-wrap gap-2">
            {TASK_COLORS.map((color) => (
              <button
                key={color}
                type="button"
                onClick={() => update({ color })}
                aria-label={`Colour ${color}`}
                aria-pressed={form.color === color}
                className="flex h-7 w-7 items-center justify-center rounded-full ring-offset-2 ring-offset-white transition dark:ring-offset-slate-900"
                style={{
                  backgroundColor: color,
                  boxShadow: form.color === color ? `0 0 0 2px ${color}` : undefined,
                }}
              >
                {form.color === color && <Check className="h-4 w-4 text-white" aria-hidden="true" />}
              </button>
            ))}
          </div>
        </fieldset>

        <fieldset>
          <legend className="label">Icon</legend>
          <div className="grid grid-cols-8 gap-1.5 sm:grid-cols-11">
            {ICON_KEYS.map((key) => {
              const Icon = iconFor(key);
              const selected = form.icon === key;
              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => update({ icon: key })}
                  aria-label={`Icon ${key}`}
                  aria-pressed={selected}
                  className={`flex h-8 w-8 items-center justify-center rounded-lg border transition-colors ${
                    selected
                      ? 'border-transparent text-white'
                      : 'border-slate-200 text-slate-500 hover:bg-slate-100 dark:border-slate-700 dark:text-slate-400 dark:hover:bg-slate-800'
                  }`}
                  style={selected ? { backgroundColor: form.color } : undefined}
                >
                  <Icon className="h-4 w-4" aria-hidden="true" />
                </button>
              );
            })}
          </div>
        </fieldset>

        <div className="flex justify-end gap-2 pt-1">
          <button type="button" className="btn btn-md btn-subtle" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="btn btn-md btn-primary">
            {task ? 'Save changes' : 'Add task'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
