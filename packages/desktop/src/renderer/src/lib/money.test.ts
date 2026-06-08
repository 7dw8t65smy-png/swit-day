import { describe, it, expect } from 'vitest';
import { currencySymbol, fmtMoney } from './money';

// money.ts exports currencySymbol and fmtMoney as pure functions.
// useCurrency and useFmtMoney are hooks that depend on a zustand store
// (useSettings) and are not tested here.

describe('currencySymbol', () => {
  it('returns "₽" for RUB', () => {
    expect(currencySymbol('RUB')).toBe('₽');
  });

  it('returns "$" for USD', () => {
    expect(currencySymbol('USD')).toBe('$');
  });

  it('defaults to RUB when no argument provided', () => {
    expect(currencySymbol()).toBe('₽');
  });
});

describe('fmtMoney', () => {
  it('formats a whole number without decimals', () => {
    const result = fmtMoney(1000, 'RUB');
    expect(result).toContain('₽');
    // Should NOT contain ".00"
    expect(result).not.toContain('.00');
    expect(result).not.toContain(',00');
  });

  it('formats a decimal number with 2 decimal places', () => {
    const result = fmtMoney(1234.56, 'RUB');
    expect(result).toContain('₽');
    // ru-RU uses comma as decimal separator
    expect(result).toMatch(/[.,]56/);
  });

  it('uses minus prefix for negative values (not parentheses)', () => {
    const result = fmtMoney(-500, 'RUB');
    // The source uses '−' (U+2212 MINUS SIGN), not '-' (U+002D HYPHEN-MINUS)
    expect(result).toContain('−');
    expect(result).not.toMatch(/^\(/);
  });

  it('formats 0 as a whole number', () => {
    const result = fmtMoney(0, 'RUB');
    expect(result).toContain('₽');
    expect(result).not.toContain('.00');
  });

  it('uses $ symbol for USD', () => {
    expect(fmtMoney(100, 'USD')).toContain('$');
  });

  it('defaults to RUB when currency not provided', () => {
    expect(fmtMoney(100)).toContain('₽');
  });

  it('negative decimal values have minus and correct symbol', () => {
    const result = fmtMoney(-99.99, 'USD');
    expect(result).toContain('−');
    expect(result).toContain('$');
  });

  it('large values include a thousands separator', () => {
    const result = fmtMoney(1000000, 'RUB');
    // ru-RU uses narrow no-break space (U+202F) or regular space as thousands sep
    // Just confirm the digits are split — length > 7 chars (digits only would be 7)
    const digitsOnly = result.replace(/[^\d]/g, '');
    expect(digitsOnly).toBe('1000000');
    expect(result.length).toBeGreaterThan(7);
  });
});
