import type {
  Board,
  Canvas,
  CalendarEvent,
  DayTotals,
  ExpenseCategory,
  Habit,
  HabitCadence,
  HabitLog,
  HabitPeriodResult,
  HabitStats,
  JournalEntry,
  MindMap,
  Note,
  PaymentMethod,
  Playbook,
  PlaybookRun,
  PlaybookRunStep,
  PlaybookRunWithSteps,
  PlaybookStep,
  PlaybookWithSteps,
  Project,
  RecurringTransaction,
  Reminder,
  Task,
  TaskTimeLog,
  Transaction,
  TransactionKind,
  TransactionSummary,
  WorkSession
} from '@swit/shared';
import { pushToast } from './hooks/useToasts';

const DEFAULT_URL = 'http://127.0.0.1:47821';

let baseUrl: string | null = null;
let bearer: string | null = null;

export interface DataImportResult {
  ok: true;
  counts: Record<string, number>;
}

export interface BackupInfo {
  file: string;
  date: string;
  size: number;
  created_at: string;
}

async function url(): Promise<string> {
  if (baseUrl) return baseUrl;
  // Try localStorage override (set by Settings page after save).
  const override = typeof localStorage !== 'undefined' ? localStorage.getItem('swit:backend_url') : null;
  if (override) {
    baseUrl = override;
    bearer = localStorage.getItem('swit:backend_token');
    return baseUrl;
  }
  if (typeof window !== 'undefined' && window.swit?.getServerUrl) {
    baseUrl = await window.swit.getServerUrl();
  } else {
    baseUrl = DEFAULT_URL;
  }
  return baseUrl;
}

export function resetApiUrl(): void {
  baseUrl = null;
  bearer = null;
}

// Короткое, человеческое сообщение об ошибке по HTTP-статусу.
// Технические детали (метод/путь/код) уходят отдельной приглушённой строкой.
function friendlyHttpMessage(status: number): string {
  if (status === 401 || status === 403) return 'Нет доступа. Проверьте подключение к серверу.';
  if (status === 404) return 'Ресурс не найден.';
  if (status === 409) return 'Конфликт данных. Обновите и попробуйте снова.';
  if (status >= 500) return `Не удалось сохранить. Сервер ответил ${status}.`;
  if (status >= 400) return 'Запрос отклонён. Проверьте данные и попробуйте снова.';
  return `Ошибка запроса (${status}).`;
}

async function req<T>(method: string, path: string, body?: unknown): Promise<T> {
  const base = await url();
  const headers: Record<string, string> = {};
  if (body) headers['Content-Type'] = 'application/json';
  if (bearer) headers['Authorization'] = `Bearer ${bearer}`;

  let res: Response;
  try {
    res = await fetch(base + path, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined
    });
  } catch (err) {
    // Сетевой сбой (сервер недоступен, разрыв соединения). Всплываем тост и
    // пробрасываем дальше, чтобы поведение вызывающих не менялось.
    pushToast({
      kind: 'error',
      message: 'Нет связи с сервером. Проверьте, запущен ли он.',
      detail: `${method} ${path}`
    });
    throw err;
  }

  if (!res.ok) {
    pushToast({
      kind: 'error',
      message: friendlyHttpMessage(res.status),
      detail: `${method} ${path} → ${res.status}`
    });
    throw new Error(`${method} ${path} → ${res.status}`);
  }
  return res.json() as Promise<T>;
}

