import { useEffect, useMemo, useState } from 'react';
import { Check, Flame, X, RotateCcw, AlertTriangle, Plus } from 'lucide-react';
import { api } from '../api';
import type { Habit, HabitLog, HabitPeriodResult, HabitStats } from '@swit/shared';
import { minutesUntilWindowEnd } from '@swit/shared';
import { cadenceLabel, parseCadenceConfig } from '../lib/habits';
import HabitStreakBadge from './HabitStreakBadge';
import { format, subDays } from 'date-fns';

type Variant = 'today' | 'compact';

/**
 * Чек-лист рутин дня. Сам тянет привычки + статистику.
 * Для каждой due-привычки рисует карточку с кнопками «Выполнил / Пропуск»
 * (либо «+1» для weekly_n).
 */
export default function HabitChecklist({
  variant = 'today'
}: {
  variant?: Variant;
}): JSX.Element | null {
  const [habits, setHabits] = useState<Habit[]>([]);
  const [logs, setLogs] = useState<HabitLog[]>([]);
  const [_periods, setPeriods] = useState<HabitPeriodResult[]>([]);
  const [stats, setStats] = useState<Record<string, HabitStats>>({});
  const [loaded, setLoaded] = useState(false);
  // tick для пересчёта «осталось N минут до конца окна»
  const [, setNow] = useState(Date.now());

  async function reload(): Promise<void> {
    const from = format(subDays(new Date(), 40), 'yyyy-MM-dd');
    const [hs, ls, ps, st] = await Promise.all([
      api.listHabits(),
      api.listHabitLogs({ from }),
      api.listHabitPeriodResults(),
      api.habitsStatsAll()
    ]);
    setHabits(hs);
    setLogs(ls);
    setPeriods(ps);
    setStats(st);
    setLoaded(true);
  }

  useEffect(() => {
    void reload();
    const id = window.setInterval(() => setNow(Date.now()), 60_000);
    return () => window.clearInterval(id);
  }, []);

  const items = useMemo(
    () => buildTodayCards(habits, logs, new Date()),
    [habits, logs]
  );

  if (!loaded) return null;
  if (items.length === 0) return null;

  const today = format(new Date(), 'yyyy-MM-dd');
  const doneCount = items.filter((i) => i.state === 'done').length;

  async function markDone(habit_id: string): Promise<void> {
    await api.toggleHabitLog({ habit_id, date: today, delta: 1 });
    await reload();
  }

  async function markSkip(habit_id: string): Promise<void> {
    await api.skipHabitLog({ habit_id, date: today });
    await reload();
  }

  async function undo(habit_id: string): Promise<void> {
    const log = logs.find((l) => l.habit_id === habit_id && l.date === today);
    if (!log) return;
    await api.deleteHabitLog(log.id);
    await reload();
  }

  if (variant === 'compact') {
    return (
      <div className="mt-5">
        <div className="text-[11px] uppercase text-muted mb-2 flex items-center justify-between">
          <span>Рутины сегодня</span>
          <span className="text-faint normal-case">
            {doneCount}/{items.length}
          </span>
        </div>
        <ul className="space-y-1">
          {items.map((it) => (
            <CompactRow
              key={it.habit.id}
              item={it}
              stats={stats[it.habit.id]}
              onDone={() => markDone(it.habit.id)}
              onUndo={() => undo(it.habit.id)}
            />
          ))}
        </ul>
      </div>
    );
  }

  return (
    <section className="bg-surface rounded-lg shadow-sm p-4">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-sm uppercase text-muted tracking-wide flex items-center gap-2">
          <Flame size={14} className="text-orange-500" />
          Рутины сегодня
        </h2>
        <span className="text-xs text-muted">
          {doneCount} из {items.length}
        </span>
      </div>
      <ul className="space-y-2">
        {items.map((it) => (
          <FullCard
            key={it.habit.id}
            item={it}
            stats={stats[it.habit.id]}
            onDone={() => markDone(it.habit.id)}
            onSkip={() => markSkip(it.habit.id)}
            onUndo={() => undo(it.habit.id)}
          />
        ))}
      </ul>
    </section>
  );
}

// ---- Карточка для full-варианта на Today ----

interface CardItem {
  habit: Habit;
  /** Текущее состояние карточки. */
  state: 'pending' | 'done' | 'missed' | 'in_progress';
  /** Прогресс для weekly_n. */
  weekly?: { done: number; target: number };
  /** Сегодняшний log (если есть). */
  todayLog: HabitLog | null;
}

