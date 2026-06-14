import { useEffect, useMemo, useState } from 'react';
import { Trash2, Plus } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { format } from 'date-fns';
import { ru } from 'date-fns/locale';
import { api, notify } from '../api';
import type { Note, Project, Task } from '@swit/shared';
import { sortByPriority } from '../lib/priority';
import { localDateKey } from '../lib/date';
import ProjectBadge from '../components/ProjectBadge';
import PriorityBadge from '../components/PriorityBadge';
import { AssigneeBadge } from '../components/AssigneeBadge';
import DifficultyBadge from '../components/DifficultyBadge';
import { useRealtimeRefetch } from '../hooks/useRealtimeRefetch';
import TaskDrawer from '../components/TaskDrawer';
import DailyIntention from '../components/DailyIntention';
import TodayEvents from '../components/TodayEvents';
import PinnedNotes from '../components/PinnedNotes';
import TaskSuggestions from '../components/TaskSuggestions';
import HabitChecklist from '../components/HabitChecklist';
import { useSettings } from '../lib/settings';
import { confirmDelete } from '../lib/confirm';

export default function Today() {
  const defaultPriority = useSettings((s) => s.settings.default_priority);
  const defaultDifficulty = useSettings((s) => s.settings.default_difficulty);
  const nav = useNavigate();

  const [tasks, setTasks] = useState<Task[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [notes, setNotes] = useState<Note[]>([]);
  const [defaultProjectId, setDefaultProjectId] = useState<string | null>(null);
  const [newTask, setNewTask] = useState('');
  const [newNote, setNewNote] = useState('');
  const [scratch, setScratch] = useState('');
  const [drawerTaskId, setDrawerTaskId] = useState<string | null>(null);

  const today = localDateKey();
  const scratchKey = `swit:scratch:${today}`;

  const projectById = useMemo(() => new Map(projects.map((p) => [p.id, p] as const)), [projects]);
  const drawerTask = useMemo(
    () => (drawerTaskId ? (tasks.find((t) => t.id === drawerTaskId) ?? null) : null),
    [drawerTaskId, tasks]
  );

  useEffect(() => {
    void load();
    setScratch(localStorage.getItem(scratchKey) ?? '');
    // Подчищаем блокноты прошлых дней, чтобы они не копились в localStorage.
    for (let i = localStorage.length - 1; i >= 0; i--) {
      const key = localStorage.key(i);
      if (key && key.startsWith('swit:scratch:') && key !== scratchKey) {
        localStorage.removeItem(key);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useRealtimeRefetch(() => void load());

  async function load() {
    const [ts, ns, ps, settings] = await Promise.all([
      api.listTasks(),
      api.listNotes({ type: 'quick' }),
      api.listProjects(),
      api.getSettings()
    ]);
    setTasks(ts);
    setNotes(ns.slice(0, 5));
    setProjects(ps.filter((p) => !p.archived));
    setDefaultProjectId(settings.default_project_id || null);
  }

  function saveScratch(v: string) {
    setScratch(v);
    if (v.trim()) localStorage.setItem(scratchKey, v);
    else localStorage.removeItem(scratchKey);
  }

  const tasksDoneToday = useMemo(
    () => tasks.filter((t) => t.status === 'done' && t.completed_at?.startsWith(today)).length,
    [tasks, today]
  );

  async function addTask() {
    const title = newTask.trim();
    if (!title) return;
    try {
      const created = await api.createTask({
        title,
        project_id: defaultProjectId,
        priority: defaultPriority,
        difficulty: defaultDifficulty,
        // Привязываем к сегодня, чтобы задача осталась в списке «на сегодня»,
        // а не исчезала через минуту после добавления.
        due_date: today
      });
      setTasks((cur) => [created, ...cur]);
      setNewTask('');
    } catch (err) {
      console.error('createTask failed', err);
      notify('SWIT Day', 'Не удалось создать задачу — проверь, что сервер запущен');
    }
  }

  async function addNote() {
    if (!newNote.trim()) return;
    const created = await api.createNote({ content: newNote, type: 'quick' });
    setNotes((cur) => [created, ...cur].slice(0, 5));
    setNewNote('');
  }

  // «Сегодня» = задачи на сегодня ИЛИ просроченные (только верхний уровень).
  const sortedTasks = useMemo(() => {
    const candidates = tasks.filter(
      (t) =>
        !t.parent_task_id &&
        (t.due_date === today || (t.due_date && t.due_date < today && t.status !== 'done'))
    );
    return sortByPriority(candidates);
  }, [tasks, today]);

  const excludeFromSuggestions = useMemo(
    () => new Set(sortedTasks.map((t) => t.id)),
    [sortedTasks]
  );
  const greeting = useMemo(() => {
    const h = new Date().getHours();
    if (h < 6) return 'Доброй ночи';
    if (h < 12) return 'Доброе утро';
    if (h < 18) return 'Добрый день';
    return 'Добрый вечер';
  }, []);

  return (
    <div className="p-6 grid grid-cols-[1fr_360px] gap-5 max-w-[1400px]">
      <div className="space-y-4 min-w-0">
        <header className="flex items-baseline justify-between">
          <div>
            <h1 className="text-2xl font-semibold">{greeting}</h1>
            <div className="text-sm text-muted capitalize">
              {format(new Date(), 'EEEE, d LLLL', { locale: ru })}
            </div>
          </div>
          {tasksDoneToday > 0 && (
            <div className="text-sm text-muted">
              ✓ <span className="text-ink font-medium">{tasksDoneToday}</span> задач сегодня
            </div>
          )}
        </header>

        <DailyIntention date={today} />

        <TaskSuggestions
          tasks={tasks}
          projects={projectById}
          today={today}
          excludeIds={excludeFromSuggestions}
          onChanged={load}
          onOpenTask={setDrawerTaskId}
        />

        <section className="bg-surface rounded-lg shadow-sm p-5">
          <div className="flex items-center justify-between mb-3">
            <div className="text-sm font-medium">
              Задачи на сегодня · {sortedTasks.filter((x) => x.status !== 'done').length} активно
            </div>
            <button onClick={() => nav('/tasks')} className="text-xs text-muted hover:text-accent">
              Все задачи →
            </button>
          </div>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void addTask();
            }}
            className="flex gap-2 mb-3"
          >
            <input
              value={newTask}
              onChange={(e) => setNewTask(e.target.value)}
              placeholder="+ Добавить задачу..."
              autoComplete="off"
              className="flex-1 h-10 px-3 rounded-md border border-border bg-surface text-sm focus:outline-none focus:border-accent"
            />
            <button
              type="submit"
              disabled={!newTask.trim()}
              className="bg-accent text-white px-4 h-10 rounded-md text-sm hover:bg-accent-hover disabled:opacity-40 flex items-center gap-1.5"
            >
              <Plus size={14} /> Добавить
            </button>
          </form>
          <ul className="space-y-0.5">
            {sortedTasks.map((task) => (
              <li
                key={task.id}
                onClick={() => setDrawerTaskId(task.id)}
                className="flex items-center gap-3 px-2 py-2 hover:bg-surface2 rounded-md text-sm group cursor-pointer"
              >
                <input
                  type="checkbox"
                  checked={task.status === 'done'}
                  onClick={(e) => e.stopPropagation()}
                  onChange={async () => {
                    const upd = await api.updateTask(task.id, {
                      status: task.status === 'done' ? 'pending' : 'done'
                    });
                    setTasks((cur) => cur.map((x) => (x.id === task.id ? upd : x)));
                  }}
                />
                <span
                  className={task.status === 'done' ? 'line-through text-muted flex-1' : 'flex-1'}
                >
                  {task.title}
                </span>
                {task.project_id && (
                  <ProjectBadge project={projectById.get(task.project_id) ?? null} />
                )}
                <DifficultyBadge difficulty={task.difficulty ?? 'medium'} />
                <PriorityBadge priority={task.priority} />
                <AssigneeBadge assigneeId={task.assignee_id} compact />
                <button
                  onClick={async (e) => {
                    e.stopPropagation();
                    if (!confirmDelete(`Удалить задачу «${task.title}»?`)) return;
                    await api.deleteTask(task.id);
                    setTasks((cur) => cur.filter((x) => x.id !== task.id));
                  }}
                  className="text-faint hover:text-danger opacity-0 group-hover:opacity-100"
                >
                  <Trash2 size={14} />
                </button>
              </li>
            ))}
            {sortedTasks.length === 0 && (
              <li className="text-sm text-muted px-2 py-3 text-center">
                Пока нет задач на сегодня. Начни сверху ↑
              </li>
            )}
          </ul>
        </section>
      </div>

      <div className="space-y-4 min-w-0">
        <HabitChecklist variant="today" />

        <TodayEvents date={today} />

        <section className="bg-surface rounded-lg shadow-sm p-5">
          <div className="text-sm font-medium mb-3">Быстрая заметка</div>
          <div className="flex gap-2 mb-3">
            <input
              value={newNote}
              onChange={(e) => setNewNote(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && addNote()}
              placeholder="Записать мысль..."
              className="flex-1 h-10 px-3 rounded-md border border-border bg-surface text-sm focus:outline-none focus:border-accent"
            />
            <button
              onClick={addNote}
              disabled={!newNote.trim()}
              className="bg-accent text-white w-10 h-10 rounded-md hover:bg-accent-hover disabled:opacity-40 flex items-center justify-center"
            >
              →
            </button>
          </div>
          <ul className="space-y-2">
            {notes.map((n) => (
              <li
                key={n.id}
                onClick={() => nav('/notes')}
                className="text-sm text-ink bg-surface2 rounded-md px-3 py-2 cursor-pointer hover:bg-surface line-clamp-3 whitespace-pre-wrap"
              >
                {n.content}
              </li>
            ))}
            {notes.length === 0 && <li className="text-sm text-muted">Пусто</li>}
          </ul>
        </section>

        <PinnedNotes />

        <section className="bg-surface rounded-lg shadow-sm p-5">
          <div className="flex items-center justify-between mb-2">
            <div className="text-sm font-medium">Блокнот</div>
            <span className="text-[10px] text-faint">авто-сохранение</span>
          </div>
          <textarea
            value={scratch}
            onChange={(e) => saveScratch(e.target.value)}
            placeholder="Сюда можно вписывать мелкие задачи, идеи, ссылки, всё что в голове крутится…"
            className="w-full h-40 p-3 rounded-md border border-border bg-surface text-sm focus:outline-none focus:border-accent resize-none placeholder:text-faint"
          />
        </section>
      </div>

      <TaskDrawer
        task={drawerTask}
        projects={projects}
        onClose={() => setDrawerTaskId(null)}
        onOpenTask={setDrawerTaskId}
        onChanged={async () => {
          setTasks(await api.listTasks());
        }}
      />
    </div>
  );
}
