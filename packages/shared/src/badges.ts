import type { HabitBadgeInfo } from './types.js';

/**
 * Фиксированный набор бэйджей. «Единица» streak зависит от cadence привычки —
 * для daily/specific_days это дни, для weekly_n недели, для monthly_day месяцы.
 * Подписи отображения формируются в UI с учётом единицы; здесь только пороги.
 */
export const HABIT_BADGES: ReadonlyArray<Omit<HabitBadgeInfo, 'unlocked'>> = [
  { id: 'streak-7',   kind: 'streak', threshold: 7,   label: 'Неделя огня',  emoji: '🔥' },
  { id: 'streak-14',  kind: 'streak', threshold: 14,  label: 'Две недели',   emoji: '🔥' },
  { id: 'streak-30',  kind: 'streak', threshold: 30,  label: 'Месяц',        emoji: '⭐' },
  { id: 'streak-60',  kind: 'streak', threshold: 60,  label: 'Два месяца',   emoji: '💎' },
  { id: 'streak-100', kind: 'streak', threshold: 100, label: 'Сотка',        emoji: '👑' },
  { id: 'total-10',   kind: 'total',  threshold: 10,  label: 'Десятка',      emoji: '✨' },
  { id: 'total-50',   kind: 'total',  threshold: 50,  label: 'Полусотня',    emoji: '🏆' },
  { id: 'total-100',  kind: 'total',  threshold: 100, label: 'Сто раз',      emoji: '🎯' },
  { id: 'total-365',  kind: 'total',  threshold: 365, label: 'Год привычки', emoji: '🌟' }
];

/**
 * Цвет «пламени» в зависимости от текущего стрика. Возвращает CSS-цвет
 * или ключ 'gradient' / 'rainbow' для специальной обработки.
 */
export function streakTier(streak: number): {
  tier: 'cold' | 'warm' | 'orange' | 'red' | 'purple' | 'rainbow' | 'royal';
  color: string;
  label: string;
} {
  if (streak >= 100) return { tier: 'royal',   color: '#FBBF24', label: 'Корона' };
  if (streak >= 60)  return { tier: 'rainbow', color: '#A855F7', label: 'Радужный' };
  if (streak >= 30)  return { tier: 'purple',  color: '#A855F7', label: 'Фиолетовый' };
  if (streak >= 14)  return { tier: 'red',     color: '#EF4444', label: 'Красный' };
  if (streak >= 7)   return { tier: 'orange',  color: '#F97316', label: 'Оранжевый' };
  if (streak >= 1)   return { tier: 'warm',    color: '#FBBF24', label: 'Тёплый' };
  return { tier: 'cold', color: '#94A3B8', label: 'Потушен' };
}
