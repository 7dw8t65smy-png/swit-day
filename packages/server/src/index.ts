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
import { backupOnStartup } from './backup.js';

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

  app.setErrorHandler((err, _req, reply) => {
    if (err.message === 'not found' || err.message.endsWith(' not found')) {
      reply.code(404).send({ error: err.message });
      return;
    }
    reply.send(err);
  });

  app.get('/health', () => ({ ok: true, ts: new Date().toISOString() }));

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
    // eslint-disable-next-line no-console
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
