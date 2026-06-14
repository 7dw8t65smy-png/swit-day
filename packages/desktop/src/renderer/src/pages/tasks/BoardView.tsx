import { useEffect, useState } from 'react';
import { Plus, Settings as SettingsIcon, Archive } from 'lucide-react';
import { api } from '../../api';
import type { Project, Task, TaskPriority, TaskDifficulty } from '@swit/shared';
import { sortByPriority } from '../../lib/priority';
import { useSettings } from '../../lib/settings';
import { TaskCard } from './TaskCard';
import { PriorityPicker, DifficultyPicker } from './pickers';

export function BoardView({
  tasks,
  projects,
  showArchived,
  onToggleArchived,
  onOpenTask,
  onChanged,
  onPatch,
  onEditProject,
  onCreateProject,
  subtaskStats
}: {
  tasks: Task[];
  projects: Project[];
  showArchived: boolean;
  onToggleArchived: () => void;
  onOpenTask: (id: string) => void;
  onChanged: () => Promise<void>;
  onPatch: (task: Task) => void;
  onEditProject: (p: Project) => void;
  onCreateProject: () => void;
  subtaskStats: { total: Map<string, number>; done: Map<string, number> };
}) {
  const visibleProjects = showArchived ? projects : projects.filter((p) => !p.archived);
  const archivedCount = projects.filter((p) => p.archived).length;
  const columns: { id: string | null; project: Project | null; items: Task[] }[] = [
    ...visibleProjects.map((p) => ({
      id: p.id,
      project: p,
      items: sortByPriority(tasks.filter((t) => t.project_id === p.id))
    })),
    {
      id: null,
      project: null,
      items: sortByPriority(tasks.filter((t) => !t.project_id))
    }
  ];

  async function moveTask(taskId: string, projectId: string | null) {
    const updated = await api.updateTask(taskId, { project_id: projectId });
    onPatch(updated);
  }

  return (
    <div className="flex gap-3 overflow-x-auto pb-3 -mx-6 px-6">
      {columns.map((col) => (
        <BoardColumn
          key={col.id ?? '__none__'}
          project={col.project}
          items={col.items}
          onOpenTask={onOpenTask}
          onChanged={onChanged}
          onPatch={onPatch}
          onDropTask={(id) => moveTask(id, col.id)}
          onEditProject={col.project ? () => onEditProject(col.project!) : undefined}
          subtaskStats={subtaskStats}
        />
      ))}

      {/* Add new project column */}
      <div className="w-[280px] shrink-0 flex flex-col gap-2 min-h-[60vh]">
        <button
          onClick={onCreateProject}
          className="flex-1 rounded-lg border-2 border-dashed border-border hover:border-accent hover:bg-accent-light text-sm text-muted hover:text-accent transition flex flex-col items-center justify-center gap-2 min-h-[140px]"
        >
          <Plus size={20} /> Новый проект
        </button>
        {archivedCount > 0 && (
          <button
            onClick={onToggleArchived}
            className="rounded-lg border border-border text-xs text-muted hover:bg-surface2 transition p-2 flex items-center justify-center gap-1.5"
          >
            <Archive size={12} />
            {showArchived ? 'Скрыть архив' : `Показать архив (${archivedCount})`}
          </button>
        )}
      </div>
    </div>
  );
}

