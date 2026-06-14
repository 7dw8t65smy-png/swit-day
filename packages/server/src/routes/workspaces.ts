import type { FastifyInstance, FastifyReply } from 'fastify';
import { customAlphabet } from 'nanoid';
import type { Workspace, WorkspaceInvite, WorkspaceMember } from '@swit/shared';
import { db, nowIso } from '../db.js';
import { createWorkspace, listWorkspacesForUser, memberRole } from '../auth.js';

// Код-приглашение: без похожих символов (0/O, 1/I), удобно диктовать.
const inviteCode = customAlphabet('ABCDEFGHJKLMNPQRSTUVWXYZ23456789', 8);

function deny(reply: FastifyReply, code: number, error: string): void {
  reply.code(code).send({ error });
}

export function registerWorkspaces(app: FastifyInstance): void {
  // Мои пространства.
  app.get('/workspaces', (req, reply) => {
    if (!req.userId) return deny(reply, 401, 'Требуется вход.');
    return listWorkspacesForUser(req.userId);
  });

  // Создать командное пространство (создатель = владелец).
  app.post<{ Body: { name?: string } }>('/workspaces', (req, reply) => {
    if (!req.userId) return deny(reply, 401, 'Требуется вход.');
    const name = String(req.body?.name ?? '').trim();
    if (!name) return deny(reply, 400, 'Укажите название команды.');
    return createWorkspace(name, 'team', req.userId);
  });

  // Создать код-приглашение (любой участник команды).
  app.post<{ Params: { id: string }; Body: { expires_in_days?: number; max_uses?: number } }>(
    '/workspaces/:id/invite',
    (req, reply) => {
      if (!req.userId) return deny(reply, 401, 'Требуется вход.');
      const ws = db.prepare('SELECT * FROM workspaces WHERE id = ?').get(req.params.id) as
        | Workspace
        | undefined;
      if (!ws) return deny(reply, 404, 'Пространство не найдено.');
      if (ws.type === 'personal') return deny(reply, 400, 'Личное пространство нельзя расшарить.');
      if (!memberRole(ws.id, req.userId)) return deny(reply, 403, 'Нет доступа к пространству.');

      const code = inviteCode();
      const days = Number(req.body?.expires_in_days);
      const expiresAt =
        Number.isFinite(days) && days > 0
          ? new Date(Date.now() + days * 86_400_000).toISOString()
          : null;
      const maxUsesRaw = Number(req.body?.max_uses);
      const maxUses = Number.isFinite(maxUsesRaw) && maxUsesRaw > 0 ? Math.floor(maxUsesRaw) : null;
      db.prepare(
        `INSERT INTO workspace_invites (code, workspace_id, created_by, expires_at, max_uses, uses, created_at)
         VALUES (?, ?, ?, ?, ?, 0, ?)`
      ).run(code, ws.id, req.userId, expiresAt, maxUses, nowIso());
      return db.prepare('SELECT * FROM workspace_invites WHERE code = ?').get(code) as WorkspaceInvite;
    }
  );

  // Присоединиться к команде по коду.
  app.post<{ Body: { code?: string } }>('/workspaces/join', (req, reply) => {
    if (!req.userId) return deny(reply, 401, 'Требуется вход.');
    const code = String(req.body?.code ?? '')
      .trim()
      .toUpperCase();
    if (!code) return deny(reply, 400, 'Введите код приглашения.');
    const inv = db.prepare('SELECT * FROM workspace_invites WHERE code = ?').get(code) as
      | WorkspaceInvite
      | undefined;
    if (!inv) return deny(reply, 404, 'Код не найден.');
    if (inv.expires_at && inv.expires_at < nowIso()) return deny(reply, 410, 'Срок кода истёк.');
    if (inv.max_uses != null && inv.uses >= inv.max_uses) {
      return deny(reply, 410, 'Код исчерпан.');
    }
    if (memberRole(inv.workspace_id, req.userId)) {
      // Уже участник — просто возвращаем пространство.
      return db.prepare('SELECT * FROM workspaces WHERE id = ?').get(inv.workspace_id) as Workspace;
    }
    const userId = req.userId;
    const tx = db.transaction(() => {
      db.prepare(
        "INSERT INTO workspace_members (workspace_id, user_id, role, joined_at) VALUES (?, ?, 'member', ?)"
      ).run(inv.workspace_id, userId, nowIso());
      db.prepare('UPDATE workspace_invites SET uses = uses + 1 WHERE code = ?').run(code);
    });
    tx();
    return db.prepare('SELECT * FROM workspaces WHERE id = ?').get(inv.workspace_id) as Workspace;
  });

  // Участники пространства.
  app.get<{ Params: { id: string } }>('/workspaces/:id/members', (req, reply) => {
    if (!req.userId) return deny(reply, 401, 'Требуется вход.');
    if (!memberRole(req.params.id, req.userId)) return deny(reply, 403, 'Нет доступа.');
    return db
      .prepare(
        `SELECT m.workspace_id, m.user_id, m.role, m.joined_at, u.handle, u.display_name,
                COALESCE(u.color, '#2563EB') AS color
         FROM workspace_members m JOIN users u ON u.id = m.user_id
         WHERE m.workspace_id = ?
         ORDER BY (m.role = 'owner') DESC, m.joined_at ASC`
      )
      .all(req.params.id) as WorkspaceMember[];
  });

  // Убрать участника (только владелец; владельца убрать нельзя).
  app.delete<{ Params: { id: string; userId: string } }>(
    '/workspaces/:id/members/:userId',
    (req, reply) => {
      if (!req.userId) return deny(reply, 401, 'Требуется вход.');
      if (memberRole(req.params.id, req.userId) !== 'owner') {
        return deny(reply, 403, 'Только владелец может убирать участников.');
      }
      const target = db
        .prepare('SELECT role FROM workspace_members WHERE workspace_id = ? AND user_id = ?')
        .get(req.params.id, req.params.userId) as { role: string } | undefined;
      if (!target) return deny(reply, 404, 'Участник не найден.');
      if (target.role === 'owner') return deny(reply, 400, 'Нельзя убрать владельца.');
      db.prepare('DELETE FROM workspace_members WHERE workspace_id = ? AND user_id = ?').run(
        req.params.id,
        req.params.userId
      );
      return { ok: true };
    }
  );

  // Покинуть команду (не владелец).
  app.post<{ Params: { id: string } }>('/workspaces/:id/leave', (req, reply) => {
    if (!req.userId) return deny(reply, 401, 'Требуется вход.');
    const role = memberRole(req.params.id, req.userId);
    if (!role) return deny(reply, 404, 'Вы не состоите в этом пространстве.');
    if (role === 'owner') return deny(reply, 400, 'Владелец не может покинуть пространство.');
    db.prepare('DELETE FROM workspace_members WHERE workspace_id = ? AND user_id = ?').run(
      req.params.id,
      req.userId
    );
    return { ok: true };
  });
}
