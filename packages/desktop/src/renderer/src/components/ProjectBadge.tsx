import type { Project } from '@swit/shared';

export default function ProjectBadge({
  project,
  size = 'sm'
}: {
  project: Project | null | undefined;
  size?: 'sm' | 'md';
}) {
  if (!project) {
    return (
      <span className="inline-flex items-center gap-1 text-xs text-faint">
        <span className="w-2 h-2 rounded-full bg-faint" /> без проекта
      </span>
    );
  }
  const px = size === 'sm' ? 'px-2 py-0.5 text-[11px]' : 'px-2.5 py-1 text-xs';
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full font-medium ${px}`}
      style={{ background: project.color + '20', color: project.color }}
    >
      {project.icon ? <span>{project.icon}</span> : <span className="w-2 h-2 rounded-full" style={{ background: project.color }} />}
      <span>{project.name}</span>
    </span>
  );
}
