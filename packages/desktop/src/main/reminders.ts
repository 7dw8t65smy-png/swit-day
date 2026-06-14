import { Notification } from 'electron';
import type {
  Habit,
  HabitCadenceConfig,
  HabitLog,
  Reminder,
  RecurringTransaction
} from '@swit/shared';

import { app } from 'electron';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { getSession } from './session.js';

let serverUrl = '';
let pollTimer: NodeJS.Timeout | null = null;
let firstTickTimer: NodeJS.Timeout | null = null;
let maintenanceTimer: NodeJS.Timeout | null = null;
// Tick lock — не давать 2 setInterval'ам зайти в tick одновременно при
// тормозном сервере.
let tickRunning = false;
let habitsTickRunning = false;
let recurringTickRunning = false;

// Track the last HH:MM we already evaluated habits for — prevents re-firing the
// same minute when the poll runs 2× within the same minute.
// In-memory marker (быстрый путь). Дополнительно перс. на диск ниже.
let lastHabitMinute = '';

// Persistent "уже стреляли сегодня в HH:MM" чтобы переживать рестарт.
//   Файл userData/habit-fired.json: { date: 'YYYY-MM-DD', items: { [habitId]: ['HH:MM', ...] } }
//   Очищается автоматически при смене календарной даты.
interface HabitFiredCache {
  date: string;
  items: Record<string, string[]>;
}

function habitFiredPath(): string {
  const dir = app.getPath('userData');
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  return join(dir, 'habit-fired.json');
}

function loadHabitFired(today: string): HabitFiredCache {
  try {
    const raw = readFileSync(habitFiredPath(), 'utf8');
    const parsed = JSON.parse(raw) as HabitFiredCache;
    if (parsed.date === today && parsed.items && typeof parsed.items === 'object') {
      return parsed;
    }
  } catch {
    // нет файла / битый JSON — стартуем с нуля
  }
  return { date: today, items: {} };
}

function saveHabitFired(cache: HabitFiredCache): void {
  try {
    writeFileSync(habitFiredPath(), JSON.stringify(cache), 'utf8');
  } catch {
    // не критично
  }
}

interface NotificationSettings {
  notify_enabled: boolean;
  notify_routines: boolean;
  notify_events: boolean;
  notify_reminders: boolean;
  notify_sound: boolean;
  notify_quiet_enabled: boolean;
  notify_quiet_start: string;
  notify_quiet_end: string;
}

// Куда и с какими заголовками ходить. Если есть сессия (многопользовательский
// режим) — на VPS с токеном и активным пространством; иначе на локальный сервер
// (одиночный режим) без авторизации.
function endpoint(): { base: string; headers: Record<string, string> } {
  const s = getSession();
  if (s && s.token) {
    const headers: Record<string, string> = { Authorization: `Bearer ${s.token}` };
    if (s.activeWorkspaceId) headers['X-Workspace-Id'] = s.activeWorkspaceId;
    return { base: s.serverUrl, headers };
  }
  return { base: serverUrl, headers: {} };
}

async function api<T>(method: string, path: string, body?: unknown): Promise<T> {
  const { base, headers } = endpoint();
  const res = await fetch(base + path, {
    method,
    headers: { ...headers, ...(body ? { 'Content-Type': 'application/json' } : {}) },
    body: body ? JSON.stringify(body) : undefined
  });
  if (!res.ok) throw new Error(`${method} ${path} → ${res.status}`);
  return res.json() as Promise<T>;
}

/** Есть ли активная серверная сессия (выбрано пространство). */
function hasWorkspaceSession(): boolean {
  const s = getSession();
  return Boolean(s && s.token && s.activeWorkspaceId);
}

function boolSetting(raw: Record<string, string>, key: string, fallback: boolean): boolean {
  const value = raw[key];
  if (value === undefined) return fallback;
  return value === '1' || value === 'true';
}

async function loadNotificationSettings(): Promise<NotificationSettings> {
  const raw = await api<Record<string, string>>('GET', '/settings');
  return {
    notify_enabled: boolSetting(raw, 'notify_enabled', true),
    notify_routines: boolSetting(raw, 'notify_routines', true),
    notify_events: boolSetting(raw, 'notify_events', true),
    notify_reminders: boolSetting(raw, 'notify_reminders', true),
    notify_sound: boolSetting(raw, 'notify_sound', true),
    notify_quiet_enabled: boolSetting(raw, 'notify_quiet_enabled', false),
    notify_quiet_start: raw.notify_quiet_start ?? '22:00',
    notify_quiet_end: raw.notify_quiet_end ?? '08:00'
  };
}