function FullCard({
  item,
  stats,
  onDone,
  onSkip,
  onUndo
}: {
  item: CardItem;
  stats: HabitStats | undefined;
  onDone: () => void;
  onSkip: () => void;
  onUndo: () => void;
}): JSX.Element {
  const { habit, state, weekly } = item;
  const isWeekly = habit.cadence === 'weekly_n';

  // Сколько минут до конца окна — отрицательное значит истекло.
  const minsLeft = isWeekly
    ? null
    : minutesUntilWindowEnd(habit, new Date(), new Date());
  const isWarning =
    !isWeekly && minsLeft !== null && minsLeft > 0 && minsLeft <= 60 && state === 'pending';
  const isExpired =
    !isWeekly && minsLeft !== null && minsLeft <= 0 && state === 'pending';

  const borderCls =
    state === 'done'
      ? 'border-transparent bg-surface2/40'
      : state === 'missed'
        ? 'border-red-300 bg-red-50/40'
        : isExpired
          ? 'border-red-400 bg-red-50/60'
          : isWarning
            ? 'border-amber-400 bg-amber-50/40'
            : 'border-border hover:border-accent';

  return (
    <li className={`rounded-md border p-3 transition ${borderCls}`}>
      <div className="flex items-start gap-3">
        <div
          className="w-10 h-10 rounded-md flex items-center justify-center text-xl shrink-0"
          style={{ background: (habit.color ?? '#2563EB') + '20' }}
        >
          {habit.icon ?? '✨'}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span
              className={`font-medium text-sm ${state === 'done' || state === 'missed' ? 'text-muted' : ''}`}
              style={state === 'done' ? { textDecoration: 'line-through' } : undefined}
            >
              {habit.title}
            </span>
            {stats && (
              <HabitStreakBadge
                streak={stats.current_streak}
                unit={stats.unit}
                size="sm"
              />
            )}
          </div>
          <div className="text-[11px] text-muted mt-0.5 flex items-center gap-2 flex-wrap">
            <span>{cadenceLabel(habit)}</span>
            {habit.remind_time && !isWeekly && (
              <span>· напоминание {habit.remind_time}</span>
            )}
            {isWeekly && weekly && (
              <span>
                ·{' '}
                <b className={weekly.done >= weekly.target ? 'text-green-600' : ''}>
                  {weekly.done}/{weekly.target}
                </b>{' '}
                на этой неделе
              </span>
            )}
          </div>
          {isWeekly && weekly && (
            <div className="mt-2 h-1.5 rounded-full bg-surface2 overflow-hidden">
              <div
                className="h-full rounded-full transition-all"
                style={{
                  width: `${Math.min(100, (weekly.done / Math.max(1, weekly.target)) * 100)}%`,
                  background:
                    weekly.done >= weekly.target ? '#22C55E' : habit.color ?? '#2563EB'
                }}
              />
            </div>
          )}
          {isWarning && (
            <div className="mt-2 text-[11px] text-amber-700 font-medium flex items-center gap-1">
              <AlertTriangle size={11} />
              Стрик прервётся через {minsLeft} мин — нажми сейчас
            </div>
          )}
          {isExpired && (
            <div className="mt-2 text-[11px] text-red-600 font-medium flex items-center gap-1">
              <AlertTriangle size={11} />
              Окно подтверждения истекло — стрик прервётся
            </div>
          )}
        </div>

        <div className="flex flex-col items-stretch gap-1 shrink-0 min-w-[120px]">
          {state === 'done' ? (
            <button
              onClick={onUndo}
              className="text-xs px-2.5 py-1.5 rounded-md border border-border hover:bg-surface2 flex items-center justify-center gap-1 text-muted"
            >
              <RotateCcw size={12} /> Отменить
            </button>
          ) : state === 'missed' ? (
            <>
              <button
                onClick={onDone}
                className="text-xs px-2.5 py-1.5 rounded-md bg-accent text-white hover:bg-accent-hover flex items-center justify-center gap-1"
              >
                <Check size={12} /> Всё-таки сделал
              </button>
              <button
                onClick={onUndo}
                className="text-[11px] text-muted hover:text-ink"
              >
                Убрать пропуск
              </button>
            </>
          ) : isWeekly ? (
            <>
              <button
                onClick={onDone}
                className="text-sm px-3 py-2 rounded-md bg-accent text-white hover:bg-accent-hover flex items-center justify-center gap-1 font-medium"
              >
                <Plus size={14} /> Выполнил
              </button>
              {weekly && weekly.done > 0 && (
                <button
                  onClick={onUndo}
                  className="text-[11px] text-muted hover:text-ink"
                >
                  Отменить последнюю
                </button>
              )}
            </>
          ) : (
            <>
              <button
                onClick={onDone}
                className="text-sm px-3 py-2 rounded-md bg-accent text-white hover:bg-accent-hover flex items-center justify-center gap-1 font-medium"
              >
                <Check size={14} /> Выполнил
              </button>
              <button
                onClick={onSkip}
                className="text-xs px-2.5 py-1.5 rounded-md border border-border hover:bg-red-50 hover:text-red-600 hover:border-red-300 flex items-center justify-center gap-1 text-muted transition"
              >
                <X size={12} /> Пропуск
              </button>
            </>
          )}
        </div>
      </div>
    </li>
  );
}

