import { useEffect, useMemo, useState } from 'react';
import {
  Plus,
  Trash2,
  ChevronRight,
  ChevronDown,
  GripVertical,
  Archive,
  ArchiveRestore
} from 'lucide-react';
import { api } from '../api';
import type { Playbook, PlaybookStep, PlaybookWithSteps, Project } from '@swit/shared';
import Modal from '../components/Modal';
import DocumentationBlock from '../components/DocumentationBlock';
import { PROJECT_ICONS, PROJECT_PALETTE } from '../lib/palette';

// Playbooks ≡ regulations/SOPs. Read-only reference: title, optional docs,
// numbered list of steps. No execution, no runs, no history — the user fills
// these in for memory ("how do I do X again?"), nothing else.

export default function Playbooks(): JSX.Element {
  const [playbooks, setPlaybooks] = useState<Playbook[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [selected, setSelected] = useState<PlaybookWithSteps | null>(null);
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    void reload();
  }, []);

  async function reload(): Promise<void> {
    const [pbs, ps] = await Promise.all([api.listPlaybooks(), api.listProjects()]);
    setPlaybooks(pbs);
    setProjects(ps);
    if (selected) {
      const fresh = await api.getPlaybook(selected.id).catch(() => null);
      setSelected(fresh);
    }
  }

  async function selectPb(id: string): Promise<void> {
    const pb = await api.getPlaybook(id);
    setSelected(pb);
  }

  const projectById = useMemo(
    () => new Map(projects.map((p) => [p.id, p] as const)),
    [projects]
  );

  return (
    <div className="p-6 grid grid-cols-[320px_1fr] gap-5 max-w-[1400px]">
      <aside>
        <div className="flex items-center gap-2 mb-4">
          <div className="flex-1 min-w-0">
            <h1 className="text-xl font-semibold">Регламенты</h1>
            <div className="text-[11px] text-muted mt-0.5">
              Справочник правил и инструкций
            </div>
          </div>
          <button
            onClick={() => setCreating(true)}
            className="bg-accent text-white w-8 h-8 rounded-md hover:bg-accent-hover flex items-center justify-center shadow-sm"
            title="Новый регламент"
          >
            <Plus size={16} />
          </button>
        </div>

        <PlaybookList
          playbooks={playbooks}
          projects={projectById}
          selectedId={selected?.id ?? null}
          onSelect={selectPb}
        />
      </aside>

      <main className="min-w-0">
        {selected ? (
          <PlaybookDetail playbook={selected} projects={projects} onChanged={reload} />
        ) : (
          <PlaybooksOverview
            playbooks={playbooks}
            projects={projects}
            onSelect={selectPb}
            onCreate={() => setCreating(true)}
          />
        )}
      </main>

      <CreatePlaybookModal
        open={creating}
        projects={projects}
        onClose={() => setCreating(false)}
        onCreated={async (pb) => {
          setCreating(false);
          await reload();
          await selectPb(pb.id);
        }}
      />
    </div>
  );
}

function EmptyState({ message }: { message: string }): JSX.Element {
  return (
    <div className="bg-surface rounded-lg shadow-sm p-12 text-center text-sm text-muted">
      {message}
    </div>
  );
}

/**
 * Overview / dashboard shown when no specific playbook is selected.
 * Fills the right pane with: a brief heading, KPI strip, tile grid of all
 * playbooks (with documentation preview), and a "create new" call-to-action
 * tile. Beats an empty white card every time.
 */
