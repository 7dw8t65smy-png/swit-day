import type { AppSettings } from '../../lib/settings';

export type Category =
  | 'general'
  | 'appearance'
  | 'workday'
  | 'notifications'
  | 'data'
  | 'about';

export type PatchFn = <K extends keyof AppSettings>(key: K, value: AppSettings[K]) => void;
