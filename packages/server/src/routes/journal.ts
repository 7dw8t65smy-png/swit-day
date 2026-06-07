import type { FastifyInstance } from 'fastify';
import { nanoid } from 'nanoid';
import { db, nowIso } from '../db.js';
import type { JournalEntry } from '@swit/shared';

interface JournalInput {
  date: string;
  what_done?: string | null;
  reflection?: string | null;
  mood?: number | null;
  total_work_s?: number | null;
  total_pause_s?: number | null;
  tasks_done?: number;
}

export function registerJournal(app: FastifyInstance): void {
  // Все записи. Сортируем по дате убыв., внутри дня — по created_at убыв.,
  // чтобы свежие сессии завершения дня шли первыми.
  app.get('/journal', () => {
    return db
      .prepare(
        'SELECT * FROM journal_entries ORDER BY date DESC, created_at DESC'
      )
      .all() as JournalEntry[];
  });

  // Все записи за указанную дату (может быть несколько — на каждое
  // «Завершить день» создаётся отдельная запись).
  app.get<{ Params: { date: string } }>('/journal/by-date/:date', (req) => {
    return db
      .prepare(
        'SELECT * FROM journal_entries WHERE date = ? ORDER BY created_at DESC'
      )
      .all(req.params.date) as JournalEntry[];
  });

  // Одна запись по id.
  app.get<{ Params: { id: string } }>('/journal/:id', (req) => {
    return (
      (db
        .prepare('SELECT * FROM journal_entries WHERE id = ?')
        .get(req.params.id) as JournalEntry | undefined) ?? null
    );
  });

  // Создать новую запись. Заменяет старый PUT-апсёрт.
  app.post<{ Body: JournalInput }>('/journal', (req, reply) => {
    const b = req.body;
    if (!b?.date || typeof b.date !== 'string') {
      return reply.code(400).send({ error: 'invalid_date' });
    }
    const id = nanoid();
    const t = nowIso();
    db.prepare(
      `INSERT INTO journal_entries
        (id, date, what_done, reflection, mood, total_work_s, total_pause_s, tasks_done, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      id,
      b.date,
      b.what_done ?? null,
      b.reflection ?? null,
      b.mood ?? null,
      b.total_work_s ?? null,
      b.total_pause_s ?? null,
      b.tasks_done ?? 0,
      t,
      t
    );
    return db.prepare('SELECT * FROM journal_entries WHERE id = ?').get(id) as JournalEntry;
  });

  // Обновить запись по id (используется в UI «Редактировать»).
  app.patch<{ Params: { id: string }; Body: Partial<JournalInput> }>(
    '/journal/:id',
    (req, reply) => {
      const cur = db
        .prepare('SELECT * FROM journal_entries WHERE id = ?')
        .get(req.params.id) as JournalEntry | undefined;
      if (!cur) return reply.code(404).send({ error: 'not_found' });
      const b = req.body ?? {};
      const n = { ...cur, ...b, updated_at: nowIso() };
      db.prepare(
        `UPDATE journal_entries
         SET what_done=?, reflection=?, mood=?, total_work_s=?, total_pause_s=?, tasks_done=?, updated_at=?
         WHERE id=?`
      ).run(
        n.what_done ?? null,
        n.reflection ?? null,
        n.mood ?? null,
        n.total_work_s ?? null,
        n.total_pause_s ?? null,
        n.tasks_done ?? 0,
        n.updated_at,
        cur.id
      );
      return db
        .prepare('SELECT * FROM journal_entries WHERE id = ?')
        .get(cur.id) as JournalEntry;
    }
  );

  // Удалить запись по id.
  app.delete<{ Params: { id: string } }>('/journal/:id', (req, reply) => {
    const r = db
      .prepare('DELETE FROM journal_entries WHERE id = ?')
      .run(req.params.id);
    if (r.changes === 0) return reply.code(404).send({ error: 'not_found' });
    return { ok: true };
  });
}
