import type { ExpenseCategory, PaymentMethod, TransactionKind } from '@swit/shared';

export const DEFAULT_CATEGORIES: {
  name: string;
  icon: string;
  color: string;
  kind: TransactionKind;
}[] = [
  { name: 'Еда',          icon: '🍔', color: '#EA580C', kind: 'expense' },
  { name: 'Транспорт',    icon: '🚕', color: '#0284C7', kind: 'expense' },
  { name: 'Дом',          icon: '🏠', color: '#65A30D', kind: 'expense' },
  { name: 'Подписки',     icon: '💳', color: '#7C3AED', kind: 'expense' },
  { name: 'Здоровье',     icon: '💊', color: '#DC2626', kind: 'expense' },
  { name: 'Одежда',       icon: '👕', color: '#DB2777', kind: 'expense' },
  { name: 'Работа',       icon: '💼', color: '#475569', kind: 'expense' },
  { name: 'Развлечения',  icon: '🎮', color: '#D97706', kind: 'expense' },
  { name: 'Другое',       icon: '📦', color: '#94A3B8', kind: 'expense' },
  // Income side — small default set
  { name: 'Зарплата',     icon: '💰', color: '#059669', kind: 'income' },
  { name: 'Подработка',   icon: '✨', color: '#0891B2', kind: 'income' },
  { name: 'Возврат',      icon: '↩️', color: '#65A30D', kind: 'income' }
];

export const PAYMENT_METHODS: { value: PaymentMethod; label: string; icon: string }[] = [
  { value: 'cash',     label: 'Наличные', icon: '💵' },
  { value: 'card',     label: 'Карта',    icon: '💳' },
  { value: 'transfer', label: 'Перевод',  icon: '🔁' },
  { value: 'other',    label: 'Другое',   icon: '·'  }
];

export function paymentLabel(m: PaymentMethod): string {
  return PAYMENT_METHODS.find((p) => p.value === m)?.label ?? m;
}

export function paymentIcon(m: PaymentMethod): string {
  return PAYMENT_METHODS.find((p) => p.value === m)?.icon ?? '·';
}

/**
 * Returns the YYYY-MM-DD range for a given preset.
 *   today        — just today
 *   week         — Monday..today  (rolling 7 days simpler — actually start of current week)
 *   month        — first of month..today
 *   year         — Jan 1..today
 *   all          — empty range (no filter)
 */
export type PeriodPreset = 'today' | 'week' | 'month' | 'year' | 'all' | 'custom';

export function presetRange(p: Exclude<PeriodPreset, 'custom' | 'all'>): { from: string; to: string } {
  const now = new Date();
  const y = now.getFullYear();
  const m = now.getMonth();
  const d = now.getDate();
  const today = ymd(now);
  switch (p) {
    case 'today':
      return { from: today, to: today };
    case 'week': {
      const day = now.getDay(); // 0=Sun
      const mondayOffset = (day === 0 ? 6 : day - 1);
      const monday = new Date(y, m, d - mondayOffset);
      return { from: ymd(monday), to: today };
    }
    case 'month':
      return { from: ymd(new Date(y, m, 1)), to: today };
    case 'year':
      return { from: ymd(new Date(y, 0, 1)), to: today };
  }
}

export function ymd(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function categoryById(
  cats: ExpenseCategory[]
): Map<string, ExpenseCategory> {
  return new Map(cats.map((c) => [c.id, c] as const));
}