function minutesFromHHMM(value: string): number | null {
  const match = value.match(/^(\d{2}):(\d{2})$/);
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours > 23 || minutes > 59) return null;
  return hours * 60 + minutes;
}

function isQuietNow(settings: NotificationSettings, now = new Date()): boolean {
  if (!settings.notify_quiet_enabled) return false;
  const start = minutesFromHHMM(settings.notify_quiet_start);
  const end = minutesFromHHMM(settings.notify_quiet_end);
  if (start === null || end === null || start === end) return false;
  const current = now.getHours() * 60 + now.getMinutes();
  if (start < end) return current >= start && current < end;
  return current >= start || current < end;
}

function reminderKind(reminder: Reminder): 'event' | 'standalone' {
  return reminder.event_id ? 'event' : 'standalone';
}

function canShowReminder(reminder: Reminder, settings: NotificationSettings): boolean {
  const kind = reminderKind(reminder);
  if (kind === 'event') return settings.notify_events;
  return settings.notify_reminders;
}

function showNotification(title: string, body: string, settings: NotificationSettings): void {
  new Notification({ title, body, silent: !settings.notify_sound }).show();
}

async function tick(): Promise<void> {
  if (tickRunning) return;
  tickRunning = true;
  try {
    const settings = await loadNotificationSettings();
    if (!settings.notify_enabled) return;
    const due = await api<Reminder[]>('GET', '/reminders/due');
    const quiet = isQuietNow(settings);
    for (const r of due) {
      if (!canShowReminder(r, settings)) {
        // Тип уведомления отключён — гасим запись, чтобы при включении
        // тоггла позже не было storm'а старых notifications.
        await api('POST', `/reminders/${r.id}/fired`);
        continue;
      }
      if (quiet) {
        // В тихие часы тоже помечаем как fired (без показа), иначе при
        // выходе из quiet окна получим взрыв всех накопившихся напоминаний.
        await api('POST', `/reminders/${r.id}/fired`);
        continue;
      }
      showNotification('SWIT Day · Напоминание', r.title, settings);
      await api('POST', `/reminders/${r.id}/fired`);
    }
  } catch {
    // server warming up
  } finally {
    tickRunning = false;
  }
}

// --- Habits push notifications ---
// Inline copy of cadence logic to avoid pulling renderer libs into main.

function parseConfig(h: Habit): HabitCadenceConfig {
  if (!h.cadence_config) return {};
  try {
    return JSON.parse(h.cadence_config) as HabitCadenceConfig;
  } catch {
    return {};
  }
}

function isDue(h: Habit, date: Date): boolean {
  const cfg = parseConfig(h);
  const wd = date.getDay();
  switch (h.cadence) {
    case 'daily':
      return true;
    case 'specific_days':
      return (cfg.weekdays ?? []).includes(wd);
    case 'weekly_n':
      return true; // если до конца недели не закрыли N раз — окно открыто; точную логику оставляем UI
    case 'monthly_day': {
      const day = date.getDate();
      const lastDay = new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
      const target = Math.min(cfg.day_of_month ?? 1, lastDay);
      return day === target;
    }
    case 'weekdays':
      return wd >= 1 && wd <= 5;
    case 'weekly':
      return wd === 1;
    default:
      return true;
  }
}

