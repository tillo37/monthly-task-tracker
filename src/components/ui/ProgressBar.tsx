interface ProgressBarProps {
  /** Uncapped percentage; the filled width is clamped to 100%. */
  value: number;
  color: string;
  exceeded?: boolean;
}

/** Compact per-task progress bar. */
export function ProgressBar({ value, color, exceeded = false }: ProgressBarProps) {
  const width = Math.min(Math.max(value, 0), 100);

  return (
    <div
      className="h-1.5 w-full overflow-hidden rounded-full bg-slate-200 dark:bg-slate-800"
      aria-hidden="true"
    >
      <div
        className="h-full rounded-full transition-[width] duration-300 ease-out"
        style={{
          width: `${width}%`,
          backgroundColor: exceeded ? '#10b981' : color,
        }}
      />
    </div>
  );
}
