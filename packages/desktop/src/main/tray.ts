import { Tray, Menu, nativeImage, BrowserWindow, app } from 'electron';
import type { DayTotals, WorkSession } from '@swit/shared';

interface State {
  active: WorkSession | null;
  totals: DayTotals | null;
}

let tray: Tray | null = null;
let serverUrl = '';
let state: State = { active: null, totals: null };
let getMainWindow: () => BrowserWindow | null = () => null;
let pollTimer: NodeJS.Timeout | null = null;

async function api<T>(method: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch(serverUrl + path, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined
  });
  if (!res.ok) throw new Error(`${method} ${path} → ${res.status}`);
  return res.json() as Promise<T>;
}

function fmtHMS(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  const h = String(Math.floor(s / 3600)).padStart(2, '0');
  const m = String(Math.floor((s % 3600) / 60)).padStart(2, '0');
  const ss = String(s % 60).padStart(2, '0');
  return `${h}:${m}:${ss}`;
}

function liveWorkSeconds(): number {
  const t = state.totals;
  if (!t) return 0;
  let s = t.work_s;
  if (t.open_segment?.type === 'work') {
    s += Math.floor((Date.now() - new Date(t.open_segment.started_at).getTime()) / 1000);
  }
  return s;
}

function statusLabel(): string {
  if (!state.active) return 'День не запущен';
  if (state.active.type === 'work') return 'Идёт работа';
  if (state.active.type === 'break') return 'Перерыв';
  return 'Пауза';
}

function buildMenu(): Menu {
  const running = state.active?.type === 'work';
  const onBreak = state.active?.type === 'break';
  const paused = state.active?.type === 'pause';
  const hasAnySession = !!state.active || (state.totals?.segments.length ?? 0) > 0;
  return Menu.buildFromTemplate([
    { label: `SWIT Day — ${statusLabel()}`, enabled: false },
    { label: `Сегодня: ${fmtHMS(liveWorkSeconds())}`, enabled: false },
    { type: 'separator' },
    {
      label: running
        ? '⏸ Пауза'
        : onBreak
          ? '⤴ Вернуться к работе'
          : paused
            ? '▶ Продолжить'
            : '▶ Старт',
      click: async () => {
        if (running) {
          await api('POST', '/sessions/start', { type: 'pause' });
        } else {
          await api('POST', '/sessions/start', { type: 'work' });
        }
        await refresh();
      }
    },
    {
      label: '☕ Перерыв',
      enabled: !onBreak && hasAnySession,
      click: async () => {
        await api('POST', '/sessions/start', { type: 'break' });
        await refresh();
      }
    },
    {
      label: '■ Завершить день',
      enabled: hasAnySession,
      click: async () => {
        const w = getMainWindow();
        if (!w) return;
        if (w.isMinimized()) w.restore();
        w.show();
        w.focus();
        w.webContents.send('timer:end-day-requested');
      }
    },
    { type: 'separator' },
    {
      label: 'Открыть SWIT Day',
      click: () => {
        const w = getMainWindow();
        if (w) {
          if (w.isMinimized()) w.restore();
          w.show();
          w.focus();
        }
      }
    },
    { type: 'separator' },
    { label: 'Выйти', click: () => app.quit() }
  ]);
}

async function refresh(): Promise<void> {
  try {
    const [active, totals] = await Promise.all([
      api<WorkSession | null>('GET', '/sessions/active'),
      api<DayTotals>('GET', '/sessions/totals')
    ]);
    state = { active, totals };
    if (tray) {
      tray.setContextMenu(buildMenu());
      const w = getMainWindow();
      w?.webContents.send('timer:changed');
    }
  } catch {
    // server still starting up
  }
}

function renderTitle(): void {
  if (!tray) return;
  if (state.active?.type === 'work') {
    tray.setTitle(' ' + fmtHMS(liveWorkSeconds()));
  } else if (state.active?.type === 'break') {
    tray.setTitle(' ☕');
  } else {
    tray.setTitle('');
  }
}

export function initTray(opts: {
  serverUrl: string;
  getMainWindow: () => BrowserWindow | null;
}): void {
  serverUrl = opts.serverUrl;
  getMainWindow = opts.getMainWindow;

  // Empty image — macOS only needs a title for menubar; this avoids shipping icon assets.
  tray = new Tray(nativeImage.createEmpty());
  tray.setToolTip('SWIT Day');
  tray.setContextMenu(buildMenu());

  // Tick every second to update title; refresh from server every 5s.
  let tickCount = 0;
  pollTimer = setInterval(() => {
    renderTitle();
    tickCount++;
    if (tickCount % 5 === 0) void refresh();
  }, 1000);

  void refresh();
}

export function destroyTray(): void {
  if (pollTimer) clearInterval(pollTimer);
  tray?.destroy();
  tray = null;
}
