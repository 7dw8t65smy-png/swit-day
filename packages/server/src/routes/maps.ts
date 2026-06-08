import type { FastifyInstance } from 'fastify';
import { nanoid } from 'nanoid';
import { db, nowIso } from '../db.js';
import type { MindMap } from '@swit/shared';

interface MapInput {
  title: string;
  content: string;
  theme?: string;
}

export function registerMaps(app: FastifyInstance): void {
  // Список карт целиком (их немного; content нужен для мини-превью в галерее).
  app.get('/maps', () => {
    return db.prepare('SELECT * FROM mind_maps ORDER BY updated_at DESC').all() as MindMap[];
  });

  app.get<{ Params: { id: string } }>('/maps/:id', (req) => {
    const row = db.prepare('SELECT * FROM mind_maps WHERE id = ?').get(req.params.id) as
      | MindMap
      | undefined;
    if (!row) throw new Error('not found');
    return row;
  });

  app.post<{ Body: MapInput }>('/maps', (req) => {
    const id = nanoid();
    const t = nowIso();
    const b = req.body;
    db.prepare(
      `INSERT INTO mind_maps (id, title, content, theme, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?)`
    ).run(id, b.title, b.content, b.theme ?? 'classic', t, t);
    return db.prepare('SELECT * FROM mind_maps WHERE id = ?').get(id) as MindMap;
  });

  app.put<{ Params: { id: string }; Body: Partial<MapInput> }>('/maps/:id', (req) => {
    const cur = db.prepare('SELECT * FROM mind_maps WHERE id = ?').get(req.params.id) as
      | MindMap
      | undefined;
    if (!cur) throw new Error('not found');
    const next = { ...cur, ...req.body, updated_at: nowIso() };
    db.prepare(`UPDATE mind_maps SET title=?, content=?, theme=?, updated_at=? WHERE id=?`).run(
      next.title,
      next.content,
      next.theme,
      next.updated_at,
      cur.id
    );
    return db.prepare('SELECT * FROM mind_maps WHERE id = ?').get(cur.id) as MindMap;
  });

  app.delete<{ Params: { id: string } }>('/maps/:id', (req) => {
    db.prepare('DELETE FROM mind_maps WHERE id = ?').run(req.params.id);
    return { ok: true };
  });

  app.post<{ Params: { id: string } }>('/maps/:id/duplicate', (req) => {
    const cur = db.prepare('SELECT * FROM mind_maps WHERE id = ?').get(req.params.id) as
      | MindMap
      | undefined;
    if (!cur) throw new Error('not found');
    const id = nanoid();
    const t = nowIso();
    db.prepare(
      `INSERT INTO mind_maps (id, title, content, theme, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?)`
    ).run(id, `${cur.title} (копия)`, cur.content, cur.theme, t, t);
    return db.prepare('SELECT * FROM mind_maps WHERE id = ?').get(id) as MindMap;
  });
}
