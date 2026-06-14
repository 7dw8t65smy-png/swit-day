import type { FastifyInstance } from 'fastify';
import { nanoid } from 'nanoid';
import { db, nowIso } from '../db.js';
import type {
  Playbook,
  PlaybookRun,
  PlaybookRunStep,
  PlaybookRunWithSteps,
  PlaybookStep,
  PlaybookWithSteps
} from '@swit/shared';

interface PlaybookInput {
  title: string;
  description?: string | null;
  content?: string | null;
  project_id?: string | null;
  icon?: string | null;
  color?: string | null;
}

interface StepInput {
  title: string;
  description?: string | null;
  sort_order?: number;
}

export function registerPlaybooks(app: FastifyInstance): void {
  // List
  app.get('/playbooks', (req) => {
    return db
      .prepare(
        'SELECT * FROM playbooks WHERE workspace_id IS ? ORDER BY archived, sort_order, created_at DESC'
      )
      .all(req.workspaceId ?? null) as Playbook[];
  });

  // Get one with steps
  app.get<{ Params: { id: string } }>('/playbooks/:id', (req) => {
    const pb = db
      .prepare('SELECT * FROM playbooks WHERE id = ? AND workspace_id IS ?')
      .get(req.params.id, req.workspaceId ?? null) as Playbook | undefined;
    if (!pb) throw new Error('not found');
    const steps = db
      .prepare(
        'SELECT * FROM playbook_steps WHERE playbook_id = ? ORDER BY sort_order, created_at'
      )
      .all(req.params.id) as PlaybookStep[];
    return { ...pb, steps } as PlaybookWithSteps;
  });

  // Create
  app.post<{ Body: PlaybookInput & { steps?: StepInput[] } }>('/playbooks', (req) => {
    const id = nanoid();
    const t = nowIso();
    const b = req.body;
    const ws = req.workspaceId ?? null;
    db.prepare(
      `INSERT INTO playbooks (id, title, description, content, project_id, icon, color, created_at, updated_at, workspace_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      id,
      b.title,
      b.description ?? null,
      b.content ?? null,
      b.project_id ?? null,
      b.icon ?? null,
      b.color ?? null,
      t,
      t,
      ws
    );
    if (b.steps && b.steps.length > 0) {
      const stmt = db.prepare(
        `INSERT INTO playbook_steps (id, playbook_id, title, description, sort_order, created_at, workspace_id)
         VALUES (?, ?, ?, ?, ?, ?, ?)`
      );
      const tx = db.transaction((items: StepInput[]) => {
        items.forEach((s, i) => {
          stmt.run(nanoid(), id, s.title, s.description ?? null, s.sort_order ?? i, t, ws);
        });
      });
      tx(b.steps);
    }
    return db.prepare('SELECT * FROM playbooks WHERE id = ?').get(id) as Playbook;
  });

  // Update
  app.patch<{ Params: { id: string }; Body: Partial<PlaybookInput> & { archived?: number } }>(
    '/playbooks/:id',
    (req) => {
      const cur = db
        .prepare('SELECT * FROM playbooks WHERE id = ? AND workspace_id IS ?')
        .get(req.params.id, req.workspaceId ?? null) as Playbook | undefined;
      if (!cur) throw new Error('not found');
      const n = { ...cur, ...req.body, updated_at: nowIso() };
      db.prepare(
        `UPDATE playbooks SET title=?, description=?, content=?, project_id=?, icon=?, color=?, archived=?, sort_order=?, updated_at=? WHERE id=?`
      ).run(
        n.title,
        n.description,
        n.content,
        n.project_id,
        n.icon,
        n.color,
        n.archived,
        n.sort_order,
        n.updated_at,
        cur.id
      );
      return db.prepare('SELECT * FROM playbooks WHERE id = ?').get(cur.id) as Playbook;
    }
  );

  // Delete
  app.delete<{ Params: { id: string } }>('/playbooks/:id', (req) => {
    const owned = db
      .prepare('SELECT id FROM playbooks WHERE id = ? AND workspace_id IS ?')
      .get(req.params.id, req.workspaceId ?? null);
    if (!owned) throw new Error('not found');
    const tx = db.transaction((id: string) => {
      const runs = db
        .prepare('SELECT id FROM playbook_runs WHERE playbook_id = ?')
        .all(id) as { id: string }[];
      for (const run of runs) {
        db.prepare('DELETE FROM playbook_run_steps WHERE run_id = ?').run(run.id);
      }
      db.prepare('DELETE FROM playbook_runs WHERE playbook_id = ?').run(id);
      db.prepare('DELETE FROM playbook_steps WHERE playbook_id = ?').run(id);
      db.prepare('DELETE FROM playbooks WHERE id = ?').run(id);
    });
    tx(req.params.id);
    return { ok: true };
  });

  // Add step
  app.post<{ Params: { id: string }; Body: StepInput }>(
    '/playbooks/:id/steps',
    (req) => {
      const id = nanoid();
      const b = req.body;
      const ws = req.workspaceId ?? null;
      const pb = db
        .prepare('SELECT id FROM playbooks WHERE id = ? AND workspace_id IS ?')
        .get(req.params.id, ws);
      if (!pb) throw new Error('not found');
      const max = db
        .prepare('SELECT MAX(sort_order) AS m FROM playbook_steps WHERE playbook_id = ?')
        .get(req.params.id) as { m: number | null };
      const sortOrder = b.sort_order ?? (max.m ?? -1) + 1;
      db.prepare(
        `INSERT INTO playbook_steps (id, playbook_id, title, description, sort_order, created_at, workspace_id)
         VALUES (?, ?, ?, ?, ?, ?, ?)`
      ).run(id, req.params.id, b.title, b.description ?? null, sortOrder, nowIso(), ws);
      // bump playbook updated_at
      db.prepare('UPDATE playbooks SET updated_at = ? WHERE id = ?').run(nowIso(), req.params.id);
      return db.prepare('SELECT * FROM playbook_steps WHERE id = ?').get(id) as PlaybookStep;
    }
  );

  // Update step
  app.patch<{ Params: { id: string }; Body: Partial<StepInput> }>(
    '/playbook-steps/:id',
    (req) => {
      const cur = db
        .prepare('SELECT * FROM playbook_steps WHERE id = ? AND workspace_id IS ?')
        .get(req.params.id, req.workspaceId ?? null) as PlaybookStep | undefined;
      if (!cur) throw new Error('not found');
      const n = { ...cur, ...req.body };
      db.prepare(
        `UPDATE playbook_steps SET title=?, description=?, sort_order=? WHERE id=?`
      ).run(n.title, n.description, n.sort_order, cur.id);
      db.prepare('UPDATE playbooks SET updated_at = ? WHERE id = ?').run(
        nowIso(),
        cur.playbook_id
      );
      return db.prepare('SELECT * FROM playbook_steps WHERE id = ?').get(cur.id) as PlaybookStep;
    }
  );

  // Delete step
  app.delete<{ Params: { id: string } }>('/playbook-steps/:id', (req) => {
    const cur = db
      .prepare('SELECT * FROM playbook_steps WHERE id = ? AND workspace_id IS ?')
      .get(req.params.id, req.workspaceId ?? null) as PlaybookStep | undefined;
    if (!cur) throw new Error('not found');
    db.prepare('DELETE FROM playbook_steps WHERE id = ?').run(req.params.id);
    if (cur) {
      db.prepare('UPDATE playbooks SET updated_at = ? WHERE id = ?').run(
        nowIso(),
        cur.playbook_id
      );
    }
    return { ok: true };
  });

  // List runs
  app.get<{ Querystring: { playbook_id?: string; active?: string } }>(
    '/playbook-runs',
    (req) => {
      const where: string[] = ['workspace_id IS ?'];
      const params: unknown[] = [req.workspaceId ?? null];
      if (req.query.playbook_id) {
        where.push('playbook_id = ?');
        params.push(req.query.playbook_id);
      }
      if (req.query.active === 'true') {
        where.push('completed_at IS NULL');
      } else if (req.query.active === 'false') {
        where.push('completed_at IS NOT NULL');
      }
      const sql = `SELECT * FROM playbook_runs ${where.length ? `WHERE ${where.join(' AND ')}` : ''} ORDER BY started_at DESC`;
      return db.prepare(sql).all(...params) as PlaybookRun[];
    }
  );

  // Get run with steps
  app.get<{ Params: { id: string } }>('/playbook-runs/:id', (req) => {
    const run = db
      .prepare('SELECT * FROM playbook_runs WHERE id = ? AND workspace_id IS ?')
      .get(req.params.id, req.workspaceId ?? null) as PlaybookRun | undefined;
    if (!run) throw new Error('not found');
    const steps = db
      .prepare('SELECT * FROM playbook_run_steps WHERE run_id = ? ORDER BY sort_order')
      .all(req.params.id) as PlaybookRunStep[];
    return { ...run, steps } as PlaybookRunWithSteps;
  });

  // Start a run (creates snapshot)
  app.post<{ Body: { playbook_id: string; title?: string } }>('/playbook-runs', (req) => {
    const ws = req.workspaceId ?? null;
    const pb = db
      .prepare('SELECT * FROM playbooks WHERE id = ? AND workspace_id IS ?')
      .get(req.body.playbook_id, ws) as Playbook | undefined;
    if (!pb) throw new Error('playbook not found');
    const steps = db
      .prepare(
        'SELECT * FROM playbook_steps WHERE playbook_id = ? ORDER BY sort_order, created_at'
      )
      .all(req.body.playbook_id) as PlaybookStep[];
    const id = nanoid();
    const t = nowIso();
    const runTitle = req.body.title?.trim() || pb.title;
    db.prepare(
      `INSERT INTO playbook_runs (id, playbook_id, playbook_title, title, content, started_at, created_at, updated_at, workspace_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(id, pb.id, pb.title, runTitle, pb.content, t, t, t, ws);
    const stmt = db.prepare(
      `INSERT INTO playbook_run_steps (id, run_id, step_id, title, description, sort_order, workspace_id)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    );
    const tx = db.transaction((items: PlaybookStep[]) => {
      items.forEach((s, i) => {
        stmt.run(nanoid(), id, s.id, s.title, s.description, s.sort_order ?? i, ws);
      });
    });
    tx(steps);
    return db.prepare('SELECT * FROM playbook_runs WHERE id = ?').get(id) as PlaybookRun;
  });

  // Update run (title, notes, completed)
  app.patch<{
    Params: { id: string };
    Body: { title?: string; notes?: string | null; completed_at?: string | null };
  }>('/playbook-runs/:id', (req) => {
    const cur = db
      .prepare('SELECT * FROM playbook_runs WHERE id = ? AND workspace_id IS ?')
      .get(req.params.id, req.workspaceId ?? null) as PlaybookRun | undefined;
    if (!cur) throw new Error('not found');
    const n = { ...cur, ...req.body, updated_at: nowIso() };
    db.prepare(
      `UPDATE playbook_runs SET title=?, notes=?, completed_at=?, updated_at=? WHERE id=?`
    ).run(n.title, n.notes, n.completed_at, n.updated_at, cur.id);
    return db.prepare('SELECT * FROM playbook_runs WHERE id = ?').get(cur.id) as PlaybookRun;
  });

  // Delete run
  app.delete<{ Params: { id: string } }>('/playbook-runs/:id', (req) => {
    const owned = db
      .prepare('SELECT id FROM playbook_runs WHERE id = ? AND workspace_id IS ?')
      .get(req.params.id, req.workspaceId ?? null);
    if (!owned) throw new Error('not found');
    db.prepare('DELETE FROM playbook_run_steps WHERE run_id = ?').run(req.params.id);
    db.prepare('DELETE FROM playbook_runs WHERE id = ?').run(req.params.id);
    return { ok: true };
  });

  // Toggle run step
  app.patch<{ Params: { id: string }; Body: { completed?: boolean; notes?: string | null } }>(
    '/run-steps/:id',
    (req) => {
      const cur = db
        .prepare('SELECT * FROM playbook_run_steps WHERE id = ? AND workspace_id IS ?')
        .get(req.params.id, req.workspaceId ?? null) as PlaybookRunStep | undefined;
      if (!cur) throw new Error('not found');
      const completed_at =
        req.body.completed === true
          ? nowIso()
          : req.body.completed === false
            ? null
            : cur.completed_at;
      const notes = req.body.notes !== undefined ? req.body.notes : cur.notes;
      db.prepare('UPDATE playbook_run_steps SET completed_at=?, notes=? WHERE id=?').run(
        completed_at,
        notes,
        cur.id
      );
      // Bump run updated_at; auto-complete if all steps done.
      db.prepare('UPDATE playbook_runs SET updated_at=? WHERE id=?').run(nowIso(), cur.run_id);
      const allDone = db
        .prepare(
          'SELECT COUNT(*) AS n FROM playbook_run_steps WHERE run_id = ? AND completed_at IS NULL'
        )
        .get(cur.run_id) as { n: number };
      if (allDone.n === 0) {
        db.prepare(
          'UPDATE playbook_runs SET completed_at=? WHERE id=? AND completed_at IS NULL'
        ).run(nowIso(), cur.run_id);
      } else {
        // Re-open the run if it was previously auto-completed but now has open steps
        db.prepare(
          'UPDATE playbook_runs SET completed_at=NULL WHERE id=? AND completed_at IS NOT NULL'
        ).run(cur.run_id);
      }
      return db
        .prepare('SELECT * FROM playbook_run_steps WHERE id = ?')
        .get(cur.id) as PlaybookRunStep;
    }
  );
}
