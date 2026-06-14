import { useEffect, useMemo, useState } from 'react';
import { Plus, Bell, Calendar as CalendarIcon, Flame, Trash2, Clock, ChevronDown } from 'lucide-react';
import { addDays, addMinutes, format, isSameDay, parseISO, startOfDay, subDays } from 'date-fns';
import { ru } from 'date-fns/locale';
import { api } from '../api';
import type { CalendarEvent, Habit, HabitLog, Reminder } from '@swit/shared';
import { buildLogMap, cadenceLabel, isHabitDueOn } from '../lib/habits';
import { useRealtimeRefetch } from '../hooks/useRealtimeRefetch';

// Reminders page — single home for everything that will ping the user.
//
// Sources:
//   1. Standalone reminders (CRUD via /reminders) — "позвонить маме в 15:00".
//   2. Routines with remind_time — derived from habits where isHabitDueOn(date).
//   3. Calendar events with reminder_min set — fire_at = event start - reminder_min.
//
// History block shows standalone reminders fired in the last 7 days.

type Source = 'standalone' | 'routine' | 'event';

interface UpcomingItem {
  key: string; // unique id for React
  source: Source;
  fireAt: Date;
  title: string;
  hint: string; // sublabel
  color: string;
  // actions available only for standalone
  reminderId?: string;
}

const LOOKAHEAD_DAYS = 30;

