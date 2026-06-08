import type { FastifyInstance } from 'fastify';
import { db } from '../db.js';
import { listBackups, createBackup } from '../backup.js';

const TABLES = [
  {
    name: 'projects',
    columns: ['id', 'name', 'color', 'icon', 'description', 'archived', 'sort_order', 'created_at', 'updated_at']
  },
  {
    name: 'tasks',
    columns: [
      'id',
      'title',
      'description',
      'project_id',
      'parent_task_id',
      'status',
      'priority',
      'difficulty',
      'due_date',
      'due_time',
      'estimated_min',
      'tags',
      'sort_order',
      'created_at',
      'updated_at',
      'completed_at'
    ]
  },
  {
    name: 'work_sessions',
    columns: ['id', 'date', 'started_at', 'ended_at', 'type', 'task_id', 'notes']
  },
  {
    name: 'task_time_logs',
    columns: ['id', 'task_id', 'started_at', 'ended_at', 'duration_s', 'date']
  },
  {
    name: 'notes',
    columns: ['id', 'content', 'type', 'task_id', 'project_id', 'date', 'pinned', 'tags', 'created_at', 'updated_at']
  },
  {
    name: 'journal_entries',
    columns: [
      'id',
      'date',
      'what_done',
      'reflection',
      'mood',
      'total_work_s',
      'total_pause_s',
      'tasks_done',
      'created_at',
      'updated_at'
    ]
  },
  {
    name: 'calendar_events',
    columns: [
      'id',
      'title',
      'date',
      'start_time',
      'end_time',
      'description',
      'project_id',
      'task_id',
      'reminder_min',
      'color',
      'type',
      'created_at',
      'updated_at'
    ]
  },
  {
    name: 'reminders',
    columns: ['id', 'title', 'datetime', 'task_id', 'event_id', 'fired', 'snoozed_to', 'created_at']
  },
  {
    name: 'playbooks',
    columns: ['id', 'title', 'description', 'content', 'project_id', 'icon', 'color', 'archived', 'sort_order', 'created_at', 'updated_at']
  },
  {
    name: 'playbook_steps',
    columns: ['id', 'playbook_id', 'title', 'description', 'sort_order', 'created_at']
  },
  {
    name: 'playbook_runs',
    columns: ['id', 'playbook_id', 'playbook_title', 'title', 'content', 'notes', 'started_at', 'completed_at', 'created_at', 'updated_at']
  },
  {
    name: 'playbook_run_steps',
    columns: ['id', 'run_id', 'step_id', 'title', 'description', 'sort_order', 'completed_at', 'notes']
  },
  {
    name: 'habits',
    columns: [
      'id',
      'title',
      'description',
      'icon',
      'color',
      'cadence',
      'cadence_config',
      'target_count',
      'remind_time',
      'confirm_window_h',
      'archived',
      'sort_order',
      'created_at',
      'updated_at'
    ]
  },
  {
    name: 'habit_logs',
    columns: ['id', 'habit_id', 'date', 'count', 'status', 'note', 'created_at']
  },
  {
    name: 'habit_period_results',
    columns: ['id', 'habit_id', 'period_kind', 'period_start', 'status', 'count_actual', 'target', 'created_at']
  },
  {
    name: 'expense_categories',
    columns: ['id', 'name', 'icon', 'color', 'kind', 'monthly_limit', 'archived', 'sort_order', 'created_at', 'updated_at']
  },
  {
    name: 'recurring_transactions',
    columns: [
      'id',
      'amount',
      'kind',
      'category_id',
      'payment_method',
      'description',
      'period',
      'day_of_month',
      'day_of_week',
      'reminder_enabled',
      'remind_time',
      'last_reminded_on',
      'archived',
      'created_at',
      'updated_at'
    ]
  },
  {
    name: 'transactions',
    columns: ['id', 'amount', 'kind', 'category_id', 'payment_method', 'date', 'description', 'note', 'recurring_id', 'created_at', 'updated_at']
  },
  {
    name: 'mind_maps',
    columns: ['id', 'title', 'content', 'theme', 'created_at', 'updated_at']
  }
] as const;

