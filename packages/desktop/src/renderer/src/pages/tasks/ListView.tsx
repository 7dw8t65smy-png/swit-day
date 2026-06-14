import { Trash2 } from 'lucide-react';
import { api } from '../../api';
import type { Project, Task } from '@swit/shared';
import { sortByPriority } from '../../lib/priority';
import { confirmDelete } from '../../lib/confirm';
import ProjectBadge from '../../components/ProjectBadge';
import PriorityBadge from '../../components/PriorityBadge';
import DifficultyBadge from '../../components/DifficultyBadge';
import { formatShortDate } from './dueDate';

export function ListView({
  tasks,
  projectById,
  onOpenTask,
  onChanged,
  onPatch
}: {
  tasks: Task[];
  projectById: Map<string, Project>;
  onOpenTask: (id: string) => void;
  onChanged: () => Promise<void>;
  onPatch: (task: Task) => void;
}) {
  const sorted = sortByPriority(tasks);
  return (
    <div className="bg-surface rounded-lg shadow-sm divide-y divide-border">
      {sorted.map((t) => (
        <div
          key={t.id}
          onClick={() => onOpenTask(t.id)}
          className="px-4 py-3 flex items-center gap-3 text-sm group hover:bg-surface2 cursor-pointer"
        >
          <input
            type="checkbox"
            checked={t.status === 'done'}
            onChange={(e) => e.stopPropagation()}
            onClick={async (e) => {
              e.stopPropagation();
              const upd = await api.updateTask(t.id, {
                status: t.status === 'done' ? 'pending' : 'done'
              });
              onPatch(upd);
            }}
          />
          <span
            className={t.status === 'done' ? 'line-through text-muted flex-1' : 'flex-1 text-ink'}
          >
            {t.title}
          </span>
          {t.project_id && <ProjectBadge project={projectById.get(t.project_id) ?? null} />}
          <DifficultyBadge difficulty={t.difficulty ?? 'medium'} />
          <PriorityBadge priority={t.priority} />
          {t.due_date && <span className="text-xs text-muted">{formatShortDate(t.due_date)}</span>}
          <button
            onClick={async (e) => {
              e.stopPropagation();
              if (!confirmDelete(`Удалить задачу «${t.title}»?`)) return;
              await api.deleteTask(t.id);
              await onChanged();
            }}
            className="text-faint hover:text-danger opacity-0 group-hover:opacity-100"
          >
            <Trash2 size={14} />
          </button>
        </div>
      ))}
      {sorted.length === 0 && (
        <div className="text-muted text-sm p-10 text-center">Нет задач</div>
      )}
    </div>
  );
}
