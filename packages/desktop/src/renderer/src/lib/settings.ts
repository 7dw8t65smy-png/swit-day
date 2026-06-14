import { create } from 'zustand';
import { api } from '../api';

// Shape of all app settings. Server stores everything as Record<string,string>;
// we parse/stringify on the boundary so the rest of the app sees typed values.
export interface AppSettings {
  // Profile
  user_name: string;
  start_page: string;
  /** Whether the first-launch onboarding wizard has been completed/skipped. */
  onboarded: boolean;
  confirm_delete: boolean;
  autostart: boolean;
  minimize_to_tray: boolean;
  show_tray_icon: boolean;

  // Appearance
  theme: 'light' | 'dark' | 'system';
  accent_color: string;
  ui_density: 'compact' | 'normal' | 'spacious';
  show_completed_tasks: boolean;
  week_starts_on: 'mon' | 'sun';
  currency: 'RUB' | 'USD';

  // Workday
  day_start: string;
  day_end: string;
  pomodoro_work_min: number;
  pomodoro_break_min: number;
  pomodoro_long_break_min: number;
  pomodoro_sessions_before_long: number;
  default_project_id: string;
  default_priority: 'low' | 'normal' | 'high' | 'urgent';
  default_difficulty: 'easy' | 'medium' | 'hard';
  default_event_reminder_min: number;

  // Notifications
  notify_enabled: boolean;
  notify_routines: boolean;
  notify_events: boolean;
  notify_reminders: boolean;
  notify_pomodoro: boolean;
  notify_day_start: boolean;
  notify_day_end: boolean;
  notify_sound: boolean;
  notify_quiet_enabled: boolean;
  notify_quiet_start: string;
  notify_quiet_end: string;

  // Reminder presets (JSON-encoded array). The shape is parsed by
  // `lib/reminderPresets.ts`. Each preset has { name, offsets: number[] minutes }.
  reminder_presets: string;
  // Which preset to use for each source kind. Names refer into
  // reminder_presets. The reserved "Без напоминаний" sentinel means "no pushes".
  preset_event: string;
  preset_routine: string;
  preset_task_urgent: string;
  preset_task_high: string;
  preset_task_normal: string;
  preset_task_low: string;
}

export const DEFAULT_SETTINGS: AppSettings = {
  user_name: '',
  start_page: '/today',
  onboarded: false,
  confirm_delete: true,
  autostart: false,
  minimize_to_tray: true,
  show_tray_icon: true,
  theme: 'light',
  accent_color: '#2563EB',
  ui_density: 'normal',
  show_completed_tasks: false,
  week_starts_on: 'mon',
  currency: 'RUB',
  day_start: '09:00',
  day_end: '18:00',
  pomodoro_work_min: 25,
  pomodoro_break_min: 5,
  pomodoro_long_break_min: 15,
  pomodoro_sessions_before_long: 4,
  default_project_id: '',
  default_priority: 'normal',
  default_difficulty: 'medium',
  default_event_reminder_min: 15,
  notify_enabled: true,
  notify_routines: true,
  notify_events: true,
  notify_reminders: true,
  notify_pomodoro: true,
  notify_day_start: false,
  notify_day_end: false,
  notify_sound: true,
  notify_quiet_enabled: false,
  notify_quiet_start: '22:00',
  notify_quiet_end: '08:00',
  reminder_presets: JSON.stringify([
    { name: 'Обычный', offsets: [0] },
    { name: 'Важный', offsets: [60, 0] },
    { name: 'Критичный', offsets: [1440, 60, 15, 0] }
  ]),
  preset_event: 'Обычный',
  preset_routine: 'Обычный',
  preset_task_urgent: 'Критичный',
  preset_task_high: 'Важный',
  preset_task_normal: 'Обычный',
  preset_task_low: 'Без напоминаний'
};

// --- Encoding ---
// Server speaks Record<string,string>. Booleans = '0'|'1', numbers stringified.

