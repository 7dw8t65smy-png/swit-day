import { describe, it, expect } from 'vitest';
import { parseCadenceConfig, isHabitDueOn, cadenceLabel, buildLogMap } from './habits';
import type { Habit, HabitLog } from '@swit/shared';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeHabit(overrides: Partial<Habit> = {}): Habit {
  return {
    id: 'h1',
    title: 'Test',
    description: null,
    icon: null,
    color: null,
    cadence: 'daily',
    cadence_config: null,
    target_count: 1,
    remind_time: null,
    confirm_window_h: 6,
    archived: 0,
    sort_order: 0,
    created_at: '2024-01-01T00:00:00.000Z',
    updated_at: '2024-01-01T00:00:00.000Z',
    ...overrides
  };
}

function makeLog(habit_id: string, date: string, count: number): HabitLog {
  return {
    id: `log-${date}`,
    habit_id,
    date,
    count,
    status: count > 0 ? 'done' : 'missed',
    note: null,
    created_at: `${date}T12:00:00.000Z`
  };
}

// Reference dates
const MON = new Date(2024, 5, 10); // Monday June 10 2024
const TUE = new Date(2024, 5, 11);
const WED = new Date(2024, 5, 12);
const SAT = new Date(2024, 5, 15);
const SUN = new Date(2024, 5, 16);

// ---------------------------------------------------------------------------
// parseCadenceConfig
// ---------------------------------------------------------------------------

describe('parseCadenceConfig', () => {
  it('returns {} when cadence_config is null', () => {
    expect(parseCadenceConfig(makeHabit({ cadence_config: null }))).toEqual({});
  });

  it('returns {} when cadence_config is empty string', () => {
    expect(parseCadenceConfig(makeHabit({ cadence_config: '' }))).toEqual({});
  });

  it('returns {} when cadence_config is invalid JSON', () => {
    expect(parseCadenceConfig(makeHabit({ cadence_config: 'not-json' }))).toEqual({});
  });

  it('parses weekdays correctly', () => {
    const cfg = { weekdays: [1, 3, 5] };
    const result = parseCadenceConfig(makeHabit({ cadence_config: JSON.stringify(cfg) }));
    expect(result.weekdays).toEqual([1, 3, 5]);
  });

  it('parses times_per_week correctly', () => {
    const cfg = { times_per_week: 3 };
    const result = parseCadenceConfig(makeHabit({ cadence_config: JSON.stringify(cfg) }));
    expect(result.times_per_week).toBe(3);
  });

  it('parses day_of_month correctly', () => {
    const cfg = { day_of_month: 15 };
    const result = parseCadenceConfig(makeHabit({ cadence_config: JSON.stringify(cfg) }));
    expect(result.day_of_month).toBe(15);
  });
});

// ---------------------------------------------------------------------------
// isHabitDueOn — daily
// ---------------------------------------------------------------------------

