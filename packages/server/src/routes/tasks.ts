import type { FastifyInstance } from 'fastify';
import { nanoid } from 'nanoid';
import { db, nowIso } from '../db.js';
import type { Task, TaskDifficulty, TaskPriority, TaskStatus } from '@swit/shared';

interface TaskInput {
  title: string;
  description?: string | null;
  project_id?: string | null;
  parent_task_id?: string | null;
  status?: TaskStatus;
  priority?: TaskPriority;
  difficulty?: TaskDifficulty;
  due_date?: string | null;
  due_time?: string | null;
  estimated_min?: number | null;
  tags?: string | null;
}

export function registerTasks(app: FastifyInstance): void {
  app.get<{
    Querystring: {
      date?: string;
      project_id?: string;
      status?: string;
      parent_task_id?: string;
      top_level?: string;
    };
  }>('/tasks', (req) => {
    const { date, project_id, status, parent_task_id, top_level } = req.query;
    const where: string[] = [];
    const params: unknown[] = [];
    if (date) {
      where.push('due_date = ?');
      params.push(date);
    }
    if (project_id) {
      where.push('project_id = ?');
      params.push(project_id);
    }
    if (status) {
      where.push('status = ?');
      params.push(status);
    }
    if (parent_task_id) {
      where.push('parent_task_id = ?');
      params.push(parent_task_id);
    }
    if (top_level === 'true') {
      where.push('parent_task_id IS NULL');
    }
    const sql = `SELECT * FROM tasks ${where.length ? `WHERE ${where.join(' AND ')}` : ''} ORDER BY sort_order, created_at DESC`;
    return db.prepare(sql).all(...params) as Task[];
  });

  app.post<{ Body: TaskInput }>('/tasks', (req) => {
    const id = nanoid();
    const t = nowIso();
    const b = req.body;
    db.prepare(
      `INSERT INTO tasks (id, title, description, project_id, parent_task_id, status, priority, difficulty, due_date, due_time, estimated_min, tags, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      id,
      b.title,
      b.description ?? null,
      b.project_id ?? null,
      b.parent_task_id ?? null,
      b.status ?? 'pending',
      b.priority ?? 'normal',
      b.difficulty ?? 'medium',
      b.due_date ?? null,
      b.due_time ?? null,
      b.estimated_min ?? null,
      b.tags ?? null,
      t,
      t
    );
    return db.prepare('SELECT * FROM tasks WHERE id = ?').get(id) as Task;
  });

  app.patch<{ Params: { id: string }; Body: Partial<TaskInput> & { completed_at?: string | null } }>(
    '/tasks/:id',
    (req) => {
      const cur = db.prepare('SELECT * FROM tasks WHERE id = ?').get(req.params.id) as
        | Task
        | undefined;
      if (!cur) throw new Error('not found');
      const next = { ...cur, ...req.body, updated_at: nowIso() };
      if (req.body.status === 'done' && !cur.completed_at) next.completed_at = nowIso();
      db.prepare(
        `UPDATE tasks SET title=?, description=?, project_id=?, parent_task_id=?, status=?, priority=?, difficulty=?, due_date=?, due_time=?, estimated_min=?, tags=?, updated_at=?, completed_at=? WHERE id=?`
      ).run(
        next.title,
        next.description,
        next.project_id,
        next.parent_task_id ?? null,
        next.status,
        next.priority,
        next.difficulty ?? 'medium',
        next.due_date,
        next.due_time,
        next.estimated_min,
        next.tags,
        next.updated_at,
        next.completed_at,
        cur.id
      );
      return db.prepare('SELECT * FROM tasks WHERE id = ?').get(cur.id) as Task;
    }
  );

  app.delete<{ Params: { id: string } }>('/tasks/:id', (req) => {
    const tx = db.transaction((id: string) => {
      // Keep user-authored content and calendar history, but remove direct task links.
      db.prepare('UPDATE tasks SET parent_task_id = NULL WHERE parent_task_id = ?').run(id);
      db.prepare('UPDATE work_sessions SET task_id = NULL WHERE task_id = ?').run(id);
      db.prepare('UPDATE notes SET task_id = NULL WHERE task_id = ?').run(id);
      db.prepare('UPDATE calendar_events SET task_id = NULL WHERE task_id = ?').run(id);
      db.prepare('UPDATE reminders SET task_id = NULL WHERE task_id = ?').run(id);
      // Task time logs require task_id, so they cannot be detached with the current schema.
      db.prepare('DELETE FROM task_time_logs WHERE task_id = ?').run(id);
      db.prepare('DELETE FROM tasks WHERE id = ?').run(id);
    });
    tx(req.params.id);
    return { ok: true };
  });
}
