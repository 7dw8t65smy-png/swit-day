import { create } from 'zustand';

/**
 * Глобальный стор тостов (всплывающих уведомлений).
 *
 * Зачем: до сих пор сетевые сбои в страницах гасились молча (почти нет
 * catch-блоков). Этот стор позволяет api.ts и глобальному обработчику
 * unhandledrejection всплывать ошибки пользователю, а ToastHost.tsx — рисовать
 * их поверх любой страницы.
 *
 * Только in-memory состояние, никакого сетевого/дискового IO. Авто-скрытие
 * через setTimeout; повторно одинаковые сообщения в окне DEDUPE_MS не плодим,
 * чтобы шквал упавших запросов не превратился в стену тостов.
 */

export type ToastKind = 'error' | 'info';

export interface Toast {
  id: string;
  kind: ToastKind;
  message: string;
  /** Необязательная техническая строка (метод/путь/код) — мелким приглушённым текстом. */
  detail?: string;
}

export interface PushToastInput {
  kind: ToastKind;
  message: string;
  detail?: string;
}

const AUTO_DISMISS_MS = 5000;
const DEDUPE_MS = 2000;

interface ToastState {
  toasts: Toast[];
  push: (input: PushToastInput) => string | null;
  dismiss: (id: string) => void;
  clear: () => void;
}

// Время последнего показа по тексту сообщения — для дедупа в пределах DEDUPE_MS.
const lastShownAt = new Map<string, number>();

function makeId(): string {
  // crypto.randomUUID доступен в Electron-рендерере; запасной вариант на всякий.
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export const useToasts = create<ToastState>((set, get) => ({
  toasts: [],
  push: ({ kind, message, detail }) => {
    const now = Date.now();
    const prev = lastShownAt.get(message);
    if (prev !== undefined && now - prev < DEDUPE_MS) {
      // Уже показывали этот текст только что — не дублируем.
      return null;
    }
    lastShownAt.set(message, now);

    const id = makeId();
    set((s) => ({ toasts: [...s.toasts, { id, kind, message, detail }] }));

    window.setTimeout(() => {
      get().dismiss(id);
    }, AUTO_DISMISS_MS);

    return id;
  },
  dismiss: (id) =>
    set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
  clear: () => set({ toasts: [] })
}));

/**
 * Императивный пуш для не-React модулей (api.ts, глобальные обработчики),
 * чтобы не тянуть хук в обычные функции. Возвращает id тоста или null (дедуп).
 */
export function pushToast(input: PushToastInput): string | null {
  return useToasts.getState().push(input);
}
