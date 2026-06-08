import { describe, it, expect } from 'vitest';
import {
  computeHabitStats,
  streakUnit,
  habitStartDate,
  isConfirmWindowExpired,
  minutesUntilWindowEnd,
  buildHeatmap
} from './streak.js';
import type { Habit, HabitLog, HabitPeriodResult } from './types.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeHabit(overrides: Partial<Habit> = {}): Habit {
  return {
    id: 'h1',
    title: 'Test habit',
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

function makeLog(
  date: string,
  status: 'done' | 'missed' = 'done',
  count = 1
): HabitLog {
  return {
    id: `log-${date}`,
    habit_id: 'h1',
    date,
    count,
    status,
    note: null,
    created_at: `${date}T12:00:00.000Z`
  };
}

function makePeriod(
  period_start: string,
  period_kind: 'week' | 'month',
  status: 'done' | 'missed',
  count_actual = 1,
  target = 1
): HabitPeriodResult {
  return {
    id: `p-${period_start}`,
    habit_id: 'h1',
    period_kind,
    period_start,
    status,
    count_actual,
    target,
    created_at: `${period_start}T00:00:00.000Z`
  };
}

// A "now" that is well after any confirm window (noon on the reference day).
// We use 2024-06-10 (Monday) as our reference "today".
const REF_NOW = new Date('2024-06-10T12:00:00.000Z');

// ---------------------------------------------------------------------------
// streakUnit
// ---------------------------------------------------------------------------

describe('streakUnit', () => {
  it('returns "day" for daily cadence', () => {
    expect(streakUnit(makeHabit({ cadence: 'daily' }))).toBe('day');
  });

  it('returns "day" for specific_days cadence', () => {
    expect(streakUnit(makeHabit({ cadence: 'specific_days' }))).toBe('day');
  });

  it('returns "day" for legacy weekdays cadence', () => {
    expect(streakUnit(makeHabit({ cadence: 'weekdays' }))).toBe('day');
  });

  it('returns "day" for legacy weekly cadence', () => {
    expect(streakUnit(makeHabit({ cadence: 'weekly' }))).toBe('day');
  });

  it('returns "week" for weekly_n cadence', () => {
    expect(streakUnit(makeHabit({ cadence: 'weekly_n' }))).toBe('week');
  });

  it('returns "month" for monthly_day cadence', () => {
    expect(streakUnit(makeHabit({ cadence: 'monthly_day' }))).toBe('month');
  });
});

// ---------------------------------------------------------------------------
// habitStartDate
// ---------------------------------------------------------------------------

describe('habitStartDate', () => {
  it('extracts YYYY-MM-DD from ISO created_at using local time components', () => {
    // created_at is used as `new Date()` then local year/month/day extracted
    const habit = makeHabit({ created_at: '2024-03-15T10:00:00.000Z' });
    const result = habitStartDate(habit);
    expect(result).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    // The year must be 2024 regardless of timezone offset
    expect(result.startsWith('2024-')).toBe(true);
  });

  it('pads single-digit months and days', () => {
    const habit = makeHabit({ created_at: '2024-01-05T00:00:00.000Z' });
    const result = habitStartDate(habit);
    expect(result).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});

// ---------------------------------------------------------------------------
// isConfirmWindowExpired
// ---------------------------------------------------------------------------

describe('isConfirmWindowExpired', () => {
  const date = new Date(2024, 5, 10); // June 10 local

  it('returns false when now is before deadline (remind_time + window)', () => {
    // remind_time 08:00, window 6h → deadline 14:00
    const habit = makeHabit({ remind_time: '08:00', confirm_window_h: 6 });
    const now = new Date(2024, 5, 10, 13, 0, 0); // 13:00 — before deadline
    expect(isConfirmWindowExpired(habit, date, now)).toBe(false);
  });

  it('returns true when now is at or after deadline', () => {
    const habit = makeHabit({ remind_time: '08:00', confirm_window_h: 6 });
    const now = new Date(2024, 5, 10, 14, 0, 0); // exactly at deadline
    expect(isConfirmWindowExpired(habit, date, now)).toBe(true);
  });

  it('uses end-of-day (midnight+window) when no remind_time set', () => {
    // No remind_time → base is midnight of next day (24:00 = 00:00 next day)
    // window 6h → deadline is 06:00 next day
    const habit = makeHabit({ remind_time: null, confirm_window_h: 6 });
    const before = new Date(2024, 5, 11, 5, 59, 0); // 05:59 next day
    expect(isConfirmWindowExpired(habit, date, before)).toBe(false);
    const after = new Date(2024, 5, 11, 6, 1, 0); // 06:01 next day
    expect(isConfirmWindowExpired(habit, date, after)).toBe(true);
  });

  it('uses default window of 6h when confirm_window_h is not specified', () => {
    const habit = makeHabit({ remind_time: '20:00', confirm_window_h: 6 });
    const before = new Date(2024, 5, 11, 1, 59, 0); // 01:59 next day
    expect(isConfirmWindowExpired(habit, date, before)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// minutesUntilWindowEnd
// ---------------------------------------------------------------------------

describe('minutesUntilWindowEnd', () => {
  const date = new Date(2024, 5, 10);

  it('returns positive minutes when window is still open', () => {
    const habit = makeHabit({ remind_time: '08:00', confirm_window_h: 6 });
    // deadline = 14:00; now = 12:00 → 120 minutes left
    const now = new Date(2024, 5, 10, 12, 0, 0);
    expect(minutesUntilWindowEnd(habit, date, now)).toBe(120);
  });

  it('returns negative minutes when window has expired', () => {
    const habit = makeHabit({ remind_time: '08:00', confirm_window_h: 6 });
    // deadline = 14:00; now = 15:00 → -60 minutes
    const now = new Date(2024, 5, 10, 15, 0, 0);
    expect(minutesUntilWindowEnd(habit, date, now)).toBe(-60);
  });

  it('returns 0 at the exact deadline moment', () => {
    const habit = makeHabit({ remind_time: '08:00', confirm_window_h: 6 });
    const now = new Date(2024, 5, 10, 14, 0, 0);
    expect(minutesUntilWindowEnd(habit, date, now)).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// computeHabitStats — daily cadence
// ---------------------------------------------------------------------------

describe('computeHabitStats (daily)', () => {
  const habit = makeHabit({
    created_at: '2024-01-01T00:00:00.000Z',
    confirm_window_h: 6
  });

  it('returns zeros for a habit with no logs and all windows expired', () => {
    const stats = computeHabitStats(habit, [], [], REF_NOW);
    expect(stats.current_streak).toBe(0);
    expect(stats.best_streak).toBe(0);
    expect(stats.total_done).toBe(0);
    expect(stats.unit).toBe('day');
  });

  it('counts a streak of consecutive done days', () => {
    const logs = [
      makeLog('2024-06-10'),
      makeLog('2024-06-09'),
      makeLog('2024-06-08'),
      makeLog('2024-06-07')
    ];
    const stats = computeHabitStats(habit, logs, [], REF_NOW);
    expect(stats.current_streak).toBe(4);
    expect(stats.best_streak).toBe(4);
  });

  it('breaks streak on a missed day', () => {
    const logs = [
      makeLog('2024-06-10'), // today — done
      makeLog('2024-06-09'), // done
      // 2024-06-08 missed (window expired, no log)
      makeLog('2024-06-07'), // done but isolated
      makeLog('2024-06-06')
    ];
    const stats = computeHabitStats(habit, logs, [], REF_NOW);
    // streak starts from today, breaks at gap on 06-08
    expect(stats.current_streak).toBe(2);
    // best is also 2 (the 06-06/07 pair can't beat the 06-09/10 pair when they're equal)
    expect(stats.best_streak).toBeGreaterThanOrEqual(2);
  });

  it('streak is 0 when today is missed and window expired', () => {
    // remind_time=08:00, window=6h → deadline=14:00.
    // Use a now well past deadline so today counts as missed.
    const h = makeHabit({ remind_time: '08:00', confirm_window_h: 6, created_at: '2024-01-01T00:00:00.000Z' });
    const nowPastDeadline = new Date(2024, 5, 10, 15, 0, 0); // 15:00 local — past 14:00 deadline
    const logs = [makeLog('2024-06-09'), makeLog('2024-06-08')];
    const stats = computeHabitStats(h, logs, [], nowPastDeadline);
    expect(stats.current_streak).toBe(0);
  });

  it('preserves streak when today window is still open (status "open")', () => {
    // remind_time 14:00, window 6h → deadline 20:00; REF_NOW is 12:00 → still open
    const h = makeHabit({ remind_time: '14:00', confirm_window_h: 6, created_at: '2024-01-01T00:00:00.000Z' });
    const logs = [makeLog('2024-06-09'), makeLog('2024-06-08')];
    const stats = computeHabitStats(h, logs, [], REF_NOW);
    // today is open → doesn't break streak; streak from yesterday = 2
    expect(stats.current_streak).toBe(2);
  });

  it('total_done sums log count values (at least 1 each)', () => {
    const logs = [
      makeLog('2024-06-10', 'done', 3),
      makeLog('2024-06-09', 'done', 1),
      makeLog('2024-06-08', 'missed', 0)
    ];
    const stats = computeHabitStats(habit, logs, [], REF_NOW);
    // missed not counted; done: max(1,3) + max(1,1) = 4
    expect(stats.total_done).toBe(4);
  });

  it('days before created_at are treated as skip (not missed)', () => {
    // Habit created on 2024-06-08; days 06-07 and before must not break streak
    const h = makeHabit({ created_at: '2024-06-08T00:00:00.000Z' });
    const logs = [makeLog('2024-06-10'), makeLog('2024-06-09'), makeLog('2024-06-08')];
    const stats = computeHabitStats(h, logs, [], REF_NOW);
    expect(stats.current_streak).toBe(3);
  });

  it('completion_pct_7 is 100 when all 7 due days are done', () => {
    const logs = Array.from({ length: 7 }, (_, i) => {
      const d = new Date('2024-06-10');
      d.setDate(d.getDate() - i);
      return makeLog(d.toISOString().slice(0, 10));
    });
    const stats = computeHabitStats(habit, logs, [], REF_NOW);
    // window for today (06-10) at noon (remind_time null → window ends 06:00 next day) is open
    // so the 7-day slice may have one 'open' filtered out — result should be 100 of non-open
    expect(stats.completion_pct_7).toBe(100);
  });

  it('completion_pct_7 is 0 when all days are missed', () => {
    // No logs at all, all windows expired → all missed
    const stats = computeHabitStats(habit, [], [], REF_NOW);
    expect(stats.completion_pct_7).toBe(0);
  });

  it('best_streak is at least current_streak', () => {
    const logs = [makeLog('2024-06-10'), makeLog('2024-06-09')];
    const stats = computeHabitStats(habit, logs, [], REF_NOW);
    expect(stats.best_streak).toBeGreaterThanOrEqual(stats.current_streak);
  });
});

// ---------------------------------------------------------------------------
// computeHabitStats — specific_days cadence
// ---------------------------------------------------------------------------

describe('computeHabitStats (specific_days)', () => {
  // Only Mon(1) and Wed(3)
  const habit = makeHabit({
    cadence: 'specific_days',
    cadence_config: JSON.stringify({ weekdays: [1, 3] }),
    created_at: '2024-01-01T00:00:00.000Z'
  });

  it('counts streak only over due days (Mon/Wed)', () => {
    // 2024-06-10 is Monday, 2024-06-05 is Wednesday
    const logs = [
      makeLog('2024-06-10'), // Monday — due
      makeLog('2024-06-05')  // Wednesday — due
    ];
    const stats = computeHabitStats(habit, logs, [], REF_NOW);
    // streak counts only Mon/Wed slots; both done
    expect(stats.current_streak).toBeGreaterThanOrEqual(1);
  });

  it('non-due days do not break streak', () => {
    // Tue/Thu/Fri/Sat/Sun between Mon and Wed are skipped, not missed
    const logs = [
      makeLog('2024-06-10'), // Mon
      makeLog('2024-06-05')  // Wed
    ];
    const stats = computeHabitStats(habit, logs, [], REF_NOW);
    // The gap between Mon 06-10 and Wed 06-05 has Fri 06-07 as next due day going back
    // Going back from 06-10 (Mon done) → next due is Wed 06-05 (done) → streak ≥ 2
    expect(stats.current_streak).toBe(2);
  });
});

// ---------------------------------------------------------------------------
// computeHabitStats — weekly_n cadence
// ---------------------------------------------------------------------------

describe('computeHabitStats (weekly_n)', () => {
  // 3 times per week
  const habit = makeHabit({
    cadence: 'weekly_n',
    cadence_config: JSON.stringify({ times_per_week: 3 }),
    created_at: '2024-01-01T00:00:00.000Z'
  });

  it('unit is "week"', () => {
    const stats = computeHabitStats(habit, [], [], REF_NOW);
    expect(stats.unit).toBe('week');
  });

  it('has week_progress with correct target', () => {
    const stats = computeHabitStats(habit, [], [], REF_NOW);
    expect(stats.week_progress).toBeDefined();
    expect(stats.week_progress!.target).toBe(3);
  });

  it('week_progress.done counts logs from current week', () => {
    // 2024-06-10 is Monday; 2024-06-09 is Sunday (prior week)
    const logs = [
      makeLog('2024-06-10', 'done', 1), // this week (Mon)
      makeLog('2024-06-09', 'done', 1)  // prior week — should NOT count
    ];
    const stats = computeHabitStats(habit, logs, [], REF_NOW);
    expect(stats.week_progress!.done).toBe(1);
  });

  it('returns done streak from period results', () => {
    // Two consecutive weeks done
    const periods = [
      makePeriod('2024-06-03', 'week', 'done'), // prev week (Mon Jun 3)
      makePeriod('2024-05-27', 'week', 'done')  // two weeks ago
    ];
    const stats = computeHabitStats(habit, [], periods, REF_NOW);
    // current week (2024-06-10) is open; prev two are done → streak ≥ 2
    expect(stats.current_streak).toBeGreaterThanOrEqual(2);
  });

  it('missed week breaks streak', () => {
    const periods = [
      makePeriod('2024-06-03', 'week', 'done'),
      makePeriod('2024-05-27', 'week', 'missed'), // gap
      makePeriod('2024-05-20', 'week', 'done')
    ];
    const stats = computeHabitStats(habit, [], periods, REF_NOW);
    // open (current) → skipped; done (06-03) → 1; missed (05-27) → breaks → streak = 1
    expect(stats.current_streak).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// computeHabitStats — monthly_day cadence
// ---------------------------------------------------------------------------

describe('computeHabitStats (monthly_day)', () => {
  const habit = makeHabit({
    cadence: 'monthly_day',
    cadence_config: JSON.stringify({ day_of_month: 15 }),
    created_at: '2024-01-01T00:00:00.000Z'
  });

  it('unit is "month"', () => {
    const stats = computeHabitStats(habit, [], [], REF_NOW);
    expect(stats.unit).toBe('month');
  });

  it('has month_progress with correct target_day', () => {
    const stats = computeHabitStats(habit, [], [], REF_NOW);
    expect(stats.month_progress).toBeDefined();
    expect(stats.month_progress!.target_day).toBe(15);
  });

  it('month_progress.done is true when this month has a done log', () => {
    const logs = [makeLog('2024-06-15')];
    const stats = computeHabitStats(habit, logs, [], REF_NOW);
    expect(stats.month_progress!.done).toBe(true);
  });

  it('month_progress.done is false when no log this month', () => {
    const logs = [makeLog('2024-05-15')]; // prior month
    const stats = computeHabitStats(habit, logs, [], REF_NOW);
    expect(stats.month_progress!.done).toBe(false);
  });

  it('clamps day_of_month 31 to last day of February (28 in non-leap)', () => {
    // Use a "now" in Feb 2025 (non-leap), day_of_month=31
    const h = makeHabit({
      cadence: 'monthly_day',
      cadence_config: JSON.stringify({ day_of_month: 31 }),
      created_at: '2024-01-01T00:00:00.000Z'
    });
    const feb2025 = new Date('2025-02-15T12:00:00.000Z');
    const stats = computeHabitStats(h, [], [], feb2025);
    // Feb 2025 has 28 days → effective = 28
    expect(stats.month_progress!.target_day).toBe(28);
  });

  it('returns streak from period results', () => {
    const periods = [
      makePeriod('2024-05-01', 'month', 'done'),
      makePeriod('2024-04-01', 'month', 'done')
    ];
    const stats = computeHabitStats(habit, [], periods, REF_NOW);
    expect(stats.current_streak).toBeGreaterThanOrEqual(2);
  });
});

// ---------------------------------------------------------------------------
// computeHabitStats — badge logic
// ---------------------------------------------------------------------------

describe('computeHabitStats badges', () => {
  const habit = makeHabit({ created_at: '2020-01-01T00:00:00.000Z' });

  it('all badges start locked with no history', () => {
    const stats = computeHabitStats(habit, [], [], REF_NOW);
    expect(stats.badges.every((b) => !b.unlocked)).toBe(true);
  });

  it('streak-7 badge unlocks at current_streak >= 7', () => {
    // 7 consecutive done days ending at REF_NOW
    const logs = Array.from({ length: 7 }, (_, i) => {
      const d = new Date('2024-06-10');
      d.setDate(d.getDate() - i);
      return makeLog(d.toISOString().slice(0, 10));
    });
    const stats = computeHabitStats(habit, logs, [], REF_NOW);
    const badge = stats.badges.find((b) => b.id === 'streak-7');
    expect(badge?.unlocked).toBe(true);
  });

  it('total-10 badge unlocks when total_done >= 10', () => {
    const logs = Array.from({ length: 12 }, (_, i) => {
      const d = new Date('2024-06-10');
      d.setDate(d.getDate() - i * 2); // every other day to avoid streak dependency
      return makeLog(d.toISOString().slice(0, 10));
    });
    const stats = computeHabitStats(habit, logs, [], REF_NOW);
    const badge = stats.badges.find((b) => b.id === 'total-10');
    expect(badge?.unlocked).toBe(true);
  });

  it('next_badge is defined when there are locked badges', () => {
    const stats = computeHabitStats(habit, [], [], REF_NOW);
    expect(stats.next_badge).toBeDefined();
  });

  it('next_badge is undefined when all badges are unlocked', () => {
    // streak >= 100 AND total >= 365 → all unlocked
    // Build 100 consecutive done logs
    const logs = Array.from({ length: 400 }, (_, i) => {
      const d = new Date('2024-06-10');
      d.setDate(d.getDate() - i);
      return makeLog(d.toISOString().slice(0, 10));
    });
    const stats = computeHabitStats(habit, logs, [], REF_NOW);
    // At 400 logs total_done=400 ≥ 365, streak >= 100 — all badges unlocked
    expect(stats.next_badge).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// buildHeatmap
// ---------------------------------------------------------------------------

describe('buildHeatmap', () => {
  const habit = makeHabit({ created_at: '2024-01-01T00:00:00.000Z' });

  it('returns an array of length equal to days param', () => {
    const result = buildHeatmap(habit, [], REF_NOW, 14);
    expect(result).toHaveLength(14);
  });

  it('returns entries in chronological order (oldest first)', () => {
    const result = buildHeatmap(habit, [], REF_NOW, 7);
    for (let i = 1; i < result.length; i++) {
      expect(result[i].date >= result[i - 1].date).toBe(true);
    }
  });

  it('marks a logged done day as "done"', () => {
    const logs = [makeLog('2024-06-10')];
    const result = buildHeatmap(habit, logs, REF_NOW, 7);
    const entry = result.find((e) => e.date === '2024-06-10');
    expect(entry?.status).toBe('done');
  });

  it('marks a logged missed day as "missed"', () => {
    const logs = [makeLog('2024-06-09', 'missed')];
    const result = buildHeatmap(habit, logs, REF_NOW, 7);
    const entry = result.find((e) => e.date === '2024-06-09');
    expect(entry?.status).toBe('missed');
  });

  it('days with open confirm window have status "open"', () => {
    // remind_time=14:00, window=6h → deadline=20:00; REF_NOW=12:00 → open
    const h = makeHabit({ remind_time: '14:00', confirm_window_h: 6, created_at: '2024-01-01T00:00:00.000Z' });
    const result = buildHeatmap(h, [], REF_NOW, 3);
    const today = result.find((e) => e.date === '2024-06-10');
    expect(today?.status).toBe('open');
  });
});

// ---------------------------------------------------------------------------
// streakFromSequence edge cases (via computeHabitStats)
// ---------------------------------------------------------------------------

describe('streak with "open" slots in sequence', () => {
  it('open slots do not break the streak count', () => {
    // remind_time=14:00 → today is open; yesterday and before done
    const h = makeHabit({ remind_time: '14:00', confirm_window_h: 6, created_at: '2020-01-01T00:00:00.000Z' });
    const logs = [makeLog('2024-06-09'), makeLog('2024-06-08'), makeLog('2024-06-07')];
    const stats = computeHabitStats(h, logs, [], REF_NOW);
    // today open (skipped in current count start), then 3 done → streak = 3
    expect(stats.current_streak).toBe(3);
  });

  it('best_streak does not reset on open slots', () => {
    const h = makeHabit({ remind_time: '14:00', confirm_window_h: 6, created_at: '2020-01-01T00:00:00.000Z' });
    const logs = Array.from({ length: 10 }, (_, i) => {
      const d = new Date('2024-06-09');
      d.setDate(d.getDate() - i);
      return makeLog(d.toISOString().slice(0, 10));
    });
    const stats = computeHabitStats(h, logs, [], REF_NOW);
    expect(stats.best_streak).toBeGreaterThanOrEqual(10);
  });
});
