import { contextBridge, ipcRenderer } from 'electron';

const api = {
  getServerUrl: (): Promise<string> => ipcRenderer.invoke('app:get-server-url'),
  openDataFolder: (): Promise<string> => ipcRenderer.invoke('app:open-data-folder'),
  showNotification: (title: string, body?: string): Promise<void> =>
    ipcRenderer.invoke('notification:show', { title, body }),
  notifyAutoPauseSettingsChanged: (): Promise<void> =>
    ipcRenderer.invoke('autopause:settings-changed'),
  saveFile: (opts: {
    defaultName: string;
    data: string;
    base64?: boolean;
  }): Promise<{ saved: boolean; path?: string }> => ipcRenderer.invoke('export:save-file', opts),
  onTimerChanged: (cb: () => void): (() => void) => {
    const handler = () => cb();
    ipcRenderer.on('timer:changed', handler);
    return () => ipcRenderer.removeListener('timer:changed', handler);
  },
  onEndDayRequested: (cb: () => void): (() => void) => {
    const handler = () => cb();
    ipcRenderer.on('timer:end-day-requested', handler);
    return () => ipcRenderer.removeListener('timer:end-day-requested', handler);
  }
};

contextBridge.exposeInMainWorld('swit', api);

export type SwitApi = typeof api;
declare global {
  interface Window {
    swit: SwitApi;
  }
}
