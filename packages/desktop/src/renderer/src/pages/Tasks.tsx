import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Trash2,
  Plus,
  Search,
  Settings as SettingsIcon,
  Archive,
  GripVertical,
  Flame,
  ArrowUp,
  ArrowDown,
  Minus,
  Check,
  AlertTriangle,
  Clock,
  CheckCircle2,
  ChevronUp,
  ChevronDown
} from 'lucide-react';
import { api } from '../api';
import type { Project, Task, TaskPriority } from '@swit/shared';
import { PRIORITIES, PRIORITY_LABEL, PRIORITY_COLOR, sortByPriority } from '../lib/priority';
import { DIFFICULTIES, DIFFICULTY_LABEL } from '../lib/difficulty';
import type { TaskDifficulty } from '@swit/shared';
import ProjectBadge from '../components/ProjectBadge';
import PriorityBadge from '../components/PriorityBadge';
import DifficultyBadge from '../components/DifficultyBadge';
import TaskDrawer from '../components/TaskDrawer';
import ProjectFormModal from '../components/ProjectFormModal';
import { useSettings } from '../lib/settings';
import { confirmDelete } from '../lib/confirm';
import { localDateKey } from '../lib/date';

type ViewMode = 'board' | 'list';
type Filter = 'open' | 'today' | 'all' | 'done';

