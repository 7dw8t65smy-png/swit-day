import { Plus } from 'lucide-react';
import type { Playbook, Project } from '@swit/shared';
import { formatRelative } from './helpers';

/**
 * Overview / dashboard shown when no specific playbook is selected.
 * Fills the right pane with: a brief heading, KPI strip, tile grid of all
 * playbooks (with documentation preview), and a "create new" call-to-action
 * tile. Beats an empty white card every time.
 */
export function PlaybooksOverview({
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
