import type { FastifyInstance } from 'fastify';
import { nanoid } from 'nanoid';
import { db, nowIso, today } from '../db.js';
import type {
  Habit,
  HabitCadence,
  HabitLog,
  HabitPeriodResult,
  HabitStats
} from '@swit/shared';
import { computeHabitStats } from '@swit/shared';

interface HabitInput {
  title: string;
  description?: string | null;
  icon?: string | null;
  color?: string | null;
  cadence?: HabitCadence;
  cadence_config?: string | null;
  target_count?: number;
  remind_time?: string | null;
  confirm_window_h?: number;
}

function getHabit(id: string): Habit | undefined {
  return db.prepare('SELECT * FROM habits WHERE id = ?').get(id) as Habit | undefined;
}

function logsForHabit(habit_id: string): HabitLog[] {
  return db
    .prepare('SELECT * FROM habit_logs WHERE habit_id = ? ORDER BY date DESC')
    .all(habit_id) as HabitLog[];
}

function periodsForHabit(habit_id: string): HabitPeriodResult[] {
  return db
    .prepare('SELECT * FROM habit_period_results WHERE habit_id = ? ORDER BY period_start DESC')
    .all(habit_id) as HabitPeriodResult[];
}

export function registerHabits(app: FastifyInstance): void {
  app.get('/habits', (req) => {
    return db
      .prepare('SELECT * FROM habits WHERE workspace_id IS ? ORDER BY archived, sort_order, created_at')
      .all(req.workspaceId ?? null) as Habit[];
  });

  app.post<{ Body: HabitInput }>('/habits', (req) => {
    const id = nanoid();
    const t = nowIso();
    const b = req.body;
    db.prepare(
      `INSERT INTO habits
       (id, title, description, icon, color, cadence, cadence_config, target_count, remind_time, confirm_window_h, created_at, updated_at, workspace_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      id,
      b.title,
      b.description ?? null,
      b.icon ?? null,
      b.color ?? '#2563EB',
      b.cadence ?? 'daily',
      b.cadence_config ?? null,
      b.target_count ?? 1,
      b.remind_time ?? null,
      b.confirm_window_h ?? 6,
      t,
      t,
      req.workspaceId ?? null
    );
    return getHabit(id) as Habit;
  });

  app.patch<{
    Params: { id: string };
    Body: Partial<HabitInput> & { archived?: number; sort_order?: number };
  }>('/habits/:id', (req) => {
    const cur = db
      .prepare('SELECT * FROM habits WHERE id = ? AND workspace_id IS ?')
      .get(req.params.id, req.workspaceId ?? null) as Habit | undefined;
    if (!cur) throw new Error('not found');
    const n = { ...cur, ...req.body, updated_at: nowIso() };
    db.prepare(
      `UPDATE habits SET
         title=?, description=?, icon=?, color=?, cadence=?, cadence_config=?,
         target_count=?, remind_time=?, confirm_window_h=?, archived=?, sort_order=?, updated_at=?
       WHERE id=?`
    ).run(
      n.title,
      n.description,
      n.icon,
      n.color,
      n.cadence,
      n.cadence_config ?? null,
      n.target_count,
      n.remind_time ?? null,
      n.confirm_window_h ?? 6,
      n.archived,
      n.sort_order,
      n.updated_at,
      cur.id
    );
    return getHabit(cur.id) as Habit;
  });

  app.delete<{ Params: { id: string } }>('/habits/:id', (req) => {
    const owned = db
      .prepare('SELECT id FROM habits WHERE id = ? AND workspace_id IS ?')
      .get(req.params.id, req.workspaceId ?? null);
    if (!owned) throw new Error('not found');
    const tx = db.transaction((id: string) => {
      db.prepare('DELETE FROM habit_logs WHERE habit_id = ?').run(id);
      db.prepare('DELETE FROM habit_period_results WHERE habit_id = ?').run(id);
      db.prepare('DELETE FROM habits WHERE id = ?').run(id);
    });
    tx(req.params.id);
    return { ok: true };
  });

  // ---- Logs ----

  app.get<{ Querystring: { from?: string; to?: string; habit_id?: string } }>(
    '/habit-logs',
    (req) => {
      const { from, to, habit_id } = req.query;
      const where: string[] = ['workspace_id IS ?'];
      const params: unknown[] = [req.workspaceId ?? null];
      if (habit_id) { where.push('habit_id = ?'); params.push(habit_id); }
      if (from) { where.push('date >= ?'); params.push(from); }
      if (to) { where.push('date <= ?'); params.push(to); }
      const sql = `SELECT * FROM habit_logs WHERE ${where.join(' AND ')} ORDER BY date DESC`;
      return db.prepare(sql).all(...params) as HabitLog[];
    }
  );

  /**
   * Toggle / increment. Поведение:
   * - Если лога за день нет → создаём 'done' с count = max(0, delta).
   * - Если есть 'missed' → перетираем в 'done' (явное «передумал, всё-таки сделал»).
   * - Если есть 'done' и newCount > 0 → обновляем count.
   * - Если есть 'done' и newCount <= 0 → удаляем лог (откат отметки).
   */
  app.post<{
    Body: { habit_id: string; date?: string; delta?: number; note?: string | null };
  }>('/habit-logs/toggle', (req) => {
    const { habit_id } = req.body;
    const date = req.body.date ?? today();
    const delta = req.body.delta ?? 1;
    const ws = req.workspaceId ?? null;
    const owned = db
      .prepare('SELECT id FROM habits WHERE id = ? AND workspace_id IS ?')
      .get(habit_id, ws);
    if (!owned) throw new Error('not found');
    const existing = db
      .prepare('SELECT * FROM habit_logs WHERE habit_id = ? AND date = ? AND workspace_id IS ?')
      .get(habit_id, date, ws) as HabitLog | undefined;
    if (!existing) {
      const id = nanoid();
      db.prepare(
        `INSERT INTO habit_logs (id, habit_id, date, count, status, note, created_at, workspace_id)
         VALUES (?, ?, ?, ?, 'done', ?, ?, ?)`
      ).run(id, habit_id, date, Math.max(0, delta), req.body.note ?? null, nowIso(), ws);
      return db.prepare('SELECT * FROM habit_logs WHERE id = ?').get(id) as HabitLog;
    }
    if (existing.status === 'missed') {
      const newCount = Math.max(1, delta);
      db.prepare(
        `UPDATE habit_logs SET count = ?, status = 'done', note = COALESCE(?, note) WHERE id = ?`
      ).run(newCount, req.body.note ?? null, existing.id);
      return db.prepare('SELECT * FROM habit_logs WHERE id = ?').get(existing.id) as HabitLog;
    }
    const newCount = existing.count + delta;
    if (newCount <= 0) {
      db.prepare('DELETE FROM habit_logs WHERE id = ?').run(existing.id);
      return { ok: true, deleted: true };
    }
    db.prepare(
      `UPDATE habit_logs SET count = ?, note = COALESCE(?, note), status = 'done' WHERE id = ?`
    ).run(newCount, req.body.note ?? null, existing.id);
    return db.prepare('SELECT * FROM habit_logs WHERE id = ?').get(existing.id) as HabitLog;
  });

  /** Явный пропуск. Создаёт/обновляет запись status='missed', count=0. */
  app.post<{ Body: { habit_id: string; date?: string; note?: string | null } }>(
    '/habit-logs/skip',
    (req) => {
      const habit_id = req.body.habit_id;
      const date = req.body.date ?? today();
      const ws = req.workspaceId ?? null;
      const owned = db
        .prepare('SELECT id FROM habits WHERE id = ? AND workspace_id IS ?')
        .get(habit_id, ws);
      if (!owned) throw new Error('not found');
      const existing = db
        .prepare('SELECT * FROM habit_logs WHERE habit_id = ? AND date = ? AND workspace_id IS ?')
        .get(habit_id, date, ws) as HabitLog | undefined;
      if (existing) {
        db.prepare(
          `UPDATE habit_logs SET status = 'missed', count = 0, note = COALESCE(?, note) WHERE id = ?`
        ).run(req.body.note ?? null, existing.id);
        return db.prepare('SELECT * FROM habit_logs WHERE id = ?').get(existing.id) as HabitLog;
      }
      const id = nanoid();
      db.prepare(
        `INSERT INTO habit_logs (id, habit_id, date, count, status, note, created_at, workspace_id)
         VALUES (?, ?, ?, 0, 'missed', ?, ?, ?)`
      ).run(id, habit_id, date, req.body.note ?? null, nowIso(), ws);
      return db.prepare('SELECT * FROM habit_logs WHERE id = ?').get(id) as HabitLog;
    }
  );

  /** Удаление лога по id (полный откат отметки). */
  app.delete<{ Params: { id: string } }>('/habit-logs/:id', (req) => {
    const r = db
      .prepare('DELETE FROM habit_logs WHERE id = ? AND workspace_id IS ?')
      .run(req.params.id, req.workspaceId ?? null);
    if (r.changes === 0) throw new Error('not found');
    return { ok: true };
  });

  // Replace count for a date (legacy).
  app.put<{
    Body: { habit_id: string; date: string; count: number; note?: string | null };
  }>('/habit-logs', (req) => {
    const { habit_id, date, count } = req.body;
    const ws = req.workspaceId ?? null;
    const owned = db
      .prepare('SELECT id FROM habits WHERE id = ? AND workspace_id IS ?')
      .get(habit_id, ws);
    if (!owned) throw new Error('not found');
    const existing = db
      .prepare('SELECT * FROM habit_logs WHERE habit_id = ? AND date = ? AND workspace_id IS ?')
      .get(habit_id, date, ws) as HabitLog | undefined;
    if (count <= 0) {
      if (existing) db.prepare('DELETE FROM habit_logs WHERE id = ?').run(existing.id);
      return { ok: true, deleted: true };
    }
    if (existing) {
      db.prepare(
        `UPDATE habit_logs SET count = ?, status = 'done', note = ? WHERE id = ?`
      ).run(count, req.body.note ?? null, existing.id);
      return db.prepare('SELECT * FROM habit_logs WHERE id = ?').get(existing.id) as HabitLog;
    }
    const id = nanoid();
    db.prepare(
      `INSERT INTO habit_logs (id, habit_id, date, count, status, note, created_at, workspace_id)
       VALUES (?, ?, ?, ?, 'done', ?, ?, ?)`
    ).run(id, habit_id, date, count, req.body.note ?? null, nowIso(), ws);
    return db.prepare('SELECT * FROM habit_logs WHERE id = ?').get(id) as HabitLog;
  });

  // ---- Period results (для weekly_n / monthly_day) ----

  app.get<{ Querystring: { habit_id?: string } }>('/habit-period-results', (req) => {
    const where: string[] = ['workspace_id IS ?'];
    const params: unknown[] = [req.workspaceId ?? null];
    if (req.query.habit_id) { where.push('habit_id = ?'); params.push(req.query.habit_id); }
    const sql = `SELECT * FROM habit_period_results
                 WHERE ${where.join(' AND ')}
                 ORDER BY period_start DESC`;
    return db.prepare(sql).all(...params) as HabitPeriodResult[];
  });

  // ---- Maintenance — фоновая задача в main process дёргает это ----

  /**
   * Проставляет 'missed' для daily / specific_days / monthly_day у которых
   * окно подтверждения истекло и нет лога. Idempotent.
   */
  app.post('/habits/_run-auto-miss', () => {
    const habits = db.prepare(`SELECT * FROM habits WHERE archived = 0`).all() as Habit[];
    const now = new Date();
    let inserted = 0;
    for (const h of habits) {
      if (h.cadence === 'weekly_n') continue;
      const startDate = habitStart(h);
      for (let back = 0; back < 30; back++) {
        const d = new Date(now);
        d.setDate(d.getDate() - back);
        if (!isDueOnDate(h, d)) continue;
        const dateStr = ymdLocal(d);
        // Не трогаем дни до создания рутины.
        if (dateStr < startDate) continue;
        const existing = db
          .prepare('SELECT 1 FROM habit_logs WHERE habit_id = ? AND date = ?')
          .get(h.id, dateStr);
        if (existing) continue;
        if (!isWindowExpired(h, d, now)) continue;
        db.prepare(
          `INSERT INTO habit_logs (id, habit_id, date, count, status, note, created_at, workspace_id)
           VALUES (?, ?, ?, 0, 'missed', NULL, ?, ?)`
        ).run(nanoid(), h.id, dateStr, nowIso(), habitWs(h));
        inserted++;
      }
    }
    return { ok: true, inserted };
  });

  /**
   * Закрывает прошедшие недели/месяцы для weekly_n / monthly_day. Idempotent.
   */
  app.post('/habits/_close-periods', () => {
    const habits = db.prepare(`SELECT * FROM habits WHERE archived = 0`).all() as Habit[];
    const now = new Date();
    let inserted = 0;
    for (const h of habits) {
      if (h.cadence === 'weekly_n') {
        const target = parseTimesPerWeek(h);
        const thisMonday = startOfWeekMonday(now);
        const startDate = habitStart(h);
        for (let w = 1; w <= 26; w++) {
          const monday = addDays(thisMonday, -7 * w);
          const sunday = addDays(monday, 6);
          if (sunday >= startOfDay(now)) continue;
          // Период целиком до создания привычки — пропускаем.
          if (ymdLocal(sunday) < startDate) continue;
          const periodStart = ymdLocal(monday);
          const exists = db
            .prepare(
              `SELECT 1 FROM habit_period_results WHERE habit_id = ? AND period_kind = 'week' AND period_start = ?`
            )
            .get(h.id, periodStart);
          if (exists) continue;
          const count = countDoneBetween(h.id, ymdLocal(monday), ymdLocal(sunday));
          const status = count >= target ? 'done' : 'missed';
          db.prepare(
            `INSERT INTO habit_period_results
             (id, habit_id, period_kind, period_start, status, count_actual, target, created_at, workspace_id)
             VALUES (?, ?, 'week', ?, ?, ?, ?, ?, ?)`
          ).run(nanoid(), h.id, periodStart, status, count, target, nowIso(), habitWs(h));
          inserted++;
        }
      } else if (h.cadence === 'monthly_day') {
        const cur = new Date(now.getFullYear(), now.getMonth(), 1);
        const startDate = habitStart(h);
        for (let m = 1; m <= 12; m++) {
          const start = new Date(cur.getFullYear(), cur.getMonth() - m, 1);
          const end = new Date(cur.getFullYear(), cur.getMonth() - m + 1, 0);
          if (ymdLocal(end) < startDate) continue;
          const periodStart = ymdLocal(start);
          const exists = db
            .prepare(
              `SELECT 1 FROM habit_period_results WHERE habit_id = ? AND period_kind = 'month' AND period_start = ?`
            )
            .get(h.id, periodStart);
          if (exists) continue;
          const count = countDoneBetween(h.id, ymdLocal(start), ymdLocal(end));
          const status = count >= 1 ? 'done' : 'missed';
          db.prepare(
            `INSERT INTO habit_period_results
             (id, habit_id, period_kind, period_start, status, count_actual, target, created_at, workspace_id)
             VALUES (?, ?, 'month', ?, ?, ?, 1, ?, ?)`
          ).run(nanoid(), h.id, periodStart, status, count, nowIso(), habitWs(h));
          inserted++;
        }
      }
    }
    return { ok: true, inserted };
  });

  // ---- Stats ----

  app.get<{ Params: { id: string } }>('/habits/:id/stats', (req) => {
    const h = db
      .prepare('SELECT * FROM habits WHERE id = ? AND workspace_id IS ?')
      .get(req.params.id, req.workspaceId ?? null) as Habit | undefined;
    if (!h) throw new Error('not found');
    const logs = logsForHabit(h.id);
    const periods = periodsForHabit(h.id);
    return computeHabitStats(h, logs, periods, new Date()) as HabitStats;
  });

  app.get('/habits-stats', (req) => {
    const habits = db
      .prepare('SELECT * FROM habits WHERE archived = 0 AND workspace_id IS ?')
      .all(req.workspaceId ?? null) as Habit[];
    const now = new Date();
    const out: Record<string, HabitStats> = {};
    for (const h of habits) {
      out[h.id] = computeHabitStats(h, logsForHabit(h.id), periodsForHabit(h.id), now);
    }
    return out;
  });
}

// ---- helpers (дубль логики streak.ts ради независимости сервера от парсинга дат) ----

function ymdLocal(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** Пространство привычки (для фоновых вставок логов/итогов периодов). */
function habitWs(h: Habit): string | null {
  return (h as { workspace_id?: string | null }).workspace_id ?? null;
}

/** Локальная дата создания рутины (YYYY-MM-DD). До неё ничего не считаем. */
function habitStart(h: Habit): string {
  return ymdLocal(new Date(h.created_at));
}

function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function startOfWeekMonday(d: Date): Date {
  const dow = d.getDay();
  const delta = dow === 0 ? -6 : 1 - dow;
  const m = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  m.setDate(m.getDate() + delta);
  return m;
}

function addDays(d: Date, n: number): Date {
  const c = new Date(d);
  c.setDate(c.getDate() + n);
  return c;
}

function parseCfg(h: Habit): { weekdays?: number[]; times_per_week?: number; day_of_month?: number } {
  if (!h.cadence_config) return {};
  try {
    return JSON.parse(h.cadence_config);
  } catch {
    return {};
  }
}

function isDueOnDate(h: Habit, d: Date): boolean {
  const cfg = parseCfg(h);
  const dow = d.getDay();
  switch (h.cadence) {
    case 'daily': return true;
    case 'specific_days': return (cfg.weekdays ?? []).includes(dow);
    case 'weekly_n': return false;
    case 'monthly_day': {
      const t = cfg.day_of_month ?? 1;
      const last = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
      return d.getDate() === Math.min(t, last);
    }
    case 'weekdays': return dow >= 1 && dow <= 5;
    case 'weekly': return dow === 1;
    default: return true;
  }
}

function isWindowExpired(h: Habit, date: Date, now: Date): boolean {
  const remind = parseHHMM(h.remind_time);
  const base = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  if (remind) base.setHours(remind.h, remind.m, 0, 0);
  else base.setHours(24, 0, 0, 0);
  const dl = new Date(base);
  dl.setHours(dl.getHours() + (h.confirm_window_h ?? 6));
  return now >= dl;
}

function parseHHMM(s: string | null): { h: number; m: number } | null {
  if (!s) return null;
  const m = s.match(/^(\d{2}):(\d{2})$/);
  if (!m) return null;
  return { h: Number(m[1]), m: Number(m[2]) };
}

function parseTimesPerWeek(h: Habit): number {
  return Math.max(1, parseCfg(h).times_per_week ?? 1);
}

function countDoneBetween(habitId: string, fromDate: string, toDate: string): number {
  const row = db
    .prepare(
      `SELECT COALESCE(SUM(count), 0) AS n
       FROM habit_logs
       WHERE habit_id = ? AND status = 'done' AND date >= ? AND date <= ?`
    )
    .get(habitId, fromDate, toDate) as { n: number };
  return row.n;
}
