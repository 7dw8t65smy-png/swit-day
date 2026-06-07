import { useEffect, useState } from 'react';
import { Calendar as CalIcon, Plus, ExternalLink } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import type { CalendarEvent, Project } from '@swit/shared';
import { api } from '../api';
import EventDialog from './EventDialog';

export default function TodayEvents({ date }: { date: string }) {
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<CalendarEvent | null>(null);
  const nav = useNavigate();

  useEffect(() => {
    void reload();
  }, [date]);

  async function reload() {
    const [es, ps] = await Promise.all([api.listEvents({ date }), api.listProjects()]);
    setEvents(es);
    setProjects(ps);
  }

  return (
    <section className="bg-surface rounded-lg shadow-sm p-4">
      <div className="flex items-center gap-2 mb-3">
        <CalIcon size={14} className="text-muted" />
        <span className="text-sm font-medium">Сегодня в календаре</span>
        {events.length > 0 && (
          <span className="text-xs text-muted bg-surface2 rounded-full px-2 py-0.5">
            {events.length}
          </span>
        )}
        <button
          onClick={() => nav('/calendar')}
          className="ml-auto text-faint hover:text-accent p-1 rounded"
          title="Открыть календарь"
        >
          <ExternalLink size={13} />
        </button>
        <button
          onClick={() => setCreating(true)}
          className="w-7 h-7 rounded-md bg-accent text-white hover:bg-accent-hover flex items-center justify-center"
          title="Добавить событие"
        >
          <Plus size={14} />
        </button>
      </div>

      {events.length === 0 ? (
        <div className="text-sm text-muted py-2">
          Нет событий ·{' '}
          <button onClick={() => setCreating(true)} className="text-accent hover:underline">
            добавить
          </button>
        </div>
      ) : (
        <ul className="space-y-1.5">
          {events.map((e) => (
            <li
              key={e.id}
              onClick={() => setEditing(e)}
              className="flex items-center gap-2 text-sm rounded-md px-2 py-1.5 cursor-pointer hover:bg-surface2"
            >
              <div
                className="w-1.5 h-1.5 rounded-full shrink-0"
                style={{ background: e.color ?? '#2563EB' }}
              />
              <span className="font-mono text-xs text-muted w-14 shrink-0">
                {e.start_time ?? '··:··'}
              </span>
              <span className="truncate">{e.title}</span>
            </li>
          ))}
        </ul>
      )}

      <EventDialog
        open={creating || editing !== null}
        date={date}
        event={editing}
        projects={projects}
        onClose={() => {
          setCreating(false);
          setEditing(null);
        }}
        onSave={async (data) => {
          const saved = editing && editing.id
            ? await api.updateEvent(editing.id, data)
            : await api.createEvent({
                title: data.title!,
                date: data.date ?? date,
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
    </section>
  );
}
