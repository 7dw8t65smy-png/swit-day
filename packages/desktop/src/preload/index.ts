import { contextBridge, ipcRenderer } from 'electron';

const api = {
  getServerUrl: (): Promise<string> => ipcRenderer.invoke('app:get-server-url'),
  openDataFolder: (): Promise<string> => ipcRenderer.invoke('app:open-data-folder'),
  showNotification: (title: string, body?: string): Promise<void> =>
    ipcRenderer.invoke('notification:show', { title, body }),
  saveFile: (opts: {
    defaultName: string;
    data: string;
    base64?: boolean;
  }): Promise<{ saved: boolean; path?: string }> => ipcRenderer.invoke('export:save-file', opts)
};

contextBridge.exposeInMainWorld('swit', api);

export type SwitApi = typeof api;
declare global {
  interface Window {
    swit: SwitApi;
  }
}
