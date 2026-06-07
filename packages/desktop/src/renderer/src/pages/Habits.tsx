import { useEffect, useMemo, useState } from 'react';
import {
  Plus,
  Bell,
  Check,
  Calendar,
  CalendarDays,
  Archive,
  Inbox,
  Wrench,
  X as XIcon,
  AlertTriangle
} from 'lucide-react';
import { addDays, format, startOfMonth, subDays } from 'date-fns';
import { api } from '../api';
import type {
  Habit,
  HabitCadence,
  HabitCadenceConfig,
  HabitLog,
  HabitStats
} from '@swit/shared';
import { minutesUntilWindowEnd, streakTier, HABIT_BADGES, habitStartDate } from '@swit/shared';
import Modal from '../components/Modal';
import HabitStreakBadge from '../components/HabitStreakBadge';
import { PROJECT_PALETTE } from '../lib/palette';
import { buildLogMap, cadenceLabel, isHabitDueOn, parseCadenceConfig } from '../lib/habits';

// Routines page (back-end still calls them "habits" — UI says "Рутины").
//
// Conceptually: periodic to-do reminders, NOT a habit tracker. So no streaks,
// no completion percentage, no daily target count. Just:
//   — when is it due (cadence)
//   — was it done today / this month
//   — optional push reminder
//
// Groups: «Сегодня», «Эта неделя», «Этот месяц», «Когда-нибудь». Archived at the bottom.

const HABIT_ICONS = ['🏃', '💧', '📚', '🧘', '☕', '💪', '🌅', '🛌', '✍️', '🎨', '🎵', '🍎', '💼', '💳', '📞', '📨'];

type SelectableCadence = 'daily' | 'specific_days' | 'weekly_n' | 'monthly_day';

const SELECTABLE_CADENCES: { value: SelectableCadence; label: string; hint: string }[] = [
  { value: 'daily', label: 'Каждый день', hint: 'Без выходных' },
  { value: 'specific_days', label: 'По дням недели', hint: 'Например, Пн–Ср–Пт' },
  { value: 'weekly_n', label: 'N раз в неделю', hint: 'В любые дни недели' },
  { value: 'monthly_day', label: 'Раз в месяц', hint: 'По числу месяца' }
];

const WEEKDAY_PICKERS: { wd: number; label: string }[] = [
  { wd: 1, label: 'Пн' },
  { wd: 2, label: 'Вт' },
  { wd: 3, label: 'Ср' },
  { wd: 4, label: 'Чт' },
  { wd: 5, label: 'Пт' },
  { wd: 6, label: 'Сб' },
  { wd: 0, label: 'Вс' }
];

function normalizeCadence(habit: Habit | null): {
  cadence: SelectableCadence;
  config: HabitCadenceConfig;
} {
  if (!habit) return { cadence: 'daily', config: {} };
  const cfg = parseCadenceConfig(habit);
  switch (habit.cadence) {
    case 'daily':
    case 'specific_days':
    case 'weekly_n':
    case 'monthly_day':
      return { cadence: habit.cadence, config: cfg };
    case 'weekdays':
      return { cadence: 'specific_days', config: { weekdays: [1, 2, 3, 4, 5] } };
    case 'weekly':
      return { cadence: 'weekly_n', config: { times_per_week: 1 } };
    default:
      return { cadence: 'daily', config: {} };
  }
}

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

function EmptyHabits({ onCreate }: { onCreate: () => void }): JSX.Element {
  return (
    <div className="bg-surface rounded-lg shadow-sm p-12 text-center">
      <div className="text-4xl mb-3 opacity-40">🔁</div>
      <div className="text-sm text-muted max-w-md mx-auto">
        Сюда хорошо положить дела, которые повторяются: оплатить квартиру 5-го числа,
        отчёт по понедельникам, тренировка три раза в неделю. Календарь забивать не нужно —
        сами напомнят.
      </div>
      <button
        onClick={onCreate}
        className="mt-4 inline-flex items-center gap-1.5 bg-accent text-white px-4 py-2 rounded-md text-sm hover:bg-accent-hover shadow-sm"
      >
        <Plus size={14} /> Создать первую рутину
      </button>
    </div>
  );
}

