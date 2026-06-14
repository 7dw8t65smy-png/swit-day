// Near-realtime через Server-Sent Events (SSE). Никаких нативных/доп. зависимостей:
// это обычный HTTP-стрим text/event-stream. Сервер только пушит маленькие сигналы
// «в пространстве X изменился ресурс Y» — клиент в ответ перезапрашивает нужный список.
// Клиентские мутации по-прежнему идут обычным REST; SSE односторонний (сервер → клиент).
import type { FastifyReply } from 'fastify';

interface Client {
  id: string;
  workspaceId: string;
  reply: FastifyReply;
}

// workspaceId → набор подключённых клиентов этого пространства.
const rooms = new Map<string, Set<Client>>();

export interface ChangeEvent {
  resource: string; // напр. 'tasks', 'notes', 'canvases'
  ts: string;
}

/** Регистрирует SSE-клиента и возвращает функцию отписки. */
export function addClient(client: Client): () => void {
  let room = rooms.get(client.workspaceId);
  if (!room) {
    room = new Set();
    rooms.set(client.workspaceId, room);
  }
  room.add(client);
  return () => {
    const r = rooms.get(client.workspaceId);
    if (!r) return;
    r.delete(client);
    if (r.size === 0) rooms.delete(client.workspaceId);
  };
}

/**
 * Рассылает событие всем клиентам пространства, кроме инициатора (exceptId).
 * Инициатор уже знает об изменении (он его и сделал) — лишний рефетч не нужен.
 */
export function broadcast(
  workspaceId: string,
  event: ChangeEvent,
  exceptId?: string
): void {
  const room = rooms.get(workspaceId);
  if (!room || room.size === 0) return;
  const frame = `event: changed\ndata: ${JSON.stringify(event)}\n\n`;
  for (const client of room) {
    if (exceptId && client.id === exceptId) continue;
    try {
      client.reply.raw.write(frame);
    } catch {
      // Битое соединение само закроется и снимется через onClose.
    }
  }
}

/** Кол-во активных подключений пространства (для диагностики/тестов). */
export function clientCount(workspaceId: string): number {
  return rooms.get(workspaceId)?.size ?? 0;
}