export const api = {
  // data backup
  exportData: () => req<Record<string, unknown>>('GET', '/data/export'),
  importData: (data: Record<string, unknown>) =>
    req<DataImportResult>('POST', '/data/import', data),
  resetData: () => req<DataImportResult>('DELETE', '/data'),
  listBackups: () => req<BackupInfo[]>('GET', '/data/backups'),
  createBackup: () => req<{ ok: true; file: string }>('POST', '/data/backup'),

  // projects
  listProjects: () => req<Project[]>('GET', '/projects'),
  createProject: (b: { name: string; color?: string; icon?: string | null; description?: string | null }) =>
    req<Project>('POST', '/projects', b),
  updateProject: (id: string, b: Partial<Project>) =>
    req<Project>('PATCH', `/projects/${id}`, b),
  deleteProject: (id: string) => req<{ ok: true }>('DELETE', `/projects/${id}`),

  // tasks
  listTasks: (
    q: {
      date?: string;
      project_id?: string;
      status?: string;
      parent_task_id?: string;
      top_level?: 'true';
    } = {}
  ) => {
    const qs = new URLSearchParams(q as Record<string, string>).toString();
    return req<Task[]>('GET', `/tasks${qs ? `?${qs}` : ''}`);
  },
  createTask: (b: {
    title: string;
    due_date?: string | null;
    due_time?: string | null;
    project_id?: string | null;
    parent_task_id?: string | null;
    priority?: 'low' | 'normal' | 'high' | 'urgent';
    difficulty?: 'easy' | 'medium' | 'hard';
  }) => req<Task>('POST', '/tasks', b),
  updateTask: (id: string, b: Partial<Task>) => req<Task>('PATCH', `/tasks/${id}`, b),
  deleteTask: (id: string) => req<{ ok: true }>('DELETE', `/tasks/${id}`),

  // notes
  listNotes: (q: { type?: 'quick' | 'full' } = {}) => {
    const qs = new URLSearchParams(q as Record<string, string>).toString();
    return req<Note[]>('GET', `/notes${qs ? `?${qs}` : ''}`);
  },
  createNote: (b: {
    content: string;
    type?: 'quick' | 'full';
    task_id?: string | null;
    project_id?: string | null;
    date?: string | null;
    pinned?: number;
    tags?: string | null;
  }) =>
    req<Note>('POST', '/notes', b),
  updateNote: (id: string, b: Partial<Note>) => req<Note>('PATCH', `/notes/${id}`, b),
  deleteNote: (id: string) => req<{ ok: true }>('DELETE', `/notes/${id}`),

  // mind maps
  listMaps: () => req<MindMap[]>('GET', '/maps'),
  getMap: (id: string) => req<MindMap>('GET', `/maps/${id}`),
  createMap: (b: { title: string; content: string; theme?: string }) =>
    req<MindMap>('POST', '/maps', b),
  updateMap: (id: string, b: Partial<{ title: string; content: string; theme: string }>) =>
    req<MindMap>('PUT', `/maps/${id}`, b),
  deleteMap: (id: string) => req<{ ok: true }>('DELETE', `/maps/${id}`),
  duplicateMap: (id: string) => req<MindMap>('POST', `/maps/${id}/duplicate`),

  // boards (свободная доска)
  listBoards: () => req<Board[]>('GET', '/boards'),
  getBoard: (id: string) => req<Board>('GET', `/boards/${id}`),
  createBoard: (b: { title: string; content: string }) => req<Board>('POST', '/boards', b),
  updateBoard: (id: string, b: Partial<{ title: string; content: string }>) =>
    req<Board>('PUT', `/boards/${id}`, b),
  deleteBoard: (id: string) => req<{ ok: true }>('DELETE', `/boards/${id}`),
  duplicateBoard: (id: string) => req<Board>('POST', `/boards/${id}/duplicate`),

  // canvases (единый холст: карта + доска)
  listCanvases: () => req<Canvas[]>('GET', '/canvases'),
  getCanvas: (id: string) => req<Canvas>('GET', `/canvases/${id}`),
  createCanvas: (b: { title: string; content: string }) => req<Canvas>('POST', '/canvases', b),
  updateCanvas: (id: string, b: Partial<{ title: string; content: string }>) =>
    req<Canvas>('PUT', `/canvases/${id}`, b),
  deleteCanvas: (id: string) => req<{ ok: true }>('DELETE', `/canvases/${id}`),
  duplicateCanvas: (id: string) => req<Canvas>('POST', `/canvases/${id}/duplicate`),

  // sessions
  startSession: (type: 'work' | 'break' | 'pause', task_id?: string | null) =>
    req<WorkSession>('POST', '/sessions/start', { type, task_id }),
  stopSession: () => req<{ ok: true; ended_at: string }>('POST', '/sessions/stop'),
  activeSession: () => req<WorkSession | null>('GET', '/sessions/active'),
  sessionsForDate: (date?: string) =>
    req<WorkSession[]>('GET', `/sessions${date ? `?date=${date}` : ''}`),
  dayTotals: (date?: string) =>
    req<DayTotals>('GET', `/sessions/totals${date ? `?date=${date}` : ''}`),

  // time logs
  startTimeLog: (task_id: string) =>
    req<TaskTimeLog>('POST', '/time-logs/start', { task_id }),
  stopTimeLog: () => req<{ ok: true }>('POST', '/time-logs/stop'),
  activeTimeLog: () => req<TaskTimeLog | null>('GET', '/time-logs/active'),
  timeLogs: (q: { task_id?: string; date?: string } = {}) => {
    const qs = new URLSearchParams(q as Record<string, string>).toString();
    return req<TaskTimeLog[]>('GET', `/time-logs${qs ? `?${qs}` : ''}`);
  },

  // events
  listEvents: (q: { from?: string; to?: string; date?: string } = {}) => {
    const qs = new URLSearchParams(q as Record<string, string>).toString();
    return req<CalendarEvent[]>('GET', `/events${qs ? `?${qs}` : ''}`);
  },
  createEvent: (b: {
    title: string;
    date: string;
    start_time?: string | null;
    end_time?: string | null;
    description?: string | null;
    project_id?: string | null;
    task_id?: string | null;
    reminder_min?: number | null;
    color?: string | null;
    type?: CalendarEvent['type'];
  }) =>
    req<CalendarEvent>('POST', '/events', b),
  updateEvent: (id: string, b: Partial<CalendarEvent>) =>
    req<CalendarEvent>('PATCH', `/events/${id}`, b),
  deleteEvent: (id: string) => req<{ ok: true }>('DELETE', `/events/${id}`),

  // journal — одна дата может содержать несколько записей,
  // каждое «Завершить день» добавляет новую.
  listJournal: () => req<JournalEntry[]>('GET', '/journal'),
  listJournalByDate: (date: string) =>
    req<JournalEntry[]>('GET', `/journal/by-date/${date}`),
  getJournalById: (id: string) => req<JournalEntry | null>('GET', `/journal/${id}`),
  createJournal: (b: Partial<JournalEntry> & { date: string }) =>
    req<JournalEntry>('POST', '/journal', b),
  updateJournal: (id: string, b: Partial<JournalEntry>) =>
    req<JournalEntry>('PATCH', `/journal/${id}`, b),
  deleteJournal: (id: string) => req<{ ok: true }>('DELETE', `/journal/${id}`),

  // reminders
  listReminders: () => req<Reminder[]>('GET', '/reminders'),
  dueReminders: () => req<Reminder[]>('GET', '/reminders/due'),
  createReminder: (b: {
    title: string;
    datetime: string;
    task_id?: string | null;
    event_id?: string | null;
  }) =>
    req<Reminder>('POST', '/reminders', b),
  markFired: (id: string) => req<{ ok: true }>('POST', `/reminders/${id}/fired`),
  snooze: (id: string, until: string) =>
    req<{ ok: true }>('POST', `/reminders/${id}/snooze`, { until }),
  deleteReminder: (id: string) => req<{ ok: true }>('DELETE', `/reminders/${id}`),

  // settings
  getSettings: () => req<Record<string, string>>('GET', '/settings'),
  setSettings: (b: Record<string, string>) => req<{ ok: true }>('PUT', '/settings', b),

  // playbooks
  listPlaybooks: () => req<Playbook[]>('GET', '/playbooks'),
  getPlaybook: (id: string) => req<PlaybookWithSteps>('GET', `/playbooks/${id}`),
  createPlaybook: (b: {
    title: string;
    description?: string | null;
    content?: string | null;
    project_id?: string | null;
    icon?: string | null;
    color?: string | null;
    steps?: { title: string; description?: string | null }[];
  }) => req<Playbook>('POST', '/playbooks', b),
  updatePlaybook: (id: string, b: Partial<Playbook>) =>
    req<Playbook>('PATCH', `/playbooks/${id}`, b),
  deletePlaybook: (id: string) => req<{ ok: true }>('DELETE', `/playbooks/${id}`),
  addStep: (pbId: string, b: { title: string; description?: string | null }) =>
    req<PlaybookStep>('POST', `/playbooks/${pbId}/steps`, b),
  updateStep: (id: string, b: Partial<PlaybookStep>) =>
    req<PlaybookStep>('PATCH', `/playbook-steps/${id}`, b),
  deleteStep: (id: string) => req<{ ok: true }>('DELETE', `/playbook-steps/${id}`),
  listRuns: (q: { playbook_id?: string; active?: 'true' | 'false' } = {}) => {
    const qs = new URLSearchParams(q as Record<string, string>).toString();
    return req<PlaybookRun[]>('GET', `/playbook-runs${qs ? `?${qs}` : ''}`);
  },
  getRun: (id: string) => req<PlaybookRunWithSteps>('GET', `/playbook-runs/${id}`),
  startRun: (b: { playbook_id: string; title?: string }) =>
    req<PlaybookRun>('POST', '/playbook-runs', b),
  updateRun: (id: string, b: { title?: string; notes?: string | null; completed_at?: string | null }) =>
    req<PlaybookRun>('PATCH', `/playbook-runs/${id}`, b),
  deleteRun: (id: string) => req<{ ok: true }>('DELETE', `/playbook-runs/${id}`),
  toggleRunStep: (id: string, b: { completed?: boolean; notes?: string | null }) =>
    req<PlaybookRunStep>('PATCH', `/run-steps/${id}`, b),

  // habits
  listHabits: () => req<Habit[]>('GET', '/habits'),
  createHabit: (b: {
    title: string;
    description?: string | null;
    icon?: string | null;
    color?: string | null;
    cadence?: HabitCadence;
    cadence_config?: string | null;
    target_count?: number;
    remind_time?: string | null;
  }) => req<Habit>('POST', '/habits', b),
  updateHabit: (id: string, b: Partial<Habit>) => req<Habit>('PATCH', `/habits/${id}`, b),
  deleteHabit: (id: string) => req<{ ok: true }>('DELETE', `/habits/${id}`),
  listHabitLogs: (q: { from?: string; to?: string; habit_id?: string } = {}) => {
    const qs = new URLSearchParams(q as Record<string, string>).toString();
    return req<HabitLog[]>('GET', `/habit-logs${qs ? `?${qs}` : ''}`);
  },
  toggleHabitLog: (b: { habit_id: string; date?: string; delta?: number; note?: string | null }) =>
    req<HabitLog | { ok: true; deleted: true }>('POST', '/habit-logs/toggle', b),
  skipHabitLog: (b: { habit_id: string; date?: string; note?: string | null }) =>
    req<HabitLog>('POST', '/habit-logs/skip', b),
  deleteHabitLog: (id: string) => req<{ ok: true }>('DELETE', `/habit-logs/${id}`),
  listHabitPeriodResults: (q: { habit_id?: string } = {}) => {
    const qs = new URLSearchParams(q as Record<string, string>).toString();
    return req<HabitPeriodResult[]>('GET', `/habit-period-results${qs ? `?${qs}` : ''}`);
  },
  habitStats: (id: string) => req<HabitStats>('GET', `/habits/${id}/stats`),
  habitsStatsAll: () => req<Record<string, HabitStats>>('GET', '/habits-stats'),
  runHabitAutoMiss: () => req<{ ok: true; inserted: number }>('POST', '/habits/_run-auto-miss'),
  closeHabitPeriods: () => req<{ ok: true; inserted: number }>('POST', '/habits/_close-periods'),

  // finance — categories
  listExpenseCategories: () =>
    req<ExpenseCategory[]>('GET', '/expense-categories'),
  createExpenseCategory: (b: {
    name: string;
    icon?: string | null;
    color?: string | null;
    kind?: TransactionKind;
    monthly_limit?: number | null;
    sort_order?: number;
  }) => req<ExpenseCategory>('POST', '/expense-categories', b),
  updateExpenseCategory: (id: string, b: Partial<ExpenseCategory>) =>
    req<ExpenseCategory>('PATCH', `/expense-categories/${id}`, b),
  deleteExpenseCategory: (id: string) =>
    req<{ ok: true }>('DELETE', `/expense-categories/${id}`),

  // finance — transactions
  listTransactions: (
    q: {
      from?: string;
      to?: string;
      category_id?: string;
      payment_method?: PaymentMethod;
      kind?: TransactionKind;
      search?: string;
      limit?: number;
    } = {}
  ) => {
    const qs = new URLSearchParams(
      Object.fromEntries(
        Object.entries(q).filter(([, v]) => v !== undefined && v !== '').map(([k, v]) => [k, String(v)])
      )
    ).toString();
    return req<Transaction[]>('GET', `/transactions${qs ? `?${qs}` : ''}`);
  },
  createTransaction: (b: {
    amount: number;
    kind?: TransactionKind;
    category_id?: string | null;
    payment_method?: PaymentMethod;
    date: string;
    description: string;
    note?: string | null;
    recurring_id?: string | null;
  }) => req<Transaction>('POST', '/transactions', b),
  updateTransaction: (id: string, b: Partial<Transaction>) =>
    req<Transaction>('PATCH', `/transactions/${id}`, b),
  deleteTransaction: (id: string) =>
    req<{ ok: true }>('DELETE', `/transactions/${id}`),
  transactionSummary: (q: { from?: string; to?: string } = {}) => {
    const qs = new URLSearchParams(q as Record<string, string>).toString();
    return req<TransactionSummary>('GET', `/transactions/summary${qs ? `?${qs}` : ''}`);
  },

  // finance — recurring
  listRecurringTransactions: () =>
    req<RecurringTransaction[]>('GET', '/recurring-transactions'),
  createRecurringTransaction: (b: Partial<RecurringTransaction> & { amount: number; description: string }) =>
    req<RecurringTransaction>('POST', '/recurring-transactions', b),
  updateRecurringTransaction: (id: string, b: Partial<RecurringTransaction>) =>
    req<RecurringTransaction>('PATCH', `/recurring-transactions/${id}`, b),
  deleteRecurringTransaction: (id: string) =>
    req<{ ok: true }>('DELETE', `/recurring-transactions/${id}`)
};

export function notify(title: string, body?: string): void {
  window.swit?.showNotification(title, body);
}