function decode(raw: Record<string, string>): AppSettings {
  const get = (k: keyof AppSettings, fallback: string): string =>
    raw[k as string] !== undefined ? raw[k as string]! : fallback;
  const bool = (k: keyof AppSettings, fallback: boolean): boolean => {
    const v = raw[k as string];
    if (v === undefined) return fallback;
    return v === '1' || v === 'true';
  };
  const num = (k: keyof AppSettings, fallback: number): number => {
    const v = raw[k as string];
    if (v === undefined || v === '') return fallback;
    const n = Number(v);
    return Number.isFinite(n) ? n : fallback;
  };
  return {
    user_name: get('user_name', DEFAULT_SETTINGS.user_name),
    start_page: get('start_page', DEFAULT_SETTINGS.start_page),
    onboarded: bool('onboarded', DEFAULT_SETTINGS.onboarded),
    confirm_delete: bool('confirm_delete', DEFAULT_SETTINGS.confirm_delete),
    autostart: bool('autostart', DEFAULT_SETTINGS.autostart),
    minimize_to_tray: bool('minimize_to_tray', DEFAULT_SETTINGS.minimize_to_tray),
    show_tray_icon: bool('show_tray_icon', DEFAULT_SETTINGS.show_tray_icon),
    theme: get('theme', DEFAULT_SETTINGS.theme) as AppSettings['theme'],
    accent_color: get('accent_color', DEFAULT_SETTINGS.accent_color),
    ui_density: get('ui_density', DEFAULT_SETTINGS.ui_density) as AppSettings['ui_density'],
    show_completed_tasks: bool('show_completed_tasks', DEFAULT_SETTINGS.show_completed_tasks),
    week_starts_on: get(
      'week_starts_on',
      DEFAULT_SETTINGS.week_starts_on
    ) as AppSettings['week_starts_on'],
    currency: get('currency', DEFAULT_SETTINGS.currency) as AppSettings['currency'],
    day_start: get('day_start', DEFAULT_SETTINGS.day_start),
    day_end: get('day_end', DEFAULT_SETTINGS.day_end),
    pomodoro_work_min: num('pomodoro_work_min', DEFAULT_SETTINGS.pomodoro_work_min),
    pomodoro_break_min: num('pomodoro_break_min', DEFAULT_SETTINGS.pomodoro_break_min),
    pomodoro_long_break_min: num(
      'pomodoro_long_break_min',
      DEFAULT_SETTINGS.pomodoro_long_break_min
    ),
    pomodoro_sessions_before_long: num(
      'pomodoro_sessions_before_long',
      DEFAULT_SETTINGS.pomodoro_sessions_before_long
    ),
    default_project_id: get('default_project_id', DEFAULT_SETTINGS.default_project_id),
    default_priority: get(
      'default_priority',
      DEFAULT_SETTINGS.default_priority
    ) as AppSettings['default_priority'],
    default_difficulty: get(
      'default_difficulty',
      DEFAULT_SETTINGS.default_difficulty
    ) as AppSettings['default_difficulty'],
    default_event_reminder_min: num(
      'default_event_reminder_min',
      DEFAULT_SETTINGS.default_event_reminder_min
    ),
    notify_enabled: bool('notify_enabled', DEFAULT_SETTINGS.notify_enabled),
    notify_routines: bool('notify_routines', DEFAULT_SETTINGS.notify_routines),
    notify_events: bool('notify_events', DEFAULT_SETTINGS.notify_events),
    notify_reminders: bool('notify_reminders', DEFAULT_SETTINGS.notify_reminders),
    notify_pomodoro: bool('notify_pomodoro', DEFAULT_SETTINGS.notify_pomodoro),
    notify_day_start: bool('notify_day_start', DEFAULT_SETTINGS.notify_day_start),
    notify_day_end: bool('notify_day_end', DEFAULT_SETTINGS.notify_day_end),
    notify_sound: bool('notify_sound', DEFAULT_SETTINGS.notify_sound),
    notify_quiet_enabled: bool('notify_quiet_enabled', DEFAULT_SETTINGS.notify_quiet_enabled),
    notify_quiet_start: get('notify_quiet_start', DEFAULT_SETTINGS.notify_quiet_start),
    notify_quiet_end: get('notify_quiet_end', DEFAULT_SETTINGS.notify_quiet_end),
    reminder_presets: get('reminder_presets', DEFAULT_SETTINGS.reminder_presets),
    preset_event: get('preset_event', DEFAULT_SETTINGS.preset_event),
    preset_routine: get('preset_routine', DEFAULT_SETTINGS.preset_routine),
    preset_task_urgent: get('preset_task_urgent', DEFAULT_SETTINGS.preset_task_urgent),
    preset_task_high: get('preset_task_high', DEFAULT_SETTINGS.preset_task_high),
    preset_task_normal: get('preset_task_normal', DEFAULT_SETTINGS.preset_task_normal),
    preset_task_low: get('preset_task_low', DEFAULT_SETTINGS.preset_task_low)
  };
}

