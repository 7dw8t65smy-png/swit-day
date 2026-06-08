import { useMemo } from 'react';
import type { Project, Task } from '@swit/shared';
import { PRIORITY_COLOR } from '../../lib/priority';
import { localDateKey } from '../../lib/date';
import { formatRelativeDue } from './dueDate';

// --- Insights row between board and footer ---
//
// Two side-by-side panels: «Срочное / просроченное» and «Дедлайны на неделе».
// Each lists up to 5 tasks, click opens the drawer. Hides itself entirely if
// both panels are empty, so it doesn't add visual noise when there's nothing to
// surface.

export function TasksInsights({
  tasks,
  projectById,
  today,
  onOpenTask
}: {
  tasks: Task[];
  projectById: Map<string, Project>;
  today: string;
  onOpenTask: (id: string) => void;
}): JSX.Element | null {
  const inWeek = useMemo(() => {
    const now = new Date();
    const in7 = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 7);
    const weekKey = localDateKey(in7);
    return tasks.filter(
      (t) =>
        !t.parent_task_id &&
        t.status !== 'done' &&
        t.due_date &&
        t.due_date > today &&
        t.due_date <= weekKey
    );
  }, [tasks, today]);

  const urgentOrOverdue = useMemo(() => {
    return tasks.filter(
      (t) =>
        !t.parent_task_id &&
        t.status !== 'done' &&
        (t.priority === 'urgent' || (t.due_date && t.due_date < today))
    );
  }, [tasks, today]);

  if (urgentOrOverdue.length === 0 && inWeek.length === 0) return null;

  // Sort: overdue first, then urgent, then by due_date
  const sortedHot = [...urgentOrOverdue].sort((a, b) => {
    const aOver = a.due_date && a.due_date < today ? 0 : 1;
    const bOver = b.due_date && b.due_date < today ? 0 : 1;
    if (aOver !== bOver) return aOver - bOver;
    return (a.due_date ?? '9999').localeCompare(b.due_date ?? '9999');
  });

  const sortedSoon = [...inWeek].sort((a, b) =>
    (a.due_date ?? '9999').localeCompare(b.due_date ?? '9999')
  );

  return (
    <div className="mt-4 grid grid-cols-1 lg:grid-cols-2 gap-3">
      <InsightPanel
        title="Срочное и просроченное"
        icon="🔥"
        accent="red"
        items={sortedHot}
        projectById={projectById}
        today={today}
        onOpenTask={onOpenTask}
        emptyHint="Ничего не горит — красота."
      />
      <InsightPanel
        title="Дедлайны на этой неделе"
        icon="📅"
        accent="amber"
        items={sortedSoon}
        projectById={projectById}
        today={today}
        onOpenTask={onOpenTask}
        emptyHint="На неделю ничего не висит."
      />
    </div>
  );
}

function InsightPanel({
  title,
  icon,
  accent,
  items,
  projectById,
  today,
  onOpenTask,
  emptyHint
}: {
  title: string;
  icon: string;
  accent: 'red' | 'amber';
  items: Task[];
  projectById: Map<string, Project>;
  today: string;
  onOpenTask: (id: string) => void;
  emptyHint: string;
}): JSX.Element {
  const headColor = accent === 'red' ? 'text-red-500' : 'text-amber-600';
  return (
    <section className="bg-surface rounded-lg shadow-sm border border-border">
      <header className="px-4 py-2.5 border-b border-border flex items-center justify-between">
        <h2 className="text-sm font-semibold flex items-center gap-1.5">
          <span>{icon}</span>
          <span className={headColor}>{title}</span>
        </h2>
        <span className="text-[11px] text-faint">{items.length}</span>
      </header>
      {items.length === 0 ? (
        <div className="px-4 py-6 text-center text-xs text-muted">{emptyHint}</div>
      ) : (
        <ul className="divide-y divide-border">
          {items.slice(0, 5).map((t) => (
            <InsightRow
              key={t.id}
              task={t}
              project={t.project_id ? projectById.get(t.project_id) ?? null : null}
              today={today}
              onClick={() => onOpenTask(t.id)}
            />
          ))}
          {items.length > 5 && (
            <li className="px-4 py-2 text-center text-[11px] text-faint">
              И ещё {items.length - 5}…
            </li>
          )}
        </ul>
      )}
    </section>
  );
}

function InsightRow({
  task,
  project,
  today,
  onClick
}: {
  task: Task;
  project: Project | null;
  today: string;
  onClick: () => void;
}): JSX.Element {
  const overdue = task.due_date && task.due_date < today;
  const dueLabel = task.due_date
    ? formatRelativeDue(task.due_date, task.due_time, false).label
    : null;
  const dueClass = overdue ? 'text-red-500 font-medium' : 'text-muted';

  return (
    <li>
      <button
        onClick={onClick}
        className="w-full px-4 py-2 text-left hover:bg-surface2/40 transition flex items-center gap-3"
      >
        <span
          className="w-2 h-2 rounded-full shrink-0"
          style={{ background: PRIORITY_COLOR[task.priority] }}
          title={task.priority}
        />
        <div className="flex-1 min-w-0">
          <div className="text-sm font-medium truncate">{task.title}</div>
          {project && (
            <div className="text-[11px] text-muted truncate">
              {project.icon ?? '📁'} {project.name}
            </div>
          )}
        </div>
        {dueLabel && (
          <span className={`text-[11px] shrink-0 ${dueClass}`}>{dueLabel}</span>
        )}
      </button>
    </li>
  );
}
