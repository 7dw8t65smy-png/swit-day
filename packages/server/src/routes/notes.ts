import type { FastifyInstance } from 'fastify';
import { nanoid } from 'nanoid';
import { db, nowIso } from '../db.js';
import type { Note, NoteType } from '@swit/shared';

interface NoteInput {
  content: string;
  type?: NoteType;
  task_id?: string | null;
  project_id?: string | null;
  date?: string | null;
  pinned?: number;
  tags?: string | null;
}

export function registerNotes(app: FastifyInstance): void {
  app.get<{ Querystring: { type?: NoteType; task_id?: string; project_id?: string } }>(
    '/notes',
    (req) => {
      const { type, task_id, project_id } = req.query;
      const where: string[] = [];
      const params: unknown[] = [];
      if (type) {
        where.push('type = ?');
        params.push(type);
      }
      if (task_id) {
        where.push('task_id = ?');
        params.push(task_id);
      }
      if (project_id) {
        where.push('project_id = ?');
        params.push(project_id);
      }
      const sql = `SELECT * FROM notes ${where.length ? `WHERE ${where.join(' AND ')}` : ''} ORDER BY pinned DESC, created_at DESC`;
      return db.prepare(sql).all(...params) as Note[];
    }
  );

  app.post<{ Body: NoteInput }>('/notes', (req) => {
    const id = nanoid();
    const t = nowIso();
    const b = req.body;
    db.prepare(
      `INSERT INTO notes (id, content, type, task_id, project_id, date, pinned, tags, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      id,
      b.content,
      b.type ?? 'quick',
      b.task_id ?? null,
      b.project_id ?? null,
      b.date ?? null,
      b.pinned ?? 0,
      b.tags ?? null,
      t,
      t
    );
    return db.prepare('SELECT * FROM notes WHERE id = ?').get(id) as Note;
  });

  app.patch<{ Params: { id: string }; Body: Partial<NoteInput> }>('/notes/:id', (req) => {
    const cur = db.prepare('SELECT * FROM notes WHERE id = ?').get(req.params.id) as
      | Note
      | undefined;
    if (!cur) throw new Error('not found');
    const next = { ...cur, ...req.body, updated_at: nowIso() };
    db.prepare(
      `UPDATE notes SET content=?, type=?, task_id=?, project_id=?, date=?, pinned=?, tags=?, updated_at=? WHERE id=?`
    ).run(
      next.content,
      next.type,
      next.task_id,
      next.project_id,
      next.date,
      next.pinned,
      next.tags,
      next.updated_at,
      cur.id
    );
    return db.prepare('SELECT * FROM notes WHERE id = ?').get(cur.id) as Note;
  });

  app.delete<{ Params: { id: string } }>('/notes/:id', (req) => {
    db.prepare('DELETE FROM notes WHERE id = ?').run(req.params.id);
    return { ok: true };
  });
}
