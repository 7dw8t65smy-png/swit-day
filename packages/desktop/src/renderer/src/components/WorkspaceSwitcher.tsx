import { useEffect, useRef, useState } from 'react';
import {
  Check,
  ChevronsUpDown,
  Plus,
  LogIn,
  Users,
  Copy,
  LogOut,
  Loader2,
  User as UserIcon,
  Trash2,
  DoorOpen,
  ChevronLeft
} from 'lucide-react';
import type { WorkspaceMember } from '@swit/shared';
import { useAuth } from '../lib/auth';
import { authApi } from '../api';
import { pushToast } from '../hooks/useToasts';

type View = 'menu' | 'create' | 'join' | 'members';

export default function WorkspaceSwitcher() {
  const status = useAuth((s) => s.status);
  const workspaces = useAuth((s) => s.workspaces);
  const activeId = useAuth((s) => s.activeWorkspaceId);
  const setActive = useAuth((s) => s.setActiveWorkspace);
  const refresh = useAuth((s) => s.refreshWorkspaces);
  const logout = useAuth((s) => s.logout);
  const user = useAuth((s) => s.user);

  const [open, setOpen] = useState(false);
  const [view, setView] = useState<View>('menu');
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [members, setMembers] = useState<WorkspaceMember[]>([]);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onDoc(e: MouseEvent): void {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, []);

  // Switcher имеет смысл только в многопользовательском режиме.
  if (status !== 'authed') return null;

  const active = workspaces.find((w) => w.id === activeId) ?? null;

  function close(): void {
    setOpen(false);
    setView('menu');
    setName('');
    setCode('');
  }

  async function handleCreate(): Promise<void> {
    if (!name.trim() || busy) return;
    setBusy(true);
    const res = await authApi.createWorkspace(name.trim());
    setBusy(false);
    if (!res.ok || !res.data) {
      pushToast({ kind: 'error', message: res.error ?? 'Не удалось создать команду.' });
      return;
    }
    await refresh();
    await setActive(res.data.id);
    pushToast({ kind: 'info', message: `Команда «${res.data.name}» создана.` });
    close();
  }

  async function handleJoin(): Promise<void> {
    if (!code.trim() || busy) return;
    setBusy(true);
    const res = await authApi.joinWorkspace(code.trim().toUpperCase());
    setBusy(false);
    if (!res.ok || !res.data) {
      pushToast({ kind: 'error', message: res.error ?? 'Не удалось присоединиться.' });
      return;
    }
    await refresh();
    await setActive(res.data.id);
    pushToast({ kind: 'info', message: `Вы в команде «${res.data.name}».` });
    close();
  }

  async function handleInvite(): Promise<void> {
    if (!active || active.type !== 'team') return;
    const res = await authApi.createInvite(active.id, {});
    if (!res.ok || !res.data) {
      pushToast({ kind: 'error', message: res.error ?? 'Не удалось создать приглашение.' });
      return;
    }
    try {
      await navigator.clipboard.writeText(res.data.code);
      pushToast({ kind: 'info', message: `Код ${res.data.code} скопирован.` });
    } catch {
      pushToast({ kind: 'info', message: `Код приглашения: ${res.data.code}` });
    }
  }

  async function openMembers(): Promise<void> {
    if (!active) return;
    setView('members');
    setMembers([]);
    const res = await authApi.listMembers(active.id);
    if (res.ok && res.data) setMembers(res.data);
    else pushToast({ kind: 'error', message: res.error ?? 'Не удалось загрузить участников.' });
  }

  async function handleRemoveMember(userId: string): Promise<void> {
    if (!active) return;
    const res = await authApi.removeMember(active.id, userId);
    if (!res.ok) {
      pushToast({ kind: 'error', message: res.error ?? 'Не удалось убрать участника.' });
      return;
    }
    setMembers((cur) => cur.filter((m) => m.user_id !== userId));
  }

  async function handleLeave(): Promise<void> {
    if (!active) return;
    const res = await authApi.leaveWorkspace(active.id);
    if (!res.ok) {
      pushToast({ kind: 'error', message: res.error ?? 'Не удалось покинуть команду.' });
      return;
    }
    await refresh();
    const personal = useAuth.getState().workspaces.find((w) => w.type === 'personal');
    if (personal) await setActive(personal.id);
    pushToast({ kind: 'info', message: `Вы покинули «${active.name}».` });
    close();
  }

  return (
    <div ref={ref} className="relative px-3 pb-3">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-2 rounded-lg border border-border bg-bg px-2.5 py-2 text-left transition hover:border-accent/50"
      >
        <span
          className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-[11px] font-bold text-white ${
            active?.type === 'personal' ? 'bg-muted' : 'bg-accent'
          }`}
        >
          {active?.type === 'personal' ? <UserIcon size={13} /> : <Users size={13} />}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-semibold text-ink">
            {active?.name ?? 'Пространство'}
          </span>
          <span className="block truncate text-[11px] text-muted">
            {active?.type === 'personal' ? 'Личное' : `Команда · ${active?.member_count ?? 1}`}
          </span>
        </span>
        <ChevronsUpDown size={14} className="shrink-0 text-muted" />
      </button>

      {open && (
        <div className="absolute left-3 right-3 z-50 mt-1 overflow-hidden rounded-lg border border-border bg-surface shadow-xl">
          {view === 'menu' && (
            <>
              <div className="max-h-56 overflow-y-auto py-1">
                {workspaces.map((w) => (
                  <button
                    key={w.id}
                    onClick={() => {
                      void setActive(w.id);
                      close();
                    }}
                    className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm transition hover:bg-surface2"
                  >
                    <span
                      className={`flex h-5 w-5 shrink-0 items-center justify-center rounded text-white ${
                        w.type === 'personal' ? 'bg-muted' : 'bg-accent'
                      }`}
                    >
                      {w.type === 'personal' ? <UserIcon size={11} /> : <Users size={11} />}
                    </span>
                    <span className="min-w-0 flex-1 truncate text-ink">{w.name}</span>
                    {w.id === activeId && <Check size={14} className="text-accent" />}
                  </button>
                ))}
              </div>

              <div className="border-t border-border py-1">
                <MenuItem icon={Plus} label="Создать команду" onClick={() => setView('create')} />
                <MenuItem icon={LogIn} label="Войти по коду" onClick={() => setView('join')} />
                {active?.type === 'team' && (
                  <MenuItem icon={Copy} label="Пригласить (скопировать код)" onClick={handleInvite} />
                )}
                {active?.type === 'team' && (
                  <MenuItem icon={Users} label="Участники" onClick={openMembers} />
                )}
              </div>

              <div className="border-t border-border py-1">
                <div className="px-3 py-1.5 text-[11px] text-muted">
                  {user?.display_name ?? user?.handle}
                </div>
                <MenuItem
                  icon={LogOut}
                  label="Выйти из аккаунта"
                  danger
                  onClick={() => {
                    void logout();
                    close();
                  }}
                />
              </div>
            </>
          )}

          {view === 'create' && (
            <InlineForm
              title="Новая команда"
              placeholder="Название команды"
              value={name}
              onChange={setName}
              busy={busy}
              onCancel={() => setView('menu')}
              onSubmit={handleCreate}
              submitLabel="Создать"
            />
          )}

          {view === 'join' && (
            <InlineForm
              title="Войти по коду"
              placeholder="КОД ПРИГЛАШЕНИЯ"
              value={code}
              onChange={(v) => setCode(v.toUpperCase())}
              busy={busy}
              onCancel={() => setView('menu')}
              onSubmit={handleJoin}
              submitLabel="Войти"
              mono
            />
          )}

          {view === 'members' && (
            <div className="py-1">
              <button
                onClick={() => setView('menu')}
                className="flex w-full items-center gap-1.5 px-3 py-2 text-xs text-muted transition hover:text-ink"
              >
                <ChevronLeft size={13} /> Назад
              </button>
              <div className="max-h-56 overflow-y-auto">
                {members.length === 0 && (
                  <div className="px-3 py-2 text-sm text-muted">Загрузка…</div>
                )}
                {members.map((m) => (
                  <div key={m.user_id} className="flex items-center gap-2 px-3 py-2 text-sm">
                    <span className="min-w-0 flex-1 truncate text-ink">
                      {m.display_name || m.handle}
                      {m.user_id === user?.id && <span className="text-muted"> (вы)</span>}
                    </span>
                    <span className="shrink-0 text-[11px] text-muted">
                      {m.role === 'owner' ? 'владелец' : 'участник'}
                    </span>
                    {active?.role === 'owner' && m.role !== 'owner' && (
                      <button
                        onClick={() => void handleRemoveMember(m.user_id)}
                        className="shrink-0 text-muted transition hover:text-red-500"
                        title="Убрать из команды"
                      >
                        <Trash2 size={14} />
                      </button>
                    )}
                  </div>
                ))}
              </div>
              {active?.role !== 'owner' && (
                <div className="border-t border-border py-1">
                  <MenuItem icon={DoorOpen} label="Покинуть команду" danger onClick={handleLeave} />
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function MenuItem({
  icon: Icon,
  label,
  onClick,
  danger
}: {
  icon: typeof Plus;
  label: string;
  onClick: () => void;
  danger?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex w-full items-center gap-2 px-3 py-2 text-left text-sm transition hover:bg-surface2 ${
        danger ? 'text-red-500' : 'text-ink'
      }`}
    >
      <Icon size={15} className="shrink-0" />
      <span>{label}</span>
    </button>
  );
}

