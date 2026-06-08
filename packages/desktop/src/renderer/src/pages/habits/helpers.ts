import type { Habit, HabitCadenceConfig } from '@swit/shared';
import { parseCadenceConfig } from '../../lib/habits';
import type { SelectableCadence } from './types';

export function normalizeCadence(habit: Habit | null): {
  cadence: SelectableCadence;
  config: HabitCadenceConfig;
} {
  if (!habit) return { cadence: 'daily', config: {} };
  const cfg = parseCadenceConfig(habit);
  switch (habit.cadence) {
    case 'daily':
    case 'specific_days':
    case 'weekly_n':
    case 'monthly_day':
      return { cadence: habit.cadence, config: cfg };
    case 'weekdays':
      return { cadence: 'specific_days', config: { weekdays: [1, 2, 3, 4, 5] } };
    case 'weekly':
      return { cadence: 'weekly_n', config: { times_per_week: 1 } };
    default:
      return { cadence: 'daily', config: {} };
  }
}

export function formatPastDate(date: string): string {
  const d = new Date(date + 'T00:00:00');
  const today = new Date();
  const yesterday = new Date(today.getFullYear(), today.getMonth(), today.getDate() - 1);
  const ystr = `${yesterday.getFullYear()}-${String(yesterday.getMonth() + 1).padStart(2, '0')}-${String(yesterday.getDate()).padStart(2, '0')}`;
  if (date === ystr) return 'Вчера';
  return d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short', weekday: 'short' });
}

export function pl(n: number, one: string, few: string, many: string): string {
  const m10 = n % 10;
  const m100 = n % 100;
  if (m10 === 1 && m100 !== 11) return one;
  if (m10 >= 2 && m10 <= 4 && (m100 < 10 || m100 >= 20)) return few;
  return many;
}
