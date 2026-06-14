import Fastify, { type FastifyInstance } from 'fastify';
import cors from '@fastify/cors';
import { HOST, PORT } from './config.js';
import { db } from './db.js';
import { registerProjects } from './routes/projects.js';
import { registerTasks } from './routes/tasks.js';
import { registerNotes } from './routes/notes.js';
import { registerSessions } from './routes/sessions.js';
import { registerEvents } from './routes/events.js';
import { registerJournal } from './routes/journal.js';
import { registerReminders } from './routes/reminders.js';
import { registerSettings } from './routes/settings.js';
import { registerPlaybooks } from './routes/playbooks.js';
import { registerHabits } from './routes/habits.js';
import { registerFinance } from './routes/finance.js';
import { registerData } from './routes/data.js';
import { registerMaps } from './routes/maps.js';
import { registerBoards } from './routes/boards.js';
import { registerCanvases } from './routes/canvases.js';
import { registerAgency } from './routes/agency.js';
import { registerAuth } from './routes/auth.js';
import { registerWorkspaces } from './routes/workspaces.js';
import { resolveToken, memberRole } from './auth.js';
import { addClient, broadcast } from './realtime.js';
import { backupOnStartup } from './backup.js';
import { nanoid } from 'nanoid';

// На VPS включаем многопользовательский режим (SWIT_AUTH_REQUIRED=1): тогда все
// контент-роуты требуют токен + выбранное пространство. Локально (без флага)
// сервер работает как раньше — одиночный режим без входа.
const AUTH_REQUIRED = process.env.SWIT_AUTH_REQUIRED === '1';

function isAllowedOrigin(origin: string | undefined): boolean {
  if (!origin || origin === 'null' || origin.startsWith('file://')) return true;
  try {
    const u = new URL(origin);
    return ['localhost', '127.0.0.1', '::1'].includes(u.hostname);
  } catch {
    return false;
  }
}

/**
 * Запускает HTTP-сервер. Возвращает уже слушающий Fastify instance.
 * Удобен и для standalone CLI (`node dist/index.js`), и для in-process
 * запуска из Electron main (без child_process — нативные модули вроде
 * better-sqlite3 загружаются в том же процессе и не требуют отдельной
 * пересборки под Node ABI).
 */