function BoardColumn({
  project,
  items,
  onOpenTask,
  onChanged,
  onPatch,
  onDropTask,
  onEditProject,
  subtaskStats
}: {
  project: Project | null;
  items: Task[];
  onOpenTask: (id: string) => void;
  onChanged: () => Promise<void>;
  onPatch: (task: Task) => void;
  onDropTask: (taskId: string) => Promise<void>;
  onEditProject?: () => void;
  subtaskStats: { total: Map<string, number>; done: Map<string, number> };
}) {
  const defaultPriority = useSettings((s) => s.settings.default_priority);
  const defaultDifficulty = useSettings((s) => s.settings.default_difficulty);
  const [title, setTitle] = useState('');
  const [priority, setPriority] = useState<TaskPriority>(defaultPriority);
  const [difficulty, setDifficulty] = useState<TaskDifficulty>(defaultDifficulty);
  const [hover, setHover] = useState(false);

  // Keep form defaults in sync with settings — if user changes them in Settings,
  // the next time they look at an "empty" form it reflects the new default.
  useEffect(() => {
    if (!title) setPriority(defaultPriority);
  }, [defaultPriority, title]);
  useEffect(() => {
    if (!title) setDifficulty(defaultDifficulty);
  }, [defaultDifficulty, title]);

  async function add() {
    if (!title.trim()) return;
    await api.createTask({
      title,
      project_id: project?.id ?? null,
      priority,
      difficulty
    });
    setTitle('');
    setPriority(defaultPriority);
    setDifficulty(defaultDifficulty);
    await onChanged();
  }

  const color = project?.color ?? '#94A3B8';

  return (
    <div
      className={`w-[320px] shrink-0 rounded-lg bg-surface2 flex flex-col min-h-[60vh] max-h-[calc(100vh-260px)] transition ${
        hover ? 'ring-2 ring-accent bg-accent-light' : ''
      }`}
      onDragOver={(e) => {
        e.preventDefault();
        setHover(true);
      }}
      onDragLeave={() => setHover(false)}
      onDrop={async (e) => {
        e.preventDefault();
        setHover(false);
        const id = e.dataTransfer.getData('text/task-id');
        if (id) await onDropTask(id);
      }}
    >
      <div
        className="px-3 py-2.5 flex items-center gap-2 border-b border-border rounded-t-lg sticky top-0 bg-surface2 z-10 group/header"
      >
        {project ? (
          <button
            onClick={onEditProject}
            className="flex items-center gap-2 flex-1 min-w-0 text-left hover:bg-surface rounded px-1 -mx-1 py-0.5 transition"
            title="Настройки проекта"
          >
            <div
              className="w-6 h-6 rounded flex items-center justify-center text-sm"
              style={{ background: color + '20' }}
            >
              {project.icon ?? '📁'}
            </div>
            <div className="font-medium text-sm flex-1 truncate">{project.name}</div>
            {project.archived ? (
              <span className="text-[10px] text-faint">архив</span>
            ) : null}
          </button>
        ) : (
          <div className="font-medium text-sm flex-1 text-muted">Без проекта</div>
        )}
        <span className="text-xs text-muted bg-surface rounded-full px-2 py-0.5">
          {items.length}
        </span>
        {project && onEditProject && (
          <button
            onClick={onEditProject}
            className="text-faint hover:text-ink opacity-0 group-hover/header:opacity-100 transition"
            title="Настройки проекта"
          >
            <SettingsIcon size={13} />
          </button>
        )}
      </div>

      <div className="overflow-y-auto p-2 space-y-2 flex-1">
        {items.map((t) => (
          <TaskCard
            key={t.id}
            task={t}
            onClick={() => onOpenTask(t.id)}
            onPatch={onPatch}
            subtaskCount={subtaskStats.total.get(t.id)}
            subtaskDone={subtaskStats.done.get(t.id)}
          />
        ))}
        {items.length === 0 && (
          <div className="text-center py-10 px-4 select-none">
            <div className="text-4xl mb-2 opacity-25">{project?.icon ?? '📋'}</div>
            <div className="text-xs text-muted font-medium">
              {project ? `В «${project.name}» пока пусто` : 'Здесь пока пусто'}
            </div>
            <div className="text-[11px] text-faint mt-1">
              Добавь задачу снизу ↓ или перетащи сюда
            </div>
          </div>
        )}
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          void add();
        }}
        className="p-2 border-t border-border bg-surface2 rounded-b-lg flex items-center gap-1"
      >
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Новая задача"
          autoComplete="off"
          className="flex-1 min-w-0 h-8 px-2.5 rounded-md bg-surface border border-border text-xs focus:outline-none focus:border-accent transition"
        />
        <PriorityPicker value={priority} onChange={setPriority} />
        <DifficultyPicker value={difficulty} onChange={setDifficulty} />
        <button
          type="submit"
          disabled={!title.trim()}
          title="Добавить задачу (Enter)"
          className={`shrink-0 w-8 h-8 rounded-md flex items-center justify-center transition ${
            title.trim()
              ? 'bg-accent text-white hover:bg-accent-hover shadow-sm'
              : 'bg-surface text-faint border border-border cursor-not-allowed'
          }`}
        >
          <Plus size={14} />
        </button>
      </form>
    </div>
  );
}
