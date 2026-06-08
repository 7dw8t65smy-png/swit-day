import { describe, it, expect } from 'vitest';
import { streakTier, HABIT_BADGES } from './badges.js';

describe('HABIT_BADGES', () => {
  it('contains exactly 9 badges', () => {
    expect(HABIT_BADGES).toHaveLength(9);
  });

  it('all badges have required fields', () => {
    for (const b of HABIT_BADGES) {
      expect(typeof b.id).toBe('string');
      expect(b.id.length).toBeGreaterThan(0);
      expect(b.kind === 'streak' || b.kind === 'total').toBe(true);
      expect(typeof b.threshold).toBe('number');
      expect(b.threshold).toBeGreaterThan(0);
      expect(typeof b.label).toBe('string');
      expect(typeof b.emoji).toBe('string');
    }
  });

  it('streak badges have ascending thresholds', () => {
    const streakBadges = HABIT_BADGES.filter((b) => b.kind === 'streak');
    for (let i = 1; i < streakBadges.length; i++) {
      expect(streakBadges[i].threshold).toBeGreaterThan(streakBadges[i - 1].threshold);
    }
  });

  it('total badges have ascending thresholds', () => {
    const totalBadges = HABIT_BADGES.filter((b) => b.kind === 'total');
    for (let i = 1; i < totalBadges.length; i++) {
      expect(totalBadges[i].threshold).toBeGreaterThan(totalBadges[i - 1].threshold);
    }
  });

  it('all badge ids are unique', () => {
    const ids = HABIT_BADGES.map((b) => b.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe('streakTier', () => {
  it('returns "cold" tier for streak 0', () => {
    const result = streakTier(0);
    expect(result.tier).toBe('cold');
    expect(result.color).toBe('#94A3B8');
  });

  it('returns "warm" tier for streak 1', () => {
    const result = streakTier(1);
    expect(result.tier).toBe('warm');
  });

  it('returns "warm" tier for streak 6 (just below orange threshold)', () => {
    expect(streakTier(6).tier).toBe('warm');
  });

  it('returns "orange" tier for streak 7 (boundary)', () => {
    const result = streakTier(7);
    expect(result.tier).toBe('orange');
    expect(result.color).toBe('#F97316');
  });

  it('returns "orange" tier for streak 13', () => {
    expect(streakTier(13).tier).toBe('orange');
  });

  it('returns "red" tier for streak 14 (boundary)', () => {
    const result = streakTier(14);
    expect(result.tier).toBe('red');
    expect(result.color).toBe('#EF4444');
  });

  it('returns "red" tier for streak 29', () => {
    expect(streakTier(29).tier).toBe('red');
  });

  it('returns "purple" tier for streak 30 (boundary)', () => {
    const result = streakTier(30);
    expect(result.tier).toBe('purple');
    expect(result.color).toBe('#A855F7');
  });

  it('returns "purple" tier for streak 59', () => {
    expect(streakTier(59).tier).toBe('purple');
  });

  it('returns "rainbow" tier for streak 60 (boundary)', () => {
    const result = streakTier(60);
    expect(result.tier).toBe('rainbow');
  });

  it('returns "rainbow" tier for streak 99', () => {
    expect(streakTier(99).tier).toBe('rainbow');
  });

  it('returns "royal" tier for streak 100 (boundary)', () => {
    const result = streakTier(100);
    expect(result.tier).toBe('royal');
    expect(result.color).toBe('#FBBF24');
  });

  it('returns "royal" tier for very large streaks', () => {
    expect(streakTier(1000).tier).toBe('royal');
  });

  it('every tier result has a non-empty label', () => {
    for (const n of [0, 1, 7, 14, 30, 60, 100]) {
      expect(streakTier(n).label.length).toBeGreaterThan(0);
    }
  });
});
