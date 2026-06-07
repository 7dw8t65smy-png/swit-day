import type { FastifyInstance } from 'fastify';
import { nanoid } from 'nanoid';
import { db, nowIso } from '../db.js';
import type { Project } from '@swit/shared';

interface ProjectInput {
  name: string;
  color?: string;
  icon?: string | null;
  description?: string | null;
}

export function registerProjects(app: FastifyInstance): void {
  app.get('/projects', () => {
    return db
      .prepare('SELECT * FROM projects ORDER BY archived, sort_order, created_at')
      .all() as Project[];
  });

  app.post<{ Body: ProjectInput }>('/projects', (req) => {
    const id = nanoid();
    const t = nowIso();
    const { name, color = '#2563EB', icon = null, description = null } = req.body;
    db.prepare(
      `INSERT INTO projects (id, name, color, icon, description, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    ).run(id, name, color, icon, description, t, t);
    return db.prepare('SELECT * FROM projects WHERE id = ?').get(id) as Project;
  });

  app.patch<{ Params: { id: string }; Body: Partial<ProjectInput> & { archived?: number } }>(
    '/projects/:id',
    (req) => {
      const cur = db.prepare('SELECT * FROM projects WHERE id = ?').get(req.params.id) as
        | Project
        | undefined;
      if (!cur) throw new Error('not found');
      const next = { ...cur, ...req.body, updated_at: nowIso() };
      db.prepare(
        `UPDATE projects SET name=?, color=?, icon=?, description=?, archived=?, sort_order=?, updated_at=? WHERE id=?`
      ).run(
        next.name,
        next.color,
        next.icon,
        next.description,
        next.archived,
        next.sort_order,
        next.updated_at,
        cur.id
      );
      return db.prepare('SELECT * FROM projects WHERE id = ?').get(cur.id) as Project;
    }
  );

  app.delete<{ Params: { id: string } }>('/projects/:id', (req) => {
    const tx = db.transaction((id: string) => {
      db.prepare('UPDATE tasks SET project_id = NULL WHERE project_id = ?').run(id);
      db.prepare('UPDATE notes SET project_id = NULL WHERE project_id = ?').run(id);
      db.prepare('UPDATE calendar_events SET project_id = NULL WHERE project_id = ?').run(id);
      db.prepare('UPDATE playbooks SET project_id = NULL WHERE project_id = ?').run(id);
      db.prepare('DELETE FROM projects WHERE id = ?').run(id);
    });
    tx(req.params.id);
    return { ok: true };
  });
}
