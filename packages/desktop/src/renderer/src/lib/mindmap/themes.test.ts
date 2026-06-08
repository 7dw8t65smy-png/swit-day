import { describe, it, expect } from 'vitest';
import { THEMES, DEFAULT_THEME, getTheme } from './themes';

describe('themes', () => {
  it('getTheme возвращает тему по ключу', () => {
    expect(getTheme('aurora').key).toBe('aurora');
  });
  it('getTheme откатывается к дефолтной для неизвестного/пустого ключа', () => {
    expect(getTheme('nope').key).toBe(DEFAULT_THEME);
    expect(getTheme(undefined).key).toBe(DEFAULT_THEME);
    expect(getTheme(null).key).toBe(DEFAULT_THEME);
  });
  it('у каждой темы есть палитра и цвет корня', () => {
    for (const t of THEMES) {
      expect(t.branchColors.length).toBeGreaterThanOrEqual(4);
      expect(t.rootColor).toMatch(/^#/);
    }
  });
});
