import type {
  Habit,
  HabitBadgeInfo,
  HabitCadenceConfig,
  HabitLog,
  HabitPeriodResult,
  HabitStats
} from './types.js';
import { HABIT_BADGES } from './badges.js';

// ---- Дата-утилиты без зависимостей (модуль shared не таскает date-fns) ----

function ymd(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function addDays(d: Date, n: number): Date {
  const c = new Date(d);
  c.setDate(c.getDate() + n);
  return c;
}

/** Понедельник недели для произвольной даты (00:00 локального дня). */
function startOfWeekMonday(d: Date): Date {
  const dow = d.getDay(); // 0=Вс..6=Сб
  const delta = dow === 0 ? -6 : 1 - dow;
  const m = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  m.setDate(m.getDate() + delta);
  return m;
}

function startOfMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

function parseCadenceConfig(habit: Habit): HabitCadenceConfig {
  if (!habit.cadence_config) return {};
  try {
    return JSON.parse(habit.cadence_config) as HabitCadenceConfig;
  } catch {
    return {};
  }
}

/** Единица стрика, в которой считаем «1». */
export function streakUnit(habit: Habit): 'day' | 'week' | 'month' {
  switch (habit.cadence) {
    case 'weekly_n':
      return 'week';
    case 'monthly_day':
      return 'month';
    default:
      return 'day';
  }
}

/**
 * День, в который привычка по расписанию должна быть выполнена.
 * Учитывает legacy-значения cadence (weekdays/weekly).
 */
function isDueOnDate(habit: Habit, date: Date): boolean {
  const cfg = parseCadenceConfig(habit);
  const dow = date.getDay(); // 0..6
  switch (habit.cadence) {
    case 'daily':
      return true;
    case 'specific_days':
      return (cfg.weekdays ?? []).includes(dow);
    case 'weekly_n':
      // weekly_n не привязан к конкретному дню — стрик считается по неделям.
      return false;
    case 'monthly_day': {
      const target = cfg.day_of_month ?? 1;
      const last = new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
      const effective = Math.min(target, last);
      return date.getDate() === effective;
    }
    case 'weekdays':
      return dow >= 1 && dow <= 5;
    case 'weekly':
      return dow === 1;
    default:
      return true;
  }
}

/**
 * Локальная дата создания рутины (YYYY-MM-DD). До этой даты привычки
 * ещё не существовало — нельзя считать те дни «пропущенными».
 */
export function habitStartDate(habit: Habit): string {
  const d = new Date(habit.created_at);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/**
 * Истекло ли окно подтверждения для конкретной даты — т.е. можно ли уже
 * автоматически отметить день как `missed`. Если remind_time не задан,
 * считаем что окно — от полуночи + confirm_window_h следующего дня
 * (т.е. до 06:00 следующего дня).
 */
export function isConfirmWindowExpired(habit: Habit, date: Date, now: Date): boolean {
  const remind = parseHHMM(habit.remind_time);
  // База: для дня date — момент remind_time этого дня. Если нет remind_time —
  // конец дня (24:00 = начало следующего дня).
  const base = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  if (remind) {
    base.setHours(remind.h, remind.m, 0, 0);
  } else {
    base.setHours(24, 0, 0, 0);
  }
  const deadline = new Date(base);
  deadline.setHours(deadline.getHours() + (habit.confirm_window_h ?? 6));
  return now >= deadline;
}

/** Сколько минут осталось до конца окна (отрицательное = окно уже истекло). */
export function minutesUntilWindowEnd(habit: Habit, date: Date, now: Date): number {
  const remind = parseHHMM(habit.remind_time);
  const base = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  if (remind) {
    base.setHours(remind.h, remind.m, 0, 0);
  } else {
    base.setHours(24, 0, 0, 0);
  }
  const deadline = new Date(base);
  deadline.setHours(deadline.getHours() + (habit.confirm_window_h ?? 6));
  return Math.round((deadline.getTime() - now.getTime()) / 60000);
}

function parseHHMM(s: string | null): { h: number; m: number } | null {
  if (!s) return null;
  const m = s.match(/^(\d{2}):(\d{2})$/);
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h > 23 || min > 59) return null;
  return { h, m: min };
}

/**
 * Главный расчёт статистики по привычке.
 * Возвращает текущий стрик, лучший, проценты, бэйджи.
 *
 * @param logs       — все daily-логи по привычке (status='done' либо 'missed')
 * @param periods    — записи habit_period_results (для weekly_n / monthly_day)
 * @param now        — текущий момент (для определения «окно ещё открыто»)
 */
export function computeHabitStats(
  habit: Habit,
  logs: HabitLog[],
  periods: HabitPeriodResult[],
  now: Date = new Date()
): HabitStats {
  const unit = streakUnit(habit);
  const cfg = parseCadenceConfig(habit);
  const totalDone = sumDoneLogs(logs);

  let currentStreak = 0;
  let bestStreak = 0;
  let completion7 = 0;
  let completion30 = 0;
  let weekProgress: HabitStats['week_progress'] | undefined;
  let monthProgress: HabitStats['month_progress'] | undefined;

  if (unit === 'day') {
    const seq = buildDayStreakSequence(habit, logs, now);
    ({ current: currentStreak, best: bestStreak } = streakFromSequence(seq));
    completion7 = pctFromSequence(seq, 7);
    completion30 = pctFromSequence(seq, 30);
  } else if (unit === 'week') {
    const seq = buildPeriodSequence(habit, periods, 'week', now, 60);
    ({ current: currentStreak, best: bestStreak } = streakFromSequence(seq));
    completion7 = pctFromSequence(seq, 7);
    completion30 = pctFromSequence(seq, 30);
    // Прогресс текущей недели
    const ws = startOfWeekMonday(now);
    const we = addDays(ws, 6);
    const target = Math.max(1, cfg.times_per_week ?? 1);
    let done = 0;
    for (const l of logs) {
      if (l.status !== 'done') continue;
      const d = new Date(l.date + 'T00:00:00');
      if (d >= ws && d <= we) done += l.count;
    }
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const daysLeft = Math.max(0, Math.round((we.getTime() - today.getTime()) / 86_400_000));
    weekProgress = { done, target, days_left: daysLeft };
  } else {
    // month
    const seq = buildPeriodSequence(habit, periods, 'month', now, 24);
    ({ current: currentStreak, best: bestStreak } = streakFromSequence(seq));
    completion7 = pctFromSequence(seq, 7);
    completion30 = pctFromSequence(seq, 30);
    const targetDay = cfg.day_of_month ?? 1;
    const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
    const eff = Math.min(targetDay, lastDay);
    const target = new Date(now.getFullYear(), now.getMonth(), eff);
    const doneThisMonth = logs.some((l) => {
      if (l.status !== 'done') return false;
      const d = new Date(l.date + 'T00:00:00');
      return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth();
    });
    monthProgress = { done: doneThisMonth, target_day: eff };
    // target используется ниже для visibility
    void target;
  }

  // Бэйджи
  const badges: HabitBadgeInfo[] = HABIT_BADGES.map((b) => ({
    ...b,
    unlocked:
      b.kind === 'streak'
        ? currentStreak >= b.threshold || bestStreak >= b.threshold
        : totalDone >= b.threshold
  }));
  const next = (() => {
    const locked = badges.filter((b) => !b.unlocked);
    if (locked.length === 0) return undefined;
    const remaining = (b: HabitBadgeInfo): number =>
      b.kind === 'streak'
        ? Math.max(0, b.threshold - currentStreak)
        : Math.max(0, b.threshold - totalDone);
    const sorted = locked.slice().sort((a, b) => remaining(a) - remaining(b));
    const best = sorted[0];
    return { ...best, remaining: remaining(best) };
  })();

  return {
    habit_id: habit.id,
    unit,
    current_streak: currentStreak,
    best_streak: bestStreak,
    total_done: totalDone,
    completion_pct_7: completion7,
    completion_pct_30: completion30,
    week_progress: weekProgress,
    month_progress: monthProgress,
    next_badge: next,
    badges
  };
}

function sumDoneLogs(logs: HabitLog[]): number {
  let sum = 0;
  for (const l of logs) {
    if (l.status === 'done') sum += Math.max(1, l.count);
  }
  return sum;
}

/**
 * Строит последовательность 'done' | 'missed' | 'open' по дням, начиная с
 * сегодня и идя в прошлое. 'open' — окно подтверждения ещё открыто; такая
 * запись не ломает стрик, но и не учитывается в нём.
 */
function buildDaySequence(
  habit: Habit,
  logs: HabitLog[],
  now: Date,
  maxDays: number
): ('done' | 'missed' | 'open' | 'skip')[] {
  const logByDate = new Map<string, HabitLog>();
  for (const l of logs) logByDate.set(l.date, l);
  const startDate = habitStartDate(habit);
  const out: ('done' | 'missed' | 'open' | 'skip')[] = [];
  let cursor = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  for (let i = 0; i < maxDays; i++) {
    const key = ymd(cursor);
    // До даты создания рутины — нечего считать; помечаем 'skip' чтобы
    // эти дни не попадали ни в стрик, ни в проценты выполнения.
    if (key < startDate) {
      out.push('skip');
    } else if (!isDueOnDate(habit, cursor)) {
      out.push('skip');
    } else {
      const log = logByDate.get(key);
      if (log) {
        out.push(log.status === 'done' ? 'done' : 'missed');
      } else if (!isConfirmWindowExpired(habit, cursor, now)) {
        out.push('open');
      } else {
        out.push('missed');
      }
    }
    cursor = addDays(cursor, -1);
  }
  return out;
}

/** Строит последовательность для day-стриков, отфильтрованную от 'skip' (не-due-дней). */
function buildDayStreakSequence(
  habit: Habit,
  logs: HabitLog[],
  now: Date
): ('done' | 'missed' | 'open')[] {
  return buildDaySequence(habit, logs, now, 400).filter(
    (s): s is 'done' | 'missed' | 'open' => s !== 'skip'
  );
}

function buildPeriodSequence(
  habit: Habit,
  periods: HabitPeriodResult[],
  kind: 'week' | 'month',
  now: Date,
  maxUnits: number
): ('done' | 'missed' | 'open')[] {
  const byStart = new Map<string, HabitPeriodResult>();
  for (const p of periods) if (p.period_kind === kind) byStart.set(p.period_start, p);
  const startDate = habitStartDate(habit);
  const out: ('done' | 'missed' | 'open')[] = [];
  let cursor = kind === 'week' ? startOfWeekMonday(now) : startOfMonth(now);
  for (let i = 0; i < maxUnits; i++) {
    const key = ymd(cursor);
    // Период целиком до создания привычки — не считаем. Для week: ключ это
    // понедельник; «период целиком ниже стартовой даты» = конец периода < start.
    // Считаем грубо: если monday < startDate И воскресенье (monday+6) < startDate.
    const periodEnd =
      kind === 'week' ? ymd(addDays(cursor, 6)) : ymd(addMonths(cursor, 1));
    if (periodEnd < startDate) {
      // Достигли дораинтервальной зоны — на этом обрываем последовательность.
      break;
    }
    const p = byStart.get(key);
    if (p) {
      out.push(p.status === 'done' ? 'done' : 'missed');
    } else {
      // Текущий период (i===0) ещё не закрыт — считаем 'open'.
      // Если период начинается раньше startDate, но захватывает старт —
      // тоже 'open' (нельзя его автоматически считать пропуском, у юзера
      // не было полного периода на выполнение).
      const isBoundary = key < startDate;
      out.push(i === 0 || isBoundary ? 'open' : 'missed');
    }
    cursor = kind === 'week' ? addDays(cursor, -7) : addMonths(cursor, -1);
  }
  return out;
}

function addMonths(d: Date, n: number): Date {
  return new Date(d.getFullYear(), d.getMonth() + n, 1);
}

function streakFromSequence(seq: ('done' | 'missed' | 'open')[]): {
  current: number;
  best: number;
} {
  // Текущий стрик: пропускаем 'open' слева (текущий период с открытым окном
  // не повышает и не рвёт стрик), затем считаем подряд 'done'.
  let current = 0;
  let started = false;
  for (const s of seq) {
    if (!started && s === 'open') continue;
    started = true;
    if (s === 'done') current++;
    else break;
  }
  // Лучший — самая длинная подряд серия 'done' за всю историю.
  let best = 0;
  let run = 0;
  for (const s of seq) {
    if (s === 'done') {
      run++;
      if (run > best) best = run;
    } else if (s === 'missed') {
      run = 0;
    }
    // 'open' не сбрасывает run — это «дырка» без вины пользователя.
  }
  return { current, best: Math.max(best, current) };
}

function pctFromSequence(seq: ('done' | 'missed' | 'open')[], window: number): number {
  const slice = seq.slice(0, window).filter((s) => s !== 'open');
  if (slice.length === 0) return 0;
  const done = slice.filter((s) => s === 'done').length;
  return Math.round((done / slice.length) * 100);
}

/** Экспорт для UI: исходная последовательность по дням для heatmap. */
export function buildHeatmap(
  habit: Habit,
  logs: HabitLog[],
  now: Date,
  days: number
): { date: string; status: 'done' | 'missed' | 'open' | 'skip' }[] {
  const seq = buildDaySequence(habit, logs, now, days);
  const out: { date: string; status: 'done' | 'missed' | 'open' | 'skip' }[] = [];
  let cursor = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  for (let i = 0; i < days; i++) {
    out.push({ date: ymd(cursor), status: seq[i] });
    cursor = addDays(cursor, -1);
  }
  // Возвращаем в хронологическом порядке (старые → новые).
  return out.reverse();
}
