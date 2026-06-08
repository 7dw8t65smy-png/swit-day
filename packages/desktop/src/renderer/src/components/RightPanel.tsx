import { useEffect, useMemo, useState } from 'react';
import { Bell, Plus, ChevronLeft, ChevronRight } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import {
  addDays,
  addMonths,
  endOfMonth,
  endOfWeek,
  format,
  isSameDay,
  isSameMonth,
  isToday,
  startOfMonth,
  startOfWeek,
  subDays
} from 'date-fns';
import { ru } from 'date-fns/locale';
import type { CalendarEvent, JournalEntry, Project } from '@swit/shared';
import { api } from '../api';
import { fmtHM } from '../lib/format';
import { aggregateJournalByDate, type DayJournalSummary } from '../lib/journalAgg';
import EventDialog from './EventDialog';
import HabitChecklist from './HabitChecklist';
import { useWeekStartsOn } from '../lib/week';

export default function RightPanel() {
  const nav = useNavigate();
  const wso = useWeekStartsOn();
  const [anchor, setAnchor] = useState(new Date());
  const [selected, setSelected] = useState(new Date());
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [journal, setJournal] = useState<JournalEntry[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<CalendarEvent | null>(null);

  useEffect(() => {
    void reload();
    // Не дёргаем сервер вхолостую, когда окно скрыто/свёрнуто.
    const id = window.setInterval(() => {
      if (document.visibilityState === 'visible') void reload();
    }, 60_000);
    return () => window.clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [anchor]);

  async function reload() {
    const from = startOfWeek(startOfMonth(anchor), { weekStartsOn: wso });
    const to = endOfWeek(endOfMonth(anchor), { weekStartsOn: wso });
    const [evs, j, ps] = await Promise.all([
      api.listEvents({ from: format(from, 'yyyy-MM-dd'), to: format(to, 'yyyy-MM-dd') }),
      api.listJournal(),
      api.listProjects()
    ]);
    setEvents(evs);
    setJournal(j);
    setProjects(ps);
  }

  const eventsByDay = useMemo(() => {
    const m = new Map<string, CalendarEvent[]>();
    for (const e of events) {
      const arr = m.get(e.date) ?? [];
      arr.push(e);
      m.set(e.date, arr);
    }
    return m;
  }, [events]);

  const upcoming = useMemo(() => {
    const now = new Date();
    const limit = new Date(now.getTime() + 2 * 60 * 60 * 1000);
    return events
      .filter((e) => {
        if (!e.start_time) return false;
        const dt = new Date(`${e.date}T${e.start_time}:00`);
        return dt >= now && dt <= limit;
      })
      .sort((a, b) => `${a.date}T${a.start_time}`.localeCompare(`${b.date}T${b.start_time}`))[0];
  }, [events]);

  const selectedKey = format(selected, 'yyyy-MM-dd');
  const selectedEvents = (eventsByDay.get(selectedKey) ?? []).sort((a, b) =>
    (a.start_time ?? '99:99').localeCompare(b.start_time ?? '99:99')
  );

  // На одну дату теперь может приходиться несколько записей —
  // сводим их в карту по дате для всех графиков.
  const journalByDate = useMemo(() => aggregateJournalByDate(journal), [journal]);

  // Hide the focus section entirely when there is no work in the last 7 days —
  // an empty chart reads as a bug, not as "ничего ещё не сделано".
  const hasWeeklyFocus = useMemo(() => {
    const cutoff = format(subDays(new Date(), 6), 'yyyy-MM-dd');
    for (const [date, summary] of journalByDate) {
      if (date >= cutoff && summary.total_work_s > 0) return true;
    }
    return false;
  }, [journalByDate]);

  return (
    <div className="p-4">
      {upcoming && (
        <div className="rounded-md bg-accent-light p-3 mb-4 flex items-start gap-2">
          <Bell size={16} className="text-accent mt-0.5 shrink-0" />
          <div className="flex-1 min-w-0">
            <div className="text-xs uppercase text-muted">Скоро</div>
            <div className="text-sm font-medium truncate">{upcoming.title}</div>
            <div className="text-xs text-muted">
              {upcoming.start_time}
              {upcoming.date !== format(new Date(), 'yyyy-MM-dd') &&
                ' · ' + format(new Date(upcoming.date + 'T00:00:00'), 'd LLL', { locale: ru })}
            </div>
          </div>
        </div>
      )}

      <div>
        <div className="text-[11px] uppercase text-muted mb-2">Календарь</div>
        <MiniCalendar
          anchor={anchor}
          selected={selected}
          eventsByDay={eventsByDay}
          weekStartsOn={wso}
          onMonthChange={setAnchor}
          onPickDay={setSelected}
          onDoubleClickDay={(d) => {
            setSelected(d);
            setCreating(true);
          }}
        />
      </div>

      <div className="mt-5">
        <div className="flex items-center justify-between mb-2">
          <div className="min-w-0">
            <div className="text-[11px] uppercase text-muted">План на</div>
            <div className="text-sm font-medium capitalize truncate">
              {isToday(selected)
                ? 'Сегодня · '
                : isSameDay(selected, addDays(new Date(), 1))
                  ? 'Завтра · '
                  : ''}
              {format(selected, 'd LLLL, EEEE', { locale: ru })}
            </div>
          </div>
          <button
            onClick={() => setCreating(true)}
            className="w-8 h-8 rounded-md bg-accent text-white hover:bg-accent-hover flex items-center justify-center shrink-0"
            title="Добавить событие на этот день"
          >
            <Plus size={14} />
          </button>
        </div>
        {selectedEvents.length === 0 ? (
          <button
            onClick={() => setCreating(true)}
            className="w-full text-sm text-muted py-3 border border-dashed border-border rounded-md hover:bg-surface2 hover:text-accent transition"
          >
            + Записать план
          </button>
        ) : (
          <ul className="space-y-1.5">
            {selectedEvents.map((e) => (
              <li
                key={e.id}
                onClick={() => setEditing(e)}
                className="rounded-md p-2 border border-border cursor-pointer hover:bg-surface2 transition"
                style={{ borderLeftWidth: 3, borderLeftColor: e.color ?? '#2563EB' }}
              >
                <div className="text-sm font-medium truncate">{e.title}</div>
                <div className="text-xs text-muted">
                  {e.start_time ?? 'Весь день'}
                  {e.end_time ? `–${e.end_time}` : ''}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      <HabitChecklist variant="compact" />

      {hasWeeklyFocus && (
        <div className="mt-5">
          <div className="text-[11px] uppercase text-muted mb-2">Фокус за неделю</div>
          <MiniBar journalByDate={journalByDate} />
        </div>
      )}

      <EventDialog
        open={creating || editing !== null}
        date={selectedKey}
        event={editing}
        projects={projects}
        onClose={() => {
          setCreating(false);
          setEditing(null);
        }}
        onSave={async (data) => {
          const saved =
            editing && editing.id
              ? await api.updateEvent(editing.id, data)
              : await api.createEvent({
                  title: data.title!,
                  date: data.date ?? selectedKey,
                  start_time: data.start_time ?? undefined,
                  ...data
                });
          await reload();
        }}
        onDelete={
          editing && editing.id
            ? async () => {
                const eid = editing.id;
                await api.deleteEvent(eid);
                await reload();
              }
            : undefined
        }
      />
    </div>
  );
}

function MiniCalendar({
  anchor,
  selected,
  eventsByDay,
  weekStartsOn,
  onMonthChange,
  onPickDay,
  onDoubleClickDay
}: {
  anchor: Date;
  selected: Date;
  eventsByDay: Map<string, CalendarEvent[]>;
  weekStartsOn: 0 | 1;
  onMonthChange: (d: Date) => void;
  onPickDay: (d: Date) => void;
  onDoubleClickDay: (d: Date) => void;
}) {
  const monthStart = startOfMonth(anchor);
  const monthEnd = endOfMonth(anchor);
  const gridStart = startOfWeek(monthStart, { weekStartsOn });
  const gridEnd = endOfWeek(monthEnd, { weekStartsOn });
  const days: Date[] = [];
  let d = gridStart;
  while (d <= gridEnd) {
    days.push(d);
    d = addDays(d, 1);
  }
  const weekdays =
    weekStartsOn === 1
      ? ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс']
      : ['Вс', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб'];

  return (
    <div>
      <div className="flex items-center justify-between mb-1.5">
        <button
          onClick={() => onMonthChange(addMonths(anchor, -1))}
          className="text-faint hover:text-ink p-0.5"
          title="Предыдущий месяц"
        >
          <ChevronLeft size={14} />
        </button>
        <button
          onClick={() => onMonthChange(new Date())}
          className="text-xs font-medium capitalize hover:text-accent transition"
          title="К сегодня"
        >
          {format(anchor, 'LLLL yyyy', { locale: ru })}
        </button>
        <button
          onClick={() => onMonthChange(addMonths(anchor, 1))}
          className="text-faint hover:text-ink p-0.5"
          title="Следующий месяц"
        >
          <ChevronRight size={14} />
        </button>
      </div>
      <div className="grid grid-cols-7 gap-0.5">
        {weekdays.map((w, i) => (
          <div key={i} className="text-[9px] text-faint text-center py-0.5 font-medium">
            {w}
          </div>
        ))}
        {days.map((day) => {
          const outside = !isSameMonth(day, anchor);
          const sel = isSameDay(day, selected);
          const evs = eventsByDay.get(format(day, 'yyyy-MM-dd')) ?? [];
          const hasEvents = evs.length > 0;
          return (
            <button
              key={day.toISOString()}
              onClick={() => onPickDay(day)}
              onDoubleClick={() => onDoubleClickDay(day)}
              title={hasEvents ? `${evs.length} событ.` : 'Двойной клик — добавить'}
              className={`relative h-7 text-xs rounded transition ${
                sel
                  ? 'bg-accent text-white font-semibold shadow-sm'
                  : isToday(day)
                    ? 'ring-1 ring-accent text-ink hover:bg-accent-light'
                    : outside
                      ? 'text-faint hover:bg-surface2'
                      : 'text-ink hover:bg-surface2'
              }`}
            >
              {format(day, 'd')}
              {hasEvents && (
                <span className="absolute bottom-0.5 left-1/2 -translate-x-1/2 flex gap-0.5">
                  {evs.slice(0, 3).map((e) => (
                    <span
                      key={e.id}
                      className="w-1 h-1 rounded-full"
                      style={{
                        background: sel ? 'white' : (e.color ?? 'var(--color-accent)')
                      }}
                    />
                  ))}
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function MiniBar({
  journalByDate
}: {
  journalByDate: Map<string, DayJournalSummary>;
}): JSX.Element | null {
  const days = Array.from({ length: 7 }, (_, i) => {
    const d = subDays(new Date(), 6 - i);
    const date = format(d, 'yyyy-MM-dd');
    const entry = journalByDate.get(date);
    return {
      date,
      label: format(d, 'EEEEEE', { locale: ru }),
      work_s: entry?.total_work_s ?? 0,
      today: isToday(d)
    };
  });
  const totalWork = days.reduce((s, d) => s + d.work_s, 0);
  if (totalWork === 0) return null;
  const max = Math.max(...days.map((d) => d.work_s), 1);

  return (
    <div className="flex items-end gap-1 h-14 bg-surface2 rounded-md p-2">
      {days.map((d) => (
        <div
          key={d.date}
          className="flex-1 flex flex-col items-center justify-end h-full"
          title={`${d.label}: ${fmtHM(d.work_s)}`}
        >
          <div className="text-[9px] text-muted timer-font mb-0.5">
            {d.work_s > 0 ? fmtHM(d.work_s) : ''}
          </div>
          <div
            className="w-full rounded-t transition-all"
            style={{
              height: `${(d.work_s / max) * 100}%`,
              minHeight: d.work_s > 0 ? 3 : 0,
              background: d.today ? 'var(--color-accent)' : 'var(--color-work)'
            }}
          />
          <div
            className={`text-[10px] mt-0.5 ${d.today ? 'text-accent font-semibold' : 'text-faint'}`}
          >
            {d.label}
          </div>
        </div>
      ))}
    </div>
  );
}
