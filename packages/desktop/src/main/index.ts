import { app, BrowserWindow, shell, ipcMain, Notification } from 'electron';
import { createWriteStream, mkdirSync, type WriteStream } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { initTray, destroyTray } from './tray.js';
import { initReminders, destroyReminders } from './reminders.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const SERVER_PORT = 47821;
const SERVER_URL = `http://127.0.0.1:${SERVER_PORT}`;
let serverInstance: { close: () => Promise<void> } | null = null;
let serverLog: WriteStream | null = null;
let mainWindow: BrowserWindow | null = null;

function getLogPath(): string {
  return path.join(app.getPath('userData'), 'swit-server.log');
}

function getDataDir(): string {
  if (process.env.SWIT_DATA_DIR) return process.env.SWIT_DATA_DIR;
  return process.platform === 'darwin'
    ? path.join(os.homedir(), 'Library', 'Application Support', 'SWIT Day')
    : path.join(os.homedir(), '.swit-day');
}

function logToFile(msg: string): void {
  try {
    serverLog?.write(`[${new Date().toISOString()}] ${msg}\n`);
  } catch {
    /* nothing */
  }
}

function boolSetting(raw: Record<string, string>, key: string, fallback: boolean): boolean {
  const value = raw[key];
  if (value === undefined) return fallback;
  return value === '1' || value === 'true';
}

function minutesFromHHMM(value: string): number | null {
  const match = value.match(/^(\d{2}):(\d{2})$/);
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours > 23 || minutes > 59) return null;
  return hours * 60 + minutes;
}

function isQuietNow(startValue: string, endValue: string): boolean {
  const start = minutesFromHHMM(startValue);
  const end = minutesFromHHMM(endValue);
  if (start === null || end === null || start === end) return false;
  const now = new Date();
  const current = now.getHours() * 60 + now.getMinutes();
  if (start < end) return current >= start && current < end;
  return current >= start || current < end;
}

async function loadSettings(): Promise<Record<string, string>> {
  const res = await fetch(`${SERVER_URL}/settings`);
  if (!res.ok) throw new Error(`GET /settings → ${res.status}`);
  return res.json() as Promise<Record<string, string>>;
}

async function showAppNotification(title: string, body?: string): Promise<void> {
  if (!Notification.isSupported()) return;
  try {
    const settings = await loadSettings();
    const enabled = boolSetting(settings, 'notify_enabled', true);
    const quietEnabled = boolSetting(settings, 'notify_quiet_enabled', false);
    if (!enabled) return;
    if (
      quietEnabled &&
      isQuietNow(settings.notify_quiet_start ?? '22:00', settings.notify_quiet_end ?? '08:00')
    ) {
      return;
    }
    const sound = boolSetting(settings, 'notify_sound', true);
    new Notification({ title, body: body ?? '', silent: !sound }).show();
  } catch {
    new Notification({ title, body: body ?? '' }).show();
  }
}

async function startServer(): Promise<void> {
  // В dev сервер запускается отдельно через `npm run dev:server`.
  if (process.env.NODE_ENV === 'development' || !app.isPackaged) return;

  try {
    serverLog = createWriteStream(getLogPath(), { flags: 'a' });
  } catch (err) {
    console.error('[server] failed to open log file', err);
  }
  logToFile('--- main process startServer() ---');

  // In-process запуск: импортируем сервер и стартуем в этом же процессе.
  // Электрон уже умеет грузить native module better-sqlite3 (он есть в
  // node_modules desktop'а, пересобран под Electron ABI). Никаких fork'ов
  // и проблем с разными версиями Node ABI.
  //
  // server/index.js распакован в app.asar.unpacked через asarUnpack —
  // меняем путь, иначе ESM-импорт не пройдёт.
  const rawPath = path.resolve(__dirname, '../server/index.js');
  const serverEntry = rawPath.replace(
    `${path.sep}app.asar${path.sep}`,
    `${path.sep}app.asar.unpacked${path.sep}`
  );
  logToFile(`server entry: ${serverEntry}`);

  // SWIT_INPROC=1 говорит серверу не вешать SIGINT/SIGTERM-handler и не
  // звать app.listen из top-level — мы сделаем это вручную.
  process.env.SWIT_INPROC = '1';
  process.env.SWIT_PORT = String(SERVER_PORT);

  try {
    const mod = (await import(pathToFileURL(serverEntry).href)) as {
      startSwitServer: (opts?: { host?: string; port?: number }) => Promise<{ close(): Promise<void> }>;
      stopSwitServer: (app: { close(): Promise<void> } | null) => Promise<void>;
    };
    const inst = await mod.startSwitServer({ host: '127.0.0.1', port: SERVER_PORT });
    serverInstance = {
      close: async () => {
        await mod.stopSwitServer(inst);
      }
    };
    logToFile(`[server] up on http://127.0.0.1:${SERVER_PORT}`);
  } catch (err) {
    logToFile(`[server] failed to start: ${err instanceof Error ? err.stack : String(err)}`);
  }
}

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1200,
    minHeight: 720,
    titleBarStyle: 'hiddenInset',
    backgroundColor: '#F5F6FA',
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.js'),
      sandbox: false,
      contextIsolation: true
    }
  });

  function openExternalSafely(url: string): void {
    try {
      const u = new URL(url);
      if (!['https:', 'http:', 'mailto:'].includes(u.protocol)) return;
      void shell.openExternal(url);
    } catch {
      // Ignore malformed URLs from renderer content.
    }
  }

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    openExternalSafely(url);
    return { action: 'deny' };
  });

  const devUrl = process.env['ELECTRON_RENDERER_URL'];
  if (devUrl) {
    mainWindow.loadURL(devUrl);
    mainWindow.webContents.openDevTools({ mode: 'detach' });
  } else {
    mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'));
  }
}

ipcMain.handle('app:get-server-url', () => SERVER_URL);

ipcMain.handle('app:open-data-folder', async () => {
  const dir = getDataDir();
  mkdirSync(dir, { recursive: true });
  const result = await shell.openPath(dir);
  return result;
});

ipcMain.handle('notification:show', async (_e, payload: { title: string; body?: string }) => {
  await showAppNotification(payload.title, payload.body);
});

app.whenReady().then(async () => {
  await startServer();
  createWindow();
  initTray({ serverUrl: SERVER_URL, getMainWindow: () => mainWindow });
  initReminders({ serverUrl: SERVER_URL });

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

let isQuitting = false;

/**
 * Корректный shutdown. Сервер крутится in-process, поэтому надо успеть
 * до выхода вызвать stopSwitServer → wal_checkpoint + db.close. Иначе
 * последние записи могут зависнуть в WAL и потеряться при крэше.
 */
app.on('before-quit', (event) => {
  if (isQuitting) return;
  destroyTray();
  destroyReminders();

  if (!serverInstance) return;

  event.preventDefault();
  isQuitting = true;

  const forceTimer = setTimeout(() => {
    logToFile('[server] shutdown timeout — forcing exit');
    app.exit(0);
  }, 2500);

  serverInstance
    .close()
    .catch((err) => logToFile(`[server] close error: ${String(err)}`))
    .finally(() => {
      clearTimeout(forceTimer);
      serverLog?.end();
      app.exit(0);
    });
});
