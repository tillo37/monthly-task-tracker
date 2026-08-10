export interface StatTileProps {
  label: string;
  value: string;
  hint?: string;
  icon: React.ComponentType<{ className?: string }>;
  tone?: 'default' | 'positive' | 'muted';
}

/** Compact labelled figure, shared by the month summary and the time reports. */
export function StatTile({ label, value, hint, icon: Icon, tone = 'default' }: StatTileProps) {
  const valueTone =
    tone === 'positive'
      ? 'text-emerald-600 dark:text-emerald-400'
      : tone === 'muted'
        ? 'text-slate-500 dark:text-slate-400'
        : '';

  return (
    <div
      role="group"
      aria-label={label}
      className="rounded-xl border border-slate-200/80 bg-slate-50/60 px-3 py-2.5 dark:border-slate-800 dark:bg-slate-950/40"
    >
      <div className="flex items-center gap-1.5 text-[11px] font-semibold tracking-wide text-slate-500 uppercase dark:text-slate-400">
        <Icon className="h-3.5 w-3.5" />
        {label}
      </div>
      <div className={`mt-1 truncate text-lg font-semibold tabular-nums ${valueTone}`} title={value}>
        {value}
      </div>
      {hint && <div className="truncate text-xs text-slate-500 dark:text-slate-400">{hint}</div>}
    </div>
  );
}
