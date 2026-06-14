import type { FastifyInstance } from 'fastify';
import { nanoid } from 'nanoid';
import { db, nowIso } from '../db.js';
import { toMskParts } from '@swit/shared';
import type {
  Agency,
  AgencyAssignment,
  AgencyChatter,
  AgencyLead,
  AgencyLeadPayout,
  AgencyModel,
  AgencyPayoutKinds,
  AgencyPayoutRow,
  AgencyPayoutRule,
  AgencyPayoutSummary,
  AgencySale,
  AgencySaleKind,
  AgencyShift,
  ParsedSale
} from '@swit/shared';

const DEFAULT_PAYOUT_KINDS: AgencyPayoutKinds = {
  message: true,
  tip: true,
  post: true,
  subscription: true,
  other: true
};

const PALETTE = [
  '#2563EB', '#DB2777', '#16A34A', '#D97706', '#7C3AED',
  '#0891B2', '#DC2626', '#4F46E5', '#059669', '#CA8A04'
];

function pickColor(): string {
  return PALETTE[Math.floor(Math.random() * PALETTE.length)];
}

// Сравнение денежных сумм в целых центах — без дрейфа IEEE 754.
function cents(n: number): number {
  return Math.round(n * 100);
}

function parseKinds(raw: string | null | undefined): AgencyPayoutKinds {
  if (!raw) return DEFAULT_PAYOUT_KINDS;
  try {
    return { ...DEFAULT_PAYOUT_KINDS, ...(JSON.parse(raw) as Partial<AgencyPayoutKinds>) };
  } catch {
    return DEFAULT_PAYOUT_KINDS;
  }
}

// Подтверждает, что агентство принадлежит активному пространству. Возвращает строку
// либо бросает «not found». Используется как охранник для всех дочерних операций.
function requireAgency(ws: string | null, agencyId: string): Agency {
  const row = db
    .prepare('SELECT * FROM agencies WHERE id = ? AND workspace_id IS ?')
    .get(agencyId, ws) as Agency | undefined;
  if (!row) throw new Error('not found');
  return row;
}

interface AgencyInput {
  name: string;
  source_tz_offset?: number;
  default_percent?: number;
  commission_percent?: number;
  base_salary?: number;
  payout_kinds?: AgencyPayoutKinds | null;
}

interface LeadInput {
  agency_id: string;
  name: string;
  share_percent?: number;
  trc20?: string | null;
  color?: string | null;
  active?: number;
  notes?: string | null;
  sort_order?: number;
}

interface ModelInput {
  agency_id: string;
  name: string;
  of_username?: string | null;
  active?: number;
  notes?: string | null;
  sort_order?: number;
}

interface ChatterInput {
  agency_id: string;
  name: string;
  telegram?: string | null;
  experience?: string | null;
  trc20?: string | null;
  percent?: number | null;
  shift?: AgencyShift | null;
  color?: string | null;
  active?: number;
  notes?: string | null;
  sort_order?: number;
}

interface RuleInput {
  agency_id: string;
  amount: number;
  match_kind?: AgencySaleKind | null;
  label?: string | null;
  active?: number;
}

