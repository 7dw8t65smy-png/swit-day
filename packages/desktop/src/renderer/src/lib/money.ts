import { useSettings } from './settings';

/** Currency symbol for display. */
export function currencySymbol(c: 'RUB' | 'USD' = 'RUB'): string {
  return c === 'USD' ? '$' : '₽';
}

/**
 * Format a money value with thousands separator and the user's currency symbol.
 * Negative values render with a minus prefix, never parentheses.
 *
 * - `1234.56` → `1 234.56 ₽`
 * - `1000`    → `1 000 ₽`   (no trailing .00 if it's a whole number)
 */
export function fmtMoney(value: number, c: 'RUB' | 'USD' = 'RUB'): string {
  const abs = Math.abs(value);
  const isWhole = Math.round(abs) === abs;
  const formatted = isWhole
    ? abs.toLocaleString('ru-RU', { maximumFractionDigits: 0 })
    : abs.toLocaleString('ru-RU', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const sign = value < 0 ? '−' : '';
  return `${sign}${formatted} ${currencySymbol(c)}`;
}

/** Hook to read the current currency reactively. */
export function useCurrency(): 'RUB' | 'USD' {
  return useSettings((s) => s.settings.currency);
}

/** Bound formatter for the user's current currency, reactive. */
export function useFmtMoney(): (value: number) => string {
  const c = useCurrency();
  return (v: number) => fmtMoney(v, c);
}