function encode(s: AppSettings): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(s)) {
    if (typeof v === 'boolean') out[k] = v ? '1' : '0';
    else out[k] = String(v);
  }
  return out;
}

// --- Runtime side-effects ---
// Anything that needs to physically change the DOM/CSS lives here.

function shade(hex: string, percent: number): string {
  // Lighten (percent > 0) or darken (percent < 0). percent in [-1, 1].
  const m = hex.replace('#', '').match(/.{2}/g);
  if (!m) return hex;
  const [r, g, b] = m.map((p) => parseInt(p, 16));
  const adj = (c: number): number => {
    if (percent >= 0) return Math.round(c + (255 - c) * percent);
    return Math.round(c * (1 + percent));
  };
  const to = (c: number): string => Math.max(0, Math.min(255, c)).toString(16).padStart(2, '0');
  return `#${to(adj(r))}${to(adj(g))}${to(adj(b))}`;
}

function applyAccent(color: string): void {
  const root = document.documentElement;
  root.style.setProperty('--color-accent', color);
  root.style.setProperty('--color-accent-hover', shade(color, -0.15));
  // Light tint: very pale version for backgrounds. Different per theme.
  const isDark = root.classList.contains('dark');
  root.style.setProperty('--color-accent-light', isDark ? shade(color, -0.7) : shade(color, 0.9));
  root.style.setProperty('--color-accent-text', shade(color, -0.2));
  // Keep `--color-work` in sync so stats/journal charts reflect the new accent.
  root.style.setProperty('--color-work', color);
}

function applyDensity(d: 'compact' | 'normal' | 'spacious'): void {
  // Drive density through root font-size — most Tailwind utilities are rem-based,
  // so cards/labels scale together. Fixed text-[10px] etc. stay fixed (by design,
  // those are intentionally small hints).
  const root = document.documentElement;
  root.classList.remove('density-compact', 'density-normal', 'density-spacious');
  root.classList.add(`density-${d}`);
  root.style.setProperty(
    'font-size',
    d === 'compact' ? '13px' : d === 'spacious' ? '17px' : '15px'
  );
}

function applyTheme(theme: 'light' | 'dark' | 'system'): void {
  const root = document.documentElement;
  const dark =
    theme === 'dark' ||
    (theme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);
  root.classList.toggle('dark', dark);
}

export function applyAllSideEffects(s: AppSettings): void {
  applyTheme(s.theme);
  applyAccent(s.accent_color);
  applyDensity(s.ui_density);
}

// --- Store ---

interface SettingsStore {
  settings: AppSettings;
  loaded: boolean;
  load: () => Promise<void>;
  /** Patch one or more keys in memory AND apply runtime side-effects immediately.
   *  Does NOT persist to the server — call `save()` for that. */
  update: <K extends keyof AppSettings>(key: K, value: AppSettings[K]) => void;
  /** Bulk replace (used on Save Cancel/Reset). */
  replace: (s: AppSettings) => void;
  /** Persist current in-memory state to the server. */
  save: () => Promise<void>;
}

export const useSettings = create<SettingsStore>((set, get) => ({
  settings: DEFAULT_SETTINGS,
  loaded: false,

  load: async (): Promise<void> => {
    try {
      const raw = await api.getSettings();
      const s = decode(raw);
      applyAllSideEffects(s);
      set({ settings: s, loaded: true });
    } catch {
      // server warming up — keep defaults, leave loaded=false so caller can retry
      applyAllSideEffects(DEFAULT_SETTINGS);
    }
  },

  update: (key, value): void => {
    const next = { ...get().settings, [key]: value };
    // Apply immediately if the change is visual — user sees feedback right away,
    // even before they hit Save.
    if (key === 'accent_color') applyAccent(next.accent_color);
    if (key === 'ui_density') applyDensity(next.ui_density);
    if (key === 'theme') applyTheme(next.theme);
    set({ settings: next });
  },

  replace: (s): void => {
    applyAllSideEffects(s);
    set({ settings: s });
  },

  save: async (): Promise<void> => {
    await api.setSettings(encode(get().settings));
  }
}));
