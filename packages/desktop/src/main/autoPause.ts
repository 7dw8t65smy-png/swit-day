import { powerMonitor, type BrowserWindow } from 'electron';
import type { WorkSession } from '@swit/shared';
import { decideAutoPause, parseAutoPauseSettings } from './autoPauseLogic.js';

// Авто-пауза таймера по простою системы.
//
// Идея: пока идёт сессия «работа», следим за системным временем простоя
// (powerMonitor.getSystemIdleTime() — секунды с последнего ввода мыши/клавиатуры
// во всей системе). Простой ≥ порога → ставим работу на паузу (бэкдейтим конец
// работы на момент, когда активность прекратилась, чтобы простой не попал в
// рабочее время). Первое касание клавиатуры/тачпада → возобновляем работу.
//
// Гарантии аккуратности:
//   • Ставим на паузу ТОЛЬКО открытую сессию типа 'work'.
//   • Возобновляем ТОЛЬКО ту паузу, которую сами и поставили (сверяем id).
//     Если пользователь вручную сменил состояние (пауза/перерыв/завершил день) —
//     отпускаем контроль и больше её не трогаем.
//   • Никогда не начинаем «день» сами: если открытой сессии нет — бездействуем.

const POLL_MS = 2000;
const SETTINGS_REFRESH_EVERY = 15; // ~ каждые 30 c обновляем настройки

let serverUrl = '';
let getMainWindow: () => BrowserWindow | null = () => null;
let timer: NodeJS.Timeout | null = null;

// Наша бухгалтерия: поставили ли мы авто-паузу и какой именно сессии.
let autoPaused = false;
let autoPauseSessionId: string | null = null;

// Кэш настроек (обновляется периодически из /settings).
let enabled = true;
let idleThresholdSec = 60;
let tickCounter = 0;

async function api<T>(method: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch(serverUrl + path, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined
  });
  if (!res.ok) throw new Error(`${method} ${path} → ${res.status}`);
  return res.json() as Promise<T>;
}

function notifyRenderer(): void {
  getMainWindow()?.webContents.send('timer:changed');
}

async function refreshSettings(): Promise<void> {
  try {
    const s = await api<Record<string, string>>('GET', '/settings');
    const parsed = parseAutoPauseSettings(s);
    enabled = parsed.enabled;
    idleThresholdSec = parsed.idleThresholdSec;
  } catch {
    /* сервер ещё поднимается — оставляем прежние значения */
  }
}

function releaseControl(): void {
  autoPaused = false;
  autoPauseSessionId = null;
}

async function tick(): Promise<void> {
  if (tickCounter % SETTINGS_REFRESH_EVERY === 0) await refreshSettings();
  tickCounter++;

  if (!enabled) {
    releaseControl();
    return;
  }

  const idle = powerMonitor.getSystemIdleTime(); // секунды

  let active: WorkSession | null;
  try {
    active = await api<WorkSession | null>('GET', '/sessions/active');
  } catch {
    return; // сервер недоступен — попробуем на следующем тике
  }

  const action = decideAutoPause({
    idleSec: idle,
    idleThresholdSec,
    active,
    autoPaused,
    autoPauseSessionId,
    nowMs: Date.now()
  });

  switch (action.kind) {
    case 'none':
      return;

    case 'release':
      // Пользователь сам сменил состояние — отпускаем и не трогаем дальше.
      releaseControl();
      return;

    case 'resume':
      // Появилась активность — возвращаемся к работе.
      try {
        await api('POST', '/sessions/start', { type: 'work' });
        releaseControl();
        notifyRenderer();
      } catch {
        /* не вышло — повторим на следующем тике */
      }
      return;

    case 'pause':
      // Простой достиг порога: закрываем работу там, где активность прекратилась
      // (prev_ended_at), а саму паузу стартуем «сейчас» — её таймер пойдёт с 0:00.
      // Минута простоя-порога между ними остаётся неучтённым промежутком.
      try {
        const paused = await api<WorkSession>('POST', '/sessions/start', {
          type: 'pause',
          prev_ended_at: action.endWorkAt,
          notes: 'auto'
        });
        autoPaused = true;
        autoPauseSessionId = paused.id;
        notifyRenderer();
      } catch {
        /* повторим на следующем тике */
      }
      return;
  }
}

export function initAutoPause(opts: {
  serverUrl: string;
  getMainWindow: () => BrowserWindow | null;
}): void {
  serverUrl = opts.serverUrl;
  getMainWindow = opts.getMainWindow;
  releaseControl();
  void refreshSettings();
  timer = setInterval(() => void tick(), POLL_MS);
}

export function destroyAutoPause(): void {
  if (timer) clearInterval(timer);
  timer = null;
  releaseControl();
}