export default function Tasks() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const showCompletedDefault = useSettings((s) => s.settings.show_completed_tasks);
  const [view, setView] = useState<ViewMode>('board');
  // If the user prefers to see completed by default — start with the "all" filter.
  const [filter, setFilter] = useState<Filter>(showCompletedDefault ? 'all' : 'open');
  const [search, setSearch] = useState('');
  const [drawerTaskId, setDrawerTaskId] = useState<string | null>(null);
  const [projectEdit, setProjectEdit] = useState<Project | null>(null);
  const [projectCreate, setProjectCreate] = useState(false);
  const [showArchived, setShowArchived] = useState(false);

  useEffect(() => {
    void reload();
  }, []);

  async function reload() {
    const [ts, ps] = await Promise.all([api.listTasks(), api.listProjects()]);
    setTasks(ts);
    setProjects(ps);
  }

  const today = localDateKey();
  const projectById = useMemo(
    () => new Map(projects.map((p) => [p.id, p] as const)),
    [projects]
  );

  // Aggregate subtask counts per parent
  const subtaskStats = useMemo(() => {
    const total = new Map<string, number>();
    const done = new Map<string, number>();
    for (const t of tasks) {
      if (!t.parent_task_id) continue;
      total.set(t.parent_task_id, (total.get(t.parent_task_id) ?? 0) + 1);
      if (t.status === 'done')
        done.set(t.parent_task_id, (done.get(t.parent_task_id) ?? 0) + 1);
    }
    return { total, done };
  }, [tasks]);

  const filtered = useMemo(
    () =>
      tasks.filter((t) => {
        // hide subtasks from the board/list — they belong to their parent
        if (t.parent_task_id) return false;
        if (filter === 'today' && t.due_date !== today) return false;
        if (filter === 'open' && t.status === 'done') return false;
        if (filter === 'done' && t.status !== 'done') return false;
        if (search && !t.title.toLowerCase().includes(search.toLowerCase())) return false;
        return true;
      }),
    [tasks, filter, search, today]
  );

  const drawerTask = useMemo(
    () => (drawerTaskId ? tasks.find((t) => t.id === drawerTaskId) ?? null : null),
    [drawerTaskId, tasks]
  );

  // Stats for the footer bar — computed over the *full* task list, not the
  // currently-filtered slice. So switching to "Готовые" doesn't make "осталось 0".
  const stats = useMemo(() => {
    const topLevel = tasks.filter((t) => !t.parent_task_id);
    const open = topLevel.filter((t) => t.status !== 'done');
    const doneTodayArr = topLevel.filter(
      (t) => t.status === 'done' && (t.completed_at ?? '').slice(0, 10) === today
    );
    const overdue = open.filter(
      (t) => t.due_date && t.due_date < today
    );
    const urgent = open.filter((t) => t.priority === 'urgent');
    const dueToday = open.filter((t) => t.due_date === today);
    return {
      remaining: open.length,
      doneToday: doneTodayArr.length,
      doneTodayTasks: doneTodayArr,
      overdue: overdue.length,
      urgent: urgent.length,
      dueToday: dueToday.length
    };
  }, [tasks, today]);

  return (
    <div className="p-6 pb-0 max-w-[1500px] min-h-screen flex flex-col">
      <div className="flex items-center gap-2 mb-4 flex-wrap">
        <h1 className="text-2xl font-semibold mr-2">Задачи</h1>
        <div className="flex gap-1 bg-surface2 rounded-md p-1">
          {(['board', 'list'] as ViewMode[]).map((v) => (
            <button
              key={v}
              onClick={() => setView(v)}
              className={`px-3 py-1 rounded text-sm ${
                view === v ? 'bg-surface shadow-sm' : 'text-muted'
              }`}
            >
              {v === 'board' ? 'Доска' : 'Список'}
            </button>
          ))}
        </div>
        <div className="flex gap-1 bg-surface2 rounded-md p-1 ml-2">
          {(['open', 'today', 'all', 'done'] as Filter[]).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`px-3 py-1 rounded text-sm ${
                filter === f ? 'bg-surface shadow-sm' : 'text-muted'
              }`}
            >
              {f === 'open'
                ? 'Открытые'
                : f === 'today'
                  ? 'Сегодня'
                  : f === 'all'
                    ? 'Все'
                    : 'Готовые'}
            </button>
          ))}
        </div>
        <div className="ml-auto flex items-center gap-2 relative">
          <Search size={14} className="absolute left-3 text-faint" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Поиск..."
            className="h-9 pl-9 pr-3 rounded-md border border-border bg-surface text-sm w-56"
          />
        </div>
      </div>

      <div className="flex-1">
        {view === 'board' ? (
          <BoardView
            tasks={filtered}
            projects={projects}
            showArchived={showArchived}
            onToggleArchived={() => setShowArchived((v) => !v)}
            onOpenTask={setDrawerTaskId}
            onChanged={reload}
            onEditProject={setProjectEdit}
            onCreateProject={() => setProjectCreate(true)}
            subtaskStats={subtaskStats}
          />
        ) : (
          <ListView
            tasks={filtered}
            projectById={projectById}
            onOpenTask={setDrawerTaskId}
            onChanged={reload}
          />
        )}
      </div>

      {view === 'board' && (
        <TasksInsights
          tasks={tasks}
          projectById={projectById}
          today={today}
          onOpenTask={setDrawerTaskId}
        />
      )}

      <TasksFooter stats={stats} onOpenTask={setDrawerTaskId} />

      <TaskDrawer
        task={drawerTask}
        projects={projects}
        onClose={() => setDrawerTaskId(null)}
        onOpenTask={setDrawerTaskId}
        onChanged={reload}
      />

      <ProjectFormModal
        open={projectCreate || projectEdit !== null}
        project={projectEdit}
        onClose={() => {
          setProjectCreate(false);
          setProjectEdit(null);
        }}
        onSaved={async () => {
          setProjectCreate(false);
          setProjectEdit(null);
          await reload();
        }}
        onDelete={async (id) => {
          // Detach tasks from this project, then delete.
          const taskIds = tasks.filter((t) => t.project_id === id).map((t) => t.id);
          for (const tid of taskIds) {
            await api.updateTask(tid, { project_id: null });
          }
          await api.deleteProject(id);
          setProjectCreate(false);
          setProjectEdit(null);
          await reload();
        }}
      />
    </div>
  );
}

