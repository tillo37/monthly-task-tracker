import { AlertTriangle } from 'lucide-react';
import type { TrackerData } from '../types';
import { summarise } from '../lib/validation';
import { formatDuration } from '../lib/time';
import { Modal } from './ui/Modal';

export interface PendingImport {
  filename: string;
  data: TrackerData;
  warnings: string[];
}

interface ImportDialogProps {
  pending: PendingImport | null;
  /** What the user currently has, so the warning is honest about the cost. */
  current: TrackerData;
  onConfirm: (data: TrackerData) => void;
  onClose: () => void;
}

/**
 * Import never happens silently: the user sees what the file contains, what it
 * would replace, and anything that was repaired during validation.
 */
export function ImportDialog({ pending, current, onConfirm, onClose }: ImportDialogProps) {
  if (!pending) return null;

  const incoming = summarise(pending.data);
  const existing = summarise(current);

  return (
    <Modal
      open
      size="md"
      title="Import data"
      description={`Reviewing ${pending.filename}`}
      onClose={onClose}
      footer={
        <>
          <button type="button" className="btn btn-md btn-subtle" onClick={onClose}>
            Cancel
          </button>
          <button
            type="button"
            className="btn btn-md btn-danger"
            onClick={() => {
              onConfirm(pending.data);
              onClose();
            }}
          >
            Replace my data
          </button>
        </>
      }
    >
      <div className="space-y-4 text-sm">
        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-xl border border-slate-200 p-3 dark:border-slate-800">
            <p className="text-xs font-semibold tracking-wide text-slate-500 uppercase dark:text-slate-400">
              Current data
            </p>
            <p className="mt-1 tabular-nums">
              {existing.months} months · {existing.tasks} tasks · {existing.completions} completions
            </p>
            <p className="text-xs text-slate-500 tabular-nums dark:text-slate-400">
              {existing.sessions} sessions · {formatDuration(existing.trackedSeconds)} tracked
            </p>
          </div>
          <div className="rounded-xl border border-indigo-200 bg-indigo-50/50 p-3 dark:border-indigo-500/30 dark:bg-indigo-500/10">
            <p className="text-xs font-semibold tracking-wide text-indigo-600 uppercase dark:text-indigo-300">
              From file
            </p>
            <p className="mt-1 tabular-nums">
              {incoming.months} months · {incoming.tasks} tasks · {incoming.completions} completions
            </p>
            <p className="text-xs text-indigo-700/80 tabular-nums dark:text-indigo-300/80">
              {incoming.sessions} sessions · {formatDuration(incoming.trackedSeconds)} tracked
            </p>
          </div>
        </div>

        <p className="flex items-start gap-2 rounded-xl bg-amber-50 p-3 text-amber-900 dark:bg-amber-500/10 dark:text-amber-200">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          <span>
            This replaces everything currently stored, including months that are not in the file.
            Export a backup first if you are not sure.
          </span>
        </p>

        {pending.warnings.length > 0 && (
          <details className="rounded-xl border border-slate-200 p-3 dark:border-slate-800">
            <summary className="cursor-pointer text-sm font-medium">
              {pending.warnings.length} item{pending.warnings.length === 1 ? '' : 's'} were repaired
              or skipped
            </summary>
            <ul className="mt-2 list-disc space-y-1 pl-5 text-xs text-slate-600 dark:text-slate-400">
              {pending.warnings.map((warning) => (
                <li key={warning}>{warning}</li>
              ))}
            </ul>
          </details>
        )}
      </div>
    </Modal>
  );
}