export default function Reminders(): JSX.Element {
  const [reminders, setReminders] = useState<Reminder[]>([]);
  const [habits, setHabits] = useState<Habit[]>([]);
  const [logs, setLogs] = useState<HabitLog[]>([]);
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [historyOpen, setHistoryOpen] = useState(false);

  useEffect(() => {
    void reload();
  }, []);
  useRealtimeRefetch(() => void reload());

  async function reload(): Promise<void> {
    const today = new Date();
    const fromDate = format(subDays(today, 7), 'yyyy-MM-dd');
    const toDate = format(addDays(today, LOOKAHEAD_DAYS), 'yyyy-MM-dd');
    const [rs, hs, ls, evs] = await Promise.all([
      api.listReminders(),
      api.listHabits(),
      api.listHabitLogs({ from: format(subDays(today, 14), 'yyyy-MM-dd') }),
      api.listEvents({ from: fromDate, to: toDate })
    ]);
    setReminders(rs);
    setHabits(hs);
    setLogs(ls);
    setEvents(evs);
  }

  const logMap = useMemo(() => buildLogMap(logs), [logs]);

  // Compose upcoming items from all 3 sources
  const upcoming: UpcomingItem[] = useMemo(() => {
    const now = new Date();
    const items: UpcomingItem[] = [];

    // 1) Standalone reminders
    for (const r of reminders) {
      if (r.event_id) continue;
      if (r.fired) continue;
      const at = r.snoozed_to ? parseISO(r.snoozed_to) : parseISO(r.datetime);
      if (at < now) continue;
      items.push({
        key: `r:${r.id}`,
        source: 'standalone',
        fireAt: at,
        title: r.title,
        hint: r.snoozed_to ? 'Отложено' : 'Напоминание',
        color: 'var(--color-accent)',
        reminderId: r.id
      });
    }

    // 2) Routines with remind_time — show next occurrence per habit within window
    for (const h of habits) {
      if (h.archived || !h.remind_time) continue;
      const inner = logMap.get(h.id);
      // Look up to LOOKAHEAD_DAYS days for the next due day
      for (let i = 0; i < LOOKAHEAD_DAYS; i++) {
        const d = addDays(startOfDay(now), i);
        if (!isHabitDueOn(h, d, inner)) continue;
        const [hh, mm] = h.remind_time.split(':').map(Number);
        const at = new Date(d.getFullYear(), d.getMonth(), d.getDate(), hh, mm);
        if (at < now) continue;
        // Skip if already done that day
        const dateKey = format(d, 'yyyy-MM-dd');
        const cnt = inner?.get(dateKey) ?? 0;
        if (cnt >= (h.target_count || 1) && isSameDay(d, now)) continue;
        items.push({
          key: `h:${h.id}:${dateKey}`,
          source: 'routine',
          fireAt: at,
          title: `${h.icon ?? '🔁'} ${h.title}`,
          hint: `Рутина · ${cadenceLabel(h)}`,
          color: h.color ?? 'var(--color-accent)'
        });
        break; // только ближайшее срабатывание
      }
    }

    // 3) Events with reminder_min
    for (const e of events) {
      if (e.reminder_min == null) continue;
      if (!e.start_time) continue;
      const start = parseISO(`${e.date}T${e.start_time}:00`);
      const at = addMinutes(start, -e.reminder_min);
      if (at < now) continue;
      items.push({
        key: `e:${e.id}`,
        source: 'event',
        fireAt: at,
        title: e.title,
        hint: `Событие в ${format(start, 'HH:mm')} · за ${e.reminder_min} мин`,
        color: e.color ?? '#2563EB'
      });
    }

    items.sort((a, b) => a.fireAt.getTime() - b.fireAt.getTime());
    return items;
  }, [reminders, habits, logMap, events]);

  // Group upcoming by time bucket
  const groups = useMemo(() => {
    const now = new Date();
    const today0 = startOfDay(now);
    const tomorrow0 = addDays(today0, 1);
    const sunday0 = addDays(today0, 7);
    const result: { today: UpcomingItem[]; tomorrow: UpcomingItem[]; week: UpcomingItem[]; later: UpcomingItem[] } = {
      today: [],
      tomorrow: [],
      week: [],
      later: []
    };
    for (const it of upcoming) {
      if (it.fireAt < tomorrow0) result.today.push(it);
      else if (it.fireAt < addDays(tomorrow0, 1)) result.tomorrow.push(it);
      else if (it.fireAt < sunday0) result.week.push(it);
      else result.later.push(it);
    }
    return result;
  }, [upcoming]);

  // History — standalone reminders fired in the last 7 days
  const history = useMemo(() => {
    const cutoff = subDays(new Date(), 7);
    return reminders
      .filter((r) => !r.event_id && r.fired === 1 && parseISO(r.datetime) >= cutoff)
      .sort((a, b) => b.datetime.localeCompare(a.datetime));
  }, [reminders]);

  async function deleteReminder(id: string): Promise<void> {
    await api.deleteReminder(id);
    await reload();
  }

  return (
    <div className="p-6 max-w-[900px] space-y-5">
      <div className="flex items-center gap-3">
        <div className="flex-1 min-w-0">
          <h1 className="text-2xl font-semibold">Напоминания</h1>
          <div className="text-sm text-muted mt-0.5">
            Всё, что должно тебе прилететь пушем
          </div>
        </div>
        <div className="text-sm text-muted">
          Предстоящих · <span className="font-semibold text-ink">{upcoming.length}</span>
        </div>
      </div>

      <QuickAdd onCreated={reload} />

      {upcoming.length === 0 ? (
        <EmptyUpcoming />
      ) : (
        <>
          <Group title="Сегодня" items={groups.today} onDelete={deleteReminder} accent />
          <Group title="Завтра" items={groups.tomorrow} onDelete={deleteReminder} />
          <Group title="На этой неделе" items={groups.week} onDelete={deleteReminder} />
          <Group title="Позже" items={groups.later} onDelete={deleteReminder} muted />
        </>
      )}

      {history.length > 0 && (
        <section>
          <button
            type="button"
            onClick={() => setHistoryOpen((v) => !v)}
            className="w-full flex items-center gap-2 text-xs uppercase tracking-wide text-muted hover:text-ink transition"
          >
            <ChevronDown
              size={14}
              className={`transition-transform ${historyOpen ? 'rotate-0' : '-rotate-90'}`}
            />
            История · {history.length} за последние 7 дней
          </button>
          {historyOpen && (
            <ul className="mt-3 space-y-1.5">
              {history.map((r) => (
                <li
                  key={r.id}
                  className="flex items-center gap-3 px-3 py-2 rounded-md bg-surface border border-border opacity-70"
                >
                  <Clock size={14} className="text-faint shrink-0" />
                  <span className="text-sm flex-1 truncate text-muted line-through">
                    {r.title}
                  </span>
                  <span className="text-[11px] text-faint">
                    {format(parseISO(r.datetime), 'd LLL HH:mm', { locale: ru })}
                  </span>
                  <button
                    onClick={() => deleteReminder(r.id)}
                    className="text-faint hover:text-red-500 transition"
                    title="Удалить из истории"
                  >
                    <Trash2 size={13} />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}
    </div>
  );
}

// --- Quick add row ---
// One-line input that parses "позвонить маме завтра в 15:00" — for now a simpler
// "text + datetime picker" combo. Natural-language parser can come later.

function QuickAdd({ onCreated }: { onCreated: () => Promise<void> }): JSX.Element {
  const [title, setTitle] = useState('');
  const [dt, setDt] = useState(() => {
    // default: in 1 hour, rounded to next 15-min slot
    const d = new Date();
    d.setMinutes(d.getMinutes() + 60);
    d.setSeconds(0, 0);
    const m = d.getMinutes();
    d.setMinutes(Math.ceil(m / 15) * 15);
    return format(d, "yyyy-MM-dd'T'HH:mm");
  });
  const canAdd = title.trim().length > 0 && dt.length > 0;

  async function add(): Promise<void> {
    if (!canAdd) return;
    const created = await api.createReminder({ title: title.trim(), datetime: dt + ':00' });
    setTitle('');
    await onCreated();
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        void add();
      }}
      className="bg-surface rounded-lg shadow-sm border border-border p-2 flex items-center gap-2"
    >
      <Bell size={16} className="text-accent ml-2 shrink-0" />
      <input
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="Напомнить о…"
        autoComplete="off"
        className="flex-1 min-w-0 h-9 px-2 bg-transparent text-sm focus:outline-none"
      />
      <input
        type="datetime-local"
        value={dt}
        onChange={(e) => setDt(e.target.value)}
        className="h-9 px-2 rounded-md border border-border bg-surface text-xs"
      />
      <button
        type="submit"
        disabled={!canAdd}
        title="Добавить (Enter)"
        className={`h-9 px-3 rounded-md text-sm flex items-center gap-1 transition shrink-0 ${
          canAdd
            ? 'bg-accent text-white hover:bg-accent-hover shadow-sm'
            : 'bg-surface text-faint border border-border cursor-not-allowed'
        }`}
      >
        <Plus size={14} /> Напомнить
      </button>
    </form>
  );
}

function EmptyUpcoming(): JSX.Element {
  return (
    <div className="bg-surface rounded-lg shadow-sm p-12 text-center">
      <div className="text-4xl mb-3 opacity-40">🔔</div>
      <div className="text-sm text-muted max-w-md mx-auto">
        Здесь будут все предстоящие пуши: разовые напоминания, рутины с заданным временем,
        события календаря с настроенным напоминанием. Создай первое — строкой выше.
      </div>
    </div>
  );
}

// --- Group of upcoming items ---

function Group({
  title,
  items,
  onDelete,
  accent,
  muted
}: {
  title: string;
  items: UpcomingItem[];
  onDelete: (id: string) => Promise<void>;
  accent?: boolean;
  muted?: boolean;
}): JSX.Element | null {
  if (items.length === 0) return null;
  return (
    <section>
      <div className={`mb-2 flex items-baseline gap-2 ${muted ? 'opacity-70' : ''}`}>
        <span
          className={`text-xs uppercase tracking-wide ${
            accent ? 'text-accent font-semibold' : 'text-muted'
          }`}
        >
          {title}
        </span>
        <span className="text-[11px] text-faint">· {items.length}</span>
      </div>
      <ul className="space-y-1.5">
        {items.map((it) => (
          <ReminderRow key={it.key} item={it} onDelete={onDelete} />
        ))}
      </ul>
    </section>
  );
}

function ReminderRow({
  item,
  onDelete
}: {
  item: UpcomingItem;
  onDelete: (id: string) => Promise<void>;
}): JSX.Element {
  const Icon =
    item.source === 'standalone' ? Bell : item.source === 'routine' ? Flame : CalendarIcon;

  return (
    <li
      className="flex items-center gap-3 bg-surface rounded-md shadow-sm border border-border hover:border-accent/40 transition"
      style={{ borderLeftWidth: 3, borderLeftColor: item.color }}
    >
      <div className="ml-3 w-7 h-7 rounded-md shrink-0 flex items-center justify-center bg-surface2">
        <Icon size={14} style={{ color: item.color }} />
      </div>
      <div className="flex-1 min-w-0 py-2.5">
        <div className="text-sm font-medium truncate">{item.title}</div>
        <div className="text-[11px] text-muted truncate">{item.hint}</div>
      </div>
      <div className="px-3 text-right shrink-0">
        <div className="text-sm font-medium timer-font">{format(item.fireAt, 'HH:mm')}</div>
        <div className="text-[10px] text-faint">
          {format(item.fireAt, 'd LLL', { locale: ru })}
        </div>
      </div>
      {item.reminderId && (
        <button
          onClick={() => onDelete(item.reminderId!)}
          className="mr-3 text-faint hover:text-red-500 transition opacity-0 group-hover:opacity-100"
          title="Удалить напоминание"
        >
          <Trash2 size={14} />
        </button>
      )}
    </li>
  );
}
