import type { FastifyInstance } from 'fastify';
import { nanoid } from 'nanoid';
import { db, nowIso } from '../db.js';
import type { Board } from '@swit/shared';

interface BoardInput {
  title: string;
  content: string;
}

export function registerBoards(app: FastifyInstance): void {
  // Список досок целиком (их немного; content нужен для мини-превью в галерее).
  app.get('/boards', () => {
    return db.prepare('SELECT * FROM boards ORDER BY updated_at DESC').all() as Board[];
  });

  app.get<{ Params: { id: string } }>('/boards/:id', (req) => {
    const row = db.prepare('SELECT * FROM boards WHERE id = ?').get(req.params.id) as
      | Board
      | undefined;
    if (!row) throw new Error('not found');
    return row;
  });

  app.post<{ Body: BoardInput }>('/boards', (req) => {
    const id = nanoid();
    const t = nowIso();
    const b = req.body;
    db.prepare(
      `INSERT INTO boards (id, title, content, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?)`
    ).run(id, b.title, b.content, t, t);
    return db.prepare('SELECT * FROM boards WHERE id = ?').get(id) as Board;
  });

  app.put<{ Params: { id: string }; Body: Partial<BoardInput> }>('/boards/:id', (req) => {
    const cur = db.prepare('SELECT * FROM boards WHERE id = ?').get(req.params.id) as
      | Board
      | undefined;
    if (!cur) throw new Error('not found');
    const next = { ...cur, ...req.body, updated_at: nowIso() };
    db.prepare(`UPDATE boards SET title=?, content=?, updated_at=? WHERE id=?`).run(
      next.title,
      next.content,
      next.updated_at,
      cur.id
    );
    return db.prepare('SELECT * FROM boards WHERE id = ?').get(cur.id) as Board;
  });

  app.delete<{ Params: { id: string } }>('/boards/:id', (req) => {
    db.prepare('DELETE FROM boards WHERE id = ?').run(req.params.id);
    return { ok: true };
  });

  app.post<{ Params: { id: string } }>('/boards/:id/duplicate', (req) => {
    const cur = db.prepare('SELECT * FROM boards WHERE id = ?').get(req.params.id) as
      | Board
      | undefined;
    if (!cur) throw new Error('not found');
    const id = nanoid();
    const t = nowIso();
    db.prepare(
      `INSERT INTO boards (id, title, content, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?)`
    ).run(id, `${cur.title} (копия)`, cur.content, t, t);
    return db.prepare('SELECT * FROM boards WHERE id = ?').get(id) as Board;
  });
}
