import type { FastifyInstance } from 'fastify';
import { nanoid } from 'nanoid';
import { db, nowIso } from '../db.js';
import type { Canvas } from '@swit/shared';

interface CanvasInput {
  title: string;
  content: string;
}

export function registerCanvases(app: FastifyInstance): void {
  app.get('/canvases', () => {
    return db.prepare('SELECT * FROM canvases ORDER BY updated_at DESC').all() as Canvas[];
  });

  app.get<{ Params: { id: string } }>('/canvases/:id', (req) => {
    const row = db.prepare('SELECT * FROM canvases WHERE id = ?').get(req.params.id) as
      | Canvas
      | undefined;
    if (!row) throw new Error('not found');
    return row;
  });

  app.post<{ Body: CanvasInput }>('/canvases', (req) => {
    const id = nanoid();
    const t = nowIso();
    const b = req.body;
    db.prepare(
      `INSERT INTO canvases (id, title, content, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?)`
    ).run(id, b.title, b.content, t, t);
    return db.prepare('SELECT * FROM canvases WHERE id = ?').get(id) as Canvas;
  });

  app.put<{ Params: { id: string }; Body: Partial<CanvasInput> }>('/canvases/:id', (req) => {
    const cur = db.prepare('SELECT * FROM canvases WHERE id = ?').get(req.params.id) as
      | Canvas
      | undefined;
    if (!cur) throw new Error('not found');
    const next = { ...cur, ...req.body, updated_at: nowIso() };
    db.prepare(`UPDATE canvases SET title=?, content=?, updated_at=? WHERE id=?`).run(
      next.title,
      next.content,
      next.updated_at,
      cur.id
    );
    return db.prepare('SELECT * FROM canvases WHERE id = ?').get(cur.id) as Canvas;
  });

  app.delete<{ Params: { id: string } }>('/canvases/:id', (req) => {
    db.prepare('DELETE FROM canvases WHERE id = ?').run(req.params.id);
    return { ok: true };
  });

  app.post<{ Params: { id: string } }>('/canvases/:id/duplicate', (req) => {
    const cur = db.prepare('SELECT * FROM canvases WHERE id = ?').get(req.params.id) as
      | Canvas
      | undefined;
    if (!cur) throw new Error('not found');
    const id = nanoid();
    const t = nowIso();
    db.prepare(
      `INSERT INTO canvases (id, title, content, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?)`
    ).run(id, `${cur.title} (копия)`, cur.content, t, t);
    return db.prepare('SELECT * FROM canvases WHERE id = ?').get(id) as Canvas;
  });
}
