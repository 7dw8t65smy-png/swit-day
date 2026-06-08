import { useEffect, useMemo, useState } from 'react';
import { Plus, Bell, Calendar, CalendarDays, Archive, Inbox, Wrench } from 'lucide-react';
import { addDays, format, subDays } from 'date-fns';
import { api } from '../api';
import type { Habit, HabitLog, HabitStats } from '@swit/shared';
import { minutesUntilWindowEnd, habitStartDate } from '@swit/shared';
import { buildLogMap, isHabitDueOn } from '../lib/habits';
import { EmptyHabits } from './habits/EmptyHabits';
import { Group } from './habits/Group';
import { RoutineRow } from './habits/RoutineRow';
import { HabitFormModal } from './habits/HabitFormModal';
import { HabitDetailModal } from './habits/HabitDetailModal';
import { formatPastDate } from './habits/helpers';

// Routines page (back-end still calls them "habits" — UI says "Рутины").
//
// Conceptually: periodic to-do reminders, NOT a habit tracker. So no streaks,
// no completion percentage, no daily target count. Just:
//   — when is it due (cadence)
//   — was it done today / this month
//   — optional push reminder
//
// Groups: «Сегодня», «Эта неделя», «Этот месяц», «Когда-нибудь». Archived at the bottom.

export default function Habits(): JSX.Element {
  const [habits, setHabits] = useState<Habit[]>([]);
  const [logs, setLogs] = useState<HabitLog[]>([]);
  const [stats, setStats] = useState<Record<string, HabitStats>>({});
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<Habit | null>(null);
  const [detail, setDetail] = useState<Habit | null>(null);

  useEffect(() => {
    void reload();
  }, []);

  async function reload(): Promise<void> {
    // Тянем 90 дней — для мини-heatmap и расчёта старых пропусков.
    const from = format(subDays(new Date(), 90), 'yyyy-MM-dd');
    const [hs, ls, st] = await Promise.all([
      api.listHabits(),
      api.listHabitLogs({ from }),
      api.habitsStatsAll()
    ]);
    setHabits(hs);
    setLogs(ls);
    setStats(st);
  }

  /**
   * Найти прошлые дни без отметок (за 7 дней) для daily/specific_days/monthly_day,
   * у которых уже истекло окно подтверждения. Используется в «Навести порядок».
   * Сегодняшний день не включаем — там работает кнопка на Today.
   */
  function buildCleanupItems(): { habit: Habit; date: string }[] {
    const items: { habit: Habit; date: string }[] = [];
    const now = new Date();
    for (const h of habits) {
      if (h.archived) continue;
      if (h.cadence === 'weekly_n') continue;
      const startDate = habitStartDate(h);
      for (let back = 1; back <= 7; back++) {
        const d = subDays(now, back);
        const dateStr = format(d, 'yyyy-MM-dd');
        // Не показываем дни до создания рутины — её тогда ещё не было.
        if (dateStr < startDate) continue;
        if (!isHabitDueOn(h, d)) continue;
        const existing = logs.find((l) => l.habit_id === h.id && l.date === dateStr);
        if (existing) continue;
        const mins = minutesUntilWindowEnd(h, d, now);
        if (mins > 0) continue;
        items.push({ habit: h, date: dateStr });
      }
    }
    return items;
  }

  const cleanupItems = useMemo(() => buildCleanupItems(), [habits, logs]);

  async function markPast(habit_id: string, date: string, kind: 'done' | 'skip'): Promise<void> {
    if (kind === 'done') {
      await api.toggleHabitLog({ habit_id, date, delta: 1 });
    } else {
      await api.skipHabitLog({ habit_id, date });
    }
    await reload();
  }

  const today = format(new Date(), 'yyyy-MM-dd');
  const logMap = useMemo(() => buildLogMap(logs), [logs]);

  // Split into buckets:
  //   today  — due сегодня
  //   week   — due в следующие 7 дней (не сегодня)
  //   month  — due в этом месяце (не сегодня и не в ближ. 7 дн.)
  //   later  — никогда не сработают в ближайший месяц (но активны)
  //   archive
  const buckets = useMemo(() => {
    const now = new Date();
    const result = {
      today: [] as Habit[],
      week: [] as Habit[],
      month: [] as Habit[],
      later: [] as Habit[],
      archive: [] as Habit[]
    };
    for (const h of habits) {
      if (h.archived) {
        result.archive.push(h);
        continue;
      }
      const inner = logMap.get(h.id);
      // probe a 31-day window for nearest due day
      let placed = false;
      for (let i = 0; i < 31; i++) {
        const d = addDays(now, i);
        if (isHabitDueOn(h, d, inner)) {
          if (i === 0) result.today.push(h);
          else if (i <= 7) result.week.push(h);
          else result.month.push(h);
          placed = true;
          break;
        }
      }
      if (!placed) result.later.push(h);
    }
    return result;
  }, [habits, logMap]);

  const doneTodayCount = buckets.today.filter((h) => {
    const cnt = logMap.get(h.id)?.get(today) ?? 0;
    return cnt >= (h.target_count || 1);
  }).length;

  async function toggleToday(habitId: string, currentlyDone: boolean): Promise<void> {
    await api.toggleHabitLog({
      habit_id: habitId,
      date: today,
      delta: currentlyDone ? -1 : 1
    });
    await reload();
  }

  function timesThisMonth(h: Habit): number {
    const inner = logMap.get(h.id);
    if (!inner) return 0;
    let count = 0;
    for (const [, v] of inner) {
      if (v >= (h.target_count || 1)) count++;
    }
    return count;
  }

  return (
    <div className="p-6 max-w-[900px] space-y-5">
      <div className="flex items-center gap-3">
        <div className="flex-1 min-w-0">
          <h1 className="text-2xl font-semibold">Рутины</h1>
          <div className="text-sm text-muted mt-0.5">
            Периодические напоминания о делах, которые повторяются
          </div>
        </div>
        {buckets.today.length > 0 && (
          <div className="text-sm text-muted">
            Сегодня · <span className="font-semibold text-ink">{doneTodayCount}</span>/
            {buckets.today.length}
          </div>
        )}
        <button
          onClick={() => setCreating(true)}
          className="bg-accent text-white px-3 h-9 rounded-md text-sm hover:bg-accent-hover flex items-center gap-1.5 shadow-sm"
        >
          <Plus size={14} /> Новая рутина
        </button>
      </div>

      {cleanupItems.length > 0 && (
        <section className="bg-amber-50 border border-amber-200 rounded-md p-3">
          <div className="flex items-center gap-2 mb-2">
            <Wrench size={14} className="text-amber-600" />
            <span className="text-sm font-medium text-amber-900">
              Навести порядок · {cleanupItems.length}
            </span>
            <span className="text-[11px] text-amber-700/80 ml-1">
              Пропущенные дни. Отметка задним числом не восстанавливает стрик.
            </span>
          </div>
          <ul className="space-y-1">
            {cleanupItems.slice(0, 10).map(({ habit, date }) => (
              <li
                key={`${habit.id}:${date}`}
                className="flex items-center gap-2 bg-surface rounded px-2 py-1.5 text-sm"
              >
                <span className="text-base leading-none">{habit.icon ?? '✨'}</span>
                <span className="flex-1 truncate">{habit.title}</span>
                <span className="text-[11px] text-muted">{formatPastDate(date)}</span>
                <button
                  onClick={() => markPast(habit.id, date, 'done')}
                  title="Отметить как выполненное"
                  className="text-[11px] px-2 py-0.5 rounded-md bg-accent text-white hover:bg-accent-hover"
                >
                  Выполнил
                </button>
                <button
                  onClick={() => markPast(habit.id, date, 'skip')}
                  title="Подтвердить пропуск"
                  className="text-[11px] px-2 py-0.5 rounded-md border border-border hover:bg-surface2"
                >
                  Пропуск
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      {habits.filter((h) => !h.archived).length === 0 ? (
        <EmptyHabits onCreate={() => setCreating(true)} />
      ) : (
        <>
          <Group
            icon={<Bell size={14} className="text-accent" />}
            title="Сегодня"
            count={buckets.today.length}
            tone="accent"
          >
            {buckets.today.map((h) => {
              const cnt = logMap.get(h.id)?.get(today) ?? 0;
              const done = cnt >= (h.target_count || 1);
              return (
                <RoutineRow
                  key={h.id}
                  habit={h}
                  state={done ? 'done-today' : 'due-today'}
                  monthCount={timesThisMonth(h)}
                  onToggle={() => toggleToday(h.id, done)}
                  stats={stats[h.id]}
                onOpen={() => setDetail(h)}
                onEdit={() => setEditing(h)}
                />
              );
            })}
          </Group>

          <Group
            icon={<Calendar size={14} className="text-muted" />}
            title="Эта неделя"
            count={buckets.week.length}
          >
            {buckets.week.map((h) => (
              <RoutineRow
                key={h.id}
                habit={h}
                state="upcoming"
                monthCount={timesThisMonth(h)}
                stats={stats[h.id]}
                onOpen={() => setDetail(h)}
                onEdit={() => setEditing(h)}
              />
            ))}
          </Group>

          <Group
            icon={<CalendarDays size={14} className="text-muted" />}
            title="В этом месяце"
            count={buckets.month.length}
          >
            {buckets.month.map((h) => (
              <RoutineRow
                key={h.id}
                habit={h}
                state="upcoming"
                monthCount={timesThisMonth(h)}
                stats={stats[h.id]}
                onOpen={() => setDetail(h)}
                onEdit={() => setEditing(h)}
              />
            ))}
          </Group>

          <Group
            icon={<Inbox size={14} className="text-faint" />}
            title="Позже"
            count={buckets.later.length}
            muted
          >
            {buckets.later.map((h) => (
              <RoutineRow
                key={h.id}
                habit={h}
                state="upcoming"
                monthCount={timesThisMonth(h)}
                stats={stats[h.id]}
                onOpen={() => setDetail(h)}
                onEdit={() => setEditing(h)}
              />
            ))}
          </Group>

          {buckets.archive.length > 0 && (
            <Group
              icon={<Archive size={14} className="text-faint" />}
              title="Архив"
              count={buckets.archive.length}
              muted
              collapsed
            >
              {buckets.archive.map((h) => (
                <RoutineRow
                  key={h.id}
                  habit={h}
                  state="archived"
                  monthCount={0}
                  stats={stats[h.id]}
                onOpen={() => setDetail(h)}
                onEdit={() => setEditing(h)}
                />
              ))}
            </Group>
          )}
        </>
      )}

      <HabitDetailModal
        habit={detail}
        stats={detail ? stats[detail.id] : undefined}
        logs={detail ? logs.filter((l) => l.habit_id === detail.id) : []}
        onClose={() => setDetail(null)}
        onEdit={() => {
          const h = detail;
          setDetail(null);
          if (h) setEditing(h);
        }}
      />

      <HabitFormModal
        open={creating || editing !== null}
        habit={editing}
        onClose={() => {
          setCreating(false);
          setEditing(null);
        }}
        onSaved={async () => {
          setCreating(false);
          setEditing(null);
          await reload();
        }}
        onDelete={async (id) => {
          await api.deleteHabit(id);
          setCreating(false);
          setEditing(null);
          await reload();
        }}
      />
    </div>
  );
}
