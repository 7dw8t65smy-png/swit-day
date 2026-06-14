// Сессия многопользовательского режима в main-процессе. Хранится в electron-store
// (файл в userData, НЕ в localStorage рендерера). Используется и IPC-хендлерами
// (index.ts), и циклом уведомлений (reminders.ts), чтобы ходить на VPS с токеном.
import Store from 'electron-store';

export interface SwitSession {
  serverUrl: string;
  token: string;
  activeWorkspaceId: string | null;
}

const store = new Store<{ session: SwitSession | null }>({
  name: 'swit-session',
  encryptionKey: 'swit-day-session-v1',
  defaults: { session: null }
});

export function getSession(): SwitSession | null {
  return store.get('session');
}

export function setSession(session: SwitSession | null): void {
  if (session && typeof session.serverUrl === 'string' && typeof session.token === 'string') {
    store.set('session', {
      serverUrl: session.serverUrl,
      token: session.token,
      activeWorkspaceId: session.activeWorkspaceId ?? null
    });
  } else {
    store.set('session', null);
  }
}

export function clearSession(): void {
  store.set('session', null);
}