function PlaybooksOverview({
  playbooks,
  projects,
  onSelect,
  onCreate
}: {
  playbooks: Playbook[];
  projects: Project[];
  onSelect: (id: string) => void;
  onCreate: () => void;
}): JSX.Element {
  const active = playbooks.filter((p) => !p.archived);
  const archivedCount = playbooks.length - active.length;
  const withDocs = active.filter((p) => (p.content ?? '').trim().length > 0).length;
  const lastUpdated = active.reduce<string | null>((max, p) => {
    if (!max) return p.updated_at;
    return p.updated_at > max ? p.updated_at : max;
  }, null);

  if (active.length === 0) {
    return (
      <div className="bg-surface rounded-lg shadow-sm p-12 text-center border border-border">
        <div className="text-5xl mb-3 opacity-40">📋</div>
        <div className="text-base font-medium mb-1">Здесь пока пусто</div>
        <div className="text-sm text-muted max-w-md mx-auto">
          Регламент — это инструкция или правило, которое не хочется держать в голове.
          Например: «созвон с клиентом», «релиз», «сбор отчёта в конце месяца».
        </div>
        <button
          onClick={onCreate}
          className="mt-5 inline-flex items-center gap-1.5 bg-accent text-white px-4 py-2 rounded-md text-sm hover:bg-accent-hover shadow-sm"
        >
          <Plus size={14} /> Создать первый регламент
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* KPI strip */}
      <div className="grid grid-cols-3 gap-3">
        <OverviewStat label="Регламентов" value={String(active.length)} icon="📋" />
        <OverviewStat label="С документацией" value={`${withDocs} из ${active.length}`} icon="📝" />
        <OverviewStat
          label="Обновлён последний"
          value={lastUpdated ? formatRelative(lastUpdated) : '—'}
          icon="🕐"
        />
      </div>

      {archivedCount > 0 && (
        <div className="text-[11px] text-faint">
          В архиве ещё {archivedCount} — открой через список слева.
        </div>
      )}

      {/* Tile grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {active.map((pb) => (
          <PlaybookTile
            key={pb.id}
            pb={pb}
            project={pb.project_id ? projects.find((p) => p.id === pb.project_id) ?? null : null}
            onClick={() => onSelect(pb.id)}
          />
        ))}

        {/* Create-new tile */}
        <button
          onClick={onCreate}
          className="rounded-lg border-2 border-dashed border-border bg-surface hover:border-accent hover:bg-accent-light/30 transition p-5 flex flex-col items-center justify-center gap-2 text-muted hover:text-accent min-h-[140px]"
        >
          <div className="w-10 h-10 rounded-md bg-surface2 flex items-center justify-center">
            <Plus size={20} />
          </div>
          <div className="text-sm font-medium">Новый регламент</div>
        </button>
      </div>
    </div>
  );
}

function OverviewStat({
  label,
  value,
  icon
}: {
  label: string;
  value: string;
  icon: string;
}): JSX.Element {
  return (
    <div className="bg-surface rounded-lg shadow-sm p-4 border border-border">
      <div className="text-[10px] uppercase tracking-wide text-muted flex items-center gap-1.5">
        <span>{icon}</span>
        {label}
      </div>
      <div className="text-xl font-semibold timer-font mt-1 truncate">{value}</div>
    </div>
  );
}

