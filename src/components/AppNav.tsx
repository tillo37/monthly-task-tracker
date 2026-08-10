import { BarChart3, CheckSquare, Timer, Trophy } from 'lucide-react';
import { hashFor, type Section } from '../hooks/useRoute';

interface AppNavProps {
  section: Section;
  onNavigate: (section: Section) => void;
  /** Shown on the Time Tracker tab while a timer is running. */
  runningLabel?: string;
  /** Hidden in local-only mode, where there is nobody to rank against. */
  showLeaderboard?: boolean;
}

const ITEMS: { section: Section; label: string; icon: typeof CheckSquare }[] = [
  { section: 'tasks', label: 'Tasks', icon: CheckSquare },
  { section: 'time', label: 'Time Tracker', icon: Timer },
  { section: 'reports', label: 'Reports', icon: BarChart3 },
  { section: 'leaderboard', label: 'Leaderboard', icon: Trophy },
];

/**
 * Primary section navigation. Real anchors so the hash routes are linkable and
 * middle-clickable, with the click intercepted only to keep state in step.
 */
export function AppNav({ section, onNavigate, runningLabel, showLeaderboard }: AppNavProps) {
  const items = showLeaderboard ? ITEMS : ITEMS.filter((item) => item.section !== 'leaderboard');

  return (
    <nav aria-label="Sections" className="flex items-center gap-1">
      {items.map((item) => {
        const active = item.section === section;
        const Icon = item.icon;

        return (
          <a
            key={item.section}
            href={hashFor(item.section)}
            aria-current={active ? 'page' : undefined}
            aria-label={
              item.section === 'time' && runningLabel
                ? `${item.label} — timer running, ${runningLabel}`
                : item.label
            }
            onClick={(event) => {
              // Leave modified clicks to the browser (new tab, new window).
              if (event.metaKey || event.ctrlKey || event.shiftKey || event.button !== 0) return;
              event.preventDefault();
              onNavigate(item.section);
            }}
            className={`btn btn-md gap-1.5 ${
              active
                ? 'bg-indigo-50 text-indigo-700 dark:bg-indigo-500/15 dark:text-indigo-300'
                : 'btn-ghost'
            }`}
          >
            <Icon className="h-4 w-4" aria-hidden="true" />
            {/* Both labels are decorative: the anchor carries the real name. */}
            <span className="hidden sm:inline" aria-hidden="true">
              {item.label}
            </span>
            <span className="sm:hidden" aria-hidden="true">
              {item.label.split(' ')[0]}
            </span>
            {item.section === 'time' && runningLabel && (
              <span
                className="ml-0.5 rounded-full bg-emerald-100 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-700 tabular-nums dark:bg-emerald-500/15 dark:text-emerald-300"
                title="Timer running"
              >
                {runningLabel}
              </span>
            )}
          </a>
        );
      })}
    </nav>
  );
}
