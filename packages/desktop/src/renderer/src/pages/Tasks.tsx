import { useEffect, useMemo, useState } from 'react';
import { Search } from 'lucide-react';
import { api } from '../api';
import type { Project, Task } from '@swit/shared';
import TaskDrawer from '../components/TaskDrawer';
import ProjectFormModal from '../components/ProjectFormModal';
import { useSettings } from '../lib/settings';
import { localDateKey } from '../lib/date';
import type { ViewMode, Filter } from './tasks/types';
import { BoardView } from './tasks/BoardView';
import { ListView } from './tasks/ListView';
import { TasksInsights } from './tasks/TasksInsights';
import { TasksFooter } from './tasks/TasksFooter';

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
