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
  app.get('/reminders', (req) => {
    return db
      .prepare('SELECT * FROM reminders WHERE workspace_id IS ? ORDER BY datetime')
      .all(req.workspaceId ?? null) as Reminder[];
  });

  app.get('/reminders/due', (req) => {
    return db
      .prepare(
        `SELECT * FROM reminders WHERE workspace_id IS ? AND fired = 0 AND datetime <= ? ORDER BY datetime`
      )
      .all(req.workspaceId ?? null, nowIso()) as Reminder[];
  });

  app.post<{ Body: ReminderInput }>('/reminders', (req) => {
    const id = nanoid();
    const b = req.body;
    db.prepare(
      `INSERT INTO reminders (id, title, datetime, task_id, event_id, created_at, workspace_id) VALUES (?, ?, ?, ?, ?, ?, ?)`
    ).run(id, b.title, b.datetime, b.task_id ?? null, b.event_id ?? null, nowIso(), req.workspaceId ?? null);
    return db.prepare('SELECT * FROM reminders WHERE id = ?').get(id) as Reminder;
  });

  app.post<{ Params: { id: string } }>('/reminders/:id/fired', (req) => {
    db.prepare('UPDATE reminders SET fired = 1 WHERE id = ? AND workspace_id IS ?').run(
      req.params.id,
      req.workspaceId ?? null
    );
    return { ok: true };
  });

  app.post<{ Params: { id: string }; Body: { until: string } }>(
    '/reminders/:id/snooze',
    (req) => {
      db.prepare(
        'UPDATE reminders SET snoozed_to = ?, datetime = ?, fired = 0 WHERE id = ? AND workspace_id IS ?'
      ).run(req.body.until, req.body.until, req.params.id, req.workspaceId ?? null);
      return { ok: true };
    }
  );

  app.delete<{ Params: { id: string } }>('/reminders/:id', (req) => {
    db.prepare('DELETE FROM reminders WHERE id = ? AND workspace_id IS ?').run(
      req.params.id,
      req.workspaceId ?? null
    );
    return { ok: true };
  });
}