function InlineForm({
  title,
  placeholder,
  value,
  onChange,
  busy,
  onCancel,
  onSubmit,
  submitLabel,
  mono
}: {
  title: string;
  placeholder: string;
  value: string;
  onChange: (v: string) => void;
  busy: boolean;
  onCancel: () => void;
  onSubmit: () => void;
  submitLabel: string;
  mono?: boolean;
}) {
  return (
    <div className="p-3">
      <div className="mb-2 text-xs font-semibold text-muted">{title}</div>
      <input
        autoFocus
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') onSubmit();
          if (e.key === 'Escape') onCancel();
        }}
        placeholder={placeholder}
        className={`mb-2 w-full rounded-md border border-border bg-bg px-2.5 py-2 text-sm text-ink outline-none focus:border-accent placeholder:text-muted/60 ${
          mono ? 'font-mono tracking-widest' : ''
        }`}
      />
      <div className="flex gap-2">
        <button
          onClick={onCancel}
          className="flex-1 rounded-md border border-border py-1.5 text-sm text-muted transition hover:text-ink"
        >
          Отмена
        </button>
        <button
          onClick={onSubmit}
          disabled={!value.trim() || busy}
          className="flex flex-1 items-center justify-center gap-1.5 rounded-md bg-accent py-1.5 text-sm font-semibold text-white transition hover:opacity-90 disabled:opacity-50"
        >
          {busy && <Loader2 size={13} className="animate-spin" />}
          {submitLabel}
        </button>
      </div>
    </div>
  );
}
