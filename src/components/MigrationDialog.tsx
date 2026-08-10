import { HardDriveDownload, ShieldCheck } from 'lucide-react';
import type { TrackerData } from '../types';
import type { LocalDataSummary } from '../data/localMigration';
import { summarise } from '../lib/validation';
import { formatDuration } from '../lib/time';
import { Modal } from './ui/Modal';

interface MigrationDialogProps {
  local: LocalDataSummary | null;
  /** What the account already holds, so replacing it is never a surprise. */
  cloud: TrackerData;
  busy: boolean;
  onImport: (data: TrackerData) => void;
  onDismiss: () => void;
}

/**
 * Offered once per account when this browser still holds data from the
 * local-only version. Consent is the whole point: nothing is uploaded until the
 * button is pressed, and the local copy is left untouched either way.
 */
export function MigrationDialog({ local, cloud, busy, onImport, onDismiss }: MigrationDialogProps) {
  if (!local) return null;

  const existing = summarise(cloud);
  const replaces = existing.tasks > 0 || existing.sessions > 0;

  return (
    <Modal
      open
      size="md"
      title="Import existing local data"
      description="This browser still holds tasks from before you had an account."
      onClose={onDismiss}
      footer={
        <>
          <button type="button" className="btn btn-md btn-subtle" disabled={busy} onClick={onDismiss}>
            Not now
          </button>
          <button
            type="button"
            className={`btn btn-md ${replaces ? 'btn-danger' : 'btn-primary'}`}
            disabled={busy}
            onClick={() => onImport(local.data)}
          >
            {busy ? 'Importing…' : 'Import into my account'}
          </button>
        </>
      }
    >
      <div className="space-y-4 text-sm">
        <div className="rounded-xl border border-indigo-200 bg-indigo-50/50 p-3 dark:border-indigo-500/30 dark:bg-indigo-500/10">
          <p className="flex items-center gap-1.5 text-xs font-semibold tracking-wide text-indigo-600 uppercase dark:text-indigo-300">
            <HardDriveDownload className="h-3.5 w-3.5" aria-hidden="true" />
            Stored in this browser
          </p>
          <p className="mt-1 tabular-nums">
            {local.months} months · {local.tasks} tasks · {local.completions} completions
          </p>
          <p className="text-xs text-indigo-700/80 tabular-nums dark:text-indigo-300/80">
            {local.sessions} sessions · {formatDuration(local.trackedSeconds)} tracked
          </p>
        </div>

        {replaces && (
          <p className="rounded-xl bg-amber-50 p-3 text-amber-900 dark:bg-amber-500/10 dark:text-amber-200">
            Your account already holds {existing.tasks} tasks and {existing.sessions} sessions.
            Importing replaces them.
          </p>
        )}

        <p className="flex items-start gap-2 text-xs text-slate-600 dark:text-slate-400">
          <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-400" aria-hidden="true" />
          <span>
            Nothing is uploaded unless you choose to import. The local copy is kept either way, and
            you can still export it from the Data menu.
          </span>
        </p>
      </div>
    </Modal>
  );
}