type TableName = (typeof TABLES)[number]['name'];
type DataExport = Partial<Record<TableName, Record<string, unknown>[]>> & {
  exported_at?: string;
  version?: number;
  events?: Record<string, unknown>[];
  journal?: Record<string, unknown>[];
  habitLogs?: Record<string, unknown>[];
  settings?: Record<string, string> | { key: string; value: string }[];
};

const LEGACY_KEYS: Partial<Record<TableName, keyof DataExport>> = {
  calendar_events: 'events',
  journal_entries: 'journal',
  habit_logs: 'habitLogs'
};

function rowsFor(table: TableName, body: DataExport): Record<string, unknown>[] {
  const value = body[table] ?? body[LEGACY_KEYS[table] as keyof DataExport];
  return Array.isArray(value) ? value.filter((row) => row && typeof row === 'object') : [];
}

function settingsRows(settings: DataExport['settings']): { key: string; value: string }[] {
  if (!settings) return [];
  if (Array.isArray(settings)) {
    return settings
      .filter((row) => row && typeof row.key === 'string')
      .map((row) => ({ key: row.key, value: String(row.value ?? '') }));
  }
  return Object.entries(settings).map(([key, value]) => ({ key, value: String(value) }));
}

export function registerData(app: FastifyInstance): void {
  app.get('/data/export', () => {
    const out: DataExport = {
      exported_at: new Date().toISOString(),
      version: 1
    };

    for (const table of TABLES) {
      out[table.name] = db.prepare(`SELECT * FROM ${table.name}`).all() as Record<string, unknown>[];
    }

    const settings = db.prepare('SELECT key, value FROM settings').all() as { key: string; value: string }[];
    out.settings = Object.fromEntries(settings.map((row) => [row.key, row.value]));
    return out;
  });

  app.post<{ Body: DataExport }>('/data/import', (req) => {
    const body = req.body ?? {};
    const counts: Record<string, number> = {};

    const tx = db.transaction(() => {
      for (const table of TABLES) {
        const placeholders = table.columns.map(() => '?').join(', ');
        const stmt = db.prepare(
          `INSERT OR REPLACE INTO ${table.name} (${table.columns.join(', ')}) VALUES (${placeholders})`
        );
        let inserted = 0;
        for (const row of rowsFor(table.name, body)) {
          stmt.run(...table.columns.map((column) => row[column] ?? null));
          inserted++;
        }
        counts[table.name] = inserted;
      }

      const settings = settingsRows(body.settings);
      const stmt = db.prepare(
        `INSERT INTO settings (key, value) VALUES (?, ?)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value`
      );
      for (const row of settings) stmt.run(row.key, row.value);
      counts.settings = settings.length;

      const violations = db.prepare('PRAGMA foreign_key_check').all() as unknown[];
      if (violations.length > 0) {
        throw new Error(`import contains broken links (${violations.length})`);
      }
    });

    db.pragma('foreign_keys = OFF');
    try {
      tx();
    } finally {
      db.pragma('foreign_keys = ON');
    }
    return { ok: true, counts };
  });

  app.get('/data/backups', () => listBackups());

  app.post('/data/backup', async () => {
    const file = await createBackup();
    return { ok: true, file };
  });

  app.delete('/data', () => {
    const counts: Record<string, number> = {};
    const tx = db.transaction(() => {
      for (const table of [...TABLES].reverse()) {
        const result = db.prepare(`DELETE FROM ${table.name}`).run();
        counts[table.name] = result.changes;
      }
      counts.settings = db.prepare('DELETE FROM settings').run().changes;
    });

    tx();
    return { ok: true, counts };
  });
}
