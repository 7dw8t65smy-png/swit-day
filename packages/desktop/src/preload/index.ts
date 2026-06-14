import { contextBridge, ipcRenderer } from 'electron';

export interface SwitSession {
  serverUrl: string;
  token: string;
  activeWorkspaceId: string | null;
}

const api = {
  getServerUrl: (): Promise<string> => ipcRenderer.invoke('app:get-server-url'),
  openDataFolder: (): Promise<string> => ipcRenderer.invoke('app:open-data-folder'),
  showNotification: (title: string, body?: string): Promise<void> =>
    ipcRenderer.invoke('notification:show', { title, body }),
  saveFile: (opts: {
    defaultName: string;
    data: string;
    base64?: boolean;
  }): Promise<{ saved: boolean; path?: string }> => ipcRenderer.invoke('export:save-file', opts),
  // Сессия многопользовательского режима (токен хранится в main, не в localStorage).
  session: {
    get: (): Promise<SwitSession | null> => ipcRenderer.invoke('session:get'),
    set: (session: SwitSession | null): Promise<{ ok: true }> =>
      ipcRenderer.invoke('session:set', session),
    clear: (): Promise<{ ok: true }> => ipcRenderer.invoke('session:clear')
  }
};

contextBridge.exposeInMainWorld('swit', api);

export type SwitApi = typeof api;
declare global {
  interface Window {
    swit: SwitApi;
  }
}
