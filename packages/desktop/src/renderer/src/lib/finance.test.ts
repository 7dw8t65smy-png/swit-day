import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { paymentLabel, paymentIcon, presetRange, ymd, categoryById, PAYMENT_METHODS } from './finance';
import type { ExpenseCategory, PaymentMethod } from '@swit/shared';

// ---------------------------------------------------------------------------
// paymentLabel / paymentIcon
// ---------------------------------------------------------------------------

describe('paymentLabel', () => {
  it('returns "Наличные" for cash', () => {
    expect(paymentLabel('cash')).toBe('Наличные');
  });

  it('returns "Карта" for card', () => {
    expect(paymentLabel('card')).toBe('Карта');
  });

  it('returns "Перевод" for transfer', () => {
    expect(paymentLabel('transfer')).toBe('Перевод');
  });

  it('returns "Другое" for other', () => {
    expect(paymentLabel('other')).toBe('Другое');
  });

  it('falls back to the raw value for unknown method', () => {
    const unknown = 'crypto' as PaymentMethod;
    expect(paymentLabel(unknown)).toBe('crypto');
  });
});

describe('paymentIcon', () => {
  it('returns icon for cash', () => {
    expect(paymentIcon('cash')).toBe('💵');
  });

  it('returns icon for card', () => {
    expect(paymentIcon('card')).toBe('💳');
  });

  it('returns "·" fallback for unknown method', () => {
    expect(paymentIcon('unknown' as PaymentMethod)).toBe('·');
  });
});

describe('PAYMENT_METHODS', () => {
  it('has 4 entries', () => {
    expect(PAYMENT_METHODS).toHaveLength(4);
  });

  it('all entries have value, label and icon', () => {
    for (const m of PAYMENT_METHODS) {
      expect(typeof m.value).toBe('string');
      expect(typeof m.label).toBe('string');
      expect(typeof m.icon).toBe('string');
    }
  });
});

// ---------------------------------------------------------------------------
// ymd
// ---------------------------------------------------------------------------

describe('ymd', () => {
  it('formats a date as YYYY-MM-DD', () => {
    expect(ymd(new Date(2024, 0, 5))).toBe('2024-01-05');   // Jan 5
    expect(ymd(new Date(2024, 11, 31))).toBe('2024-12-31'); // Dec 31
  });

  it('pads month and day with leading zeros', () => {
    expect(ymd(new Date(2024, 5, 3))).toBe('2024-06-03');
  });
});

// ---------------------------------------------------------------------------
// presetRange — uses `new Date()` internally; freeze time for determinism
// ---------------------------------------------------------------------------

describe('presetRange', () => {
  // Fix "today" to Wednesday June 12 2024 (getDay()=3, not Mon/Sun edge case)
  const FIXED = new Date(2024, 5, 12); // local June 12 2024

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(FIXED);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('today → from and to are both today', () => {
    const { from, to } = presetRange('today');
    expect(from).toBe('2024-06-12');
    expect(to).toBe('2024-06-12');
  });

  it('month → from is first of month, to is today', () => {
    const { from, to } = presetRange('month');
    expect(from).toBe('2024-06-01');
    expect(to).toBe('2024-06-12');
  });

  it('year → from is Jan 1 of current year, to is today', () => {
    const { from, to } = presetRange('year');
    expect(from).toBe('2024-01-01');
    expect(to).toBe('2024-06-12');
  });

  it('week → from is Monday of current week (Jun 10), to is today', () => {
    // Wednesday Jun 12 → Monday = Jun 10
    const { from, to } = presetRange('week');
    expect(from).toBe('2024-06-10');
    expect(to).toBe('2024-06-12');
  });

  it('week on Monday → from and to are the same Monday', () => {
    vi.setSystemTime(new Date(2024, 5, 10)); // Monday
    const { from, to } = presetRange('week');
    expect(from).toBe('2024-06-10');
    expect(to).toBe('2024-06-10');
  });

  it('week on Sunday → from is previous Monday', () => {
    vi.setSystemTime(new Date(2024, 5, 16)); // Sunday
    const { from, to } = presetRange('week');
    expect(from).toBe('2024-06-10'); // Monday Jun 10
    expect(to).toBe('2024-06-16');
  });
});

// ---------------------------------------------------------------------------
// categoryById
// ---------------------------------------------------------------------------

describe('categoryById', () => {
  const cats: ExpenseCategory[] = [
    { id: 'c1', name: 'Еда', icon: '🍔', color: '#EA580C', kind: 'expense', monthly_limit: null, archived: 0, sort_order: 0, created_at: '', updated_at: '' },
    { id: 'c2', name: 'Доход', icon: null, color: null, kind: 'income', monthly_limit: 10000, archived: 0, sort_order: 1, created_at: '', updated_at: '' }
  ];

  it('builds a map keyed by id', () => {
    const map = categoryById(cats);
    expect(map.size).toBe(2);
    expect(map.get('c1')?.name).toBe('Еда');
    expect(map.get('c2')?.kind).toBe('income');
  });

  it('returns empty map for empty array', () => {
    expect(categoryById([])).toEqual(new Map());
  });
});