export function registerAgency(app: FastifyInstance): void {
  // ---------- Agencies ----------

  app.get('/agency/agencies', (req) => {
    return db
      .prepare('SELECT * FROM agencies WHERE workspace_id IS ? ORDER BY created_at')
      .all(req.workspaceId ?? null) as Agency[];
  });

  app.post<{ Body: AgencyInput }>('/agency/agencies', (req) => {
    const id = nanoid();
    const t = nowIso();
    const b = req.body;
    db.prepare(
      `INSERT INTO agencies (id, name, source_tz_offset, default_percent, commission_percent, base_salary, payout_kinds, created_at, updated_at, workspace_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      id,
      b.name,
      b.source_tz_offset ?? 300,
      b.default_percent ?? 5,
      b.commission_percent ?? 5,
      b.base_salary ?? 0,
      b.payout_kinds ? JSON.stringify(b.payout_kinds) : null,
      t,
      t,
      req.workspaceId ?? null
    );
    return db.prepare('SELECT * FROM agencies WHERE id = ?').get(id) as Agency;
  });

  app.patch<{ Params: { id: string }; Body: Partial<AgencyInput> }>('/agency/agencies/:id', (req) => {
    const cur = requireAgency(req.workspaceId ?? null, req.params.id);
    const b = req.body;
    const next = {
      name: b.name ?? cur.name,
      source_tz_offset: b.source_tz_offset ?? cur.source_tz_offset,
      default_percent: b.default_percent ?? cur.default_percent,
      commission_percent: b.commission_percent ?? cur.commission_percent,
      base_salary: b.base_salary ?? cur.base_salary,
      payout_kinds:
        b.payout_kinds !== undefined
          ? b.payout_kinds
            ? JSON.stringify(b.payout_kinds)
            : null
          : cur.payout_kinds
    };
    db.prepare(
      `UPDATE agencies SET name=?, source_tz_offset=?, default_percent=?, commission_percent=?, base_salary=?, payout_kinds=?, updated_at=? WHERE id=?`
    ).run(
      next.name,
      next.source_tz_offset,
      next.default_percent,
      next.commission_percent,
      next.base_salary,
      next.payout_kinds,
      nowIso(),
      cur.id
    );
    return db.prepare('SELECT * FROM agencies WHERE id = ?').get(cur.id) as Agency;
  });

  app.delete<{ Params: { id: string } }>('/agency/agencies/:id', (req) => {
    const r = db
      .prepare('DELETE FROM agencies WHERE id = ? AND workspace_id IS ?')
      .run(req.params.id, req.workspaceId ?? null);
    if (r.changes === 0) throw new Error('not found');
    return { ok: true };
  });

  // ---------- Models ----------

  app.get<{ Querystring: { agency_id?: string } }>('/agency/models', (req) => {
    const ws = req.workspaceId ?? null;
    if (req.query.agency_id) requireAgency(ws, req.query.agency_id);
    const where = ['workspace_id IS ?'];
    const params: unknown[] = [ws];
    if (req.query.agency_id) {
      where.push('agency_id = ?');
      params.push(req.query.agency_id);
    }
    return db
      .prepare(`SELECT * FROM agency_models WHERE ${where.join(' AND ')} ORDER BY sort_order, name`)
      .all(...params) as AgencyModel[];
  });

  app.post<{ Body: ModelInput }>('/agency/models', (req) => {
    const ws = req.workspaceId ?? null;
    requireAgency(ws, req.body.agency_id);
    const id = nanoid();
    const t = nowIso();
    const b = req.body;
    db.prepare(
      `INSERT INTO agency_models (id, agency_id, name, of_username, active, notes, sort_order, created_at, updated_at, workspace_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      id,
      b.agency_id,
      b.name,
      b.of_username ?? null,
      b.active ?? 1,
      b.notes ?? null,
      b.sort_order ?? 0,
      t,
      t,
      ws
    );
    return db.prepare('SELECT * FROM agency_models WHERE id = ?').get(id) as AgencyModel;
  });

  app.patch<{ Params: { id: string }; Body: Partial<ModelInput> }>('/agency/models/:id', (req) => {
    const cur = db
      .prepare('SELECT * FROM agency_models WHERE id = ? AND workspace_id IS ?')
      .get(req.params.id, req.workspaceId ?? null) as AgencyModel | undefined;
    if (!cur) throw new Error('not found');
    const n = { ...cur, ...req.body, updated_at: nowIso() };
    db.prepare(
      `UPDATE agency_models SET name=?, of_username=?, active=?, notes=?, sort_order=?, updated_at=? WHERE id=?`
    ).run(n.name, n.of_username, n.active, n.notes, n.sort_order, n.updated_at, cur.id);
    return db.prepare('SELECT * FROM agency_models WHERE id = ?').get(cur.id) as AgencyModel;
  });

  app.delete<{ Params: { id: string } }>('/agency/models/:id', (req) => {
    const r = db
      .prepare('DELETE FROM agency_models WHERE id = ? AND workspace_id IS ?')
      .run(req.params.id, req.workspaceId ?? null);
    if (r.changes === 0) throw new Error('not found');
    return { ok: true };
  });

  // ---------- Chatters ----------

  app.get<{ Querystring: { agency_id?: string } }>('/agency/chatters', (req) => {
    const ws = req.workspaceId ?? null;
    if (req.query.agency_id) requireAgency(ws, req.query.agency_id);
    const where = ['workspace_id IS ?'];
    const params: unknown[] = [ws];
    if (req.query.agency_id) {
      where.push('agency_id = ?');
      params.push(req.query.agency_id);
    }
    return db
      .prepare(`SELECT * FROM agency_chatters WHERE ${where.join(' AND ')} ORDER BY sort_order, name`)
      .all(...params) as AgencyChatter[];
  });

  app.post<{ Body: ChatterInput }>('/agency/chatters', (req) => {
    const ws = req.workspaceId ?? null;
    requireAgency(ws, req.body.agency_id);
    const id = nanoid();
    const t = nowIso();
    const b = req.body;
    db.prepare(
      `INSERT INTO agency_chatters
       (id, agency_id, name, telegram, experience, trc20, percent, shift, color, active, notes, sort_order, created_at, updated_at, workspace_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      id,
      b.agency_id,
      b.name,
      b.telegram ?? null,
      b.experience ?? null,
      b.trc20 ?? null,
      b.percent ?? null,
      b.shift ?? null,
      b.color ?? pickColor(),
      b.active ?? 1,
      b.notes ?? null,
      b.sort_order ?? 0,
      t,
      t,
      ws
    );
    return db.prepare('SELECT * FROM agency_chatters WHERE id = ?').get(id) as AgencyChatter;
  });

  app.patch<{ Params: { id: string }; Body: Partial<ChatterInput> }>(
    '/agency/chatters/:id',
    (req) => {
      const cur = db
        .prepare('SELECT * FROM agency_chatters WHERE id = ? AND workspace_id IS ?')
        .get(req.params.id, req.workspaceId ?? null) as AgencyChatter | undefined;
      if (!cur) throw new Error('not found');
      const n = { ...cur, ...req.body, updated_at: nowIso() };
      db.prepare(
        `UPDATE agency_chatters SET
           name=?, telegram=?, experience=?, trc20=?, percent=?, shift=?, color=?, active=?, notes=?, sort_order=?, updated_at=?
         WHERE id=?`
      ).run(
        n.name,
        n.telegram,
        n.experience,
        n.trc20,
        n.percent ?? null,
        n.shift ?? null,
        n.color,
        n.active,
        n.notes,
        n.sort_order,
        n.updated_at,
        cur.id
      );
      return db.prepare('SELECT * FROM agency_chatters WHERE id = ?').get(cur.id) as AgencyChatter;
    }
  );

  app.delete<{ Params: { id: string } }>('/agency/chatters/:id', (req) => {
    const r = db
      .prepare('DELETE FROM agency_chatters WHERE id = ? AND workspace_id IS ?')
      .run(req.params.id, req.workspaceId ?? null);
    if (r.changes === 0) throw new Error('not found');
    return { ok: true };
  });

  // ---------- Assignments (закрепление чаттера за моделью+сменой) ----------

  app.get<{ Querystring: { agency_id?: string; model_id?: string } }>(
    '/agency/assignments',
    (req) => {
      const ws = req.workspaceId ?? null;
      const where = ['workspace_id IS ?'];
      const params: unknown[] = [ws];
      if (req.query.agency_id) {
        where.push('agency_id = ?');
        params.push(req.query.agency_id);
      }
      if (req.query.model_id) {
        where.push('model_id = ?');
        params.push(req.query.model_id);
      }
      return db
        .prepare(`SELECT * FROM agency_assignments WHERE ${where.join(' AND ')}`)
        .all(...params) as AgencyAssignment[];
    }
  );

  // Установить или снять чаттера на слот (модель+смена). chatter_id=null → снять.
  app.put<{
    Body: { agency_id: string; model_id: string; shift: AgencyShift; chatter_id: string | null };
  }>('/agency/assignments', (req) => {
    const ws = req.workspaceId ?? null;
    const { agency_id, model_id, shift, chatter_id } = req.body;
    requireAgency(ws, agency_id);
    const model = db
      .prepare('SELECT id FROM agency_models WHERE id = ? AND agency_id = ? AND workspace_id IS ?')
      .get(model_id, agency_id, ws);
    if (!model) throw new Error('not found');

    db.prepare(
      'DELETE FROM agency_assignments WHERE model_id = ? AND shift = ? AND workspace_id IS ?'
    ).run(model_id, shift, ws);

    if (chatter_id) {
      const chatter = db
        .prepare('SELECT id FROM agency_chatters WHERE id = ? AND agency_id = ? AND workspace_id IS ?')
        .get(chatter_id, agency_id, ws);
      if (!chatter) throw new Error('not found');
      db.prepare(
        `INSERT INTO agency_assignments (id, agency_id, model_id, chatter_id, shift, created_at, workspace_id)
         VALUES (?, ?, ?, ?, ?, ?, ?)`
      ).run(nanoid(), agency_id, model_id, chatter_id, shift, nowIso(), ws);
    }
    return { ok: true };
  });

  // ---------- Payout rules ----------

  app.get<{ Querystring: { agency_id?: string } }>('/agency/payout-rules', (req) => {
    const ws = req.workspaceId ?? null;
    const where = ['workspace_id IS ?'];
    const params: unknown[] = [ws];
    if (req.query.agency_id) {
      where.push('agency_id = ?');
      params.push(req.query.agency_id);
    }
    return db
      .prepare(`SELECT * FROM agency_payout_rules WHERE ${where.join(' AND ')} ORDER BY created_at`)
      .all(...params) as AgencyPayoutRule[];
  });

  app.post<{ Body: RuleInput }>('/agency/payout-rules', (req) => {
    const ws = req.workspaceId ?? null;
    requireAgency(ws, req.body.agency_id);
    const id = nanoid();
    const b = req.body;
    db.prepare(
      `INSERT INTO agency_payout_rules (id, agency_id, match_kind, amount, label, active, created_at, workspace_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(id, b.agency_id, b.match_kind ?? null, b.amount, b.label ?? null, b.active ?? 1, nowIso(), ws);
    return db.prepare('SELECT * FROM agency_payout_rules WHERE id = ?').get(id) as AgencyPayoutRule;
  });

  app.patch<{ Params: { id: string }; Body: Partial<RuleInput> }>(
    '/agency/payout-rules/:id',
    (req) => {
      const cur = db
        .prepare('SELECT * FROM agency_payout_rules WHERE id = ? AND workspace_id IS ?')
        .get(req.params.id, req.workspaceId ?? null) as AgencyPayoutRule | undefined;
      if (!cur) throw new Error('not found');
      const n = { ...cur, ...req.body };
      db.prepare(
        `UPDATE agency_payout_rules SET match_kind=?, amount=?, label=?, active=? WHERE id=?`
      ).run(n.match_kind ?? null, n.amount, n.label, n.active, cur.id);
      return db
        .prepare('SELECT * FROM agency_payout_rules WHERE id = ?')
        .get(cur.id) as AgencyPayoutRule;
    }
  );

  app.delete<{ Params: { id: string } }>('/agency/payout-rules/:id', (req) => {
    const r = db
      .prepare('DELETE FROM agency_payout_rules WHERE id = ? AND workspace_id IS ?')
      .run(req.params.id, req.workspaceId ?? null);
    if (r.changes === 0) throw new Error('not found');
    return { ok: true };
  });

  // ---------- Sales ----------

  app.get<{
    Querystring: {
      agency_id?: string;
      model_id?: string;
      chatter_id?: string;
      shift?: string;
      kind?: string;
      from?: string;
      to?: string;
      limit?: string;
    };
  }>('/agency/sales', (req) => {
    const ws = req.workspaceId ?? null;
    const q = req.query;
    const where = ['workspace_id IS ?'];
    const params: unknown[] = [ws];
    if (q.agency_id) { where.push('agency_id = ?'); params.push(q.agency_id); }
    if (q.model_id) { where.push('model_id = ?'); params.push(q.model_id); }
    if (q.chatter_id) {
      if (q.chatter_id === 'none') where.push('chatter_id IS NULL');
      else { where.push('chatter_id = ?'); params.push(q.chatter_id); }
    }
    if (q.shift) { where.push('shift = ?'); params.push(q.shift); }
    if (q.kind) { where.push('kind = ?'); params.push(q.kind); }
    if (q.from) { where.push('local_date >= ?'); params.push(q.from); }
    if (q.to) { where.push('local_date <= ?'); params.push(q.to); }
    const lim = q.limit ? Math.min(5000, Math.max(1, parseInt(q.limit, 10) || 1000)) : 1000;
    return db
      .prepare(
        `SELECT * FROM agency_sales WHERE ${where.join(' AND ')}
         ORDER BY occurred_at DESC LIMIT ${lim}`
      )
      .all(...params) as AgencySale[];
  });

  // Импорт распарсенных на клиенте продаж: сервер считает смену/чаттера,
  // применяет правила исключения и дедуп. Возвращает вставленные + счётчики.
  app.post<{ Body: { agency_id: string; model_id: string; sales: ParsedSale[] } }>(
    '/agency/sales/import',
    (req) => {
      const ws = req.workspaceId ?? null;
      const { agency_id, model_id, sales } = req.body;
      const agency = requireAgency(ws, agency_id);
      const model = db
        .prepare('SELECT id FROM agency_models WHERE id = ? AND agency_id = ? AND workspace_id IS ?')
        .get(model_id, agency_id, ws);
      if (!model) throw new Error('not found');
      if (!Array.isArray(sales)) throw new Error('sales must be an array');

      const kinds = parseKinds(agency.payout_kinds);
      const rules = db
        .prepare('SELECT * FROM agency_payout_rules WHERE agency_id = ? AND workspace_id IS ? AND active = 1')
        .all(agency_id, ws) as AgencyPayoutRule[];

      const insert = db.prepare(
        `INSERT OR IGNORE INTO agency_sales
         (id, agency_id, model_id, chatter_id, occurred_at, local_date, shift, amount, fee, net,
          kind, fan_name, counts_for_payout, excluded_reason, dedup_key, raw_line, created_at, updated_at, workspace_id)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      );

      let inserted = 0;
      let skipped = 0;
      const insertedIds: string[] = [];

      const tx = db.transaction(() => {
        for (const s of sales) {
          // Дату считаем в МСК; смену и чаттера НЕ определяем автоматически —
          // пользователь сам выберет чаттера на продаже, смена возьмётся из него.
          const parts = toMskParts(s, agency.source_tz_offset);
          const chatterId: string | null = null;

          // Считается ли в ЗП: сначала по типу, затем правила исключения по сумме.
          let counts = kinds[s.kind] !== false;
          let reason: string | null = null;
          if (!counts) reason = 'Тип не учитывается в ЗП';
          for (const rule of rules) {
            if (rule.match_kind && rule.match_kind !== s.kind) continue;
            if (cents(rule.amount) === cents(s.amount)) {
              counts = false;
              reason = rule.label || 'Исключено правилом';
              break;
            }
          }

          const dedup = `${model_id}|${parts.occurredAtUtc}|${s.amount.toFixed(2)}|${s.kind}|${s.fan_name ?? ''}`;
          const id = nanoid();
          const t = nowIso();
          const r = insert.run(
            id,
            agency_id,
            model_id,
            chatterId,
            parts.occurredAtUtc,
            parts.mskDate,
            null, // смена определится при назначении чаттера
            s.amount,
            s.fee,
            s.net,
            s.kind,
            s.fan_name ?? null,
            counts ? 1 : 0,
            reason,
            dedup,
            s.raw_line ?? null,
            t,
            t,
            ws
          );
          if (r.changes > 0) {
            inserted++;
            insertedIds.push(id);
          } else {
            skipped++;
          }
        }
      });
      tx();

      const rows =
        insertedIds.length > 0
          ? (db
              .prepare(
                `SELECT * FROM agency_sales WHERE workspace_id IS ? AND id IN (${insertedIds.map(() => '?').join(',')})`
              )
              .all(ws, ...insertedIds) as AgencySale[])
          : [];
      return { ok: true, inserted, skipped, sales: rows };
    }
  );

  app.patch<{
    Params: { id: string };
    Body: Partial<Pick<AgencySale, 'chatter_id' | 'counts_for_payout' | 'excluded_reason' | 'kind'>>;
  }>('/agency/sales/:id', (req) => {
    const ws = req.workspaceId ?? null;
    const cur = db
      .prepare('SELECT * FROM agency_sales WHERE id = ? AND workspace_id IS ?')
      .get(req.params.id, ws) as AgencySale | undefined;
    if (!cur) throw new Error('not found');
    const n = { ...cur, ...req.body, updated_at: nowIso() };

    // Смена продажи следует за назначенным чаттером (у каждого фиксированная смена).
    // Чаттер обязан принадлежать тому же агентству, что и продажа.
    let shift = cur.shift;
    if ('chatter_id' in req.body) {
      if (n.chatter_id) {
        const ch = db
          .prepare('SELECT shift FROM agency_chatters WHERE id = ? AND agency_id = ? AND workspace_id IS ?')
          .get(n.chatter_id, cur.agency_id, ws) as { shift: string | null } | undefined;
        if (!ch) throw new Error('not found');
        shift = (ch.shift as AgencySale['shift']) ?? null;
      } else {
        shift = null;
      }
    }

    // Явное переключение «в ЗП» пользователем помечаем ручным — пересчёт его не тронет.
    const manual = 'counts_for_payout' in req.body ? 1 : cur.manual_payout;

    db.prepare(
      `UPDATE agency_sales SET chatter_id=?, shift=?, counts_for_payout=?, excluded_reason=?, manual_payout=?, kind=?, updated_at=? WHERE id=?`
    ).run(
      n.chatter_id ?? null,
      shift,
      n.counts_for_payout,
      n.excluded_reason ?? null,
      manual,
      n.kind,
      n.updated_at,
      cur.id
    );
    return db.prepare('SELECT * FROM agency_sales WHERE id = ? AND workspace_id IS ?').get(cur.id, ws) as AgencySale;
  });

  app.delete<{ Params: { id: string } }>('/agency/sales/:id', (req) => {
    const r = db
      .prepare('DELETE FROM agency_sales WHERE id = ? AND workspace_id IS ?')
      .run(req.params.id, req.workspaceId ?? null);
    if (r.changes === 0) throw new Error('not found');
    return { ok: true };
  });

  // Пересчёт продаж по текущим настройкам агентства (типы в ЗП + правила сумм)
  // и пересинхронизация смены продажи со сменой назначенного чаттера.
  app.post<{ Body: { agency_id: string } }>('/agency/sales/recompute', (req) => {
    const ws = req.workspaceId ?? null;
    const { agency_id } = req.body;
    const agency = requireAgency(ws, agency_id);
    const kinds = parseKinds(agency.payout_kinds);
    const rules = db
      .prepare('SELECT * FROM agency_payout_rules WHERE agency_id = ? AND workspace_id IS ? AND active = 1')
      .all(agency_id, ws) as AgencyPayoutRule[];
    const sales = db
      .prepare('SELECT * FROM agency_sales WHERE agency_id = ? AND workspace_id IS ?')
      .all(agency_id, ws) as AgencySale[];
    const chatters = db
      .prepare('SELECT id, shift FROM agency_chatters WHERE agency_id = ? AND workspace_id IS ?')
      .all(agency_id, ws) as { id: string; shift: AgencySale['shift'] }[];
    const shiftById = new Map(chatters.map((c) => [c.id, c.shift]));

    const upd = db.prepare(
      'UPDATE agency_sales SET counts_for_payout = ?, excluded_reason = ?, shift = ?, updated_at = ? WHERE id = ?'
    );
    const shiftUpd = db.prepare('UPDATE agency_sales SET shift = ?, updated_at = ? WHERE id = ?');
    let updated = 0;
    const tx = db.transaction(() => {
      for (const s of sales) {
        const shift = s.chatter_id ? shiftById.get(s.chatter_id) ?? null : null;
        // Ручное переопределение «в ЗП» не трогаем — синхронизируем только смену.
        if (s.manual_payout) {
          shiftUpd.run(shift, nowIso(), s.id);
          updated++;
          continue;
        }
        let counts = kinds[s.kind] !== false;
        let reason: string | null = counts ? null : 'Тип не учитывается в ЗП';
        for (const rule of rules) {
          if (rule.match_kind && rule.match_kind !== s.kind) continue;
          if (cents(rule.amount) === cents(s.amount)) {
            counts = false;
            reason = rule.label || 'Исключено правилом';
            break;
          }
        }
        upd.run(counts ? 1 : 0, reason, shift, nowIso(), s.id);
        updated++;
      }
    });
    tx();
    return { ok: true, updated };
  });

  // ---------- Team leads (тим-лиды: делят пул комиссии) ----------

  app.get<{ Querystring: { agency_id?: string } }>('/agency/leads', (req) => {
    const ws = req.workspaceId ?? null;
    if (req.query.agency_id) requireAgency(ws, req.query.agency_id);
    const where = ['workspace_id IS ?'];
    const params: unknown[] = [ws];
    if (req.query.agency_id) {
      where.push('agency_id = ?');
      params.push(req.query.agency_id);
    }
    return db
      .prepare(`SELECT * FROM agency_leads WHERE ${where.join(' AND ')} ORDER BY sort_order, name`)
      .all(...params) as AgencyLead[];
  });

  app.post<{ Body: LeadInput }>('/agency/leads', (req) => {
    const ws = req.workspaceId ?? null;
    requireAgency(ws, req.body.agency_id);
    const id = nanoid();
    const t = nowIso();
    const b = req.body;
    db.prepare(
      `INSERT INTO agency_leads
       (id, agency_id, name, share_percent, trc20, color, active, sort_order, notes, created_at, updated_at, workspace_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      id,
      b.agency_id,
      b.name,
      b.share_percent ?? 0,
      b.trc20 ?? null,
      b.color ?? pickColor(),
      b.active ?? 1,
      b.sort_order ?? 0,
      b.notes ?? null,
      t,
      t,
      ws
    );
    return db.prepare('SELECT * FROM agency_leads WHERE id = ?').get(id) as AgencyLead;
  });

  app.patch<{ Params: { id: string }; Body: Partial<LeadInput> }>('/agency/leads/:id', (req) => {
    const cur = db
      .prepare('SELECT * FROM agency_leads WHERE id = ? AND workspace_id IS ?')
      .get(req.params.id, req.workspaceId ?? null) as AgencyLead | undefined;
    if (!cur) throw new Error('not found');
    const n = { ...cur, ...req.body, updated_at: nowIso() };
    db.prepare(
      `UPDATE agency_leads SET name=?, share_percent=?, trc20=?, color=?, active=?, sort_order=?, notes=?, updated_at=? WHERE id=?`
    ).run(
      n.name,
      n.share_percent,
      n.trc20,
      n.color,
      n.active,
      n.sort_order,
      n.notes,
      n.updated_at,
      cur.id
    );
    return db.prepare('SELECT * FROM agency_leads WHERE id = ?').get(cur.id) as AgencyLead;
  });

  app.delete<{ Params: { id: string } }>('/agency/leads/:id', (req) => {
    const r = db
      .prepare('DELETE FROM agency_leads WHERE id = ? AND workspace_id IS ?')
      .run(req.params.id, req.workspaceId ?? null);
    if (r.changes === 0) throw new Error('not found');
    return { ok: true };
  });

  // ---------- Payouts (расчёт выплат за период) ----------

  app.get<{ Querystring: { agency_id?: string; from?: string; to?: string } }>(
    '/agency/payouts',
    (req) => {
      const ws = req.workspaceId ?? null;
      const { agency_id, from, to } = req.query;
      if (!agency_id) throw new Error('agency_id required');
      const agency = requireAgency(ws, agency_id);

      const where = ['workspace_id IS ?', 'agency_id = ?', 'counts_for_payout = 1', 'chatter_id IS NOT NULL'];
      const params: unknown[] = [ws, agency_id];
      if (from) { where.push('local_date >= ?'); params.push(from); }
      if (to) { where.push('local_date <= ?'); params.push(to); }
      const whereSql = where.join(' AND ');

      const grouped = db
        .prepare(
          `SELECT chatter_id, COUNT(*) AS cnt, COALESCE(SUM(net), 0) AS net_total
           FROM agency_sales WHERE ${whereSql} GROUP BY chatter_id`
        )
        .all(...params) as { chatter_id: string; cnt: number; net_total: number }[];

      const chatters = db
        .prepare('SELECT * FROM agency_chatters WHERE agency_id = ? AND workspace_id IS ?')
        .all(agency_id, ws) as AgencyChatter[];
      const byId = new Map(chatters.map((c) => [c.id, c]));

      const rows: AgencyPayoutRow[] = grouped.map((g) => {
        const c = byId.get(g.chatter_id);
        const percent = c?.percent ?? agency.default_percent;
        return {
          chatter_id: g.chatter_id,
          chatter_name: c?.name ?? '—',
          trc20: c?.trc20 ?? null,
          percent,
          sales_count: g.cnt,
          net_total: +g.net_total.toFixed(2),
          payout: +((g.net_total * percent) / 100).toFixed(2)
        };
      });
      rows.sort((a, b) => b.payout - a.payout);

      // Матрица «дата × чаттер» по тем же продажам, что идут в ЗП.
      const byDate = db
        .prepare(
          `SELECT local_date, chatter_id, COALESCE(SUM(net), 0) AS net
           FROM agency_sales WHERE ${whereSql}
           GROUP BY local_date, chatter_id ORDER BY local_date`
        )
        .all(...params) as { local_date: string; chatter_id: string | null; net: number }[];

      // Пул комиссии агентства = commission_percent% от NET, идущего в ЗП
      // (с учётом типов/правил), независимо от того, назначен ли чаттер.
      const commWhere = ['workspace_id IS ?', 'agency_id = ?', 'counts_for_payout = 1'];
      const commParams: unknown[] = [ws, agency_id];
      if (from) { commWhere.push('local_date >= ?'); commParams.push(from); }
      if (to) { commWhere.push('local_date <= ?'); commParams.push(to); }
      const commRow = db
        .prepare(`SELECT COALESCE(SUM(net), 0) AS net FROM agency_sales WHERE ${commWhere.join(' AND ')}`)
        .get(...commParams) as { net: number };
      const pool = +((commRow.net * agency.commission_percent) / 100).toFixed(2);

      const leadRows = db
        .prepare(
          'SELECT * FROM agency_leads WHERE agency_id = ? AND workspace_id IS ? AND active = 1 ORDER BY sort_order, name'
        )
        .all(agency_id, ws) as AgencyLead[];
      const leads: AgencyLeadPayout[] = leadRows.map((l) => ({
        lead_id: l.id,
        name: l.name,
        trc20: l.trc20,
        share_percent: l.share_percent,
        payout: +((pool * l.share_percent) / 100).toFixed(2)
      }));

      const out: AgencyPayoutSummary = {
        rows,
        by_date: byDate.map((d) => ({ ...d, net: +d.net.toFixed(2) })),
        net_total: +rows.reduce((s, r) => s + r.net_total, 0).toFixed(2),
        payout_total: +rows.reduce((s, r) => s + r.payout, 0).toFixed(2),
        commission_percent: agency.commission_percent,
        base_salary: agency.base_salary,
        pool,
        leads
      };
      return out;
    }
  );
}