describe('isHabitDueOn (daily)', () => {
  const habit = makeHabit({ cadence: 'daily' });

  it('is due on Monday', () => {
    expect(isHabitDueOn(habit, MON)).toBe(true);
  });

  it('is due on Sunday', () => {
    expect(isHabitDueOn(habit, SUN)).toBe(true);
  });

  it('is due on Saturday', () => {
    expect(isHabitDueOn(habit, SAT)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// isHabitDueOn — specific_days
// ---------------------------------------------------------------------------

describe('isHabitDueOn (specific_days)', () => {
  const habit = makeHabit({
    cadence: 'specific_days',
    cadence_config: JSON.stringify({ weekdays: [1, 3] }) // Mon, Wed
  });

  it('is due on Monday (1)', () => {
    expect(isHabitDueOn(habit, MON)).toBe(true);
  });

  it('is due on Wednesday (3)', () => {
    expect(isHabitDueOn(habit, WED)).toBe(true);
  });

  it('is NOT due on Tuesday (2)', () => {
    expect(isHabitDueOn(habit, TUE)).toBe(false);
  });

  it('is NOT due on Saturday (6)', () => {
    expect(isHabitDueOn(habit, SAT)).toBe(false);
  });

  it('is NOT due on Sunday (0)', () => {
    expect(isHabitDueOn(habit, SUN)).toBe(false);
  });

  it('returns false for every day when weekdays is empty', () => {
    const h = makeHabit({ cadence: 'specific_days', cadence_config: JSON.stringify({ weekdays: [] }) });
    expect(isHabitDueOn(h, MON)).toBe(false);
    expect(isHabitDueOn(h, SUN)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// isHabitDueOn — weekly_n
// ---------------------------------------------------------------------------

describe('isHabitDueOn (weekly_n)', () => {
  it('returns true with no logsForHabit (no data → assume slot available)', () => {
    const habit = makeHabit({ cadence: 'weekly_n', cadence_config: JSON.stringify({ times_per_week: 3 }) });
    expect(isHabitDueOn(habit, MON, undefined)).toBe(true);
  });

  it('returns true when done count < target', () => {
    const habit = makeHabit({ cadence: 'weekly_n', cadence_config: JSON.stringify({ times_per_week: 3 }) });
    // Week of Jun 10 (Mon): one done log
    const logsMap = new Map<string, number>([['2024-06-10', 1]]);
    expect(isHabitDueOn(habit, MON, logsMap)).toBe(true);
  });

  it('returns false when done count >= target', () => {
    const habit = makeHabit({ cadence: 'weekly_n', cadence_config: JSON.stringify({ times_per_week: 2 }) });
    // Two done logs this week
    const logsMap = new Map<string, number>([
      ['2024-06-10', 1],
      ['2024-06-11', 1]
    ]);
    expect(isHabitDueOn(habit, MON, logsMap)).toBe(false);
  });

  it('logs from a different week do not count toward this week', () => {
    const habit = makeHabit({ cadence: 'weekly_n', cadence_config: JSON.stringify({ times_per_week: 1 }) });
    // Last week's log only
    const logsMap = new Map<string, number>([['2024-06-03', 1]]);
    // For the week of Jun 10, done count is still 0 < 1
    expect(isHabitDueOn(habit, MON, logsMap)).toBe(true);
  });

  it('zero-count logs are not counted as done', () => {
    const habit = makeHabit({ cadence: 'weekly_n', cadence_config: JSON.stringify({ times_per_week: 1 }) });
    const logsMap = new Map<string, number>([['2024-06-10', 0]]);
    expect(isHabitDueOn(habit, MON, logsMap)).toBe(true);
  });

  it('defaults times_per_week to 1 when not configured', () => {
    const habit = makeHabit({ cadence: 'weekly_n', cadence_config: null });
    const logsMap = new Map<string, number>([['2024-06-10', 1]]);
    expect(isHabitDueOn(habit, MON, logsMap)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// isHabitDueOn — monthly_day
// ---------------------------------------------------------------------------

describe('isHabitDueOn (monthly_day)', () => {
  it('is due on the configured day of month', () => {
    const habit = makeHabit({ cadence: 'monthly_day', cadence_config: JSON.stringify({ day_of_month: 10 }) });
    expect(isHabitDueOn(habit, new Date(2024, 5, 10))).toBe(true);
  });

  it('is NOT due on other days', () => {
    const habit = makeHabit({ cadence: 'monthly_day', cadence_config: JSON.stringify({ day_of_month: 10 }) });
    expect(isHabitDueOn(habit, new Date(2024, 5, 11))).toBe(false);
  });

  it('clamps day 31 to last day of month (Feb 2025 = 28)', () => {
    const habit = makeHabit({ cadence: 'monthly_day', cadence_config: JSON.stringify({ day_of_month: 31 }) });
    expect(isHabitDueOn(habit, new Date(2025, 1, 28))).toBe(true);
    expect(isHabitDueOn(habit, new Date(2025, 1, 27))).toBe(false);
  });

  it('clamps day 30 to 28 for Feb in non-leap year', () => {
    const habit = makeHabit({ cadence: 'monthly_day', cadence_config: JSON.stringify({ day_of_month: 30 }) });
    expect(isHabitDueOn(habit, new Date(2025, 1, 28))).toBe(true);
  });

  it('day 31 works correctly in a 31-day month', () => {
    const habit = makeHabit({ cadence: 'monthly_day', cadence_config: JSON.stringify({ day_of_month: 31 }) });
    expect(isHabitDueOn(habit, new Date(2024, 6, 31))).toBe(true); // July 31
  });

  it('defaults day_of_month to 1 when not configured', () => {
    const habit = makeHabit({ cadence: 'monthly_day', cadence_config: null });
    expect(isHabitDueOn(habit, new Date(2024, 5, 1))).toBe(true);
    expect(isHabitDueOn(habit, new Date(2024, 5, 2))).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// isHabitDueOn — legacy cadences
// ---------------------------------------------------------------------------

describe('isHabitDueOn (legacy weekdays)', () => {
  const habit = makeHabit({ cadence: 'weekdays' });

  it('is due Mon–Fri', () => {
    expect(isHabitDueOn(habit, MON)).toBe(true);
    expect(isHabitDueOn(habit, TUE)).toBe(true);
    expect(isHabitDueOn(habit, WED)).toBe(true);
  });

  it('is NOT due on Saturday', () => {
    expect(isHabitDueOn(habit, SAT)).toBe(false);
  });

  it('is NOT due on Sunday', () => {
    expect(isHabitDueOn(habit, SUN)).toBe(false);
  });
});

describe('isHabitDueOn (legacy weekly)', () => {
  const habit = makeHabit({ cadence: 'weekly' });

  it('is due on Monday only', () => {
    expect(isHabitDueOn(habit, MON)).toBe(true);
  });

  it('is NOT due on Tuesday', () => {
    expect(isHabitDueOn(habit, TUE)).toBe(false);
  });

  it('is NOT due on Sunday', () => {
    expect(isHabitDueOn(habit, SUN)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// cadenceLabel
// ---------------------------------------------------------------------------

describe('cadenceLabel', () => {
  it('daily → "Каждый день"', () => {
    expect(cadenceLabel(makeHabit({ cadence: 'daily' }))).toBe('Каждый день');
  });

  it('specific_days with no weekdays → "Дни не выбраны"', () => {
    const h = makeHabit({ cadence: 'specific_days', cadence_config: JSON.stringify({ weekdays: [] }) });
    expect(cadenceLabel(h)).toBe('Дни не выбраны');
  });

  it('specific_days with all 7 days → "Каждый день"', () => {
    const h = makeHabit({ cadence: 'specific_days', cadence_config: JSON.stringify({ weekdays: [0,1,2,3,4,5,6] }) });
    expect(cadenceLabel(h)).toBe('Каждый день');
  });

  it('specific_days with Mon–Fri → "По будням"', () => {
    const h = makeHabit({ cadence: 'specific_days', cadence_config: JSON.stringify({ weekdays: [1,2,3,4,5] }) });
    expect(cadenceLabel(h)).toBe('По будням');
  });

  it('specific_days with Sat+Sun → "По выходным"', () => {
    const h = makeHabit({ cadence: 'specific_days', cadence_config: JSON.stringify({ weekdays: [0,6] }) });
    expect(cadenceLabel(h)).toBe('По выходным');
  });

  it('specific_days with Mon+Wed contains day abbreviations', () => {
    const h = makeHabit({ cadence: 'specific_days', cadence_config: JSON.stringify({ weekdays: [1, 3] }) });
    const label = cadenceLabel(h);
    expect(label).toContain('Пн');
    expect(label).toContain('Ср');
  });

  it('weekly_n 1 time → "1 раз в неделю"', () => {
    const h = makeHabit({ cadence: 'weekly_n', cadence_config: JSON.stringify({ times_per_week: 1 }) });
    expect(cadenceLabel(h)).toBe('1 раз в неделю');
  });

  it('weekly_n 3 times → "3 раза в неделю"', () => {
    const h = makeHabit({ cadence: 'weekly_n', cadence_config: JSON.stringify({ times_per_week: 3 }) });
    expect(cadenceLabel(h)).toBe('3 раза в неделю');
  });

  it('weekly_n 5 times → "5 раз в неделю" (no "а" suffix for 5)', () => {
    const h = makeHabit({ cadence: 'weekly_n', cadence_config: JSON.stringify({ times_per_week: 5 }) });
    expect(cadenceLabel(h)).toBe('5 раз в неделю');
  });

  it('monthly_day 15 → "Каждое 15 число"', () => {
    const h = makeHabit({ cadence: 'monthly_day', cadence_config: JSON.stringify({ day_of_month: 15 }) });
    expect(cadenceLabel(h)).toBe('Каждое 15 число');
  });

  it('legacy weekdays → "По будням"', () => {
    expect(cadenceLabel(makeHabit({ cadence: 'weekdays' }))).toBe('По будням');
  });

  it('legacy weekly → "Раз в неделю"', () => {
    expect(cadenceLabel(makeHabit({ cadence: 'weekly' }))).toBe('Раз в неделю');
  });
});

// ---------------------------------------------------------------------------
// buildLogMap
// ---------------------------------------------------------------------------

describe('buildLogMap', () => {
  it('returns empty map for empty logs', () => {
    expect(buildLogMap([])).toEqual(new Map());
  });

  it('groups logs by habit_id', () => {
    const logs: HabitLog[] = [
      makeLog('h1', '2024-06-10', 1),
      makeLog('h2', '2024-06-10', 1),
      makeLog('h1', '2024-06-09', 2)
    ];
    const map = buildLogMap(logs);
    expect(map.has('h1')).toBe(true);
    expect(map.has('h2')).toBe(true);
    expect(map.get('h1')?.get('2024-06-10')).toBe(1);
    expect(map.get('h1')?.get('2024-06-09')).toBe(2);
    expect(map.get('h2')?.get('2024-06-10')).toBe(1);
  });

  it('stores count values including 0', () => {
    const logs: HabitLog[] = [makeLog('h1', '2024-06-10', 0)];
    const map = buildLogMap(logs);
    expect(map.get('h1')?.get('2024-06-10')).toBe(0);
  });
});
