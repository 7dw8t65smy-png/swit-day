export type TaskStatus = 'pending' | 'active' | 'paused' | 'done' | 'cancelled';
export type TaskPriority = 'low' | 'normal' | 'high' | 'urgent';
export type TaskDifficulty = 'easy' | 'medium' | 'hard';
export type SessionType = 'work' | 'break' | 'pause';
export type DayTimerStatus = 'idle' | 'running' | 'paused' | 'on_break' | 'finished';
export type NoteType = 'quick' | 'full';
export type CalendarEventType = 'event' | 'reminder' | 'deadline';

export interface Project {
  id: string;
  name: string;
  color: string;
  icon: string | null;
  description: string | null;
  archived: number;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

export interface Task {
  id: string;
  title: string;
  description: string | null;
  project_id: string | null;
  parent_task_id: string | null;
  status: TaskStatus;
  priority: TaskPriority;
  difficulty: TaskDifficulty;
  due_date: string | null;
  due_time: string | null;
  estimated_min: number | null;
  tags: string | null;
  sort_order: number;
  created_at: string;
  updated_at: string;
  completed_at: string | null;
}

export interface WorkSession {
  id: string;
  date: string;
  started_at: string;
  ended_at: string | null;
  type: SessionType;
  task_id: string | null;
  notes: string | null;
}

export interface TaskTimeLog {
  id: string;
  task_id: string;
  started_at: string;
  ended_at: string | null;
  duration_s: number | null;
  date: string;
}

export interface Note {
  id: string;
  content: string;
  type: NoteType;
  task_id: string | null;
  project_id: string | null;
  date: string | null;
  pinned: number;
  tags: string | null;
  created_at: string;
  updated_at: string;
}

export interface JournalEntry {
  id: string;
  date: string;
  what_done: string | null;
  reflection: string | null;
  mood: number | null;
  total_work_s: number | null;
  total_pause_s: number | null;
  tasks_done: number;
  created_at: string;
  updated_at: string;
}

export interface CalendarEvent {
  id: string;
  title: string;
  date: string;
  start_time: string | null;
  end_time: string | null;
  description: string | null;
  project_id: string | null;
  task_id: string | null;
  reminder_min: number | null;
  color: string | null;
  type: CalendarEventType;
  created_at: string;
  updated_at: string;
}

export interface Reminder {
  id: string;
  title: string;
  datetime: string;
  task_id: string | null;
  event_id: string | null;
  fired: number;
  snoozed_to: string | null;
  created_at: string;
}

export interface Settings {
  [key: string]: string;
}

// --- Finance ---

export type TransactionKind = 'expense' | 'income';
export type PaymentMethod = 'cash' | 'card' | 'transfer' | 'other';

export interface ExpenseCategory {
  id: string;
  name: string;
  icon: string | null;
  color: string | null;
  kind: TransactionKind;
  monthly_limit: number | null;
  archived: number;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

export interface Transaction {
  id: string;
  amount: number;
  kind: TransactionKind;
  category_id: string | null;
  payment_method: PaymentMethod;
  date: string; // YYYY-MM-DD
  description: string;
  note: string | null;
  recurring_id: string | null;
  created_at: string;
  updated_at: string;
}

export type RecurrencePeriod = 'monthly' | 'weekly';

export interface RecurringTransaction {
  id: string;
  amount: number;
  kind: TransactionKind;
  category_id: string | null;
  payment_method: PaymentMethod;
  description: string;
  period: RecurrencePeriod;
  day_of_month: number | null;
  day_of_week: number | null;
  reminder_enabled: number;
  remind_time: string | null;
  last_reminded_on: string | null;
  archived: number;
  created_at: string;
  updated_at: string;
}

export interface TransactionSummary {
  total_expense: number;
  total_income: number;
  by_category: { category_id: string | null; kind: TransactionKind; amount: number }[];
  by_day: { date: string; expense: number; income: number }[];
  count: number;
}

// Playbooks (регламенты)
export interface Playbook {
  id: string;
  title: string;
  description: string | null;    // короткий subtitle
  content: string | null;        // полная документация, markdown
  project_id: string | null;     // null = глобальный
  icon: string | null;
  color: string | null;
  archived: number;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

export interface PlaybookStep {
  id: string;
  playbook_id: string;
  title: string;
  description: string | null;    // markdown
  sort_order: number;
  created_at: string;
}

export interface PlaybookWithSteps extends Playbook {
  steps: PlaybookStep[];
}

export interface PlaybookRun {
  id: string;
  playbook_id: string;
  playbook_title: string;        // snapshot
  title: string;                 // e.g. "Нанять Петю"
  content: string | null;        // snapshot документации
  notes: string | null;
  started_at: string;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface PlaybookRunStep {
  id: string;
  run_id: string;
  step_id: string;               // original template step id (may be deleted)
  title: string;                 // snapshot
  description: string | null;    // snapshot
  sort_order: number;
  completed_at: string | null;
  notes: string | null;
}

export interface PlaybookRunWithSteps extends PlaybookRun {
  steps: PlaybookRunStep[];
}

// Виды повторения привычек.
// - daily          → каждый день.
// - specific_days  → конкретные дни недели (cadence_config.weekdays: 0..6, 1=Пн).
// - weekly_n       → N раз в неделю в любые дни (cadence_config.times_per_week).
// - monthly_day    → определённое число месяца (cadence_config.day_of_month: 1..31).
// Старые значения 'weekdays' / 'weekly' остаются в БД ради обратной совместимости и
// нормализуются helper'ом isHabitDueOn — в новой UI их не выбрать, но они работают.
export type HabitCadence =
  | 'daily'
  | 'specific_days'
  | 'weekly_n'
  | 'monthly_day'
  | 'weekdays' // legacy: Пн–Пт
  | 'weekly';  // legacy: «раз в неделю»

export interface HabitCadenceConfig {
  weekdays?: number[];       // для specific_days, 0..6 (1 = понедельник, 0 = воскресенье)
  times_per_week?: number;   // для weekly_n, 1..7
  day_of_month?: number;     // для monthly_day, 1..31
}

export interface Habit {
  id: string;
  title: string;
  description: string | null;
  icon: string | null;
  color: string | null;
  cadence: HabitCadence;
  cadence_config: string | null; // JSON-encoded HabitCadenceConfig
  target_count: number;          // сколько раз надо в день (обычно 1)
  remind_time: string | null;    // 'HH:MM' or null
  confirm_window_h: number;      // окно подтверждения после remind_time, часы (default 6)
  archived: number;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

export type HabitLogStatus = 'done' | 'missed';

export interface HabitLog {
  id: string;
  habit_id: string;
  date: string;                  // YYYY-MM-DD
  count: number;
  status: HabitLogStatus;
  note: string | null;
  created_at: string;
}

export type HabitPeriodKind = 'week' | 'month';

export interface HabitPeriodResult {
  id: string;
  habit_id: string;
  period_kind: HabitPeriodKind;
  period_start: string;          // YYYY-MM-DD: понедельник недели или 1-е число месяца
  status: HabitLogStatus;
  count_actual: number;
  target: number;
  created_at: string;
}

/** Описание разблокированного / следующего бэйджа. */
export interface HabitBadgeInfo {
  id: string;
  kind: 'streak' | 'total';
  threshold: number;
  label: string;
  emoji: string;
  unlocked: boolean;
}

export interface HabitStats {
  habit_id: string;
  /** Единица стрика, зависит от cadence. */
  unit: 'day' | 'week' | 'month';
  current_streak: number;
  best_streak: number;
  total_done: number;
  /** % выполнения за последние 7 / 30 единиц периода. */
  completion_pct_7: number;
  completion_pct_30: number;
  /** Прогресс текущей недели для weekly_n. */
  week_progress?: { done: number; target: number; days_left: number };
  /** Прогресс месяца для monthly_day — done 0|1 + дни до контрольной даты. */
  month_progress?: { done: boolean; target_day: number };
  /** Ближайший заблокированный бэйдж. */
  next_badge?: HabitBadgeInfo & { remaining: number };
  badges: HabitBadgeInfo[];
}

export interface DaySegment {
  type: SessionType;
  started_at: string;
  ended_at: string | null;
  duration_s: number;
}

export interface DayTotals {
  date: string;
  work_s: number;        // closed work sessions only
  break_s: number;       // closed
  pause_s: number;       // closed
  sessions_count: number;
  day_started_at: string | null;
  open_segment: { type: SessionType; started_at: string } | null;
  segments: DaySegment[];
}

// --- Интеллект-карты (mind maps) ---

/** Направление авто-раскладки от корня. */
export type MindMapLayout = 'right' | 'left' | 'tree';

/** Приоритет-маркер задачи на узле. */
export type MindMapPriority = 'high' | 'medium' | 'low';

export interface MindMapNode {
  id: string;
  /** null — корневой узел. */
  parentId: string | null;
  text: string;
  /** Цвет ветки/узла (hex). Если не задан — наследуется от ветки. */
  color?: string | null;
  emoji?: string | null;
  note?: string | null;
  /** Маркер приоритета (показывается значком на узле). */
  priority?: MindMapPriority | null;
  /** Узел-задача отмечен выполненным. */
  done?: boolean;
  /** Метки/теги узла. */
  tags?: string[];
  /** Поддерево скрыто. */
  collapsed?: boolean;
}

/** Ключ визуальной темы карты (из THEMES в рендерере). */
export type MindMapTheme = string;

/** Документ карты целиком (хранится сериализованным в mind_maps.content). */
export interface MindMapDoc {
  rootId: string;
  nodes: MindMapNode[];
  layout: MindMapLayout;
  /** Ключ визуальной темы. Если не задан — тема по умолчанию. */
  theme?: MindMapTheme;
}

/** Строка таблицы mind_maps (content — сериализованный MindMapDoc). */
export interface MindMap {
  id: string;
  title: string;
  content: string;
  theme: string;
  created_at: string;
  updated_at: string;
}

// --- Свободная доска (Board) ---
// Отдельный тип документа: элементы с произвольными координатами и размерами,
// без авто-раскладки дерева. Хранится в таблице boards (content — JSON BoardDoc).

export type BoardElementType =
  | 'sticker'
  | 'text'
  | 'card'
  | 'shape'
  | 'connector'
  | 'frame'
  | 'image'
  | 'draw';

export type BoardShapeKind = 'rect' | 'ellipse' | 'diamond';

export interface BoardElementStyle {
  /** Фон элемента (hex) или null — прозрачный. */
  fill?: string | null;
  /** Цвет текста. */
  color?: string | null;
  /** Цвет рамки. */
  border?: string | null;
  /** Размер шрифта в px. */
  fontSize?: number | null;
  /** Геометрия фигуры (для type === 'shape'). */
  shape?: BoardShapeKind | null;
}

export interface BoardElement {
  id: string;
  type: BoardElementType;
  x: number;
  y: number;
  width: number;
  height: number;
  /** Порядок наложения (выше — поверх). */
  zIndex: number;
  text?: string | null;
  style?: BoardElementStyle;
  /** Коннектор: id элемента-источника. */
  from?: string | null;
  /** Коннектор: id элемента-цели. */
  to?: string | null;
  /** Изображение: data-URL картинки. */
  src?: string | null;
  /** Свободная линия: точки в локальных координатах bbox [x0,y0,x1,y1,...]. */
  points?: number[];
  /** Идентификатор группы (общий у сгруппированных элементов). */
  groupId?: string | null;
}

/** Документ свободной доски целиком (сериализуется в boards.content). */
export interface BoardDoc {
  elements: BoardElement[];
}

/** Строка таблицы boards (content — сериализованный BoardDoc). */
export interface Board {
  id: string;
  title: string;
  content: string;
  created_at: string;
  updated_at: string;
}
