interface ProgressRingProps {
  /** Uncapped percentage; the arc itself is clamped to one full turn. */
  value: number;
  size?: number;
  strokeWidth?: number;
  label: string;
  sublabel?: string;
  exceeded?: boolean;
}

/** Large circular progress indicator for the month total. */
export function ProgressRing({
  value,
  size = 148,
  strokeWidth = 12,
  label,
  sublabel,
  exceeded = false,
}: ProgressRingProps) {
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const fraction = Math.min(Math.max(value, 0), 100) / 100;

  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden="true">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          strokeWidth={strokeWidth}
          className="stroke-slate-200 dark:stroke-slate-800"
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={circumference * (1 - fraction)}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
          className={`transition-[stroke-dashoffset] duration-300 ease-out ${
            exceeded ? 'stroke-emerald-500' : 'stroke-indigo-500'
          }`}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-2xl font-semibold tabular-nums">{label}</span>
        {sublabel && (
          <span className="mt-0.5 text-xs text-slate-500 tabular-nums dark:text-slate-400">
            {sublabel}
          </span>
        )}
      </div>
    </div>
  );
}
