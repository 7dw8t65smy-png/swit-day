import { Tray, Menu, nativeImage, BrowserWindow, app } from 'electron';

let tray: Tray | null = null;
let getMainWindow: () => BrowserWindow | null = () => null;

function showMainWindow(): void {
  const w = getMainWindow();
  if (!w) return;
  if (w.isMinimized()) w.restore();
  w.show();
  w.focus();
}

function buildMenu(): Menu {
  return Menu.buildFromTemplate([
    { label: 'Открыть SWIT Day', click: showMainWindow },
    { type: 'separator' },
    { label: 'Выйти', click: () => app.quit() }
  ]);
}

export function initTray(opts: {
  serverUrl: string;
  getMainWindow: () => BrowserWindow | null;
}): void {
  getMainWindow = opts.getMainWindow;

  // Empty image — macOS shows the title/menu; avoids shipping icon assets.
  tray = new Tray(nativeImage.createEmpty());
  tray.setToolTip('SWIT Day');
  tray.setTitle('');
  tray.setContextMenu(buildMenu());
}

export function destroyTray(): void {
  tray?.destroy();
  tray = null;
}
