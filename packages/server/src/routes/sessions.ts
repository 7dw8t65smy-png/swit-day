import type { FastifyInstance } from 'fastify';
import { nanoid } from 'nanoid';
import { db, nowIso, today } from '../db.js';
import type { SessionType, TaskTimeLog, WorkSession } from '@swit/shared';

// Нормализует опциональную метку времени для бэкдейта (авто-пауза по простою).
// Возвращает ISO не позже «сейчас», либо null если не задано/некорректно.
function normalizeAt(at: string | null | undefined): string | null {
  if (!at) return null;
  const ms = new Date(at).getTime();
  if (!Number.isFinite(ms)) return null;
  return new Date(Math.min(ms, Date.now())).toISOString();
}

export function registerSessions(app: FastifyInstance): void {
  // work_sessions
  app.get<{ Querystring: { date?: string } }>('/sessions', (req) => {
    const date = req.query.date ?? today();
    return db
      .prepare('SELECT * FROM work_sessions WHERE date = ? ORDER BY started_at')
      .all(date) as WorkSession[];
  });

  app.post<{
    Body: { type: SessionType; task_id?: string | null; notes?: string | null; at?: string | null };
  }>('/sessions/start', (req) => {
    // `at` позволяет бэкдейтить переход (авто-пауза по простою: работа должна
    // закончиться в момент, когда пользователь перестал что-либо делать).
    const t = normalizeAt(req.body.at) ?? nowIso();
    // Закрываем открытые сессии в момент `t`, но не раньше их начала
    // (MAX по ISO-строкам = хронологический максимум).
    db.prepare(
      `UPDATE work_sessions SET ended_at = MAX(?, started_at) WHERE ended_at IS NULL`
    ).run(t);
    const id = nanoid();
    db.prepare(
      `INSERT INTO work_sessions (id, date, started_at, type, task_id, notes) VALUES (?, ?, ?, ?, ?, ?)`
    ).run(id, today(), t, req.body.type, req.body.task_id ?? null, req.body.notes ?? null);
    return db.prepare('SELECT * FROM work_sessions WHERE id = ?').get(id) as WorkSession;
  });

  app.post('/sessions/stop', () => {
    const t = nowIso();
    db.prepare(`UPDATE work_sessions SET ended_at = ? WHERE ended_at IS NULL`).run(t);
    return { ok: true, ended_at: t };
  });

  app.get('/sessions/active', () => {
    return (
      (db
        .prepare('SELECT * FROM work_sessions WHERE ended_at IS NULL ORDER BY started_at DESC LIMIT 1')
        .get() as WorkSession | undefined) ?? null
    );
  });

  // Day totals — sums durations of CLOSED sessions only. The currently-open session,
  // if any, is returned separately so the client can tick it locally.
  app.get<{ Querystring: { date?: string } }>('/sessions/totals', (req) => {
    const date = req.query.date ?? today();
    const rows = db
      .prepare(
        `SELECT type, started_at, ended_at FROM work_sessions WHERE date = ? ORDER BY started_at`
      )
      .all(date) as { type: SessionType; started_at: string; ended_at: string | null }[];

    const closed: Record<SessionType, number> = { work: 0, break: 0, pause: 0 };
    const segments = [];
    let dayStartedAt: string | null = null;
    let openSegment: { type: SessionType; started_at: string } | null = null;
    const now = Date.now();
    for (const r of rows) {
      if (!dayStartedAt) dayStartedAt = r.started_at;
      const start = new Date(r.started_at).getTime();
      if (r.ended_at) {
        const dur = Math.max(0, Math.floor((new Date(r.ended_at).getTime() - start) / 1000));
        closed[r.type] += dur;
        segments.push({ type: r.type, started_at: r.started_at, ended_at: r.ended_at, duration_s: dur });
      } else {
        openSegment = { type: r.type, started_at: r.started_at };
        segments.push({
          type: r.type,
          started_at: r.started_at,
          ended_at: null,
          duration_s: Math.floor((now - start) / 1000)
        });
      }
    }
    return {
      date,
      work_s: closed.work,
      break_s: closed.break,
      pause_s: closed.pause,
      sessions_count: rows.filter((r) => r.type === 'work').length,
      day_started_at: dayStartedAt,
      open_segment: openSegment,
      segments
    };
  });

  // task_time_logs
  app.post<{ Body: { task_id: string } }>('/time-logs/start', (req) => {
    db.prepare(
      `UPDATE task_time_logs SET ended_at = ?, duration_s = CAST((julianday(?) - julianday(started_at)) * 86400 AS INTEGER) WHERE ended_at IS NULL`
    ).run(nowIso(), nowIso());
    const id = nanoid();
    db.prepare(
      `INSERT INTO task_time_logs (id, task_id, started_at, date) VALUES (?, ?, ?, ?)`
    ).run(id, req.body.task_id, nowIso(), today());
    return db.prepare('SELECT * FROM task_time_logs WHERE id = ?').get(id) as TaskTimeLog;
  });

  app.post('/time-logs/stop', () => {
    const t = nowIso();
    db.prepare(
      `UPDATE task_time_logs SET ended_at = ?, duration_s = CAST((julianday(?) - julianday(started_at)) * 86400 AS INTEGER) WHERE ended_at IS NULL`
    ).run(t, t);
    return { ok: true };
  });

  app.get('/time-logs/active', () => {
    return (
      (db
        .prepare('SELECT * FROM task_time_logs WHERE ended_at IS NULL ORDER BY started_at DESC LIMIT 1')
        .get() as TaskTimeLog | undefined) ?? null
    );
  });

  app.get<{ Querystring: { task_id?: string; date?: string } }>('/time-logs', (req) => {
    const where: string[] = [];
    const params: unknown[] = [];
    if (req.query.task_id) {
      where.push('task_id = ?');
      params.push(req.query.task_id);
    }
    if (req.query.date) {
      where.push('date = ?');
      params.push(req.query.date);
    }
    const sql = `SELECT * FROM task_time_logs ${where.length ? `WHERE ${where.join(' AND ')}` : ''} ORDER BY started_at DESC`;
    return db.prepare(sql).all(...params) as TaskTimeLog[];
  });
}