function Group({
  icon,
  title,
  count,
  children,
  tone,
  muted,
  collapsed = false
}: {
  icon: React.ReactNode;
  title: string;
  count: number;
  children: React.ReactNode;
  tone?: 'accent';
  muted?: boolean;
  collapsed?: boolean;
}): JSX.Element | null {
  const [open, setOpen] = useState(!collapsed);
  if (count === 0) return null;
  return (
    <section>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={`w-full flex items-center gap-2 mb-2 group ${
          muted ? 'opacity-70' : ''
        }`}
      >
        {icon}
        <span
          className={`text-xs uppercase tracking-wide ${
            tone === 'accent' ? 'text-accent font-semibold' : 'text-muted'
          }`}
        >
          {title}
        </span>
        <span className="text-xs text-faint">· {count}</span>
        <span className="ml-auto text-[10px] text-faint group-hover:text-muted transition">
          {open ? 'скрыть' : 'показать'}
        </span>
      </button>
      {open && <div className="space-y-1.5">{children}</div>}
    </section>
  );
}

type RowState = 'due-today' | 'done-today' | 'upcoming' | 'archived';

function RoutineRow({
  habit,
  state,
  monthCount,
  stats,
  onToggle,
  onOpen,
  onEdit
}: {
  habit: Habit;
  state: RowState;
  monthCount: number;
  stats?: HabitStats;
  onToggle?: () => void;
  onOpen: () => void;
  onEdit: () => void;
}): JSX.Element {
  const done = state === 'done-today';
  const archived = state === 'archived';
  const dueToday = state === 'due-today';
  const color = habit.color ?? '#2563EB';
  // Окно подтверждения — только для не-weekly_n и due-today.
  const minsLeft =
    dueToday && habit.cadence !== 'weekly_n'
      ? minutesUntilWindowEnd(habit, new Date(), new Date())
      : null;
  const isWarning = minsLeft !== null && minsLeft > 0 && minsLeft <= 60;
  const isExpired = minsLeft !== null && minsLeft <= 0;

  return (
    <div
      className={`group flex items-center gap-3 bg-surface rounded-md shadow-sm border transition ${
        dueToday
          ? 'border-accent/40 hover:border-accent'
          : done
            ? 'border-transparent opacity-70'
            : 'border-transparent hover:border-border'
      }`}
      style={
        dueToday
          ? { borderLeftWidth: 3, borderLeftColor: color }
          : undefined
      }
    >
      {/* Check button — only meaningful when due today */}
      {onToggle && !archived ? (
        <button
          onClick={onToggle}
          aria-label={done ? 'Отменить выполнение' : 'Отметить выполненным'}
          className={`ml-3 w-6 h-6 rounded-md shrink-0 flex items-center justify-center transition ${
            done ? '' : 'border-2 border-border hover:border-accent'
          }`}
          style={done ? { background: color } : undefined}
        >
          {done && <Check size={14} className="text-white" />}
        </button>
      ) : (
        <div className="ml-3 w-6 h-6 shrink-0 flex items-center justify-center">
          <div
            className="w-2.5 h-2.5 rounded-full"
            style={{ background: archived ? 'var(--color-border)' : color, opacity: 0.6 }}
          />
        </div>
      )}

      <button
        onClick={onOpen}
        className="flex-1 min-w-0 text-left px-1 py-3 flex items-center gap-3"
      >
        <span className="text-xl leading-none shrink-0">{habit.icon ?? '✨'}</span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <span
              className={`text-sm font-medium truncate ${
                done ? 'line-through text-muted' : archived ? 'text-muted' : ''
              }`}
            >
              {habit.title}
            </span>
            {stats && !archived && (
              <HabitStreakBadge
                streak={stats.current_streak}
                unit={stats.unit}
                size="sm"
              />
            )}
          </div>
          <div className="text-[11px] text-muted truncate flex items-center gap-1.5 mt-0.5">
            <span>{cadenceLabel(habit)}</span>
            {habit.remind_time && (
              <span className="inline-flex items-center gap-0.5 text-accent">
                <Bell size={9} />
                {habit.remind_time}
              </span>
            )}
            {monthCount > 0 && !archived && (
              <span className="text-faint">· {monthCount} в этом месяце</span>
            )}
            {stats && stats.best_streak > 0 && !archived && (
              <span className="text-faint">· лучший {stats.best_streak}</span>
            )}
          </div>
          {(isWarning || isExpired) && !done && (
            <div
              className={`mt-1 text-[10px] font-medium flex items-center gap-1 ${
                isExpired ? 'text-red-600' : 'text-amber-600'
              }`}
            >
              <AlertTriangle size={10} />
              {isExpired
                ? 'Окно истекло — стрик прервётся'
                : `Стрик прервётся через ${minsLeft} мин`}
            </div>
          )}
        </div>
      </button>
      <button
        onClick={onEdit}
        title="Редактировать"
        className="mr-2 text-faint hover:text-accent p-1 opacity-0 group-hover:opacity-100"
      >
        ✎
      </button>
    </div>
  );
}

