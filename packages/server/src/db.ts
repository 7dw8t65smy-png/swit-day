import Database from 'better-sqlite3';
import { SCHEMA_SQL } from '@swit/shared';
import { DB_PATH } from './config.js';

export const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// Migrations for existing databases — ALTER TABLE ADD COLUMN if missing.
// Must run BEFORE SCHEMA_SQL so that indexes created on new columns don't fail
// when the table already exists from a previous schema version.
function tableExists(name: string): boolean {
  const row = db
    .prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name=?`)
    .get(name) as { name: string } | undefined;
  return !!row;
}

function ensureColumn(table: string, name: string, def: string): void {
  if (!tableExists(table)) return;
  const cols = db.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[];
  if (!cols.some((c) => c.name === name)) {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${name} ${def}`);
  }
}

ensureColumn('tasks', 'difficulty', "TEXT DEFAULT 'medium'");
ensureColumn('tasks', 'parent_task_id', 'TEXT REFERENCES tasks(id)');
ensureColumn('playbooks', 'content', 'TEXT');
ensureColumn('playbook_runs', 'content', 'TEXT');
ensureColumn('habits', 'cadence_config', 'TEXT');
ensureColumn('habits', 'remind_time', 'TEXT');
ensureColumn('habits', 'confirm_window_h', 'INTEGER NOT NULL DEFAULT 6');
ensureColumn('habit_logs', 'status', "TEXT NOT NULL DEFAULT 'done'");
// Multi-user: назначение задачи участнику + цвет пользователя для подписи.
ensureColumn('tasks', 'assignee_id', 'TEXT');
ensureColumn('users', 'color', 'TEXT');
// Агентства: фиксированная смена чаттера + ручное переопределение «в ЗП».
ensureColumn('agency_chatters', 'shift', 'TEXT');
ensureColumn('agency_sales', 'manual_payout', 'INTEGER NOT NULL DEFAULT 0');

// Старая схема имела UNIQUE на journal_entries.date. Теперь допустимо
// несколько записей за один день. UNIQUE в SQLite не снимается ALTER'ом —
// нужно пересоздать таблицу.
function migrateJournalDropUnique(): void {
  if (!tableExists('journal_entries')) return;
  const auto = db
    .prepare(
      `SELECT name FROM sqlite_master
       WHERE type='index' AND tbl_name='journal_entries' AND name LIKE 'sqlite_autoindex_%'`
    )
    .all() as { name: string }[];
  if (auto.length === 0) return; // уже без UNIQUE — нечего делать
  db.exec(`
    BEGIN;
    CREATE TABLE journal_entries_new (
      id          TEXT PRIMARY KEY,
      date        TEXT NOT NULL,
      what_done   TEXT,
      reflection  TEXT,
      mood        INTEGER,
      total_work_s   INTEGER,
      total_pause_s  INTEGER,
      tasks_done  INTEGER DEFAULT 0,
      created_at  TEXT NOT NULL,
      updated_at  TEXT NOT NULL
    );
    INSERT INTO journal_entries_new
      (id, date, what_done, reflection, mood, total_work_s, total_pause_s, tasks_done, created_at, updated_at)
      SELECT id, date, what_done, reflection, mood, total_work_s, total_pause_s, tasks_done, created_at, updated_at
      FROM journal_entries;
    DROP TABLE journal_entries;
    ALTER TABLE journal_entries_new RENAME TO journal_entries;
    COMMIT;
  `);
}
migrateJournalDropUnique();

db.exec(SCHEMA_SQL);

// Контент-таблицы, разделяемые по пространствам (workspace). Один источник правды
// для миграции колонки и для scoping-хелперов в роутах.
export const WORKSPACE_TABLES = [
  'projects',
  'tasks',
  'work_sessions',
  'task_time_logs',
  'notes',
  'journal_entries',
  'calendar_events',
  'reminders',
  'playbooks',
  'playbook_steps',
  'playbook_runs',
  'playbook_run_steps',
  'habits',
  'habit_logs',
  'habit_period_results',
  'expense_categories',
  'transactions',
  'recurring_transactions',
  'mind_maps',
  'boards',
  'canvases',
  'agencies',
  'agency_models',
  'agency_chatters',
  'agency_assignments',
  'agency_payout_rules',
  'agency_sales'
] as const;

// Добавляет workspace_id ко всем контент-таблицам (и свежим, и старым). Колонка
// nullable на уровне БД — старые строки получают workspace_id при миграции данных
// в пространство пользователя; новые строки всегда пишутся с workspace_id из роута.
function ensureWorkspaceColumns(): void {
  for (const table of WORKSPACE_TABLES) {
    ensureColumn(table, 'workspace_id', 'TEXT');
    try {
      db.exec(`CREATE INDEX IF NOT EXISTS idx_${table}_ws ON ${table}(workspace_id)`);
    } catch {
      /* индекс уже есть / таблица отсутствует — пропускаем */
    }
  }
}
ensureWorkspaceColumns();

// One-off cleanup: ранее auto-miss проставлял пропуски за даты до создания
// рутины (баг). Чистим эти записи. После исправления логика их больше
// не создаёт — миграция остаётся безопасным no-op для свежих БД.
function cleanupPreCreationMisses(): void {
  if (!tableExists('habits') || !tableExists('habit_logs')) return;
  try {
    db.exec(`
      DELETE FROM habit_logs
      WHERE status = 'missed'
      AND date < SUBSTR(
        (SELECT created_at FROM habits WHERE habits.id = habit_logs.habit_id), 1, 10
      );
    `);
  } catch {
    // невалидные данные — игнорируем
  }
}
cleanupPreCreationMisses();

export const nowIso = (): string => new Date().toISOString();
export const today = (): string => {
  const d = new Date();
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};
