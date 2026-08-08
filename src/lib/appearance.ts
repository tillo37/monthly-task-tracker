import {
  Activity,
  BookOpen,
  Brain,
  Briefcase,
  CheckCircle2,
  Code,
  Coffee,
  Droplets,
  Dumbbell,
  Footprints,
  Guitar,
  Heart,
  Languages,
  Leaf,
  Moon,
  Music,
  PenLine,
  Salad,
  Sparkles,
  Sun,
  Target,
  Wallet,
  type LucideIcon,
} from 'lucide-react';

/** Icons a task can use. Keys are what gets persisted. */
export const TASK_ICONS: Record<string, LucideIcon> = {
  target: Target,
  dumbbell: Dumbbell,
  bookOpen: BookOpen,
  languages: Languages,
  brain: Brain,
  code: Code,
  penLine: PenLine,
  music: Music,
  guitar: Guitar,
  heart: Heart,
  leaf: Leaf,
  droplets: Droplets,
  salad: Salad,
  moon: Moon,
  sun: Sun,
  coffee: Coffee,
  footprints: Footprints,
  activity: Activity,
  briefcase: Briefcase,
  wallet: Wallet,
  sparkles: Sparkles,
  checkCircle: CheckCircle2,
};

export const ICON_KEYS = Object.keys(TASK_ICONS);

export const DEFAULT_ICON = 'target';

export function iconFor(key: string | undefined): LucideIcon {
  return (key && TASK_ICONS[key]) || TASK_ICONS[DEFAULT_ICON];
}

/** Restrained accent palette — readable on both light and dark surfaces. */
export const TASK_COLORS = [
  '#6366f1',
  '#0ea5e9',
  '#14b8a6',
  '#22c55e',
  '#eab308',
  '#f97316',
  '#ef4444',
  '#ec4899',
  '#a855f7',
  '#64748b',
] as const;

export const DEFAULT_COLOR = TASK_COLORS[0];

/** Picks the next least-used colour so new tasks stay visually distinct. */
export function nextColor(usedColors: string[]): string {
  const unused = TASK_COLORS.find((color) => !usedColors.includes(color));
  return unused ?? TASK_COLORS[usedColors.length % TASK_COLORS.length];
}

const HEX_COLOR = /^#[0-9a-fA-F]{6}$/;

export function isValidColor(value: unknown): value is string {
  return typeof value === 'string' && HEX_COLOR.test(value);
}