// --- Form modal (mostly same as before, minus "цель за день") ---

function HabitFormModal({
  open,
  habit,
  onClose,
  onSaved,
  onDelete
}: {
  open: boolean;
  habit: Habit | null;
  onClose: () => void;
  onSaved: () => Promise<void>;
  onDelete: (id: string) => Promise<void>;
}): JSX.Element {
  const [title, setTitle] = useState('');
  const [icon, setIcon] = useState(HABIT_ICONS[0]);
  const [color, setColor] = useState<string>(PROJECT_PALETTE[0]);
  const [cadence, setCadence] = useState<SelectableCadence>('daily');
  const [weekdays, setWeekdays] = useState<number[]>([1, 3, 5]);
  const [timesPerWeek, setTimesPerWeek] = useState(3);
  const [dayOfMonth, setDayOfMonth] = useState(1);
  const [remindEnabled, setRemindEnabled] = useState(false);
  const [remindTime, setRemindTime] = useState('09:00');
  const [confirmWindowH, setConfirmWindowH] = useState<number>(6);

  useEffect(() => {
    if (!open) return;
    setTitle(habit?.title ?? '');
    setIcon(habit?.icon ?? HABIT_ICONS[0]);
    setColor(habit?.color ?? PROJECT_PALETTE[0]);
    const { cadence: c, config } = normalizeCadence(habit);
    setCadence(c);
    setWeekdays(config.weekdays ?? [1, 3, 5]);
    setTimesPerWeek(config.times_per_week ?? 3);
    setDayOfMonth(config.day_of_month ?? 1);
    setRemindEnabled(!!habit?.remind_time);
    setRemindTime(habit?.remind_time ?? '09:00');
    setConfirmWindowH(habit?.confirm_window_h ?? 6);
  }, [open, habit]);

  function buildConfig(): HabitCadenceConfig {
    switch (cadence) {
      case 'specific_days':
        return { weekdays: weekdays.slice().sort((a, b) => a - b) };
      case 'weekly_n':
        return { times_per_week: Math.min(7, Math.max(1, timesPerWeek)) };
      case 'monthly_day':
        return { day_of_month: Math.min(31, Math.max(1, dayOfMonth)) };
      default:
        return {};
    }
  }

  async function save(): Promise<void> {
    if (!title.trim()) return;
    if (cadence === 'specific_days' && weekdays.length === 0) {
      alert('Выбери хотя бы один день недели');
      return;
    }
    const payload = {
      title,
      icon,
      color,
      cadence: cadence as HabitCadence,
      cadence_config: JSON.stringify(buildConfig()),
      target_count: 1, // фиксировано: рутина = сделано/не сделано, без объёмов
      remind_time: remindEnabled ? remindTime : null,
      confirm_window_h: Math.max(1, Math.min(48, Math.round(confirmWindowH)))
    };
    const saved = habit
      ? await api.updateHabit(habit.id, payload)
      : await api.createHabit(payload);
    await onSaved();
  }

  async function toggleArchive(): Promise<void> {
    if (!habit) return;
    await api.updateHabit(habit.id, { archived: habit.archived ? 0 : 1 });
    await onSaved();
  }

  function toggleWeekday(wd: number): void {
    setWeekdays((prev) =>
      prev.includes(wd) ? prev.filter((d) => d !== wd) : [...prev, wd]
    );
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={habit ? 'Рутина' : 'Новая рутина'}
      footer={
        <>
          {habit && (
            <button
              onClick={() => {
                if (confirm(`Удалить «${habit.title}»? История выполнений будет утеряна.`))
                  void onDelete(habit.id);
              }}
              className="px-3 py-1.5 rounded-md text-sm text-red-500 border border-border mr-auto"
            >
              Удалить
            </button>
          )}
          {habit && (
            <button
              onClick={toggleArchive}
              className="px-3 py-1.5 rounded-md text-sm border border-border"
            >
              {habit.archived ? 'Вернуть' : 'В архив'}
            </button>
          )}
          <button onClick={onClose} className="px-3 py-1.5 rounded-md text-sm border border-border">
            Отмена
          </button>
          <button
            onClick={save}
            disabled={!title.trim()}
            className="px-4 py-1.5 rounded-md text-sm bg-accent text-white hover:bg-accent-hover disabled:opacity-40"
          >
            Сохранить
          </button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="flex gap-2 items-start">
          <select
            value={icon}
            onChange={(e) => setIcon(e.target.value)}
            className="h-10 px-2 rounded-md border border-border bg-surface text-lg"
          >
            {HABIT_ICONS.map((i) => (
              <option key={i} value={i}>
                {i}
              </option>
            ))}
          </select>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            autoFocus
            placeholder="Например, «Оплатить квартиру»"
            className="flex-1 h-10 px-3 rounded-md border border-border bg-surface text-sm"
          />
        </div>

        <div>
          <label className="text-xs uppercase text-muted">Когда напоминать</label>
          <div className="grid grid-cols-2 gap-2 mt-2">
            {SELECTABLE_CADENCES.map((c) => (
              <button
                key={c.value}
                onClick={() => setCadence(c.value)}
                className={`px-3 py-2 rounded-md text-sm border text-left transition ${
                  cadence === c.value
                    ? 'border-accent bg-accent-light text-ink'
                    : 'border-border text-muted hover:bg-surface2'
                }`}
              >
                <div className="font-medium">{c.label}</div>
                <div className="text-[10px] opacity-70">{c.hint}</div>
              </button>
            ))}
          </div>

          {cadence === 'specific_days' && (
            <div className="mt-3">
              <div className="text-[11px] text-muted mb-1.5">В какие дни недели?</div>
              <div className="flex flex-wrap gap-1.5">
                {WEEKDAY_PICKERS.map((d) => (
                  <button
                    key={d.wd}
                    onClick={() => toggleWeekday(d.wd)}
                    className={`w-10 h-9 rounded-md text-xs font-medium border transition ${
                      weekdays.includes(d.wd)
                        ? 'bg-accent text-white border-accent'
                        : 'bg-surface text-muted border-border hover:bg-surface2'
                    }`}
                  >
                    {d.label}
                  </button>
                ))}
              </div>
              <div className="flex gap-2 mt-2 text-[10px]">
                <button
                  onClick={() => setWeekdays([1, 2, 3, 4, 5])}
                  className="text-accent hover:underline"
                >
                  Будни
                </button>
                <button
                  onClick={() => setWeekdays([0, 6])}
                  className="text-accent hover:underline"
                >
                  Выходные
                </button>
                <button
                  onClick={() => setWeekdays([0, 1, 2, 3, 4, 5, 6])}
                  className="text-accent hover:underline"
                >
                  Всё подряд
                </button>
              </div>
            </div>
          )}

          {cadence === 'weekly_n' && (
            <div className="mt-3">
              <div className="text-[11px] text-muted mb-1.5">
                Сколько раз в неделю · {timesPerWeek}
              </div>
              <input
                type="range"
                min={1}
                max={7}
                value={timesPerWeek}
                onChange={(e) => setTimesPerWeek(Number(e.target.value))}
                className="w-full"
              />
              <div className="text-[10px] text-faint mt-1">
                Будет напоминать каждый день недели, пока не закроешь нужное количество.
              </div>
            </div>
          )}

          {cadence === 'monthly_day' && (
            <div className="mt-3">
              <label className="text-[11px] text-muted block mb-1.5">Какого числа?</label>
              <input
                type="number"
                min={1}
                max={31}
                value={dayOfMonth}
                onChange={(e) => setDayOfMonth(Number(e.target.value))}
                className="w-20 h-9 px-2 rounded-md border border-border bg-surface text-sm"
              />
              <div className="text-[10px] text-faint mt-1">
                В коротких месяцах сдвинется на последний день.
              </div>
            </div>
          )}
        </div>

        <div>
          <label className="text-xs uppercase text-muted flex items-center justify-between">
            <span>Пуш-уведомление</span>
            <input
              type="checkbox"
              checked={remindEnabled}
              onChange={(e) => setRemindEnabled(e.target.checked)}
              className="accent-accent"
            />
          </label>
          {remindEnabled && (
            <div className="mt-2 flex items-center gap-2">
              <Bell size={14} className="text-accent" />
              <input
                type="time"
                value={remindTime}
                onChange={(e) => setRemindTime(e.target.value)}
                className="h-9 px-2 rounded-md border border-border bg-surface text-sm"
              />
              <span className="text-[11px] text-faint">
                В подходящий день — уведомление в этот час
              </span>
            </div>
          )}
        </div>

        {cadence !== 'weekly_n' && (
          <div>
            <label className="text-xs uppercase text-muted">
              Окно подтверждения · {confirmWindowH} ч
            </label>
            <input
              type="range"
              min={1}
              max={24}
              value={confirmWindowH}
              onChange={(e) => setConfirmWindowH(Number(e.target.value))}
              className="w-full mt-2"
            />
            <div className="text-[10px] text-faint mt-1">
              Сколько часов после {remindEnabled ? `${remindTime}` : 'конца дня'} даём на отметку
              «Выполнил». По истечении — день автоматически становится пропуском, стрик рвётся.
            </div>
          </div>
        )}

        <div>
          <label className="text-xs uppercase text-muted">Цвет</label>
          <div className="flex flex-wrap gap-2 mt-2">
            {PROJECT_PALETTE.map((c) => (
              <button
                key={c}
                onClick={() => setColor(c)}
                className={`w-8 h-8 rounded-md ring-offset-2 ring-offset-surface ${
                  color === c ? 'ring-2 ring-ink' : ''
                }`}
                style={{ background: c }}
              />
            ))}
          </div>
        </div>
      </div>
    </Modal>
  );
}

// ---- Детальная модалка рутины: stats, бэйджи, heatmap, история ----

function HabitDetailModal({
  habit,
  stats,
  logs,
  onClose,
  onEdit
}: {
  habit: Habit | null;
  stats: HabitStats | undefined;
  logs: HabitLog[];
  onClose: () => void;
  onEdit: () => void;
}): JSX.Element {
  if (!habit) {
    return (
      <Modal open={false} onClose={onClose} title="">
        <div />
      </Modal>
    );
  }
  const tier = streakTier(stats?.current_streak ?? 0);
  return (
    <Modal
      open={!!habit}
      onClose={onClose}
      title={`${habit.icon ?? ''} ${habit.title}`}
      wide
      footer={
        <>
          <button onClick={onClose} className="px-3 py-1.5 rounded-md text-sm border border-border">
            Закрыть
          </button>
          <button
            onClick={onEdit}
            className="px-4 py-1.5 rounded-md text-sm bg-accent text-white hover:bg-accent-hover"
          >
            Редактировать
          </button>
        </>
      }
    >
      <div className="space-y-5">
        {/* Большой стрик */}
        <section
          className="rounded-lg p-5 text-center"
          style={{ background: tier.color + '18' }}
        >
          <div className="text-[11px] uppercase tracking-wide text-muted">
            Текущий стрик
          </div>
          <div className="mt-2 flex items-center justify-center">
            <HabitStreakBadge
              streak={stats?.current_streak ?? 0}
              unit={stats?.unit ?? 'day'}
              size="lg"
            />
          </div>
          <div className="mt-3 grid grid-cols-3 gap-3 text-sm">
            <DetailMetric label="Лучший" value={String(stats?.best_streak ?? 0)} />
            <DetailMetric label="Всего" value={String(stats?.total_done ?? 0)} />
            <DetailMetric
              label="Цикл"
              value={
                stats?.unit === 'day'
                  ? 'дни'
                  : stats?.unit === 'week'
                    ? 'недели'
                    : 'месяцы'
              }
            />
          </div>
        </section>

        {/* Прогресс недели/месяца */}
        {stats?.week_progress && (
          <section className="rounded-lg border border-border p-4">
            <div className="text-xs uppercase text-muted mb-2">
              Эта неделя · {stats.week_progress.done}/{stats.week_progress.target}
              {stats.week_progress.days_left > 0 && (
                <span className="text-faint normal-case">
                  {' '}
                  · осталось {stats.week_progress.days_left}{' '}
                  {pl(stats.week_progress.days_left, 'день', 'дня', 'дней')}
                </span>
              )}
            </div>
            <div className="h-2 rounded-full bg-surface2 overflow-hidden">
              <div
                className="h-full rounded-full"
                style={{
                  width: `${Math.min(
                    100,
                    (stats.week_progress.done / Math.max(1, stats.week_progress.target)) * 100
                  )}%`,
                  background:
                    stats.week_progress.done >= stats.week_progress.target
                      ? '#22C55E'
                      : habit.color ?? '#2563EB'
                }}
              />
            </div>
          </section>
        )}

        {stats?.month_progress && (
          <section className="rounded-lg border border-border p-4 text-sm">
            <div className="text-xs uppercase text-muted mb-1">Этот месяц</div>
            {stats.month_progress.done ? (
              <span className="text-green-600 font-medium">
                ✓ Выполнено в этом месяце
              </span>
            ) : (
              <span className="text-muted">
                Контрольная дата —{' '}
                <b className="text-ink">{stats.month_progress.target_day}-е число</b>
              </span>
            )}
          </section>
        )}

        {/* Бэйджи */}
        {stats && (
          <section>
            <div className="text-xs uppercase text-muted mb-2">Бэйджи</div>
            <div className="grid grid-cols-3 gap-2">
              {stats.badges.map((b) => {
                const remaining =
                  b.kind === 'streak'
                    ? Math.max(0, b.threshold - stats.current_streak)
                    : Math.max(0, b.threshold - stats.total_done);
                return (
                  <div
                    key={b.id}
                    className={`rounded-md p-2 border text-center text-xs ${
                      b.unlocked
                        ? 'border-accent/40 bg-accent-light/40'
                        : 'border-border bg-surface2/40 opacity-70'
                    }`}
                  >
                    <div className={`text-2xl ${b.unlocked ? '' : 'grayscale opacity-50'}`}>
                      {b.emoji}
                    </div>
                    <div className="font-medium mt-1 truncate">{b.label}</div>
                    <div className="text-[10px] text-muted">
                      {b.unlocked
                        ? 'Разблокировано'
                        : `Осталось ${remaining} ${
                            b.kind === 'streak'
                              ? stats.unit === 'day'
                                ? 'дн'
                                : stats.unit === 'week'
                                  ? 'нед'
                                  : 'мес'
                              : 'раз'
                          }`}
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        )}

        {/* Heatmap последних 90 дней */}
        <section>
          <div className="text-xs uppercase text-muted mb-2">
            Активность за 90 дней
          </div>
          <Heatmap habit={habit} logs={logs} />
        </section>

        {/* История */}
        <section>
          <div className="text-xs uppercase text-muted mb-2">История последних отметок</div>
          <ul className="text-xs divide-y divide-border max-h-48 overflow-auto">
            {logs.slice(0, 30).map((l) => (
              <li
                key={l.id}
                className="py-1.5 flex items-center gap-2"
              >
                <span
                  className={`w-2 h-2 rounded-full ${
                    l.status === 'done' ? 'bg-green-500' : 'bg-red-400'
                  }`}
                />
                <span className="timer-font text-muted">{l.date}</span>
                <span className="flex-1">
                  {l.status === 'done'
                    ? `Выполнено${l.count > 1 ? ` ×${l.count}` : ''}`
                    : 'Пропуск'}
                </span>
                {l.note && <span className="text-faint truncate">{l.note}</span>}
              </li>
            ))}
            {logs.length === 0 && (
              <li className="py-2 text-muted text-center">Ещё пусто</li>
            )}
          </ul>
        </section>
      </div>
    </Modal>
  );
}

function DetailMetric({ label, value }: { label: string; value: string }): JSX.Element {
  return (
    <div className="bg-surface rounded-md py-2">
      <div className="text-[10px] uppercase text-muted">{label}</div>
      <div className="text-base font-semibold timer-font mt-0.5">{value}</div>
    </div>
  );
}

function Heatmap({ habit, logs }: { habit: Habit; logs: HabitLog[] }): JSX.Element {
  const days = 90;
  const cells: { date: string; status: 'done' | 'missed' | 'open' | 'skip' }[] = [];
  const now = new Date();
  const startDate = habitStartDate(habit);
  const byDate = new Map<string, HabitLog>();
  for (const l of logs) byDate.set(l.date, l);
  for (let i = days - 1; i >= 0; i--) {
    const d = subDays(now, i);
    const dateStr = format(d, 'yyyy-MM-dd');
    // До создания рутины — нейтральные серые клетки.
    if (dateStr < startDate) {
      cells.push({ date: dateStr, status: 'skip' });
      continue;
    }
    if (habit.cadence !== 'weekly_n' && !isHabitDueOn(habit, d)) {
      cells.push({ date: dateStr, status: 'skip' });
      continue;
    }
    const log = byDate.get(dateStr);
    if (log) {
      cells.push({
        date: dateStr,
        status: log.status === 'done' ? 'done' : 'missed'
      });
    } else if (i === 0) {
      cells.push({ date: dateStr, status: 'open' });
    } else {
      cells.push({ date: dateStr, status: 'missed' });
    }
  }
  return (
    <div className="flex flex-wrap gap-0.5">
      {cells.map((c) => (
        <div
          key={c.date}
          title={`${c.date}: ${
            c.status === 'done'
              ? 'выполнено'
              : c.status === 'missed'
                ? 'пропуск'
                : c.status === 'open'
                  ? 'ещё можно отметить'
                  : 'не due'
          }`}
          className="w-3 h-3 rounded-sm"
          style={{
            background:
              c.status === 'done'
                ? habit.color ?? '#2563EB'
                : c.status === 'missed'
                  ? '#EF4444'
                  : c.status === 'open'
                    ? '#F59E0B'
                    : 'var(--color-surface2)'
          }}
        />
      ))}
    </div>
  );
}

function formatPastDate(date: string): string {
  const d = new Date(date + 'T00:00:00');
  const today = new Date();
  const yesterday = new Date(today.getFullYear(), today.getMonth(), today.getDate() - 1);
  const ystr = `${yesterday.getFullYear()}-${String(yesterday.getMonth() + 1).padStart(2, '0')}-${String(yesterday.getDate()).padStart(2, '0')}`;
  if (date === ystr) return 'Вчера';
  return d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short', weekday: 'short' });
}

function pl(n: number, one: string, few: string, many: string): string {
  const m10 = n % 10;
  const m100 = n % 100;
  if (m10 === 1 && m100 !== 11) return one;
  if (m10 >= 2 && m10 <= 4 && (m100 < 10 || m100 >= 20)) return few;
  return many;
}
