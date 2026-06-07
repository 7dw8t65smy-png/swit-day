import type { Project, Task } from '@swit/shared';

/**
 * Build a human-readable summary of tasks completed today.
 * Groups by project, sorts within group by completion time.
 */
export function buildAutoSummary(tasks: Task[], projects: Project[], date: string): string {
  const done = tasks.filter((t) => t.status === 'done' && t.completed_at?.startsWith(date));
  if (done.length === 0) return '';

  const byProject = new Map<string | null, Task[]>();
  for (const t of done) {
    const key = t.project_id ?? null;
    const arr = byProject.get(key) ?? [];
    arr.push(t);
    byProject.set(key, arr);
  }
  for (const arr of byProject.values()) {
    arr.sort((a, b) => (a.completed_at ?? '').localeCompare(b.completed_at ?? ''));
  }

  const projectById = new Map(projects.map((p) => [p.id, p] as const));
  const lines: string[] = [];

  // Projects with tasks done — sorted by project name
  const projectIds = [...byProject.keys()]
    .filter((k): k is string => k !== null)
    .sort((a, b) => {
      const na = projectById.get(a)?.name ?? '';
      const nb = projectById.get(b)?.name ?? '';
      return na.localeCompare(nb);
    });

  for (const pid of projectIds) {
    const p = projectById.get(pid);
    const items = byProject.get(pid) ?? [];
    const header = p ? `${p.icon ?? '📁'} ${p.name}` : 'Проект';
    lines.push(`${header} (${items.length})`);
    for (const t of items) lines.push(`  • ${t.title}`);
    lines.push('');
  }

  const orphans = byProject.get(null);
  if (orphans && orphans.length > 0) {
    lines.push(`Без проекта (${orphans.length})`);
    for (const t of orphans) lines.push(`  • ${t.title}`);
    lines.push('');
  }

  lines.push(`Итого задач готово: ${done.length}`);
  return lines.join('\n').trim();
}

export function mergeWithUserText(auto: string, user: string): string {
  if (!user.trim()) return auto;
  if (!auto.trim()) return user;
  if (user.includes(auto.trim())) return user;
  return `${user.trim()}\n\n— Авто-сводка —\n${auto}`;
}
