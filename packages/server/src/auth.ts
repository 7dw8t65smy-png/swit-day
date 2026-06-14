// Аутентификация и доступ к пространствам. Пароли — scrypt (встроенный node:crypto,
// без нативных зависимостей). Токены сессий — непрозрачные случайные строки;
// в БД хранится только их sha256, поэтому утечка таблицы не раскрывает токены.
import { randomBytes, scryptSync, timingSafeEqual, createHash } from 'node:crypto';
import { nanoid } from 'nanoid';
import { db, nowIso } from './db.js';
import type { User, Workspace, WorkspaceType, WorkspaceRole, WorkspaceWithRole } from '@swit/shared';

const SCRYPT_KEYLEN = 64;

export function hashPassword(password: string): string {
  const salt = randomBytes(16).toString('hex');
  const hash = scryptSync(password, salt, SCRYPT_KEYLEN).toString('hex');
  return `${salt}:${hash}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  const [salt, hash] = stored.split(':');
  if (!salt || !hash) return false;
  const expected = Buffer.from(hash, 'hex');
  const actual = scryptSync(password, salt, SCRYPT_KEYLEN);
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

export interface UserRow extends User {
  password_hash: string;
}

export function getUserByHandle(handle: string): UserRow | undefined {
  return db.prepare('SELECT * FROM users WHERE handle = ?').get(handle.trim().toLowerCase()) as
    | UserRow
    | undefined;
}

// Палитра цветов участников — назначенные задачи подписываются этим цветом.
const MEMBER_PALETTE = [
  '#2563EB', '#7C3AED', '#DB2777', '#EA580C', '#16A34A',
  '#0891B2', '#CA8A04', '#DC2626', '#0D9488', '#9333EA'
];
function pickColor(): string {
  return MEMBER_PALETTE[Math.floor(Math.random() * MEMBER_PALETTE.length)];
}

export function getUserById(id: string): User | undefined {
  return db
    .prepare(
      "SELECT id, handle, display_name, created_at, COALESCE(color, '#2563EB') AS color FROM users WHERE id = ?"
    )
    .get(id) as User | undefined;
}

/** Создаёт пользователя и его личное пространство в одной транзакции. */
export function createUser(handle: string, displayName: string, password: string): User {
  const id = nanoid();
  const t = nowIso();
  const tx = db.transaction(() => {
    db.prepare(
      'INSERT INTO users (id, handle, display_name, password_hash, created_at, color) VALUES (?, ?, ?, ?, ?, ?)'
    ).run(
      id,
      handle.trim().toLowerCase(),
      displayName.trim() || handle.trim(),
      hashPassword(password),
      t,
      pickColor()
    );
    createWorkspace('Личное', 'personal', id);
  });
  tx();
  return getUserById(id) as User;
}

export function createSession(userId: string, device?: string | null): string {
  const token = randomBytes(32).toString('base64url');
  db.prepare(
    `INSERT INTO auth_sessions (id, user_id, token_hash, device, created_at, last_used_at, expires_at)
     VALUES (?, ?, ?, ?, ?, ?, NULL)`
  ).run(nanoid(), userId, sha256(token), device ?? null, nowIso(), nowIso());
  return token;
}

export function resolveToken(token: string | undefined): User | null {
  if (!token) return null;
  const row = db
    .prepare(
      `SELECT u.id, u.handle, u.display_name, u.created_at, COALESCE(u.color, '#2563EB') AS color
       FROM auth_sessions s JOIN users u ON u.id = s.user_id
       WHERE s.token_hash = ? AND (s.expires_at IS NULL OR s.expires_at > ?)`
    )
    .get(sha256(token), nowIso()) as User | undefined;
  if (!row) return null;
  db.prepare('UPDATE auth_sessions SET last_used_at = ? WHERE token_hash = ?').run(
    nowIso(),
    sha256(token)
  );
  return row;
}

export function destroySession(token: string): void {
  db.prepare('DELETE FROM auth_sessions WHERE token_hash = ?').run(sha256(token));
}

export function memberRole(workspaceId: string, userId: string): WorkspaceRole | null {
  const row = db
    .prepare('SELECT role FROM workspace_members WHERE workspace_id = ? AND user_id = ?')
    .get(workspaceId, userId) as { role: WorkspaceRole } | undefined;
  return row?.role ?? null;
}

export function listWorkspacesForUser(userId: string): WorkspaceWithRole[] {
  return db
    .prepare(
      `SELECT w.id, w.name, w.type, w.owner_id, w.created_at, m.role,
         (SELECT COUNT(*) FROM workspace_members mm WHERE mm.workspace_id = w.id) AS member_count
       FROM workspaces w
       JOIN workspace_members m ON m.workspace_id = w.id
       WHERE m.user_id = ?
       ORDER BY (w.type = 'personal') DESC, w.created_at ASC`
    )
    .all(userId) as WorkspaceWithRole[];
}

export function createWorkspace(name: string, type: WorkspaceType, ownerId: string): Workspace {
  const id = nanoid();
  const t = nowIso();
  db.prepare(
    'INSERT INTO workspaces (id, name, type, owner_id, created_at) VALUES (?, ?, ?, ?, ?)'
  ).run(id, name.trim() || (type === 'personal' ? 'Личное' : 'Команда'), type, ownerId, t);
  db.prepare(
    "INSERT INTO workspace_members (workspace_id, user_id, role, joined_at) VALUES (?, ?, 'owner', ?)"
  ).run(id, ownerId, t);
  return db.prepare('SELECT * FROM workspaces WHERE id = ?').get(id) as Workspace;
}

// Контекст запроса, который проставляет auth-хук (см. index.ts).
declare module 'fastify' {
  interface FastifyRequest {
    userId?: string;
    workspaceId?: string;
    workspaceRole?: WorkspaceRole;
  }
}
