import type { SelectableCadence } from './types';

export const HABIT_ICONS = ['🏃', '💧', '📚', '🧘', '☕', '💪', '🌅', '🛌', '✍️', '🎨', '🎵', '🍎', '💼', '💳', '📞', '📨'];

export const SELECTABLE_CADENCES: { value: SelectableCadence; label: string; hint: string }[] = [
  { value: 'daily', label: 'Каждый день', hint: 'Без выходных' },
  { value: 'specific_days', label: 'По дням недели', hint: 'Например, Пн–Ср–Пт' },
  { value: 'weekly_n', label: 'N раз в неделю', hint: 'В любые дни недели' },
  { value: 'monthly_day', label: 'Раз в месяц', hint: 'По числу месяца' }
];

export const WEEKDAY_PICKERS: { wd: number; label: string }[] = [
  { wd: 1, label: 'Пн' },
  { wd: 2, label: 'Вт' },
  { wd: 3, label: 'Ср' },
  { wd: 4, label: 'Чт' },
  { wd: 5, label: 'Пт' },
  { wd: 6, label: 'Сб' },
  { wd: 0, label: 'Вс' }
];