function PlaybookTile({
  pb,
  project,
  onClick
}: {
  pb: Playbook;
  project: Project | null;
  onClick: () => void;
}): JSX.Element {
  const previewLines = (pb.content ?? '')
    .replace(/^#+\s*/gm, '') // strip markdown headings
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
    .slice(0, 3);

  return (
    <button
      onClick={onClick}
      className="text-left bg-surface rounded-lg shadow-sm border border-border hover:border-accent hover:shadow-md transition p-4 min-h-[140px] flex flex-col group"
    >
      <div className="flex items-start gap-3">
        <div className="text-3xl shrink-0">{pb.icon ?? '📋'}</div>
        <div className="flex-1 min-w-0">
          <div className="text-base font-semibold truncate group-hover:text-accent transition">
            {pb.title}
          </div>
          <div className="text-[11px] text-muted mt-0.5 truncate">
            {project ? `${project.icon ?? '📁'} ${project.name}` : '🌐 Глобальный'}
            {' · обновлён '}
            {formatRelative(pb.updated_at)}
          </div>
        </div>
      </div>

      {pb.description && (
        <div className="text-xs text-muted mt-2 line-clamp-2">{pb.description}</div>
      )}

      {previewLines.length > 0 && (
        <div className="mt-3 pt-3 border-t border-border space-y-0.5">
          {previewLines.map((l, i) => (
            <div key={i} className="text-[11px] text-faint truncate">
              {l}
            </div>
          ))}
        </div>
      )}
    </button>
  );
}

/** Human-friendly "обновлён сегодня / вчера / 3 дн. назад / 14 мая". */
function formatRelative(iso: string): string {
  const then = new Date(iso);
  const now = new Date();
  const diffMs = now.getTime() - then.getTime();
  const diffDays = Math.floor(diffMs / 86_400_000);
  if (diffDays < 1) return 'сегодня';
  if (diffDays === 1) return 'вчера';
  if (diffDays < 7) return `${diffDays} дн. назад`;
  return then.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' });
}

/** «1 шаг», «2 шага», «5 шагов» — RU plural for the step count badge. */
function pluralizeSteps(n: number): string {
  const mod100 = n % 100;
  const mod10 = n % 10;
  if (mod100 >= 11 && mod100 <= 14) return `${n} шагов`;
  if (mod10 === 1) return `${n} шаг`;
  if (mod10 >= 2 && mod10 <= 4) return `${n} шага`;
  return `${n} шагов`;
}

function PlaybookList({
  playbooks,
  projects,
  selectedId,
  onSelect
}: {
  playbooks: Playbook[];
  projects: Map<string, Project>;
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  // Group: global first, then by project
  const global = playbooks.filter((p) => !p.project_id && !p.archived);
  const byProject = new Map<string, Playbook[]>();
  for (const pb of playbooks) {
    if (pb.archived) continue;
    if (!pb.project_id) continue;
    const arr = byProject.get(pb.project_id) ?? [];
    arr.push(pb);
    byProject.set(pb.project_id, arr);
  }
  const archived = playbooks.filter((p) => p.archived);

  return (
    <div className="space-y-3">
      {global.length > 0 && (
        <Group title="🌐 Глобальные">
          {global.map((pb) => (
            <PbRow key={pb.id} pb={pb} active={pb.id === selectedId} onSelect={onSelect} />
          ))}
        </Group>
      )}
      {[...byProject.entries()].map(([pid, items]) => {
        const proj = projects.get(pid);
        return (
          <Group key={pid} title={`${proj?.icon ?? '📁'} ${proj?.name ?? 'Проект'}`}>
            {items.map((pb) => (
              <PbRow key={pb.id} pb={pb} active={pb.id === selectedId} onSelect={onSelect} />
            ))}
          </Group>
        );
      })}
      {archived.length > 0 && (
        <Group title="🗄 Архив">
          {archived.map((pb) => (
            <PbRow key={pb.id} pb={pb} active={pb.id === selectedId} onSelect={onSelect} />
          ))}
        </Group>
      )}
      {playbooks.length === 0 && <div className="text-sm text-muted">Пока пусто</div>}
    </div>
  );
}

function Group({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="text-[11px] uppercase text-muted px-2 mb-1">{title}</div>
      <div className="space-y-1">{children}</div>
    </div>
  );
}

function PbRow({
  pb,
  active,
  onSelect
}: {
  pb: Playbook;
  active: boolean;
  onSelect: (id: string) => void;
}) {
  const tint = pb.color ?? 'var(--color-accent)';
  return (
    <button
      onClick={() => onSelect(pb.id)}
      className={`w-full text-left px-2.5 py-2 rounded-md transition flex items-center gap-2.5 ${
        active
          ? 'bg-accent-light border border-accent shadow-sm'
          : 'border border-transparent hover:bg-surface2'
      } ${pb.archived ? 'opacity-60' : ''}`}
    >
      <span
        className="w-7 h-7 rounded-md flex items-center justify-center text-base shrink-0"
        style={{ background: active ? 'var(--color-surface)' : (tint as string) + '20' }}
      >
        {pb.icon ?? '📋'}
      </span>
      <span className="flex-1 min-w-0">
        <span className={`text-sm font-medium block truncate ${active ? 'text-accent' : ''}`}>
          {pb.title}
        </span>
        {pb.description && (
          <span className="text-[11px] text-muted block truncate">{pb.description}</span>
        )}
      </span>
    </button>
  );
}

function PlaybookDetail({
  playbook,
  projects,
  onChanged
}: {
  playbook: PlaybookWithSteps;
  projects: Project[];
  onChanged: () => Promise<void>;
}): JSX.Element {
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(playbook.title);
  const [description, setDescription] = useState(playbook.description ?? '');
  const [projectId, setProjectId] = useState(playbook.project_id ?? '');
  const [icon, setIcon] = useState(playbook.icon ?? '📋');

  useEffect(() => {
    setTitle(playbook.title);
    setDescription(playbook.description ?? '');
    setProjectId(playbook.project_id ?? '');
    setIcon(playbook.icon ?? '📋');
  }, [playbook.id]);

  async function saveMeta() {
    await api.updatePlaybook(playbook.id, {
      title,
      description: description || null,
      project_id: projectId || null,
      icon
    });
    setEditing(false);
    await onChanged();
  }

  async function toggleArchive() {
    await api.updatePlaybook(playbook.id, { archived: playbook.archived ? 0 : 1 });
    await onChanged();
  }

  async function remove(): Promise<void> {
    if (!confirm(`Удалить регламент «${playbook.title}»?`)) return;
    await api.deletePlaybook(playbook.id);
    await onChanged();
  }

  return (
    <div className="space-y-4">
      <section className="bg-surface rounded-lg shadow-sm p-5">
        {editing ? (
          <div className="space-y-3">
            <div className="flex gap-2 items-start">
              <select
                value={icon}
                onChange={(e) => setIcon(e.target.value)}
                className="h-10 px-2 rounded-md border border-border bg-surface text-lg"
              >
                {['📋', ...PROJECT_ICONS].map((i) => (
                  <option key={i} value={i}>
                    {i}
                  </option>
                ))}
              </select>
              <input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="flex-1 h-10 px-3 rounded-md border border-border bg-surface text-base font-medium"
              />
            </div>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
              placeholder="Краткое описание регламента..."
              className="w-full p-3 rounded-md border border-border bg-surface text-sm resize-none"
            />
            <div className="grid grid-cols-[120px_1fr] gap-3 items-center">
              <div className="text-xs uppercase text-muted">Проект</div>
              <select
                value={projectId}
                onChange={(e) => setProjectId(e.target.value)}
                className="h-10 px-2 rounded-md border border-border bg-surface text-sm"
              >
                <option value="">🌐 Глобальный (без проекта)</option>
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.icon ?? ''} {p.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setEditing(false)}
                className="px-3 py-1.5 rounded-md text-sm border border-border"
              >
                Отмена
              </button>
              <button
                onClick={saveMeta}
                className="px-4 py-1.5 rounded-md text-sm bg-accent text-white"
              >
                Сохранить
              </button>
            </div>
          </div>
        ) : (
          <div className="flex items-start gap-4">
            <div className="text-3xl">{playbook.icon ?? '📋'}</div>
            <div className="flex-1 min-w-0">
              <h2 className="text-xl font-semibold">{playbook.title}</h2>
              {playbook.description && (
                <p className="text-sm text-muted mt-1">{playbook.description}</p>
              )}
              <div className="text-xs text-muted mt-2">
                {playbook.project_id
                  ? `📁 ${projects.find((p) => p.id === playbook.project_id)?.name ?? '—'}`
                  : '🌐 Глобальный'}
                {' · '}
                {pluralizeSteps(playbook.steps.length)}
              </div>
            </div>
            <div className="flex gap-2 shrink-0">
              <button
                onClick={() => setEditing(true)}
                className="px-3 py-2 rounded-md text-sm border border-border hover:bg-surface2"
              >
                Изменить
              </button>
              <button
                onClick={toggleArchive}
                className="px-3 py-2 rounded-md text-sm border border-border hover:bg-surface2"
                title={playbook.archived ? 'Вернуть из архива' : 'В архив'}
              >
                {playbook.archived ? <ArchiveRestore size={14} /> : <Archive size={14} />}
              </button>
              <button
                onClick={remove}
                title="Удалить регламент"
                className="px-3 py-2 rounded-md text-sm border border-border hover:bg-red-50 hover:border-red-300 hover:text-red-500 transition"
              >
                <Trash2 size={14} />
              </button>
            </div>
          </div>
        )}
      </section>

      <DocumentationBlock
        value={playbook.content}
        label="Документация"
        onSave={async (v) => {
          await api.updatePlaybook(playbook.id, { content: v });
          await onChanged();
        }}
      />

      <StepEditor playbook={playbook} onChanged={onChanged} />
    </div>
  );
}

function StepEditor({
  playbook,
  onChanged
}: {
  playbook: PlaybookWithSteps;
  onChanged: () => Promise<void>;
}) {
  const [newStep, setNewStep] = useState('');
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  async function add() {
    if (!newStep.trim()) return;
    await api.addStep(playbook.id, { title: newStep });
    setNewStep('');
    await onChanged();
  }

  function toggle(id: string) {
    setExpanded((cur) => {
      const next = new Set(cur);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  return (
    <section className="bg-surface rounded-lg shadow-sm p-5">
      <div className="text-sm font-medium mb-3">Шаги · {playbook.steps.length}</div>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void add();
        }}
        className="flex gap-2 mb-3"
      >
        <input
          value={newStep}
          onChange={(e) => setNewStep(e.target.value)}
          placeholder="+ Новый шаг (название)"
          className="flex-1 h-9 px-3 rounded-md border border-border bg-surface text-sm focus:outline-none focus:border-accent"
        />
        <button
          type="submit"
          disabled={!newStep.trim()}
          className="bg-accent text-white px-4 h-9 rounded-md text-sm hover:bg-accent-hover disabled:opacity-40"
        >
          Добавить
        </button>
      </form>

      <div className="space-y-1">
        {playbook.steps.map((s, i) => (
          <StepRow
            key={s.id}
            step={s}
            index={i}
            expanded={expanded.has(s.id)}
            onToggle={() => toggle(s.id)}
            onChanged={onChanged}
          />
        ))}
        {playbook.steps.length === 0 && (
          <div className="text-sm text-muted text-center py-4">
            Добавь первый шаг сверху ↑
          </div>
        )}
      </div>
    </section>
  );
}

function StepRow({
  step,
  index,
  expanded,
  onToggle,
  onChanged
}: {
  step: PlaybookStep;
  index: number;
  expanded: boolean;
  onToggle: () => void;
  onChanged: () => Promise<void>;
}) {
  const [title, setTitle] = useState(step.title);
  const [description, setDescription] = useState(step.description ?? '');

  useEffect(() => {
    setTitle(step.title);
    setDescription(step.description ?? '');
  }, [step.id]);

  async function saveTitle() {
    if (title !== step.title) {
      await api.updateStep(step.id, { title });
      await onChanged();
    }
  }
  async function saveDesc() {
    if (description !== (step.description ?? '')) {
      await api.updateStep(step.id, { description: description || null });
      await onChanged();
    }
  }
  async function remove() {
    if (!confirm('Удалить шаг?')) return;
    await api.deleteStep(step.id);
    await onChanged();
  }
  async function move(dir: -1 | 1) {
    await api.updateStep(step.id, { sort_order: step.sort_order + dir * 1.5 });
    await onChanged();
  }

  return (
    <div className="border border-border rounded-md group">
      <div className="flex items-center gap-2 px-3 py-2">
        <button
          onClick={onToggle}
          className="text-faint hover:text-ink shrink-0"
          title={expanded ? 'Свернуть' : 'Развернуть'}
        >
          {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        </button>
        <span className="text-xs text-muted timer-font w-5">{index + 1}.</span>
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onBlur={saveTitle}
          className="flex-1 text-sm bg-transparent focus:outline-none"
        />
        <div className="flex gap-1 opacity-0 group-hover:opacity-100">
          <button onClick={() => move(-1)} className="text-faint hover:text-ink text-xs px-1">
            ↑
          </button>
          <button onClick={() => move(1)} className="text-faint hover:text-ink text-xs px-1">
            ↓
          </button>
          <button onClick={remove} className="text-faint hover:text-danger">
            <Trash2 size={12} />
          </button>
        </div>
      </div>
      {expanded && (
        <div className="border-t border-border px-3 py-2">
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            onBlur={saveDesc}
            rows={4}
            placeholder="Подробное описание шага, инструкции, ссылки..."
            className="w-full p-2 rounded-md border border-border bg-surface text-sm focus:outline-none focus:border-accent resize-none font-mono"
          />
        </div>
      )}
    </div>
  );
}

function CreatePlaybookModal({
  open,
  projects,
  onClose,
  onCreated
}: {
  open: boolean;
  projects: Project[];
  onClose: () => void;
  onCreated: (pb: Playbook) => Promise<void>;
}) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [projectId, setProjectId] = useState('');
  const [icon, setIcon] = useState('📋');

  useEffect(() => {
    if (open) {
      setTitle('');
      setDescription('');
      setProjectId('');
      setIcon('📋');
    }
  }, [open]);

  async function create() {
    if (!title.trim()) return;
    const pb = await api.createPlaybook({
      title,
      description: description || null,
      project_id: projectId || null,
      icon
    });
    await onCreated(pb);
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Новый регламент"
      footer={
        <>
          <button onClick={onClose} className="px-3 py-1.5 rounded-md text-sm border border-border">
            Отмена
          </button>
          <button
            onClick={create}
            disabled={!title.trim()}
            className="px-4 py-1.5 rounded-md text-sm bg-accent text-white hover:bg-accent-hover disabled:opacity-40"
          >
            Создать
          </button>
        </>
      }
    >
      <div className="space-y-3">
        <div className="flex gap-2 items-start">
          <select
            value={icon}
            onChange={(e) => setIcon(e.target.value)}
            className="h-10 px-2 rounded-md border border-border bg-surface text-lg"
          >
            {['📋', '📝', '🚀', '💼', '🎓', '🛠', '📚', '🎯', ...PROJECT_ICONS].map((i) => (
              <option key={i} value={i}>
                {i}
              </option>
            ))}
          </select>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            autoFocus
            placeholder="Например, «Наём нового чаттера»"
            className="flex-1 h-10 px-3 rounded-md border border-border bg-surface text-sm"
          />
        </div>
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={2}
          placeholder="Короткое описание (опционально)"
          className="w-full p-3 rounded-md border border-border bg-surface text-sm resize-none"
        />
        <div>
          <label className="text-xs uppercase text-muted">Привязать к проекту</label>
          <select
            value={projectId}
            onChange={(e) => setProjectId(e.target.value)}
            className="w-full mt-1 h-10 px-2 rounded-md border border-border bg-surface text-sm"
          >
            <option value="">🌐 Глобальный (без проекта)</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.icon ?? ''} {p.name}
              </option>
            ))}
          </select>
        </div>
        <div className="text-xs text-muted">
          После создания добавь шаги — каждый с описанием.
        </div>
      </div>
    </Modal>
  );
}

