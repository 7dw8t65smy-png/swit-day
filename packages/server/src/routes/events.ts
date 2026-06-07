import type { FastifyInstance } from 'fastify';
import { nanoid } from 'nanoid';
import { db, nowIso } from '../db.js';
import type { CalendarEvent, CalendarEventType } from '@swit/shared';

interface EventInput {
  title: string;
  date: string;
  start_time?: string | null;
  end_time?: string | null;
  description?: string | null;
  project_id?: string | null;
  task_id?: string | null;
  reminder_min?: number | null;
  color?: string | null;
  type?: CalendarEventType;
}

export function registerEvents(app: FastifyInstance): void {
  app.get<{ Querystring: { from?: string; to?: string; date?: string } }>('/events', (req) => {
    const { from, to, date } = req.query;
    if (date) {
      return db
        .prepare('SELECT * FROM calendar_events WHERE date = ? ORDER BY start_time')
        .all(date) as CalendarEvent[];
    }
    if (from && to) {
      return db
        .prepare('SELECT * FROM calendar_events WHERE date BETWEEN ? AND ? ORDER BY date, start_time')
        .all(from, to) as CalendarEvent[];
    }
    return db
      .prepare('SELECT * FROM calendar_events ORDER BY date, start_time')
      .all() as CalendarEvent[];
  });

  app.post<{ Body: EventInput }>('/events', (req) => {
    const id = nanoid();
    const t = nowIso();
    const b = req.body;
    db.prepare(
      `INSERT INTO calendar_events (id, title, date, start_time, end_time, description, project_id, task_id, reminder_min, color, type, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      id,
      b.title,
      b.date,
      b.start_time ?? null,
      b.end_time ?? null,
      b.description ?? null,
      b.project_id ?? null,
      b.task_id ?? null,
      b.reminder_min ?? null,
      b.color ?? null,
      b.type ?? 'event',
      t,
      t
    );
    syncEventReminder(id, b.title, b.date, b.start_time ?? null, b.reminder_min ?? null);
    return db.prepare('SELECT * FROM calendar_events WHERE id = ?').get(id) as CalendarEvent;
  });

  app.patch<{ Params: { id: string }; Body: Partial<EventInput> }>('/events/:id', (req) => {
    const cur = db.prepare('SELECT * FROM calendar_events WHERE id = ?').get(req.params.id) as
      | CalendarEvent
      | undefined;
    if (!cur) throw new Error('not found');
    const n = { ...cur, ...req.body, updated_at: nowIso() };
    db.prepare(
      `UPDATE calendar_events SET title=?, date=?, start_time=?, end_time=?, description=?, project_id=?, task_id=?, reminder_min=?, color=?, type=?, updated_at=? WHERE id=?`
    ).run(
      n.title,
      n.date,
      n.start_time,
      n.end_time,
      n.description,
      n.project_id,
      n.task_id,
      n.reminder_min,
      n.color,
      n.type,
      n.updated_at,
      cur.id
    );
    syncEventReminder(cur.id, n.title, n.date, n.start_time, n.reminder_min);
    return db.prepare('SELECT * FROM calendar_events WHERE id = ?').get(cur.id) as CalendarEvent;
  });

  app.delete<{ Params: { id: string } }>('/events/:id', (req) => {
    db.prepare('DELETE FROM reminders WHERE event_id = ?').run(req.params.id);
    db.prepare('DELETE FROM calendar_events WHERE id = ?').run(req.params.id);
    return { ok: true };
  });
}

function syncEventReminder(
  eventId: string,
  title: string,
  date: string,
  startTime: string | null,
  reminderMin: number | null
): void {
  // Always remove existing reminders linked to this event, then recreate if needed.
  db.prepare('DELETE FROM reminders WHERE event_id = ?').run(eventId);
  if (!reminderMin || reminderMin <= 0) return;
  const time = startTime ?? '09:00';
  const when = new Date(`${date}T${time}:00`);
  if (isNaN(when.getTime())) return;
  when.setMinutes(when.getMinutes() - reminderMin);
  if (when.getTime() < Date.now()) return; // in the past
  db.prepare(
    `INSERT INTO reminders (id, title, datetime, event_id, created_at) VALUES (?, ?, ?, ?, ?)`
  ).run(nanoid(), title, when.toISOString(), eventId, nowIso());
}
