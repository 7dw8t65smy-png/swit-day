import type { FastifyInstance } from 'fastify';
import { nanoid } from 'nanoid';
import { db, nowIso } from '../db.js';
import type { Reminder } from '@swit/shared';

interface ReminderInput {
  title: string;
  datetime: string;
  task_id?: string | null;
  event_id?: string | null;
}

export function registerReminders(app: FastifyInstance): void {
  app.get('/reminders', () => {
    return db.prepare('SELECT * FROM reminders ORDER BY datetime').all() as Reminder[];
  });

  app.get('/reminders/due', () => {
    return db
      .prepare(
        `SELECT * FROM reminders WHERE fired = 0 AND datetime <= ? ORDER BY datetime`
      )
      .all(nowIso()) as Reminder[];
  });

  app.post<{ Body: ReminderInput }>('/reminders', (req) => {
    const id = nanoid();
    const b = req.body;
    db.prepare(
      `INSERT INTO reminders (id, title, datetime, task_id, event_id, created_at) VALUES (?, ?, ?, ?, ?, ?)`
    ).run(id, b.title, b.datetime, b.task_id ?? null, b.event_id ?? null, nowIso());
    return db.prepare('SELECT * FROM reminders WHERE id = ?').get(id) as Reminder;
  });

  app.post<{ Params: { id: string } }>('/reminders/:id/fired', (req) => {
    db.prepare('UPDATE reminders SET fired = 1 WHERE id = ?').run(req.params.id);
    return { ok: true };
  });

  app.post<{ Params: { id: string }; Body: { until: string } }>(
    '/reminders/:id/snooze',
    (req) => {
      db.prepare('UPDATE reminders SET snoozed_to = ?, datetime = ?, fired = 0 WHERE id = ?').run(
        req.body.until,
        req.body.until,
        req.params.id
      );
      return { ok: true };
    }
  );

  app.delete<{ Params: { id: string } }>('/reminders/:id', (req) => {
    db.prepare('DELETE FROM reminders WHERE id = ?').run(req.params.id);
    return { ok: true };
  });
}