function CompactRow({
  item,
  stats,
  onDone,
  onUndo
}: {
  item: CardItem;
  stats: HabitStats | undefined;
  onDone: () => void;
  onUndo: () => void;
}): JSX.Element {
  const { habit, state, weekly } = item;
  const done =
    state === 'done' || (weekly !== undefined && weekly.done >= weekly.target);
  return (
    <li>
      <button
        onClick={() => (done ? onUndo() : onDone())}
        className={`w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-sm transition text-left ${
          done ? 'bg-surface2 text-muted line-through' : 'hover:bg-surface2'
        }`}
      >
        <span
          className={`w-4 h-4 rounded shrink-0 flex items-center justify-center ${
            done ? '' : 'border border-border'
          }`}
          style={done ? { background: habit.color ?? 'var(--color-accent)' } : undefined}
        >
          {done && <Check size={10} className="text-white" />}
        </span>
        <span className="text-base leading-none shrink-0">{habit.icon ?? '✨'}</span>
        <span className="truncate flex-1">{habit.title}</span>
        {weekly && (
          <span className={`text-[10px] timer-font ${done ? 'text-muted' : 'text-faint'}`}>
            {weekly.done}/{weekly.target}
          </span>
        )}
        {stats && stats.current_streak > 0 && (
          <span className="text-[10px] timer-font text-orange-500">
            🔥{stats.current_streak}
          </span>
        )}
      </button>
    </li>
  );
}

// ---- Какие рутины показать сегодня и в каком состоянии ----

function buildTodayCards(habits: Habit[], logs: HabitLog[], now: Date): CardItem[] {
  const today = format(now, 'yyyy-MM-dd');
  const out: CardItem[] = [];
  for (const h of habits) {
    if (h.archived) continue;
    const todayLog =
      logs.find((l) => l.habit_id === h.id && l.date === today) ?? null;
    if (h.cadence === 'weekly_n') {
      const cfg = parseCadenceConfig(h);
      const target = Math.max(1, cfg.times_per_week ?? 1);
      const ws = startOfWeekMonday(now);
      const we = addDays(ws, 6);
      let done = 0;
      for (const l of logs) {
        if (l.habit_id !== h.id) continue;
        if (l.status !== 'done') continue;
        const d = new Date(l.date + 'T00:00:00');
        if (d >= ws && d <= we) done += l.count;
      }
      out.push({
        habit: h,
        state: done >= target ? 'done' : done > 0 ? 'in_progress' : 'pending',
        weekly: { done, target },
        todayLog
      });
      continue;
    }
    if (!isDueOnDate(h, now)) continue;
    if (todayLog) {
      out.push({
        habit: h,
        state: todayLog.status === 'done' ? 'done' : 'missed',
        todayLog
      });
    } else {
      out.push({ habit: h, state: 'pending', todayLog: null });
    }
  }
  return out;
}

function isDueOnDate(h: Habit, d: Date): boolean {
  const cfg = parseCadenceConfig(h);
  const dow = d.getDay();
  switch (h.cadence) {
    case 'daily':
      return true;
    case 'specific_days':
      return (cfg.weekdays ?? []).includes(dow);
    case 'monthly_day': {
      const t = cfg.day_of_month ?? 1;
      const last = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
      return d.getDate() === Math.min(t, last);
    }
    case 'weekdays':
      return dow >= 1 && dow <= 5;
    case 'weekly':
      return dow === 1;
    default:
      return false;
  }
}

function startOfWeekMonday(d: Date): Date {
  const dow = d.getDay();
  const delta = dow === 0 ? -6 : 1 - dow;
  const m = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  m.setDate(m.getDate() + delta);
  return m;
}

function addDays(d: Date, n: number): Date {
  const c = new Date(d);
  c.setDate(c.getDate() + n);
  return c;
}
