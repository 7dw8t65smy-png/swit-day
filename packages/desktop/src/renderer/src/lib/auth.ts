// Состояние сессии многопользовательского режима.
//
// Режимы (status):
//  - 'loading' — идёт проба сервера / восстановление сессии
//  - 'legacy'  — сервер без авторизации (одиночный режим): приложение работает
//                как раньше, без входа и без пространств
//  - 'anon'    — сервер требует вход, пользователь не залогинен → экран входа
//  - 'authed'  — залогинен, выбрано активное пространство
import { create } from 'zustand';
import type { User, WorkspaceWithRole } from '@swit/shared';
import { authApi, configureApi, getApiConfig } from '../api';
import { connectRealtime, disconnectRealtime, onRealtimeChange } from './realtime';

export type AuthStatus = 'loading' | 'legacy' | 'anon' | 'authed';

interface SwitSession {
  serverUrl: string;
  token: string;
  activeWorkspaceId: string | null;
}

interface SessionBridge {
  get(): Promise<SwitSession | null>;
  set(s: SwitSession | null): Promise<{ ok: true }>;
  clear(): Promise<{ ok: true }>;
}

function sessionBridge(): SessionBridge | null {
  const swit = (window as unknown as { swit?: { session?: SessionBridge } }).swit;
  return swit?.session ?? null;
}

const DEFAULT_URL = 'https://65-21-103-80.sslip.io';

async function persist(token: string, workspaceId: string | null): Promise<void> {
  const { serverUrl } = getApiConfig();
  await sessionBridge()?.set({ serverUrl, token, activeWorkspaceId: workspaceId });
}

interface AuthState {
  status: AuthStatus;
  serverUrl: string;
  user: User | null;
  workspaces: WorkspaceWithRole[];
  activeWorkspaceId: string | null;
  // Счётчик инвалидации: растёт при realtime-изменении или смене пространства.
  // Страницы могут держать его в зависимостях своих загрузок (Этап 4).
  dataVersion: number;
  bootstrap: () => Promise<void>;
  login: (serverUrl: string, handle: string, password: string) => Promise<string | null>;
  register: (
    serverUrl: string,
    handle: string,
    displayName: string,
    password: string
  ) => Promise<string | null>;
  logout: () => Promise<void>;
  setActiveWorkspace: (id: string) => Promise<void>;
  refreshWorkspaces: () => Promise<void>;
  bumpData: () => void;
}

// Realtime-изменения двигают dataVersion → подписанные страницы перезагрузятся.
let realtimeBound = false;

export const useAuth = create<AuthState>((set, get) => ({
  status: 'loading',
  serverUrl: DEFAULT_URL,
  user: null,
  workspaces: [],
  activeWorkspaceId: null,
  dataVersion: 0,

  bootstrap: async () => {
    if (!realtimeBound) {
      realtimeBound = true;
      onRealtimeChange(() => get().bumpData());
    }
    const saved = (await sessionBridge()?.get()) ?? null;
    const serverUrl = saved?.serverUrl || DEFAULT_URL;
    configureApi({ serverUrl, token: null, workspaceId: null });
    set({ serverUrl });

    const health = await authApi.health(serverUrl);
    // Сервер недоступен или одиночный режим → работаем без входа (как раньше).
    if (!health || !health.auth_required) {
      set({ status: 'legacy' });
      return;
    }

    if (saved?.token) {
      configureApi({ token: saved.token });
      const me = await authApi.me();
      if (me.ok && me.data) {
        const workspaces = me.data.workspaces;
        const active =
          (saved.activeWorkspaceId &&
            workspaces.find((w) => w.id === saved.activeWorkspaceId)?.id) ||
          workspaces.find((w) => w.type === 'personal')?.id ||
          workspaces[0]?.id ||
          null;
        configureApi({ workspaceId: active });
        set({ status: 'authed', user: me.data.user, workspaces, activeWorkspaceId: active });
        await persist(saved.token, active);
        connectRealtime();
        return;
      }
      // Токен протух — чистим.
      configureApi({ token: null, workspaceId: null });
      await sessionBridge()?.clear();
    }
    set({ status: 'anon' });
  },

  login: async (serverUrl, handle, password) => {
    configureApi({ serverUrl, token: null, workspaceId: null });
    const res = await authApi.login({ handle, password });
    if (!res.ok || !res.data) return res.error ?? 'Не удалось войти.';
    return applyAuth(serverUrl, res.data, set);
  },

  register: async (serverUrl, handle, displayName, password) => {
    configureApi({ serverUrl, token: null, workspaceId: null });
    const res = await authApi.register({ handle, display_name: displayName, password });
    if (!res.ok || !res.data) return res.error ?? 'Не удалось зарегистрироваться.';
    return applyAuth(serverUrl, res.data, set);
  },

  logout: async () => {
    await authApi.logout();
    disconnectRealtime();
    await sessionBridge()?.clear();
    configureApi({ token: null, workspaceId: null });
    set({ status: 'anon', user: null, workspaces: [], activeWorkspaceId: null });
  },

  setActiveWorkspace: async (id) => {
    if (id === get().activeWorkspaceId) return;
    configureApi({ workspaceId: id });
    set((s) => ({ activeWorkspaceId: id, dataVersion: s.dataVersion + 1 }));
    await persist(getApiConfig().token ?? '', id);
    connectRealtime();
  },

  refreshWorkspaces: async () => {
    const res = await authApi.listWorkspaces();
    if (res.ok && res.data) set({ workspaces: res.data });
  },

  bumpData: () => set((s) => ({ dataVersion: s.dataVersion + 1 }))
}));

// Применяет успешный вход/регистрацию: токен, пространства, активное = личное.
async function applyAuth(
  serverUrl: string,
  auth: { token: string; user: User; workspaces: WorkspaceWithRole[] },
  set: (partial: Partial<AuthState>) => void
): Promise<null> {
  configureApi({ serverUrl, token: auth.token });
  const active =
    auth.workspaces.find((w) => w.type === 'personal')?.id || auth.workspaces[0]?.id || null;
  configureApi({ workspaceId: active });
  set({
    status: 'authed',
    serverUrl,
    user: auth.user,
    workspaces: auth.workspaces,
    activeWorkspaceId: active
  });
  await sessionBridge()?.set({ serverUrl, token: auth.token, activeWorkspaceId: active });
  connectRealtime();
  return null;
}
