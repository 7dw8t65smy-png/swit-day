import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { AuthResult } from '@swit/shared';
import {
  createSession,
  createUser,
  destroySession,
  getUserByHandle,
  getUserById,
  listWorkspacesForUser,
  verifyPassword
} from '../auth.js';

const HANDLE_RE = /^[a-zA-Zа-яА-Я0-9_.@-]{3,40}$/;
const MIN_PASSWORD = 6;

function bearer(req: FastifyRequest): string | undefined {
  const auth = req.headers['authorization'];
  return typeof auth === 'string' && auth.startsWith('Bearer ') ? auth.slice(7) : undefined;
}

function bad(reply: FastifyReply, code: number, error: string): void {
  reply.code(code).send({ error });
}

export function registerAuth(app: FastifyInstance): void {
  app.post<{ Body: { handle?: string; display_name?: string; password?: string } }>(
    '/auth/register',
    (req, reply) => {
      const handle = String(req.body?.handle ?? '').trim();
      const password = String(req.body?.password ?? '');
      const displayName = String(req.body?.display_name ?? '').trim();
      if (!HANDLE_RE.test(handle)) {
        return bad(reply, 400, 'Имя пользователя: 3-40 символов (буквы, цифры, _ . @ -).');
      }
      if (password.length < MIN_PASSWORD) {
        return bad(reply, 400, `Пароль должен быть не короче ${MIN_PASSWORD} символов.`);
      }
      if (getUserByHandle(handle)) {
        return bad(reply, 409, 'Такое имя уже занято.');
      }
      const user = createUser(handle, displayName || handle, password);
      const token = createSession(user.id, req.headers['user-agent'] ?? null);
      const result: AuthResult = { token, user, workspaces: listWorkspacesForUser(user.id) };
      return result;
    }
  );

  app.post<{ Body: { handle?: string; password?: string } }>('/auth/login', (req, reply) => {
    const handle = String(req.body?.handle ?? '').trim();
    const password = String(req.body?.password ?? '');
    const row = getUserByHandle(handle);
    if (!row || !verifyPassword(password, row.password_hash)) {
      return bad(reply, 401, 'Неверное имя пользователя или пароль.');
    }
    const token = createSession(row.id, req.headers['user-agent'] ?? null);
    const user = {
      id: row.id,
      handle: row.handle,
      display_name: row.display_name,
      created_at: row.created_at
    };
    const result: AuthResult = { token, user, workspaces: listWorkspacesForUser(row.id) };
    return result;
  });

  // Текущий пользователь + его пространства (для восстановления сессии при старте клиента).
  app.get('/auth/me', (req, reply) => {
    if (!req.userId) return bad(reply, 401, 'Требуется вход.');
    const user = getUserById(req.userId);
    if (!user) return bad(reply, 401, 'Сессия недействительна.');
    return { user, workspaces: listWorkspacesForUser(req.userId) };
  });

  app.post('/auth/logout', (req) => {
    const token = bearer(req);
    if (token) destroySession(token);
    return { ok: true };
  });
}