function BoardView({
  tasks,
  projects,
  showArchived,
  onToggleArchived,
  onOpenTask,
  onChanged,
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
    await api.updateTask(taskId, { project_id: projectId });
    await onChanged();
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
  onDropTask,
  onEditProject,
  subtaskStats
}: {
  project: Project | null;
  items: Task[];
  onOpenTask: (id: string) => void;
  onChanged: () => Promise<void>;
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
            onChanged={onChanged}
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

function TaskCard({
  task,
  onClick,
  onChanged,
  subtaskCount,
  subtaskDone
}: {
  task: Task;
  onClick: () => void;
  onChanged: () => Promise<void>;
  subtaskCount?: number;
  subtaskDone?: number;
}) {
  async function toggle(e: React.MouseEvent) {
    e.stopPropagation();
    const updated = await api.updateTask(task.id, {
      status: task.status === 'done' ? 'pending' : 'done'
    });
    await onChanged();
  }
  const accent = PRIORITY_COLOR[task.priority];
  const due = task.due_date
    ? formatRelativeDue(task.due_date, task.due_time, task.status === 'done')
    : null;
  const hasFooter =
    !!due ||
    task.priority !== 'normal' ||
    (task.difficulty && task.difficulty !== 'medium') ||
    (subtaskCount ?? 0) > 0;

  return (
    <div
      onClick={onClick}
      draggable
      onDragStart={(e) => {
        e.dataTransfer.setData('text/task-id', task.id);
        e.dataTransfer.effectAllowed = 'move';
      }}
      className={`bg-surface rounded-md cursor-pointer hover:shadow-md hover:border-accent/40 transition shadow-sm group border border-transparent ${
        task.status === 'done' ? 'opacity-60' : ''
      }`}
      style={
        task.priority !== 'normal'
          ? { borderLeft: `3px solid ${accent}` }
          : { borderLeft: '3px solid transparent' }
      }
    >
      <div className="flex items-start gap-1 p-2.5 pl-1">
        <div
          className="self-stretch flex items-center px-0.5 -my-2.5 py-2.5 text-faint/40 group-hover:text-muted cursor-grab active:cursor-grabbing transition"
          title="Перетащить задачу в другой проект"
          onClick={(e) => e.stopPropagation()}
        >
          <GripVertical size={14} />
        </div>
        <input
          type="checkbox"
          checked={task.status === 'done'}
          onChange={() => {}}
          onClick={toggle}
          className="mt-0.5 shrink-0"
        />
        <div className="flex-1 min-w-0">
          <div
            className={`text-sm leading-tight ${
              task.status === 'done' ? 'line-through text-muted' : ''
            }`}
          >
            {task.title}
          </div>
          {hasFooter && (
            <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
              <DifficultyBadge difficulty={task.difficulty ?? 'medium'} />
              <PriorityBadge priority={task.priority} />
              {subtaskCount !== undefined && subtaskCount > 0 && (
                <span
                  className="text-[10px] text-muted flex items-center gap-0.5"
                  title={`Подзадачи: ${subtaskDone ?? 0} из ${subtaskCount} готово`}
                >
                  ✎ {subtaskDone ?? 0}/{subtaskCount}
                </span>
              )}
              {due && (
                <span
                  className={`text-[10px] font-medium ${due.toneClass}`}
                  title={`Дедлайн: ${task.due_date}${task.due_time ? ' в ' + task.due_time.slice(0, 5) : ''}`}
                >
                  {due.label}
                </span>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function ListView({
  tasks,
  projectById,
  onOpenTask,
  onChanged
}: {
  tasks: Task[];
  projectById: Map<string, Project>;
  onOpenTask: (id: string) => void;
  onChanged: () => Promise<void>;
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
              await onChanged();
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

// --- Insights row between board and footer ---
//
// Two side-by-side panels: «Срочное / просроченное» and «Дедлайны на неделе».
// Each lists up to 5 tasks, click opens the drawer. Hides itself entirely if
// both panels are empty, so it doesn't add visual noise when there's nothing to
// surface.

function TasksInsights({
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

// --- Sticky footer with stats and "done today" strip ---
//
// Always-visible bar at the bottom of the Tasks page. Left side shows live
// counters (остатков, сделано, срочных, просрочено, дедлайн сегодня). Right side
// hosts an expand toggle for the "Сделано сегодня" strip — collapsed by default,
// hidden entirely when there's nothing done today.

interface TaskStats {
  remaining: number;
  doneToday: number;
  doneTodayTasks: Task[];
  overdue: number;
  urgent: number;
  dueToday: number;
}

function TasksFooter({
  stats,
  onOpenTask
}: {
  stats: TaskStats;
  onOpenTask: (id: string) => void;
}): JSX.Element {
  const [doneOpen, setDoneOpen] = useState(false);
  const hasDone = stats.doneToday > 0;

  return (
    <div className="sticky bottom-0 -mx-6 mt-4 bg-surface border-t border-border shadow-[0_-2px_8px_rgba(0,0,0,0.04)] z-10">
      {hasDone && doneOpen && (
        <div className="px-6 py-2 border-b border-border bg-surface2/40">
          <div className="text-[10px] uppercase tracking-wide text-muted mb-1.5">
            Сделано сегодня
          </div>
          <div className="flex gap-1.5 flex-wrap">
            {stats.doneTodayTasks.map((t) => (
              <button
                key={t.id}
                onClick={() => onOpenTask(t.id)}
                title={t.title}
                className="px-2 py-1 rounded-full text-[11px] bg-surface border border-border text-muted line-through hover:bg-accent-light hover:text-accent hover:border-accent transition max-w-[200px] truncate"
              >
                <Check size={10} className="inline -mt-0.5 mr-1 text-green-600" />
                {t.title}
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="px-6 py-2 flex items-center gap-3 text-xs flex-wrap">
        <Metric
          icon={<Clock size={13} className="text-muted" />}
          label="Осталось"
          value={stats.remaining}
        />
        <Metric
          icon={<CheckCircle2 size={13} className="text-green-600" />}
          label="Сегодня сделано"
          value={stats.doneToday}
        />
        {stats.urgent > 0 && (
          <Metric
            icon={<Flame size={13} className="text-red-500" />}
            label="Срочно"
            value={stats.urgent}
            tone="urgent"
          />
        )}
        {stats.overdue > 0 && (
          <Metric
            icon={<AlertTriangle size={13} className="text-red-500" />}
            label="Просрочено"
            value={stats.overdue}
            tone="urgent"
          />
        )}
        {stats.dueToday > 0 && (
          <Metric
            icon={<Clock size={13} className="text-amber-500" />}
            label="Дедлайн сегодня"
            value={stats.dueToday}
            tone="warn"
          />
        )}

        {hasDone && (
          <button
            onClick={() => setDoneOpen((v) => !v)}
            className="ml-auto flex items-center gap-1 text-xs text-muted hover:text-ink transition"
          >
            {doneOpen ? 'Скрыть выполненные' : `Показать выполненные (${stats.doneToday})`}
            {doneOpen ? <ChevronDown size={12} /> : <ChevronUp size={12} />}
          </button>
        )}
      </div>
    </div>
  );
}

function Metric({
  icon,
  label,
  value,
  tone
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
  tone?: 'urgent' | 'warn';
}): JSX.Element {
  const valueColor =
    tone === 'urgent' ? 'text-red-500' : tone === 'warn' ? 'text-amber-600' : 'text-ink';
  return (
    <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-surface2">
      {icon}
      <span className="text-muted">{label}:</span>
      <span className={`font-semibold timer-font ${valueColor}`}>{value}</span>
    </div>
  );
}

// --- Compact pickers for the "new task" inline form ---
// Replace native <select> (ugly OS chevron, cryptic ·/🟡 icons) with custom
// 32px buttons that pop a small menu. Icons are semantic: priority = flag/arrow
// in priority color, difficulty = signal-bars (1/2/3) in green/amber/red.

function PriorityGlyph({ priority }: { priority: TaskPriority }): JSX.Element {
  const color = PRIORITY_COLOR[priority];
  if (priority === 'urgent') return <Flame size={14} style={{ color }} />;
  if (priority === 'high') return <ArrowUp size={14} style={{ color }} strokeWidth={2.5} />;
  if (priority === 'low') return <ArrowDown size={14} style={{ color }} strokeWidth={2.5} />;
  // normal — neutral muted dash, so the button doesn't look "empty"
  return <Minus size={14} className="text-faint" strokeWidth={2.5} />;
}

const DIFFICULTY_TONE: Record<'easy' | 'medium' | 'hard', { bars: number; cls: string }> = {
  easy:   { bars: 1, cls: 'bg-green-500' },
  medium: { bars: 2, cls: 'bg-amber-500' },
  hard:   { bars: 3, cls: 'bg-red-500' }
};

function DifficultyGlyph({ difficulty }: { difficulty: TaskDifficulty }): JSX.Element {
  const tone = DIFFICULTY_TONE[difficulty];
  return (
    <div className="flex items-end gap-[2px] h-3">
      {[0, 1, 2].map((i) => (
        <div
          key={i}
          className={`w-[3px] rounded-sm ${i < tone.bars ? tone.cls : 'bg-border'}`}
          style={{ height: 4 + i * 3 }}
        />
      ))}
    </div>
  );
}

/**
 * Lightweight click-outside popover used by Priority/Difficulty pickers.
 * Anchored to its trigger button, opens upward (mb-1, bottom-full) because the
 * form lives at the bottom of the column and there isn't room below.
 */
function usePopover(): {
  open: boolean;
  setOpen: (v: boolean) => void;
  ref: React.RefObject<HTMLDivElement>;
} {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent): void => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onEsc = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onEsc);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onEsc);
    };
  }, [open]);
  return { open, setOpen, ref };
}

function PriorityPicker({
  value,
  onChange
}: {
  value: TaskPriority;
  onChange: (v: TaskPriority) => void;
}): JSX.Element {
  const { open, setOpen, ref } = usePopover();
  return (
    <div className="relative shrink-0" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        title={`Приоритет: ${PRIORITY_LABEL[value]}`}
        aria-label={`Приоритет: ${PRIORITY_LABEL[value]}`}
        aria-haspopup="listbox"
        aria-expanded={open}
        className={`w-8 h-8 rounded-md bg-surface border flex items-center justify-center transition hover:border-accent ${
          open ? 'border-accent ring-2 ring-accent/30' : 'border-border'
        }`}
      >
        <PriorityGlyph priority={value} />
      </button>
      {open && (
        <div
          role="listbox"
          className="absolute bottom-full right-0 mb-1.5 z-20 bg-surface rounded-md shadow-lg border border-border py-1 min-w-[150px]"
        >
          <div className="px-2.5 py-1 text-[10px] uppercase tracking-wide text-faint">
            Приоритет
          </div>
          {PRIORITIES.map((p) => (
            <button
              key={p}
              type="button"
              role="option"
              aria-selected={value === p}
              onClick={() => {
                onChange(p);
                setOpen(false);
              }}
              className={`w-full px-2.5 py-1.5 text-xs flex items-center gap-2.5 hover:bg-surface2 transition ${
                value === p ? 'bg-accent-light text-ink font-medium' : ''
              }`}
            >
              <PriorityGlyph priority={p} />
              <span className="flex-1 text-left">{PRIORITY_LABEL[p]}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function DifficultyPicker({
  value,
  onChange
}: {
  value: TaskDifficulty;
  onChange: (v: TaskDifficulty) => void;
}): JSX.Element {
  const { open, setOpen, ref } = usePopover();
  return (
    <div className="relative shrink-0" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        title={`Сложность: ${DIFFICULTY_LABEL[value]}`}
        aria-label={`Сложность: ${DIFFICULTY_LABEL[value]}`}
        aria-haspopup="listbox"
        aria-expanded={open}
        className={`w-8 h-8 rounded-md bg-surface border flex items-center justify-center transition hover:border-accent ${
          open ? 'border-accent ring-2 ring-accent/30' : 'border-border'
        }`}
      >
        <DifficultyGlyph difficulty={value} />
      </button>
      {open && (
        <div
          role="listbox"
          className="absolute bottom-full right-0 mb-1.5 z-20 bg-surface rounded-md shadow-lg border border-border py-1 min-w-[140px]"
        >
          <div className="px-2.5 py-1 text-[10px] uppercase tracking-wide text-faint">
            Сложность
          </div>
          {DIFFICULTIES.map((d) => (
            <button
              key={d}
              type="button"
              role="option"
              aria-selected={value === d}
              onClick={() => {
                onChange(d);
                setOpen(false);
              }}
              className={`w-full px-2.5 py-1.5 text-xs flex items-center gap-2.5 hover:bg-surface2 transition ${
                value === d ? 'bg-accent-light text-ink font-medium' : ''
              }`}
            >
              <DifficultyGlyph difficulty={d} />
              <span className="flex-1 text-left">{DIFFICULTY_LABEL[d]}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function formatShortDate(d: string): string {
  const today = localDateKey();
  if (d === today) return 'Сегодня';
  const dt = new Date(d + 'T00:00:00');
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  if (d === localDateKey(tomorrow)) return 'Завтра';
  return dt.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' });
}

// Relative due-date label + colored tone.
// overdue → red, today → amber, tomorrow → accent, дальше → нейтральный.
function formatRelativeDue(
  dateStr: string,
  timeStr: string | null | undefined,
  done: boolean
): { label: string; toneClass: string } {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const target = new Date(dateStr + 'T00:00:00');
  const diffDays = Math.round((target.getTime() - today.getTime()) / 86_400_000);
  const time = timeStr ? timeStr.slice(0, 5) : null;

  let label: string;
  let toneClass: string;

  if (diffDays < 0) {
    const abs = Math.abs(diffDays);
    label =
      abs === 1
        ? 'вчера'
        : abs < 7
          ? `${abs} дн. назад`
          : target.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' });
    toneClass = done ? 'text-muted' : 'text-red-500';
  } else if (diffDays === 0) {
    label = time ? `сегодня в ${time}` : 'сегодня';
    toneClass = done ? 'text-muted' : 'text-amber-500';
  } else if (diffDays === 1) {
    label = time ? `завтра в ${time}` : 'завтра';
    toneClass = 'text-accent';
  } else if (diffDays < 7) {
    label = time ? `через ${diffDays} дн. в ${time}` : `через ${diffDays} дн.`;
    toneClass = 'text-muted';
  } else {
    const datePart = target.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' });
    label = time ? `${datePart} в ${time}` : datePart;
    toneClass = 'text-muted';
  }

  return { label, toneClass };
}
