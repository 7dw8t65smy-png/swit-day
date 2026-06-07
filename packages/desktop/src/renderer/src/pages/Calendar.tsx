import { useEffect, useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight, Plus, GripVertical, X } from 'lucide-react';
import {
  addMonths,
  addWeeks,
  addDays,
  endOfMonth,
  endOfWeek,
  format,
  isSameDay,
  isSameMonth,
  isToday,
  startOfMonth,
  startOfWeek
} from 'date-fns';
import { ru } from 'date-fns/locale';
import { api } from '../api';
import type { CalendarEvent, Project, Task } from '@swit/shared';
import EventDialog from '../components/EventDialog';
import TaskDrawer from '../components/TaskDrawer';
import { sortByPriority } from '../lib/priority';
import { PRIORITY_COLOR } from '../lib/priority';

type View = 'month' | 'week' | 'day';

interface QuickCreate {
  date: string;
  startTime?: string;
}

export default function Calendar() {
  const [view, setView] = useState<View>('week');
  const [anchor, setAnchor] = useState<Date>(new Date());
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
  const [editing, setEditing] = useState<CalendarEvent | null>(null);
  const [quickCreate, setQuickCreate] = useState<QuickCreate | null>(null);
  const [drawerTaskId, setDrawerTaskId] = useState<string | null>(null);

  useEffect(() => {
    void reload();
  }, [anchor, view]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.tagName === 'INPUT' || (e.target as HTMLElement)?.tagName === 'TEXTAREA') return;
      if (e.key === 'ArrowLeft') shift(-1);
      else if (e.key === 'ArrowRight') shift(1);
      else if (e.key === 't' || e.key === 'T') setAnchor(new Date());
      else if (e.key === 'n' || e.key === 'N') {
        setQuickCreate({ date: format(selectedDate, 'yyyy-MM-dd') });
      } else if (e.key === '1') setView('month');
      else if (e.key === '2') setView('week');
      else if (e.key === '3') setView('day');
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view, anchor, selectedDate]);

  async function reload() {
    let from: Date, to: Date;
    if (view === 'month') {
      from = startOfWeek(startOfMonth(anchor), { weekStartsOn: 1 });
      to = endOfWeek(endOfMonth(anchor), { weekStartsOn: 1 });
    } else if (view === 'week') {
      from = startOfWeek(anchor, { weekStartsOn: 1 });
      to = endOfWeek(anchor, { weekStartsOn: 1 });
    } else {
      from = anchor;
      to = anchor;
    }
    const [evs, ps, ts] = await Promise.all([
      api.listEvents({ from: format(from, 'yyyy-MM-dd'), to: format(to, 'yyyy-MM-dd') }),
      api.listProjects(),
      api.listTasks()
    ]);
    setEvents(evs);
    setProjects(ps);
    setTasks(ts);
  }

  async function scheduleTask(taskId: string, date: string, startTime: string) {
    const updated = await api.updateTask(taskId, { due_date: date, due_time: startTime });
    void syncTaskDeadline(updated);
    await reload();
  }

  async function unscheduleTask(taskId: string) {
    const updated = await api.updateTask(taskId, { due_time: null });
    void syncTaskDeadline(updated);
    await reload();
  }

  const tasksByDay = useMemo(() => {
    const m = new Map<string, Task[]>();
    for (const t of tasks) {
      if (!t.due_date || !t.due_time) continue;
      if (t.status === 'done') continue;
      const arr = m.get(t.due_date) ?? [];
      arr.push(t);
      m.set(t.due_date, arr);
    }
    return m;
  }, [tasks]);

  const unscheduledTasks = useMemo(
    () =>
      sortByPriority(
        tasks.filter(
          (t) => !t.due_time && !t.parent_task_id && t.status !== 'done' && t.status !== 'cancelled'
        )
      ),
    [tasks]
  );

  function shift(dir: 1 | -1) {
    if (view === 'month') setAnchor(addMonths(anchor, dir));
    else if (view === 'week') setAnchor(addWeeks(anchor, dir));
    else setAnchor(addDays(anchor, dir));
  }

  const eventsByDay = useMemo(() => {
    const m = new Map<string, CalendarEvent[]>();
    for (const e of events) {
      const arr = m.get(e.date) ?? [];
      arr.push(e);
      m.set(e.date, arr);
    }
    for (const arr of m.values()) {
      arr.sort((a, b) => (a.start_time ?? '99:99').localeCompare(b.start_time ?? '99:99'));
    }
    return m;
  }, [events]);

  const dayEvents = eventsByDay.get(format(selectedDate, 'yyyy-MM-dd')) ?? [];

  return (
    <div className="p-6 grid grid-cols-[1fr_300px] gap-5 max-w-[1500px]">
      <div>
        <div className="flex items-center gap-2 mb-4">
          <button
            onClick={() => shift(-1)}
            className="w-8 h-8 rounded-md border border-border hover:bg-surface2 flex items-center justify-center"
            title="←"
          >
            <ChevronLeft size={16} />
          </button>
          <button
            onClick={() => setAnchor(new Date())}
            className="px-3 h-8 rounded-md border border-border hover:bg-surface2 text-sm"
            title="T"
          >
            Сегодня
          </button>
          <button
            onClick={() => shift(1)}
            className="w-8 h-8 rounded-md border border-border hover:bg-surface2 flex items-center justify-center"
            title="→"
          >
            <ChevronRight size={16} />
          </button>
          <div className="text-lg font-semibold text-ink ml-2 capitalize">
            {view === 'month' && format(anchor, 'LLLL yyyy', { locale: ru })}
            {view === 'week' &&
              `${format(startOfWeek(anchor, { weekStartsOn: 1 }), 'd LLL', { locale: ru })} – ${format(
                endOfWeek(anchor, { weekStartsOn: 1 }),
                'd LLL yyyy',
                { locale: ru }
              )}`}
            {view === 'day' && format(anchor, 'd LLLL yyyy, EEEE', { locale: ru })}
          </div>
          <div className="ml-auto flex gap-1 bg-surface2 rounded-md p-1">
            {(['month', 'week', 'day'] as View[]).map((v, i) => (
              <button
                key={v}
                onClick={() => setView(v)}
                title={String(i + 1)}
                className={`px-3 py-1 rounded text-sm ${
                  view === v ? 'bg-surface shadow-sm' : 'text-muted'
                }`}
              >
                {v === 'month' ? 'Месяц' : v === 'week' ? 'Неделя' : 'День'}
              </button>
            ))}
          </div>
          <button
            onClick={() => setQuickCreate({ date: format(selectedDate, 'yyyy-MM-dd') })}
            className="bg-accent text-white px-3 h-8 rounded-md text-sm hover:bg-accent-hover flex items-center gap-1.5"
            title="N"
          >
            <Plus size={14} /> Новое
          </button>
        </div>

        {view === 'month' && (
          <MonthGrid
            anchor={anchor}
            selectedDate={selectedDate}
            eventsByDay={eventsByDay}
            onPickDay={(d) => setSelectedDate(d)}
            onQuickAdd={(d) => setQuickCreate({ date: format(d, 'yyyy-MM-dd') })}
          />
        )}
        {view === 'week' && (
          <WeekGrid
            anchor={anchor}
            events={events}
            tasksByDay={tasksByDay}
            onClickEvent={(e) => setEditing(e)}
            onClickTask={setDrawerTaskId}
            onPickDay={(d) => {
              setSelectedDate(d);
              setView('day');
            }}
            onCellClick={(date, hour) => {
              const hh = String(hour).padStart(2, '0');
              setQuickCreate({ date: format(date, 'yyyy-MM-dd'), startTime: `${hh}:00` });
            }}
            onDropTask={async (taskId, date, hour) => {
              const hh = String(hour).padStart(2, '0');
              await scheduleTask(taskId, format(date, 'yyyy-MM-dd'), `${hh}:00`);
            }}
          />
        )}
        {view === 'day' && (
          <DayGrid
            date={anchor}
            events={eventsByDay.get(format(anchor, 'yyyy-MM-dd')) ?? []}
            tasks={tasksByDay.get(format(anchor, 'yyyy-MM-dd')) ?? []}
            onClickEvent={(e) => setEditing(e)}
            onClickTask={setDrawerTaskId}
            onHourClick={(hour) => {
              const hh = String(hour).padStart(2, '0');
              setQuickCreate({ date: format(anchor, 'yyyy-MM-dd'), startTime: `${hh}:00` });
            }}
            onDropTask={async (taskId, hour) => {
              const hh = String(hour).padStart(2, '0');
              await scheduleTask(taskId, format(anchor, 'yyyy-MM-dd'), `${hh}:00`);
            }}
          />
        )}

        <div className="text-xs text-muted mt-3">
          ← / → — навигация · T — сегодня · N — новое событие · 1/2/3 — вид
        </div>
      </div>

      <aside className="space-y-4 h-fit sticky top-4">
        <div className="bg-surface rounded-lg shadow-sm p-4">
          <div className="flex items-center justify-between mb-3">
            <div className="text-xs uppercase text-muted flex items-center gap-1.5">
              <GripVertical size={12} /> Без расписания
            </div>
            <span className="text-xs text-muted bg-surface2 rounded-full px-2 py-0.5">
              {unscheduledTasks.length}
            </span>
          </div>
          {unscheduledTasks.length === 0 ? (
            <div className="text-xs text-faint text-center py-3">
              Все задачи запланированы 🎉
            </div>
          ) : (
            <ul className="space-y-1 max-h-[280px] overflow-y-auto">
              {unscheduledTasks.map((t) => (
                <li
                  key={t.id}
                  draggable
                  onDragStart={(e) => e.dataTransfer.setData('text/task-id', t.id)}
                  onClick={() => setDrawerTaskId(t.id)}
                  className="px-2 py-1.5 rounded-md text-sm cursor-grab active:cursor-grabbing hover:bg-surface2 flex items-center gap-2 group"
                  style={{ borderLeft: `3px solid ${PRIORITY_COLOR[t.priority]}` }}
                >
                  <span className="flex-1 truncate">{t.title}</span>
                  {t.due_date && (
                    <span className="text-[10px] text-muted">📅 {t.due_date.slice(5)}</span>
                  )}
                </li>
              ))}
            </ul>
          )}
          <div className="text-[10px] text-faint mt-2">
            Перетащи задачу на час в календаре чтобы запланировать
          </div>
        </div>

      <div className="bg-surface rounded-lg shadow-sm p-4">
        <div className="flex items-center justify-between mb-3">
          <div>
            <div className="text-xs uppercase text-muted">План на</div>
            <div className="font-medium text-sm">
              {format(selectedDate, 'd LLLL, EEEE', { locale: ru })}
            </div>
          </div>
          <button
            onClick={() => setQuickCreate({ date: format(selectedDate, 'yyyy-MM-dd') })}
            className="w-8 h-8 rounded-md bg-accent text-white hover:bg-accent-hover flex items-center justify-center"
          >
            <Plus size={14} />
          </button>
        </div>
        {dayEvents.length === 0 ? (
          <div className="text-sm text-muted py-4 text-center">Нет событий</div>
        ) : (
          <ul className="space-y-2">
            {dayEvents.map((e) => (
              <li
                key={e.id}
                onClick={() => setEditing(e)}
                className="rounded-md p-3 border border-border cursor-pointer hover:bg-surface2 transition"
                style={{ borderLeftWidth: 3, borderLeftColor: e.color ?? '#2563EB' }}
              >
                <div className="text-sm font-medium">{e.title}</div>
                <div className="text-xs text-muted mt-0.5">
                  {e.start_time ? `${e.start_time}${e.end_time ? '–' + e.end_time : ''}` : 'Весь день'}
                  {e.type !== 'event' && ` · ${e.type}`}
                </div>
                {e.description && (
                  <div className="text-xs text-faint mt-1 line-clamp-2">{e.description}</div>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
      </aside>

      <TaskDrawer
        task={drawerTaskId ? tasks.find((x) => x.id === drawerTaskId) ?? null : null}
        projects={projects}
        onClose={() => setDrawerTaskId(null)}
        onOpenTask={setDrawerTaskId}
        onChanged={reload}
      />

      <EventDialog
        open={quickCreate !== null || editing !== null}
        date={quickCreate?.date ?? format(selectedDate, 'yyyy-MM-dd')}
        event={
          editing ??
          (quickCreate?.startTime
            ? ({
                id: '',
                title: '',
                date: quickCreate.date,
                start_time: quickCreate.startTime,
                end_time: null,
                description: null,
                project_id: null,
                task_id: null,
                reminder_min: null,
                color: null,
                type: 'event',
                created_at: '',
                updated_at: ''
              } as CalendarEvent)
            : null)
        }
        projects={projects}
        onClose={() => {
          setQuickCreate(null);
          setEditing(null);
        }}
        onSave={async (data) => {
          const saved = editing && editing.id
            ? await api.updateEvent(editing.id, data)
            : await api.createEvent({
                title: data.title!,
                date: data.date!,
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

function MonthGrid({
  anchor,
  selectedDate,
  eventsByDay,
  onPickDay,
  onQuickAdd
}: {
  anchor: Date;
  selectedDate: Date;
  eventsByDay: Map<string, CalendarEvent[]>;
  onPickDay: (d: Date) => void;
  onQuickAdd: (d: Date) => void;
}) {
  const monthStart = startOfMonth(anchor);
  const monthEnd = endOfMonth(anchor);
  const gridStart = startOfWeek(monthStart, { weekStartsOn: 1 });
  const gridEnd = endOfWeek(monthEnd, { weekStartsOn: 1 });

  const days: Date[] = [];
  let d = gridStart;
  while (d <= gridEnd) {
    days.push(d);
    d = addDays(d, 1);
  }

  const weekdays = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];

  return (
    <div className="bg-surface rounded-lg shadow-sm overflow-hidden">
      <div className="grid grid-cols-7 border-b border-border">
        {weekdays.map((w) => (
          <div key={w} className="px-2 py-2 text-xs uppercase text-muted text-center">
            {w}
          </div>
        ))}
      </div>
      <div className="grid grid-cols-7 grid-rows-6">
        {days.map((day) => {
          const evs = eventsByDay.get(format(day, 'yyyy-MM-dd')) ?? [];
          const outside = !isSameMonth(day, anchor);
          const selected = isSameDay(day, selectedDate);
          return (
            <div
              key={day.toISOString()}
              onClick={() => onPickDay(day)}
              onDoubleClick={() => onQuickAdd(day)}
              className={`group min-h-[100px] text-left p-2 border-b border-r border-border last:border-r-0 hover:bg-surface2 transition cursor-pointer relative ${
                outside ? 'bg-surface2/40' : ''
              } ${selected ? 'bg-accent-light' : ''}`}
            >
              <div className="flex items-center justify-between">
                <div
                  className={`text-sm font-medium inline-flex items-center justify-center w-7 h-7 rounded-full ${
                    isToday(day) ? 'bg-accent text-white' : outside ? 'text-faint' : 'text-ink'
                  }`}
                >
                  {format(day, 'd')}
                </div>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onQuickAdd(day);
                  }}
                  className="text-faint hover:text-accent opacity-0 group-hover:opacity-100 transition"
                  title="Добавить событие"
                >
                  <Plus size={14} />
                </button>
              </div>
              <div className="space-y-1 mt-1">
                {evs.slice(0, 3).map((e) => (
                  <div
                    key={e.id}
                    className="text-[11px] truncate rounded px-1.5 py-0.5"
                    style={{
                      background: (e.color ?? '#2563EB') + '20',
                      color: e.color ?? '#2563EB'
                    }}
                  >
                    {e.start_time ? e.start_time + ' ' : ''}
                    {e.title}
                  </div>
                ))}
                {evs.length > 3 && (
                  <div className="text-[10px] text-muted">+{evs.length - 3}</div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function WeekGrid({
  anchor,
  events,
  tasksByDay,
  onClickEvent,
  onClickTask,
  onPickDay,
  onCellClick,
  onDropTask
}: {
  anchor: Date;
  events: CalendarEvent[];
  tasksByDay: Map<string, Task[]>;
  onClickEvent: (e: CalendarEvent) => void;
  onClickTask: (id: string) => void;
  onPickDay: (d: Date) => void;
  onCellClick: (date: Date, hour: number) => void;
  onDropTask: (taskId: string, date: Date, hour: number) => Promise<void>;
}) {
  const start = startOfWeek(anchor, { weekStartsOn: 1 });
  const days: Date[] = [];
  for (let i = 0; i < 7; i++) days.push(addDays(start, i));
  const hours = Array.from({ length: 24 }, (_, i) => i);

  return (
    <div className="bg-surface rounded-lg shadow-sm overflow-hidden">
      <div className="grid grid-cols-[60px_repeat(7,1fr)] border-b border-border bg-surface sticky top-0 z-10">
        <div />
        {days.map((d) => {
          const today = isToday(d);
          return (
            <button
              key={d.toISOString()}
              onClick={() => onPickDay(d)}
              className={`px-2 py-2 text-center hover:bg-surface2 ${today ? 'bg-accent-light' : ''}`}
            >
              <div className="text-xs uppercase text-muted">{format(d, 'EEE', { locale: ru })}</div>
              <div
                className={`text-base font-medium inline-flex items-center justify-center w-7 h-7 rounded-full mt-0.5 ${
                  today ? 'bg-accent text-white' : ''
                }`}
              >
                {format(d, 'd')}
              </div>
            </button>
          );
        })}
      </div>
      <div className="max-h-[640px] overflow-y-auto">
        {hours.map((h) => (
          <div key={h} className="grid grid-cols-[60px_repeat(7,1fr)] relative">
            <div className="text-[10px] text-faint pr-2 text-right pt-0.5 h-12 border-b border-border">
              {String(h).padStart(2, '0')}:00
            </div>
            {days.map((d) => {
              const evs = events.filter((e) => {
                if (e.date !== format(d, 'yyyy-MM-dd')) return false;
                if (!e.start_time) return false;
                return Number(e.start_time.slice(0, 2)) === h;
              });
              const dayKey = format(d, 'yyyy-MM-dd');
              const dayTasks = (tasksByDay.get(dayKey) ?? []).filter(
                (t) => Number((t.due_time ?? '00:00').slice(0, 2)) === h
              );
              return (
                <div
                  key={`${d.toISOString()}-${h}`}
                  onClick={() => onCellClick(d, h)}
                  onDragOver={(ev) => ev.preventDefault()}
                  onDrop={async (ev) => {
                    ev.preventDefault();
                    const id = ev.dataTransfer.getData('text/task-id');
                    if (id) await onDropTask(id, d, h);
                  }}
                  className="h-12 border-b border-r border-border last:border-r-0 relative hover:bg-accent-light/30 cursor-pointer"
                >
                  {dayTasks.map((t) => {
                    const startMin = Number((t.due_time ?? '00:00').slice(3, 5));
                    const heightPx = Math.max(20, (t.estimated_min ?? 30) * 0.8);
                    return (
                      <div
                        key={t.id}
                        onClick={(ev) => {
                          ev.stopPropagation();
                          onClickTask(t.id);
                        }}
                        className="absolute left-0.5 right-0.5 rounded text-[11px] px-1.5 py-0.5 cursor-pointer overflow-hidden hover:shadow-md transition z-10"
                        style={{
                          top: `${(startMin / 60) * 48}px`,
                          height: `${heightPx}px`,
                          background: 'var(--color-surface)',
                          borderLeft: `2px solid ${PRIORITY_COLOR[t.priority]}`,
                          color: 'var(--color-text)',
                          border: '1px solid var(--color-border)',
                          borderLeftWidth: 3,
                          borderLeftColor: PRIORITY_COLOR[t.priority]
                        }}
                      >
                        <span className="opacity-50 mr-1">☑</span>
                        {t.title}
                      </div>
                    );
                  })}
                  {evs.map((e) => {
                    const startMin = Number((e.start_time ?? '00:00').slice(3, 5));
                    const endTotal = e.end_time
                      ? Number(e.end_time.slice(0, 2)) * 60 + Number(e.end_time.slice(3, 5))
                      : Number((e.start_time ?? '00:00').slice(0, 2)) * 60 + startMin + 60;
                    const startTotal = h * 60 + startMin;
                    const heightPx = Math.max(20, ((endTotal - startTotal) / 60) * 48);
                    return (
                      <div
                        key={e.id}
                        onClick={(ev) => {
                          ev.stopPropagation();
                          onClickEvent(e);
                        }}
                        className="absolute left-0.5 right-0.5 rounded text-[11px] px-1.5 py-0.5 cursor-pointer overflow-hidden hover:shadow-md transition z-10"
                        style={{
                          top: `${(startMin / 60) * 48}px`,
                          height: `${heightPx}px`,
                          background: (e.color ?? '#2563EB') + '30',
                          color: e.color ?? '#2563EB',
                          borderLeft: `2px solid ${e.color ?? '#2563EB'}`
                        }}
                      >
                        <div className="font-medium truncate">{e.title}</div>
                        {heightPx > 28 && (
                          <div className="text-[10px] opacity-70 truncate">
                            {e.start_time}
                            {e.end_time ? `–${e.end_time}` : ''}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}

function DayGrid({
  date,
  events,
  tasks,
  onClickEvent,
  onClickTask,
  onHourClick,
  onDropTask
}: {
  date: Date;
  events: CalendarEvent[];
  tasks: Task[];
  onClickEvent: (e: CalendarEvent) => void;
  onClickTask: (id: string) => void;
  onHourClick: (hour: number) => void;
  onDropTask: (taskId: string, hour: number) => Promise<void>;
}) {
  const hours = Array.from({ length: 24 }, (_, i) => i);
  const allDay = events.filter((e) => !e.start_time);
  const timed = events.filter((e) => e.start_time);

  return (
    <div className="bg-surface rounded-lg shadow-sm overflow-hidden">
      {allDay.length > 0 && (
        <div className="p-4 border-b border-border">
          <div className="text-xs uppercase text-muted mb-2">Весь день</div>
          <div className="space-y-1">
            {allDay.map((e) => (
              <div
                key={e.id}
                onClick={() => onClickEvent(e)}
                className="rounded px-2 py-1 text-sm cursor-pointer"
                style={{ background: (e.color ?? '#2563EB') + '20', color: e.color ?? '#2563EB' }}
              >
                {e.title}
              </div>
            ))}
          </div>
        </div>
      )}
      <div className="max-h-[640px] overflow-y-auto">
        {hours.map((h) => (
          <div key={h} className="grid grid-cols-[60px_1fr] border-b border-border">
            <div className="text-[10px] text-faint pr-2 text-right pt-1 h-14">
              {String(h).padStart(2, '0')}:00
            </div>
            <div
              onClick={() => onHourClick(h)}
              onDragOver={(e) => e.preventDefault()}
              onDrop={async (e) => {
                e.preventDefault();
                const id = e.dataTransfer.getData('text/task-id');
                if (id) await onDropTask(id, h);
              }}
              className="h-14 relative cursor-pointer hover:bg-accent-light/30"
            >
              {tasks
                .filter((t) => Number((t.due_time ?? '00:00').slice(0, 2)) === h)
                .map((t) => {
                  const startMin = Number((t.due_time ?? '00:00').slice(3, 5));
                  const heightPx = Math.max(28, (t.estimated_min ?? 30) * 0.95);
                  return (
                    <div
                      key={t.id}
                      onClick={(ev) => {
                        ev.stopPropagation();
                        onClickTask(t.id);
                      }}
                      className="absolute left-1 right-2 rounded text-xs px-2 py-1 cursor-pointer hover:shadow-md transition z-10"
                      style={{
                        top: `${(startMin / 60) * 56}px`,
                        height: `${heightPx}px`,
                        background: 'var(--color-surface)',
                        border: '1px solid var(--color-border)',
                        borderLeftWidth: 3,
                        borderLeftColor: PRIORITY_COLOR[t.priority]
                      }}
                    >
                      <div className="font-medium">
                        <span className="opacity-50 mr-1">☑</span>
                        {t.title}
                      </div>
                      <div className="text-[10px] opacity-70">{t.due_time}</div>
                    </div>
                  );
                })}
              {timed
                .filter((e) => Number(e.start_time!.slice(0, 2)) === h)
                .map((e) => {
                  const startMin = Number(e.start_time!.slice(3, 5));
                  const endTotal = e.end_time
                    ? Number(e.end_time.slice(0, 2)) * 60 + Number(e.end_time.slice(3, 5))
                    : Number(e.start_time!.slice(0, 2)) * 60 + startMin + 60;
                  const startTotal = h * 60 + startMin;
                  const heightPx = Math.max(28, ((endTotal - startTotal) / 60) * 56);
                  return (
                    <div
                      key={e.id}
                      onClick={(ev) => {
                        ev.stopPropagation();
                        onClickEvent(e);
                      }}
                      className="absolute left-1 right-2 rounded text-xs px-2 py-1 cursor-pointer hover:shadow-md transition z-10"
                      style={{
                        top: `${(startMin / 60) * 56}px`,
                        height: `${heightPx}px`,
                        background: (e.color ?? '#2563EB') + '20',
                        borderLeft: `3px solid ${e.color ?? '#2563EB'}`,
                        color: e.color ?? '#2563EB'
                      }}
                    >
                      <div className="font-medium">{e.title}</div>
                      <div className="text-[10px] opacity-70">
                        {e.start_time}
                        {e.end_time ? `–${e.end_time}` : ''}
                      </div>
                    </div>
                  );
                })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
