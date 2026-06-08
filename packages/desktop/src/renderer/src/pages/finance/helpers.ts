import { Wallet, BarChart3, Target, Tags, Repeat, type LucideIcon } from 'lucide-react';
import type { RecurringTransaction, TransactionKind } from '@swit/shared';
import { ymd } from '../../lib/finance';

export type Tab = 'transactions' | 'analytics' | 'budgets' | 'recurring' | 'categories';

export const TABS: { key: Tab; label: string; icon: LucideIcon }[] = [
  { key: 'transactions', label: 'Транзакции', icon: Wallet },
  { key: 'analytics',    label: 'Аналитика',  icon: BarChart3 },
  { key: 'budgets',      label: 'Бюджеты',    icon: Target },
  { key: 'recurring',    label: 'Регулярные', icon: Repeat },
  { key: 'categories',   label: 'Категории',  icon: Tags }
];

export const WEEKDAY_NAMES = ['Пн','Вт','Ср','Чт','Пт','Сб','Вс'];

export function describeSchedule(r: RecurringTransaction): string {
  if (r.period === 'monthly') {
    return `${r.day_of_month ?? 1}-го числа`;
  }
  const idx = (r.day_of_week ?? 1) - 1;
  return `по ${WEEKDAY_NAMES[idx]?.toLowerCase() ?? '?'}`;
}

/**
 * Когда регулярный платёж сработает в следующий раз. Возвращает YYYY-MM-DD или null,
 * если расчёт не имеет смысла (например, ежемесячный с day_of_month = null).
 */
export function nextDueDate(r: RecurringTransaction): string | null {
  const now = new Date();
  if (r.period === 'monthly') {
    const dom = r.day_of_month ?? 1;
    const candidate = new Date(now.getFullYear(), now.getMonth(), dom);
    if (candidate < new Date(now.getFullYear(), now.getMonth(), now.getDate())) {
      candidate.setMonth(candidate.getMonth() + 1);
    }
    // Защита от 31 февраля и т.п. — сдвинется на 1 марта; ок.
    return ymd(candidate);
  }
  // weekly: 1..7 (Mon..Sun); JS getDay: 0=Sun..6=Sat → переводим.
  const targetDow = r.day_of_week ?? 1;
  const jsTarget = targetDow === 7 ? 0 : targetDow;
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const delta = (jsTarget - today.getDay() + 7) % 7 || 7;
  const next = new Date(today);
  next.setDate(next.getDate() + delta);
  return ymd(next);
}

/**
 * Парсит строку быстрого добавления.
 * Примеры:
 *   «Кофе 250»            → expense, 250, описание = "Кофе"
 *   «+5000 Зарплата»      → income,  5000, описание = "Зарплата"
 *   «−1200 Такси»         → expense, 1200, описание = "Такси"
 *   «обед 350 еда»        → expense, 350,  описание = "обед", категория = "еда"
 * Возвращает null, если не нашли число.
 */
export function parseQuickAdd(input: string): {
  amount: number;
  kind: TransactionKind;
  description: string;
  categoryName: string | null;
} | null {
  const s = input.trim();
  if (!s) return null;
  // Найти первое число
  const numMatch = s.match(/(?:^|\s)([+\-−]?\s*\d+(?:[.,]\d+)?)(?=\s|$)/);
  if (!numMatch) return null;
  const raw = numMatch[1].replace(/\s/g, '').replace(',', '.').replace('−', '-');
  const num = Number(raw);
  if (!Number.isFinite(num)) return null;
  const isIncome = /^\+/.test(raw);
  const amount = Math.abs(num);
  const numIndex = numMatch.index! + (numMatch[0].length - numMatch[1].length);
  const before = s.slice(0, numIndex).trim();
  const after = s.slice(numIndex + numMatch[1].length).trim();
  // Описание — кусок без числа. Категория, если есть, — последнее слово после числа.
  let description = '';
  let categoryName: string | null = null;
  if (before && after) {
    description = before;
    categoryName = after;
  } else if (before) {
    description = before;
  } else {
    description = after;
  }
  if (!description) description = 'Транзакция';
  return {
    amount,
    kind: isIncome ? 'income' : 'expense',
    description,
    categoryName
  };
}

export function pluralize(n: number, forms: [string, string, string]): string {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return forms[0];
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20)) return forms[1];
  return forms[2];
}

export function formatDay(date: string): string {
  const d = new Date(date + 'T00:00:00');
  const today = new Date();
  const yesterday = new Date(today.getFullYear(), today.getMonth(), today.getDate() - 1);
  if (date === ymd(today)) return 'Сегодня';
  if (date === ymd(yesterday)) return 'Вчера';
  return d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', weekday: 'short' });
}
