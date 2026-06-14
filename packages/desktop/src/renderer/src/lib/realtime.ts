// Realtime-подписка через EventSource (SSE). Один поток на активное
// пространство; при смене пространства/токена пересоздаём. Сервер шлёт
// событие `changed` с { resource, ts } — мы зовём onChange, а UI решает,
// что перезапросить (см. useRealtimeRefetch в Этапе 4).
import { realtimeUrl } from '../api';

export interface ChangePayload {
  resource: string;
  ts: string;
}

let source: EventSource | null = null;
const listeners = new Set<(p: ChangePayload) => void>();

/** Подписаться на realtime-изменения. Возвращает функцию отписки. */
export function onRealtimeChange(fn: (p: ChangePayload) => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

function emit(p: ChangePayload): void {
  for (const fn of listeners) {
    try {
      fn(p);
    } catch {
      /* слушатель не должен ронять поток */
    }
  }
}

/** (Пере)подключает SSE к текущему пространству. Безопасно звать многократно. */
export function connectRealtime(): void {
  disconnectRealtime();
  const url = realtimeUrl();
  if (!url) return; // нет токена/пространства — в одиночном режиме realtime не нужен
  try {
    source = new EventSource(url);
    source.addEventListener('changed', (ev) => {
      try {
        const data = JSON.parse((ev as MessageEvent).data) as ChangePayload;
        if (data && typeof data.resource === 'string') emit(data);
      } catch {
        /* битый фрейм игнорируем */
      }
    });
    // onerror: EventSource сам переподключится (retry задаёт сервер). Ничего не делаем.
  } catch {
    source = null;
  }
}

export function disconnectRealtime(): void {
  if (source) {
    try {
      source.close();
    } catch {
      /* already closed */
    }
    source = null;
  }
}
