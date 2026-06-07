import { useSettings } from './settings';

/**
 * Returns 0 (Sunday) or 1 (Monday) — the format `date-fns` expects in
 * `{ weekStartsOn }` options. Driven by the user's setting.
 *
 * Use as: `startOfWeek(d, { weekStartsOn: weekStartsOn() })`
 * Note: this reads the CURRENT settings value at call time. Inside React
 * components, prefer the hook `useWeekStartsOn` so changes trigger re-renders.
 */
export function weekStartsOn(): 0 | 1 {
  return useSettings.getState().settings.week_starts_on === 'sun' ? 0 : 1;
}

export function useWeekStartsOn(): 0 | 1 {
  return useSettings((s) => (s.settings.week_starts_on === 'sun' ? 0 : 1));
}
