export const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS projects (
  id          TEXT PRIMARY KEY,
  name        TEXT NOT NULL,
  color       TEXT NOT NULL,
  icon        TEXT,
  description TEXT,
  archived    INTEGER DEFAULT 0,
  sort_order  INTEGER DEFAULT 0,
  created_at  TEXT NOT NULL,
  updated_at  TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS tasks (
  id              TEXT PRIMARY KEY,
  title           TEXT NOT NULL,
  description     TEXT,
  project_id      TEXT REFERENCES projects(id),
  parent_task_id  TEXT REFERENCES tasks(id),
  status          TEXT DEFAULT 'pending',
  priority        TEXT DEFAULT 'normal',
  difficulty      TEXT DEFAULT 'medium',
  due_date        TEXT,
  due_time        TEXT,
  estimated_min   INTEGER,
  tags            TEXT,
  sort_order      INTEGER DEFAULT 0,
  created_at      TEXT NOT NULL,
  updated_at      TEXT NOT NULL,
  completed_at    TEXT
);

CREATE TABLE IF NOT EXISTS work_sessions (
  id          TEXT PRIMARY KEY,
  date        TEXT NOT NULL,
  started_at  TEXT NOT NULL,
  ended_at    TEXT,
  type        TEXT NOT NULL,
  task_id     TEXT REFERENCES tasks(id),
  notes       TEXT
);

CREATE TABLE IF NOT EXISTS task_time_logs (
  id          TEXT PRIMARY KEY,
  task_id     TEXT NOT NULL REFERENCES tasks(id),
  started_at  TEXT NOT NULL,
  ended_at    TEXT,
  duration_s  INTEGER,
  date        TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS notes (
  id         TEXT PRIMARY KEY,
  content    TEXT NOT NULL,
  type       TEXT DEFAULT 'quick',
  task_id    TEXT REFERENCES tasks(id),
  project_id TEXT REFERENCES projects(id),
  date       TEXT,
  pinned     INTEGER DEFAULT 0,
  tags       TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

-- Несколько записей за одну дату допустимы: каждое «Завершить день»
-- порождает отдельную запись, чтобы было видно прогресс за день частями.
CREATE TABLE IF NOT EXISTS journal_entries (
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
CREATE INDEX IF NOT EXISTS idx_journal_entries_date ON journal_entries(date);

CREATE TABLE IF NOT EXISTS calendar_events (
  id           TEXT PRIMARY KEY,
  title        TEXT NOT NULL,
  date         TEXT NOT NULL,
  start_time   TEXT,
  end_time     TEXT,
  description  TEXT,
  project_id   TEXT REFERENCES projects(id),
  task_id      TEXT REFERENCES tasks(id),
  reminder_min INTEGER,
  color        TEXT,
  type         TEXT DEFAULT 'event',
  created_at   TEXT NOT NULL,
  updated_at   TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS reminders (
  id           TEXT PRIMARY KEY,
  title        TEXT NOT NULL,
  datetime     TEXT NOT NULL,
  task_id      TEXT REFERENCES tasks(id),
  event_id     TEXT REFERENCES calendar_events(id),
  fired        INTEGER DEFAULT 0,
  snoozed_to   TEXT,
  created_at   TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS settings (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS playbooks (
  id          TEXT PRIMARY KEY,
  title       TEXT NOT NULL,
  description TEXT,
  content     TEXT,
  project_id  TEXT REFERENCES projects(id),
  icon        TEXT,
  color       TEXT,
  archived    INTEGER DEFAULT 0,
  sort_order  INTEGER DEFAULT 0,
  created_at  TEXT NOT NULL,
  updated_at  TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS playbook_steps (
  id          TEXT PRIMARY KEY,
  playbook_id TEXT NOT NULL REFERENCES playbooks(id) ON DELETE CASCADE,
  title       TEXT NOT NULL,
  description TEXT,
  sort_order  INTEGER DEFAULT 0,
  created_at  TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS playbook_runs (
  id              TEXT PRIMARY KEY,
  playbook_id     TEXT NOT NULL REFERENCES playbooks(id),
  playbook_title  TEXT NOT NULL,
  title           TEXT NOT NULL,
  content         TEXT,
  notes           TEXT,
  started_at      TEXT NOT NULL,
  completed_at    TEXT,
  created_at      TEXT NOT NULL,
  updated_at      TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS habits (
  id              TEXT PRIMARY KEY,
  title           TEXT NOT NULL,
  description     TEXT,
  icon            TEXT,
  color           TEXT,
  cadence         TEXT NOT NULL DEFAULT 'daily',
  -- JSON: { weekdays?: number[] (0..6, 1=Mon),
  --        times_per_week?: number,
  --        day_of_month?: number (1..31) }
  cadence_config  TEXT,
  target_count    INTEGER DEFAULT 1,
  remind_time     TEXT,   -- 'HH:MM' or NULL
  -- Сколько часов после remind_time даём пользователю на отметку «выполнил»
  -- до того, как день автоматически станет missed и стрик прервётся.
  -- Касается только daily / specific_days / monthly_day; для weekly_n
  -- норма проверяется в конце недели.
  confirm_window_h INTEGER NOT NULL DEFAULT 6,
  archived        INTEGER DEFAULT 0,
  sort_order      INTEGER DEFAULT 0,
  created_at      TEXT NOT NULL,
  updated_at      TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS habit_logs (
  id        TEXT PRIMARY KEY,
  habit_id  TEXT NOT NULL REFERENCES habits(id) ON DELETE CASCADE,
  date      TEXT NOT NULL,
  count     INTEGER NOT NULL DEFAULT 1,
  -- 'done'   — пользователь подтвердил выполнение (count > 0).
  -- 'missed' — окно подтверждения истекло или пользователь явно нажал «Пропуск».
  -- При status='missed' count = 0 и сам факт записи означает «день закрыт как пропуск».
  status    TEXT NOT NULL DEFAULT 'done',
  note      TEXT,
  created_at TEXT NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_habit_logs_unique
  ON habit_logs(habit_id, date);

-- Итоги периодов для weekly_n / monthly_day. На каждой неделе/месяце ровно одна запись.
-- period_start — понедельник недели (для week) или 1-е число месяца (для month), YYYY-MM-DD.
CREATE TABLE IF NOT EXISTS habit_period_results (
  id           TEXT PRIMARY KEY,
  habit_id     TEXT NOT NULL REFERENCES habits(id) ON DELETE CASCADE,
  period_kind  TEXT NOT NULL,           -- 'week' | 'month'
  period_start TEXT NOT NULL,           -- YYYY-MM-DD
  status       TEXT NOT NULL,           -- 'done' | 'missed'
  count_actual INTEGER NOT NULL DEFAULT 0,
  target       INTEGER NOT NULL DEFAULT 1,
  created_at   TEXT NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_habit_period_results_unique
  ON habit_period_results(habit_id, period_kind, period_start);

CREATE TABLE IF NOT EXISTS playbook_run_steps (
  id            TEXT PRIMARY KEY,
  run_id        TEXT NOT NULL REFERENCES playbook_runs(id) ON DELETE CASCADE,
  step_id       TEXT NOT NULL,
  title         TEXT NOT NULL,
  description   TEXT,
  sort_order    INTEGER DEFAULT 0,
  completed_at  TEXT,
  notes         TEXT
);

-- Finance module: categories, transactions, recurring templates.
-- Categories are user-editable (with the default seed list filled on first run
-- by the renderer). Payment methods are fixed in the type layer, not in DB.
CREATE TABLE IF NOT EXISTS expense_categories (
  id              TEXT PRIMARY KEY,
  name            TEXT NOT NULL,
  icon            TEXT,
  color           TEXT,
  kind            TEXT NOT NULL DEFAULT 'expense', -- 'expense' | 'income'
  monthly_limit   REAL,                             -- NULL = no budget
  archived        INTEGER DEFAULT 0,
  sort_order      INTEGER DEFAULT 0,
  created_at      TEXT NOT NULL,
  updated_at      TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS transactions (
  id              TEXT PRIMARY KEY,
  amount          REAL NOT NULL,                    -- positive value; sign comes from kind
  kind            TEXT NOT NULL DEFAULT 'expense',  -- 'expense' | 'income'
  category_id     TEXT REFERENCES expense_categories(id) ON DELETE SET NULL,
  payment_method  TEXT NOT NULL DEFAULT 'card',     -- 'cash' | 'card' | 'transfer' | 'other'
  date            TEXT NOT NULL,                    -- YYYY-MM-DD
  description     TEXT NOT NULL,
  note            TEXT,
  recurring_id    TEXT REFERENCES recurring_transactions(id) ON DELETE SET NULL,
  created_at      TEXT NOT NULL,
  updated_at      TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS recurring_transactions (
  id                  TEXT PRIMARY KEY,
  amount              REAL NOT NULL,
  kind                TEXT NOT NULL DEFAULT 'expense',
  category_id         TEXT REFERENCES expense_categories(id) ON DELETE SET NULL,
  payment_method      TEXT NOT NULL DEFAULT 'card',
  description         TEXT NOT NULL,
  -- Recurrence: 'monthly' (day_of_month) | 'weekly' (day_of_week 0..6)
  period              TEXT NOT NULL DEFAULT 'monthly',
  day_of_month        INTEGER,
  day_of_week         INTEGER,
  reminder_enabled    INTEGER DEFAULT 1,
  remind_time         TEXT,                          -- 'HH:MM' or NULL
  last_reminded_on    TEXT,                          -- YYYY-MM-DD
  archived            INTEGER DEFAULT 0,
  created_at          TEXT NOT NULL,
  updated_at          TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_tasks_status      ON tasks(status);
CREATE INDEX IF NOT EXISTS idx_tasks_due_date    ON tasks(due_date);
CREATE INDEX IF NOT EXISTS idx_tasks_project     ON tasks(project_id);
CREATE INDEX IF NOT EXISTS idx_tasks_parent      ON tasks(parent_task_id);
CREATE INDEX IF NOT EXISTS idx_sessions_date     ON work_sessions(date);
CREATE INDEX IF NOT EXISTS idx_time_logs_date    ON task_time_logs(date);
CREATE INDEX IF NOT EXISTS idx_time_logs_task    ON task_time_logs(task_id);
CREATE INDEX IF NOT EXISTS idx_notes_date        ON notes(date);
CREATE INDEX IF NOT EXISTS idx_events_date       ON calendar_events(date);
CREATE INDEX IF NOT EXISTS idx_reminders_dt      ON reminders(datetime);
CREATE INDEX IF NOT EXISTS idx_pb_project        ON playbooks(project_id);
CREATE INDEX IF NOT EXISTS idx_pb_steps_pb       ON playbook_steps(playbook_id);
CREATE INDEX IF NOT EXISTS idx_tx_date           ON transactions(date);
CREATE INDEX IF NOT EXISTS idx_tx_category       ON transactions(category_id);
CREATE INDEX IF NOT EXISTS idx_tx_kind           ON transactions(kind);
CREATE INDEX IF NOT EXISTS idx_tx_recurring      ON transactions(recurring_id);
CREATE INDEX IF NOT EXISTS idx_pb_runs_pb        ON playbook_runs(playbook_id);
CREATE INDEX IF NOT EXISTS idx_pb_run_steps_run  ON playbook_run_steps(run_id);

-- Интеллект-карты. Весь документ карты (узлы, связи, раскладка, стили) хранится
-- одним JSON в content — редактирование идёт целиком на холсте.
CREATE TABLE IF NOT EXISTS mind_maps (
  id           TEXT PRIMARY KEY,
  title        TEXT NOT NULL,
  content      TEXT NOT NULL,
  theme        TEXT DEFAULT 'classic',
  created_at   TEXT NOT NULL,
  updated_at   TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_mind_maps_updated ON mind_maps(updated_at);

-- Свободные доски (whiteboard). Документ (элементы, координаты, размеры, стили)
-- хранится одним JSON в content. Независимы от интеллект-карт.
CREATE TABLE IF NOT EXISTS boards (
  id           TEXT PRIMARY KEY,
  title        TEXT NOT NULL,
  content      TEXT NOT NULL,
  created_at   TEXT NOT NULL,
  updated_at   TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_boards_updated ON boards(updated_at);

-- Единый холст: карта-дерево + свободная доска в одном документе (JSON CanvasDoc).
CREATE TABLE IF NOT EXISTS canvases (
  id           TEXT PRIMARY KEY,
  title        TEXT NOT NULL,
  content      TEXT NOT NULL,
  created_at   TEXT NOT NULL,
  updated_at   TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_canvases_updated ON canvases(updated_at);

-- ===== Многопользовательский слой: аккаунты, пространства, доступ =====
-- Колонка workspace_id добавляется ко всем контент-таблицам отдельной миграцией
-- (см. ensureWorkspaceColumns в server/db.ts), чтобы покрыть и старые БД.

CREATE TABLE IF NOT EXISTS users (
  id            TEXT PRIMARY KEY,
  handle        TEXT NOT NULL UNIQUE,          -- ник или email в нижнем регистре
  display_name  TEXT NOT NULL,
  password_hash TEXT NOT NULL,                 -- scrypt: salt:hash (hex)
  created_at    TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS workspaces (
  id          TEXT PRIMARY KEY,
  name        TEXT NOT NULL,
  type        TEXT NOT NULL DEFAULT 'team',    -- 'personal' | 'team'
  owner_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at  TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS workspace_members (
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  user_id      TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role         TEXT NOT NULL DEFAULT 'member', -- 'owner' | 'member'
  joined_at    TEXT NOT NULL,
  PRIMARY KEY (workspace_id, user_id)
);
CREATE INDEX IF NOT EXISTS idx_ws_members_user ON workspace_members(user_id);

CREATE TABLE IF NOT EXISTS workspace_invites (
  code         TEXT PRIMARY KEY,              -- короткий код-приглашение
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  created_by   TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at   TEXT,                          -- NULL = бессрочно
  max_uses     INTEGER,                       -- NULL = без лимита
  uses         INTEGER NOT NULL DEFAULT 0,
  created_at   TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS auth_sessions (
  id           TEXT PRIMARY KEY,
  user_id      TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash   TEXT NOT NULL UNIQUE,          -- sha256(token), hex
  device       TEXT,
  created_at   TEXT NOT NULL,
  last_used_at TEXT,
  expires_at   TEXT                           -- NULL = бессрочно
);
CREATE INDEX IF NOT EXISTS idx_auth_sessions_token ON auth_sessions(token_hash);
`;
