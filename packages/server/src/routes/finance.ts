import type { FastifyInstance } from 'fastify';
import { nanoid } from 'nanoid';
import { db, nowIso } from '../db.js';
import type {
  ExpenseCategory,
  PaymentMethod,
  RecurringTransaction,
  Transaction,
  TransactionKind,
  TransactionSummary
} from '@swit/shared';

interface CategoryInput {
  name: string;
  icon?: string | null;
  color?: string | null;
  kind?: TransactionKind;
  monthly_limit?: number | null;
  archived?: number;
  sort_order?: number;
}

interface TransactionInput {
  amount: number;
  kind?: TransactionKind;
  category_id?: string | null;
  payment_method?: PaymentMethod;
  date: string;
  description: string;
  note?: string | null;
  recurring_id?: string | null;
}

interface RecurringInput {
  amount: number;
  kind?: TransactionKind;
  category_id?: string | null;
  payment_method?: PaymentMethod;
  description: string;
  period?: 'monthly' | 'weekly';
  day_of_month?: number | null;
  day_of_week?: number | null;
  reminder_enabled?: number;
  remind_time?: string | null;
  archived?: number;
}

export function registerFinance(app: FastifyInstance): void {
  // ---------- Categories ----------

  app.get('/expense-categories', (req) => {
    return db
      .prepare(
        `SELECT * FROM expense_categories
         WHERE workspace_id IS ?
         ORDER BY archived, sort_order, created_at`
      )
      .all(req.workspaceId ?? null) as ExpenseCategory[];
  });

  app.post<{ Body: CategoryInput }>('/expense-categories', (req) => {
    const id = nanoid();
    const t = nowIso();
    const b = req.body;
    db.prepare(
      `INSERT INTO expense_categories
       (id, name, icon, color, kind, monthly_limit, archived, sort_order, created_at, updated_at, workspace_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      id,
      b.name,
      b.icon ?? null,
      b.color ?? '#94A3B8',
      b.kind ?? 'expense',
      b.monthly_limit ?? null,
      b.archived ?? 0,
      b.sort_order ?? 0,
      t,
      t,
      req.workspaceId ?? null
    );
    return db.prepare('SELECT * FROM expense_categories WHERE id = ?').get(id) as ExpenseCategory;
  });

  app.patch<{ Params: { id: string }; Body: Partial<CategoryInput> }>(
    '/expense-categories/:id',
    (req) => {
      const cur = db
        .prepare('SELECT * FROM expense_categories WHERE id = ? AND workspace_id IS ?')
        .get(req.params.id, req.workspaceId ?? null) as ExpenseCategory | undefined;
      if (!cur) throw new Error('not found');
      const n = { ...cur, ...req.body, updated_at: nowIso() };
      db.prepare(
        `UPDATE expense_categories SET
           name=?, icon=?, color=?, kind=?, monthly_limit=?, archived=?, sort_order=?, updated_at=?
         WHERE id=?`
      ).run(
        n.name,
        n.icon,
        n.color,
        n.kind,
        n.monthly_limit,
        n.archived,
        n.sort_order,
        n.updated_at,
        cur.id
      );
      return db.prepare('SELECT * FROM expense_categories WHERE id = ?').get(cur.id) as ExpenseCategory;
    }
  );

  app.delete<{ Params: { id: string } }>('/expense-categories/:id', (req) => {
    const r = db
      .prepare('DELETE FROM expense_categories WHERE id = ? AND workspace_id IS ?')
      .run(req.params.id, req.workspaceId ?? null);
    if (r.changes === 0) throw new Error('not found');
    return { ok: true };
  });

  // ---------- Transactions ----------

  app.get<{
    Querystring: {
      from?: string;
      to?: string;
      category_id?: string;
      payment_method?: PaymentMethod;
      kind?: TransactionKind;
      search?: string;
      limit?: string;
    };
  }>('/transactions', (req) => {
    const { from, to, category_id, payment_method, kind, search, limit } = req.query;
    const where: string[] = ['workspace_id IS ?'];
    const params: unknown[] = [req.workspaceId ?? null];
    if (from) { where.push('date >= ?'); params.push(from); }
    if (to) { where.push('date <= ?'); params.push(to); }
    if (category_id) { where.push('category_id = ?'); params.push(category_id); }
    if (payment_method) { where.push('payment_method = ?'); params.push(payment_method); }
    if (kind) { where.push('kind = ?'); params.push(kind); }
    if (search) {
      where.push('(description LIKE ? OR note LIKE ?)');
      params.push(`%${search}%`, `%${search}%`);
    }
    const lim = limit ? Math.min(2000, Math.max(1, parseInt(limit, 10) || 200)) : 500;
    const sql = `SELECT * FROM transactions
                 ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
                 ORDER BY date DESC, created_at DESC
                 LIMIT ${lim}`;
    return db.prepare(sql).all(...params) as Transaction[];
  });

  app.post<{ Body: TransactionInput }>('/transactions', (req) => {
    const id = nanoid();
    const t = nowIso();
    const b = req.body;
    db.prepare(
      `INSERT INTO transactions
       (id, amount, kind, category_id, payment_method, date, description, note, recurring_id, created_at, updated_at, workspace_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      id,
      Math.abs(b.amount),
      b.kind ?? 'expense',
      b.category_id ?? null,
      b.payment_method ?? 'card',
      b.date,
      b.description,
      b.note ?? null,
      b.recurring_id ?? null,
      t,
      t,
      req.workspaceId ?? null
    );
    return db.prepare('SELECT * FROM transactions WHERE id = ?').get(id) as Transaction;
  });

  app.patch<{ Params: { id: string }; Body: Partial<TransactionInput> }>(
    '/transactions/:id',
    (req) => {
      const cur = db
        .prepare('SELECT * FROM transactions WHERE id = ? AND workspace_id IS ?')
        .get(req.params.id, req.workspaceId ?? null) as Transaction | undefined;
      if (!cur) throw new Error('not found');
      const n = { ...cur, ...req.body, updated_at: nowIso() };
      db.prepare(
        `UPDATE transactions SET
           amount=?, kind=?, category_id=?, payment_method=?, date=?,
           description=?, note=?, recurring_id=?, updated_at=?
         WHERE id=?`
      ).run(
        Math.abs(n.amount),
        n.kind,
        n.category_id,
        n.payment_method,
        n.date,
        n.description,
        n.note,
        n.recurring_id,
        n.updated_at,
        cur.id
      );
      return db.prepare('SELECT * FROM transactions WHERE id = ?').get(cur.id) as Transaction;
    }
  );

  app.delete<{ Params: { id: string } }>('/transactions/:id', (req) => {
    const r = db
      .prepare('DELETE FROM transactions WHERE id = ? AND workspace_id IS ?')
      .run(req.params.id, req.workspaceId ?? null);
    if (r.changes === 0) throw new Error('not found');
    return { ok: true };
  });

  // ---------- Summary / analytics ----------
  // One endpoint returns aggregates for a given date range.
  // Front-end derives per-month, top-categories, biggest transactions itself
  // from the raw list — keeping the API minimal and the renderer in charge of
  // pretty groupings.

  app.get<{ Querystring: { from?: string; to?: string } }>('/transactions/summary', (req) => {
    const { from, to } = req.query;
    const where: string[] = ['workspace_id IS ?'];
    const params: unknown[] = [req.workspaceId ?? null];
    if (from) { where.push('date >= ?'); params.push(from); }
    if (to) { where.push('date <= ?'); params.push(to); }
    const whereSql = `WHERE ${where.join(' AND ')}`;

    const totals = db
      .prepare(
        `SELECT
           COALESCE(SUM(CASE WHEN kind='expense' THEN amount END), 0) AS total_expense,
           COALESCE(SUM(CASE WHEN kind='income'  THEN amount END), 0) AS total_income,
           COUNT(*) AS count
         FROM transactions ${whereSql}`
      )
      .get(...params) as { total_expense: number; total_income: number; count: number };

    const byCategory = db
      .prepare(
        `SELECT category_id, kind, COALESCE(SUM(amount), 0) AS amount
         FROM transactions ${whereSql}
         GROUP BY category_id, kind`
      )
      .all(...params) as { category_id: string | null; kind: TransactionKind; amount: number }[];

    const byDay = db
      .prepare(
        `SELECT date,
                COALESCE(SUM(CASE WHEN kind='expense' THEN amount END), 0) AS expense,
                COALESCE(SUM(CASE WHEN kind='income'  THEN amount END), 0) AS income
         FROM transactions ${whereSql}
         GROUP BY date
         ORDER BY date`
      )
      .all(...params) as { date: string; expense: number; income: number }[];

    const out: TransactionSummary = {
      total_expense: totals.total_expense,
      total_income: totals.total_income,
      by_category: byCategory,
      by_day: byDay,
      count: totals.count
    };
    return out;
  });

  // ---------- Recurring templates ----------

  app.get('/recurring-transactions', (req) => {
    return db
      .prepare(
        'SELECT * FROM recurring_transactions WHERE workspace_id IS ? ORDER BY archived, created_at'
      )
      .all(req.workspaceId ?? null) as RecurringTransaction[];
  });

  app.post<{ Body: RecurringInput }>('/recurring-transactions', (req) => {
    const id = nanoid();
    const t = nowIso();
    const b = req.body;
    db.prepare(
      `INSERT INTO recurring_transactions
       (id, amount, kind, category_id, payment_method, description, period,
        day_of_month, day_of_week, reminder_enabled, remind_time, archived, created_at, updated_at, workspace_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      id,
      Math.abs(b.amount),
      b.kind ?? 'expense',
      b.category_id ?? null,
      b.payment_method ?? 'card',
      b.description,
      b.period ?? 'monthly',
      b.day_of_month ?? null,
      b.day_of_week ?? null,
      b.reminder_enabled ?? 1,
      b.remind_time ?? null,
      b.archived ?? 0,
      t,
      t,
      req.workspaceId ?? null
    );
    return db
      .prepare('SELECT * FROM recurring_transactions WHERE id = ?')
      .get(id) as RecurringTransaction;
  });

  app.patch<{ Params: { id: string }; Body: Partial<RecurringInput> & { last_reminded_on?: string | null } }>(
    '/recurring-transactions/:id',
    (req) => {
      const cur = db
        .prepare('SELECT * FROM recurring_transactions WHERE id = ? AND workspace_id IS ?')
        .get(req.params.id, req.workspaceId ?? null) as RecurringTransaction | undefined;
      if (!cur) throw new Error('not found');
      const n = { ...cur, ...req.body, updated_at: nowIso() };
      db.prepare(
        `UPDATE recurring_transactions SET
           amount=?, kind=?, category_id=?, payment_method=?, description=?,
           period=?, day_of_month=?, day_of_week=?, reminder_enabled=?, remind_time=?,
           last_reminded_on=?, archived=?, updated_at=?
         WHERE id=?`
      ).run(
        Math.abs(n.amount),
        n.kind,
        n.category_id,
        n.payment_method,
        n.description,
        n.period,
        n.day_of_month,
        n.day_of_week,
        n.reminder_enabled,
        n.remind_time,
        n.last_reminded_on,
        n.archived,
        n.updated_at,
        cur.id
      );
      return db
        .prepare('SELECT * FROM recurring_transactions WHERE id = ?')
        .get(cur.id) as RecurringTransaction;
    }
  );

  app.delete<{ Params: { id: string } }>('/recurring-transactions/:id', (req) => {
    const r = db
      .prepare('DELETE FROM recurring_transactions WHERE id = ? AND workspace_id IS ?')
      .run(req.params.id, req.workspaceId ?? null);
    if (r.changes === 0) throw new Error('not found');
    return { ok: true };
  });
}
