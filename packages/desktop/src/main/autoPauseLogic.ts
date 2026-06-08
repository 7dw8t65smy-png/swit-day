import type { WorkSession } from '@swit/shared';

// Чистая (без побочных эффектов) логика авто-паузы по простою системы.
// Вынесена из autoPause.ts, чтобы её можно было покрыть юнит-тестами без
// Electron (powerMonitor) и без сети (fetch). Слой ввода-вывода в autoPause.ts
// лишь собирает входные данные, зовёт decideAutoPause() и исполняет действие.

const DEFAULT_IDLE_THRESHOLD_SEC = 60;

export interface AutoPauseSettings {
  /** Включена ли авто-пауза (по умолчанию — да). */
  enabled: boolean;
  /** Порог простоя в секундах, после которого ставим работу на паузу. */
  idleThresholdSec: number;
}

// Сервер хранит настройки как Record<string,string>. Разбираем поля авто-паузы:
//   auto_pause_enabled : '1'|'true' → вкл, иначе выкл (отсутствует → вкл).
//   auto_pause_idle_min: минуты простоя (≥1) → секунды; иначе дефолт 60 c.
export function parseAutoPauseSettings(raw: Record<string, string>): AutoPauseSettings {
  const en = raw.auto_pause_enabled;
  const enabled = en === undefined ? true : en === '1' || en === 'true';
  const min = Number(raw.auto_pause_idle_min);
  const idleThresholdSec =
    Number.isFinite(min) && min >= 1 ? Math.round(min * 60) : DEFAULT_IDLE_THRESHOLD_SEC;
  return { enabled, idleThresholdSec };
}

export interface AutoPauseState {
  /** Системный простой в секундах (powerMonitor.getSystemIdleTime). */
  idleSec: number;
  /** Порог простоя в секундах. */
  idleThresholdSec: number;
  /** Текущая открытая сессия (или null, если день не идёт). */
  active: WorkSession | null;
  /** Стоит ли сейчас НАША авто-пауза. */
  autoPaused: boolean;
  /** id сессии-паузы, которую поставили мы (для сверки с active). */
  autoPauseSessionId: string | null;
  /** Текущее время в мс (Date.now) — для бэкдейта паузы. */
  nowMs: number;
}

export type AutoPauseAction =
  // Ничего не делаем.
  | { kind: 'none' }
  // Отпустить контроль: пользователь сам сменил состояние — больше не трогаем.
  | { kind: 'release' }
  // Поставить на паузу: закрыть работу в `endWorkAt` (момент, когда активность
  // прекратилась), а саму паузу стартовать «сейчас» — чтобы её таймер шёл с 0:00.
  // Минута простоя-порога между ними остаётся неучтённым промежутком.
  | { kind: 'pause'; endWorkAt: string }
  // Вернуться к работе (появилась активность).
  | { kind: 'resume' };

// Решает, что делать на очередном тике. Чистая функция: одни и те же входные
// данные → одно и то же действие.
export function decideAutoPause(s: AutoPauseState): AutoPauseAction {
  if (s.autoPaused) {
    // Сверяем, что активна именно наша пауза. Если пользователь вмешался
    // (завершил день / переключил состояние / возобновил работу руками) —
    // отпускаем контроль и больше не возобновляем автоматически.
    if (!s.active || s.active.id !== s.autoPauseSessionId || s.active.type !== 'pause') {
      return { kind: 'release' };
    }
    // Появилась активность раньше порога → возвращаемся к работе.
    if (s.idleSec < s.idleThresholdSec) return { kind: 'resume' };
    // Всё ещё простой → держим паузу.
    return { kind: 'none' };
  }

  // Не на авто-паузе: ставим на паузу идущую РАБОТУ при достижении порога.
  // Никогда не начинаем день сами — если открытой работы нет, бездействуем.
  if (s.active && s.active.type === 'work' && s.idleSec >= s.idleThresholdSec) {
    const idleStartMs = s.nowMs - s.idleSec * 1000;
    const activeStartMs = new Date(s.active.started_at).getTime();
    // Работа заканчивается в момент, когда активность прекратилась, но не раньше
    // начала самой работы — иначе простой засчитался бы как работа. Сама пауза
    // стартует «сейчас» (в слое ввода-вывода), поэтому её таймер пойдёт с 0:00.
    const endWorkAt = new Date(Math.max(idleStartMs, activeStartMs)).toISOString();
    return { kind: 'pause', endWorkAt };
  }

  return { kind: 'none' };
}