function ymd(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

async function tickHabits(): Promise<void> {
  if (habitsTickRunning) return;
  habitsTickRunning = true;
  const now = new Date();
  const hhmm = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
  const today = ymd(now);

  try {
    const settings = await loadNotificationSettings();
    if (!settings.notify_enabled || !settings.notify_routines || isQuietNow(settings, now)) return;
    if (hhmm === lastHabitMinute) return;
    lastHabitMinute = hhmm;

    // Загружаем персистентный маркер «уже стреляли». Переживает рестарт
    // приложения — без этого reopen в 09:00:30 заново всплывает 09:00 push.
    const fired = loadHabitFired(today);

    const habits = await api<Habit[]>('GET', '/habits');
    const candidates = habits.filter((h) => !h.archived && h.remind_time === hhmm);
    if (candidates.length === 0) return;

    const logs = await api<HabitLog[]>('GET', `/habit-logs?from=${today}&to=${today}`);
    const doneIds = new Set(
      logs.filter((l) => l.count >= 1).map((l) => l.habit_id)
    );

    let firedSomething = false;
    for (const h of candidates) {
      if (doneIds.has(h.id)) continue;
      const alreadyFired = (fired.items[h.id] ?? []).includes(hhmm);
      if (alreadyFired) continue;
      if (!isDue(h, now)) continue;
      showNotification(`${h.icon ?? '🔔'} ${h.title}`, 'Время рутины', settings);
      fired.items[h.id] = [...(fired.items[h.id] ?? []), hhmm];
      firedSomething = true;
    }
    if (firedSomething) saveHabitFired(fired);
  } catch {
    // server warming up or offline
  } finally {
    habitsTickRunning = false;
  }
}

// --- Регулярные платежи ---
// Подходит ли регулярный платёж под сегодня (по дню месяца / дню недели).
function isRecurringDue(r: RecurringTransaction, date: Date): boolean {
  if (r.period === 'weekly') {
    return r.day_of_week != null && date.getDay() === r.day_of_week;
  }
  // monthly: целимся в day_of_month, но не дальше последнего дня месяца.
  const lastDay = new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
  const target = Math.min(r.day_of_month ?? 1, lastDay);
  return date.getDate() === target;
}

/**
 * Напоминания о регулярных платежах. Раз в день, когда наступило remind_time
 * и платёж приходится на сегодня. last_reminded_on на сервере защищает от
 * повторов (idempotent). Работает только при активной серверной сессии.
 */
async function tickRecurring(): Promise<void> {
  if (recurringTickRunning) return;
  if (!hasWorkspaceSession()) return; // регулярные платежи живут в пространстве
  recurringTickRunning = true;
  const now = new Date();
  const today = ymd(now);
  try {
    const settings = await loadNotificationSettings();
    if (!settings.notify_enabled || !settings.notify_reminders || isQuietNow(settings, now)) return;
    const list = await api<RecurringTransaction[]>('GET', '/recurring-transactions');
    const cur = now.getHours() * 60 + now.getMinutes();
    for (const r of list) {
      if (r.archived || !r.reminder_enabled) continue;
      if (r.last_reminded_on === today) continue;
      if (!isRecurringDue(r, now)) continue;
      const remind = minutesFromHHMM(r.remind_time ?? '09:00') ?? 540;
      if (cur < remind) continue;
      showNotification('💸 ' + r.description, `Регулярный платёж · ${Math.abs(r.amount)}`, settings);
      await api('PATCH', `/recurring-transactions/${r.id}`, { last_reminded_on: today });
    }
  } catch {
    // offline / server warming up
  } finally {
    recurringTickRunning = false;
  }
}

/**
 * Раз в 10 минут просим сервер:
 *  - проставить 'missed' для рутин, у которых истекло окно подтверждения,
 *  - закрыть прошедшие недели/месяцы для weekly_n / monthly_day.
 * Сервер сам учитывает идемпотентность.
 */
async function runHabitMaintenance(): Promise<void> {
  try {
    await api('POST', '/habits/_run-auto-miss');
    await api('POST', '/habits/_close-periods');
  } catch {
    // сервер может ещё подниматься
  }
}

export function initReminders(opts: { serverUrl: string }): void {
  serverUrl = opts.serverUrl;
  destroyReminders();
  // Check every 30 seconds.
  pollTimer = setInterval(() => {
    void tick();
    void tickHabits();
    void tickRecurring();
  }, 30_000);
  // First check after 5 seconds — сначала прогоняем maintenance (auto-miss
  // и закрытие периодов), потом обычный tick и tickHabits, чтобы не пушить
  // рутину, которая уже считается missed/закрытой.
  firstTickTimer = setTimeout(() => {
    void (async (): Promise<void> => {
      await runHabitMaintenance();
      await tick();
      await tickHabits();
      await tickRecurring();
    })();
  }, 5000);
  // Maintenance — каждые 10 минут.
  maintenanceTimer = setInterval(() => {
    void runHabitMaintenance();
  }, 10 * 60_000);
}

export function destroyReminders(): void {
  if (pollTimer) clearInterval(pollTimer);
  if (firstTickTimer) clearTimeout(firstTickTimer);
  if (maintenanceTimer) clearInterval(maintenanceTimer);
  pollTimer = null;
  firstTickTimer = null;
  maintenanceTimer = null;
  lastHabitMinute = '';
}