export async function startSwitServer(opts?: {
  host?: string;
  port?: number;
}): Promise<FastifyInstance> {
  const app = Fastify({
    logger: { level: 'info' },
    bodyLimit: 50 * 1024 * 1024
  });

  await app.register(cors, {
    origin: (origin, cb) => cb(null, isAllowedOrigin(origin))
  });

  app.setErrorHandler((err, req, reply) => {
    // Явные «не найдено» из роутов.
    if (err.message === 'not found' || err.message.endsWith(' not found')) {
      reply.code(404).send({ error: err.message });
      return;
    }
    // Нарушение ограничений БД (NOT NULL, FK и т.п.) — это ошибка данных
    // запроса, а не сбой сервера: отвечаем 400, не раскрывая текст SQL.
    const code = (err as { code?: string }).code ?? '';
    if (typeof code === 'string' && code.startsWith('SQLITE_CONSTRAINT')) {
      reply.code(400).send({ error: 'Некорректные данные запроса.' });
      return;
    }
    // Fastify сам проставляет statusCode для разбора тела/валидации/размера —
    // это тоже клиентские ошибки (4xx), пробрасываем как есть.
    const status = err.statusCode ?? 500;
    if (status >= 400 && status < 500) {
      reply.code(status).send({ error: err.message });
      return;
    }
    // Всё остальное — внутренняя ошибка: детали в лог сервера, наружу — общий текст.
    req.log.error(err);
    reply.code(500).send({ error: 'Внутренняя ошибка сервера.' });
  });

  // Клиент пробует /health на старте: auth_required говорит, показывать ли
  // экран входа. В одиночном режиме (флаг выключен) клиент работает как раньше.
  app.get('/health', () => ({
    ok: true,
    ts: new Date().toISOString(),
    auth_required: AUTH_REQUIRED
  }));

  // SSE-поток realtime. Аутентификация через query: ?token=...&workspace=...
  // (EventSource не умеет слать заголовки). Сервер шлёт сигналы об изменениях
  // в выбранном пространстве; клиент в ответ перезапрашивает нужный список.
  app.get<{ Querystring: { token?: string; workspace?: string; client_id?: string } }>(
    '/realtime',
    (req, reply) => {
      const { token, workspace } = req.query;
      const user = token ? resolveToken(token) : null;
      if (!user) {
        reply.code(401).send({ error: 'Требуется вход.' });
        return;
      }
      if (!workspace || !memberRole(workspace, user.id)) {
        reply.code(403).send({ error: 'Нет доступа к пространству.' });
        return;
      }

      reply.raw.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache, no-transform',
        Connection: 'keep-alive',
        'X-Accel-Buffering': 'no'
      });
      reply.raw.write(`retry: 3000\n\n`);
      reply.raw.write(`event: ready\ndata: {"ok":true}\n\n`);

      const id = req.query.client_id || nanoid();
      const remove = addClient({ id, workspaceId: workspace, reply });

      // Heartbeat-комментарий держит соединение живым через прокси (Caddy).
      const heartbeat = setInterval(() => {
        try {
          reply.raw.write(`: ping\n\n`);
        } catch {
          /* закроется по close */
        }
      }, 25_000);

      req.raw.on('close', () => {
        clearInterval(heartbeat);
        remove();
      });
    }
  );

  // После любой успешной мутации в пространстве — рассылаем сигнал «изменилось»
  // остальным клиентам этого пространства. Инициатор (x-client-id) исключается.
  app.addHook('onResponse', async (req, reply) => {
    const method = req.method;
    if (method === 'GET' || method === 'HEAD' || method === 'OPTIONS') return;
    if (reply.statusCode >= 400) return;
    const ws = req.workspaceId;
    if (!ws) return;
    const resource = req.url.split('?')[0].split('/').filter(Boolean)[0];
    if (!resource) return;
    const clientId = req.headers['x-client-id'];
    broadcast(
      ws,
      { resource, ts: new Date().toISOString() },
      typeof clientId === 'string' ? clientId : undefined
    );
  });

  // Аутентификация и привязка к пространству. Разрешаем токен на любом запросе
  // (если он есть — проставляем контекст), а жёсткую проверку включаем только
  // в многопользовательском режиме. /health и /auth/* всегда публичны.
  app.addHook('onRequest', async (req, reply) => {
    const path = req.url.split('?')[0];
    // /realtime аутентифицируется сам через query-параметры (EventSource не шлёт
    // заголовков), поэтому в общем гейте считаем его публичным.
    const isPublic = path === '/health' || path === '/realtime' || path.startsWith('/auth/');

    const authHeader = req.headers['authorization'];
    const token =
      typeof authHeader === 'string' && authHeader.startsWith('Bearer ')
        ? authHeader.slice(7)
        : undefined;
    const user = token ? resolveToken(token) : null;
    if (user) req.userId = user.id;

    const wsHeader = req.headers['x-workspace-id'];
    if (user && typeof wsHeader === 'string' && wsHeader) {
      const role = memberRole(wsHeader, user.id);
      if (role) {
        req.workspaceId = wsHeader;
        req.workspaceRole = role;
      }
    }

    if (isPublic || !AUTH_REQUIRED) return;

    if (!req.userId) {
      reply.code(401).send({ error: 'Требуется вход.' });
      return;
    }
    // Управление пространствами не требует выбранного пространства; контент — требует.
    const needsWorkspace = !path.startsWith('/workspaces');
    if (needsWorkspace && !req.workspaceId) {
      reply.code(400).send({ error: 'Не выбрано пространство.' });
      return;
    }
  });

  registerAuth(app);
  registerWorkspaces(app);

  registerProjects(app);
  registerTasks(app);
  registerNotes(app);
  registerSessions(app);
  registerEvents(app);
  registerJournal(app);
  registerReminders(app);
  registerSettings(app);
  registerPlaybooks(app);
  registerHabits(app);
  registerFinance(app);
  registerData(app);
  registerMaps(app);
  registerBoards(app);
  registerCanvases(app);
  registerAgency(app);

  // Раз в сутки снимаем копию БД до начала активной работы.
  await backupOnStartup();

  const host = opts?.host ?? HOST;
  const port = opts?.port ?? PORT;
  await app.listen({ host, port });
  app.log.info(`SWIT Day server up on http://${host}:${port}`);
  return app;
}

/**
 * Корректно закрывает сервер и БД. WAL-checkpoint гарантирует, что все
 * транзакции попали в основной .db файл, прежде чем процесс умрёт.
 */
export async function stopSwitServer(app: FastifyInstance | null): Promise<void> {
  try {
    db.pragma('wal_checkpoint(TRUNCATE)');
  } catch {
    /* swallow — не должно мешать чистому выходу */
  }
  try {
    db.close();
  } catch {
    /* already closed */
  }
  if (app) {
    try {
      await app.close();
    } catch {
      /* swallow */
    }
  }
}

// Standalone-режим (npm run dev / node dist/index.js) — стартуем сразу.
// В in-process режиме (импорт из Electron) этот файл импортируется
// и блок ниже не должен запускаться. Признак — наличие SWIT_INPROC=1.
if (process.env.SWIT_INPROC !== '1') {
  let runningApp: FastifyInstance | null = null;
  try {
    runningApp = await startSwitServer();
  } catch (err) {
    console.error('[swit-server] failed to start', err);
    process.exit(1);
  }

  let shuttingDown = false;
  const shutdown = (): void => {
    if (shuttingDown) return;
    shuttingDown = true;
    void stopSwitServer(runningApp).finally(() => process.exit(0));
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}
