import type { Playbook, Project } from '@swit/shared';

export function PlaybookList({
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
