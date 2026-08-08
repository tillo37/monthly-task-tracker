import { useEffect, useRef, useState } from 'react';
import { Database, Download, RotateCcw, Upload } from 'lucide-react';

interface DataMenuProps {
  monthName: string;
  onExportAll: () => void;
  onExportMonth: () => void;
  onImport: () => void;
  onResetMonth: () => void;
  canReset: boolean;
}

/** Dropdown holding the backup and reset actions, closed on Escape or outside click. */
export function DataMenu({
  monthName,
  onExportAll,
  onExportMonth,
  onImport,
  onResetMonth,
  canReset,
}: DataMenuProps) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;

    const onPointerDown = (event: MouseEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };

    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  const run = (action: () => void) => () => {
    setOpen(false);
    action();
  };

  const itemClass =
    'flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-sm text-slate-700 hover:bg-slate-100 disabled:opacity-50 disabled:hover:bg-transparent dark:text-slate-200 dark:hover:bg-slate-800';

  return (
    <div className="relative" ref={containerRef}>
      <button
        type="button"
        className="btn btn-md btn-subtle"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
      >
        <Database className="h-4 w-4" aria-hidden="true" />
        Data
      </button>

      {open && (
        <div
          role="menu"
          aria-label="Data options"
          className="card absolute right-0 z-40 mt-1.5 w-60 p-1.5 shadow-lg"
        >
          <button type="button" role="menuitem" className={itemClass} onClick={run(onExportMonth)}>
            <Download className="h-4 w-4" aria-hidden="true" />
            Export {monthName}
          </button>
          <button type="button" role="menuitem" className={itemClass} onClick={run(onExportAll)}>
            <Download className="h-4 w-4" aria-hidden="true" />
            Export all data
          </button>
          <button type="button" role="menuitem" className={itemClass} onClick={run(onImport)}>
            <Upload className="h-4 w-4" aria-hidden="true" />
            Import data…
          </button>

          <div className="my-1.5 h-px bg-slate-200 dark:bg-slate-800" />

          <button
            type="button"
            role="menuitem"
            disabled={!canReset}
            className={`${itemClass} text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-500/10`}
            onClick={run(onResetMonth)}
          >
            <RotateCcw className="h-4 w-4" aria-hidden="true" />
            Reset this month's progress
          </button>
        </div>
      )}
    </div>
  );
}
