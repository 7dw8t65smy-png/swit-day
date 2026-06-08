import type { FastifyInstance } from 'fastify';
import { db, today } from '../db.js';
import type { SessionType, TaskTimeLog, WorkSession } from '@swit/shared';

// Таймер смены и таймеры задач удалены из приложения. Эти эндпоинты остаются
// ТОЛЬКО ДЛЯ ЧТЕНИЯ — журнал и статистика показывают исторические данные,
// накопленные ранее. Новые сессии/тайм-логи приложение больше не создаёт.
export function registerSessions(app: FastifyInstance): void {
  // work_sessions (read-only)
  app.get<{ Querystring: { date?: string } }>('/sessions', (req) => {
    const date = req.query.date ?? today();
    return db
      .prepare('SELECT * FROM work_sessions WHERE date = ? ORDER BY started_at')
      .all(date) as WorkSession[];
  });

  // Day totals — sums durations of CLOSED sessions only.
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
    for (const r of rows) {
      if (!dayStartedAt) dayStartedAt = r.started_at;
      const start = new Date(r.started_at).getTime();
      if (r.ended_at) {
        const dur = Math.max(0, Math.floor((new Date(r.ended_at).getTime() - start) / 1000));
        closed[r.type] += dur;
        segments.push({
          type: r.type,
          started_at: r.started_at,
          ended_at: r.ended_at,
          duration_s: dur
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
      open_segment: null,
      segments
    };
  });

  // task_time_logs (read-only)
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
    const sql = `SELECT * FROM task_time_logs ${
      where.length ? `WHERE ${where.join(' AND ')}` : ''
    } ORDER BY started_at DESC`;
    return db.prepare(sql).all(...params) as TaskTimeLog[];
  });
}
