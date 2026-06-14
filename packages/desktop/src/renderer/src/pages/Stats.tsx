import { useEffect, useMemo, useState } from 'react';
import { useRealtimeRefetch } from '../hooks/useRealtimeRefetch';
import {
  Bar,
  BarChart,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  Legend
} from 'recharts';
import { format, parseISO, subDays } from 'date-fns';
import { ru } from 'date-fns/locale';
import { api } from '../api';
import type { JournalEntry, Project, Task, TaskTimeLog } from '@swit/shared';
import { fmtHM } from '../lib/format';
import {
  aggregateJournalByDate,
  aggregatedJournalArray,
  type DayJournalSummary
} from '../lib/journalAgg';

type Period = 'week' | 'month' | 'quarter' | 'all';

export default function Stats() {
  const [period, setPeriod] = useState<Period>('week');
  const [journal, setJournal] = useState<JournalEntry[]>([]);
  const [logs, setLogs] = useState<TaskTimeLog[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);

  useEffect(() => {
    void load();
  }, []);
  useRealtimeRefetch(() => void load());

  async function load() {
    const [j, l, ts, ps] = await Promise.all([
      api.listJournal(),
      api.timeLogs({}),
      api.listTasks(),
      api.listProjects()
    ]);
    setJournal(j);
    setLogs(l);
    setTasks(ts);
    setProjects(ps);
  }

  const from = useMemo(() => {
    const d = new Date();
    if (period === 'week') return subDays(d, 6);
    if (period === 'month') return subDays(d, 29);
    if (period === 'quarter') return subDays(d, 89);
    return new Date(2000, 0, 1);
  }, [period]);

  // На одну дату теперь может приходиться несколько записей в журнале;
  // сводим их в одну виртуальную «дневную сводку» для статистики.
  const journalByDate = useMemo(() => aggregateJournalByDate(journal), [journal]);
  const aggregatedJournal = useMemo(() => aggregatedJournalArray(journal), [journal]);
  const periodJournal = useMemo(
    () => aggregatedJournal.filter((j) => parseISO(j.date) >= from),
    [aggregatedJournal, from]
  );
  const periodLogs = useMemo(
    () => logs.filter((l) => parseISO(l.date) >= from && l.ended_at),
    [logs, from]
  );

  // Per-day work for bar chart
  const days = useMemo(() => {
    const count = period === 'week' ? 7 : period === 'month' ? 30 : period === 'quarter' ? 90 : 30;
    return Array.from({ length: count }, (_, i) => {
      const d = subDays(new Date(), count - 1 - i);
      const date = format(d, 'yyyy-MM-dd');
      const entry = journalByDate.get(date);
      return {
        date,
        label: format(d, period === 'week' ? 'EEEEEE' : 'd MMM', { locale: ru }),
        work: Math.round(((entry?.total_work_s ?? 0) / 3600) * 10) / 10,
        tasks: entry?.tasks_done ?? 0
      };
    });
  }, [journalByDate, period]);

  // By project
  const taskById = useMemo(() => new Map(tasks.map((t) => [t.id, t] as const)), [tasks]);
  const projectById = useMemo(() => new Map(projects.map((p) => [p.id, p] as const)), [projects]);

  const byProject = useMemo(() => {
    const totals = new Map<string | null, number>();
    for (const l of periodLogs) {
      const t = taskById.get(l.task_id);
      const pid = t?.project_id ?? null;
      totals.set(pid, (totals.get(pid) ?? 0) + (l.duration_s ?? 0));
    }
    return [...totals.entries()]
      .map(([pid, s]) => ({
        name: pid ? (projectById.get(pid)?.name ?? 'Удалён') : 'Без проекта',
        seconds: s,
        hours: Math.round((s / 3600) * 10) / 10,
        color: pid ? (projectById.get(pid)?.color ?? '#999') : '#6B7280'
      }))
      .filter((x) => x.seconds > 0)
      .sort((a, b) => b.seconds - a.seconds);
  }, [periodLogs, taskById, projectById]);

  // Metrics
  const totalWork = periodJournal.reduce((a, j) => a + (j.total_work_s ?? 0), 0);
  const totalPause = periodJournal.reduce((a, j) => a + (j.total_pause_s ?? 0), 0);
  const totalTasks = periodJournal.reduce((a, j) => a + (j.tasks_done ?? 0), 0);
  const avgWork = periodJournal.length > 0 ? totalWork / periodJournal.length : 0;
  const bestDay = periodJournal.reduce<DayJournalSummary | null>(
    (best, j) => (!best || (j.total_work_s ?? 0) > (best.total_work_s ?? 0) ? j : best),
    null
  );

  // Streak: consecutive days ending today with journal entries
  const streak = useMemo(() => {
    let s = 0;
    let d = new Date();
    while (true) {
      const date = format(d, 'yyyy-MM-dd');
      const entry = journalByDate.get(date);
      if (!entry || entry.total_work_s <= 0) break;
      s++;
      d = subDays(d, 1);
    }
    return s;
  }, [journalByDate]);

  // Heatmap data: last 90 days (12 weeks)
  const heatmapDays = useMemo(() => {
    const arr: { date: string; work_s: number }[] = [];
    for (let i = 89; i >= 0; i--) {
      const d = subDays(new Date(), i);
      const date = format(d, 'yyyy-MM-dd');
      const entry = journalByDate.get(date);
      arr.push({ date, work_s: entry?.total_work_s ?? 0 });
    }
    return arr;
  }, [journalByDate]);
  const heatmapMax = Math.max(...heatmapDays.map((d) => d.work_s), 1);

  return (
    <div className="p-6 max-w-[1200px] space-y-4">
      <div className="flex items-center gap-2 mb-2">
        <h1 className="text-2xl font-semibold mr-4">Статистика</h1>
        <div className="flex gap-1 bg-surface2 rounded-md p-1">
          {(['week', 'month', 'quarter', 'all'] as Period[]).map((p) => (
            <button
              key={p}
              onClick={() => setPeriod(p)}
              className={`px-3 py-1 rounded text-sm ${
                period === p ? 'bg-surface shadow-sm' : 'text-muted'
              }`}
            >
              {p === 'week'
                ? 'Неделя'
                : p === 'month'
                  ? 'Месяц'
                  : p === 'quarter'
                    ? 'Квартал'
                    : 'Всё'}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-4 gap-3">
        <StatCard label="Всего работы" value={fmtHM(totalWork)} accent="work" />
        <StatCard label="В среднем за день" value={fmtHM(avgWork)} />
        <StatCard label="Задач завершено" value={String(totalTasks)} />
        <StatCard
          label="Streak"
          value={`${streak} ${streak === 1 ? 'день' : 'дней'}`}
          accent="work"
        />
      </div>

      <section className="bg-surface rounded-lg shadow-sm p-4">
        <div className="text-sm font-medium mb-3">Фокус по дням, часов</div>
        <div className="h-64">
          <ResponsiveContainer>
            <BarChart data={days}>
              <XAxis dataKey="label" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} />
              <Tooltip formatter={(v: number) => [`${v} ч`, 'Работа']} labelFormatter={(l) => l} />
              <Bar dataKey="work" fill="var(--color-work)" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </section>

      <div className="grid grid-cols-2 gap-4">
        <section className="bg-surface rounded-lg shadow-sm p-4">
          <div className="text-sm font-medium mb-3">По проектам</div>
          {byProject.length === 0 ? (
            <div className="text-sm text-muted py-10 text-center">
              Нет данных. Запусти таймер на задачи, чтобы появились часы по проектам.
            </div>
          ) : (
            <div className="h-64">
              <ResponsiveContainer>
                <PieChart>
                  <Pie
                    data={byProject}
                    dataKey="seconds"
                    nameKey="name"
                    innerRadius={50}
                    outerRadius={90}
                  >
                    {byProject.map((entry) => (
                      <Cell key={entry.name} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(v: number) => [fmtHM(v), 'Время']} />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                </PieChart>
              </ResponsiveContainer>
            </div>
          )}
        </section>

        <section className="bg-surface rounded-lg shadow-sm p-4">
          <div className="text-sm font-medium mb-3">Лучший день</div>
          {bestDay ? (
            <div className="text-center py-4">
              <div className="text-3xl font-bold timer-font" style={{ color: 'var(--color-work)' }}>
                {fmtHM(bestDay.total_work_s ?? 0)}
              </div>
              <div className="text-sm text-muted mt-1">
                {format(parseISO(bestDay.date), 'd LLLL yyyy', { locale: ru })}
              </div>
              {bestDay.tasks_done ? (
                <div className="text-xs text-muted mt-1">{bestDay.tasks_done} задач</div>
              ) : null}
            </div>
          ) : (
            <div className="text-sm text-muted py-10 text-center">Нет данных</div>
          )}

          <div className="mt-4">
            <div className="text-sm font-medium mb-2">Соотношение</div>
            <Ratio work={totalWork} pause={totalPause} />
          </div>
        </section>
      </div>

      <section className="bg-surface rounded-lg shadow-sm p-4">
        <div className="text-sm font-medium mb-3">Активность за 90 дней</div>
        <Heatmap days={heatmapDays} max={heatmapMax} />
      </section>

      <section className="bg-surface rounded-lg shadow-sm p-4">
        <div className="text-sm font-medium mb-3">Детали по дням</div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-xs uppercase text-muted text-left">
                <th className="py-2 pr-2">Дата</th>
                <th className="py-2 pr-2">Работа</th>
                <th className="py-2 pr-2">Паузы</th>
                <th className="py-2 pr-2">Задач</th>
                <th className="py-2">Настроение</th>
              </tr>
            </thead>
            <tbody>
              {periodJournal.map((j) => (
                <tr key={j.id} className="border-t border-border">
                  <td className="py-2 pr-2">{format(parseISO(j.date), 'd LLL', { locale: ru })}</td>
                  <td className="py-2 pr-2 timer-font">{fmtHM(j.total_work_s ?? 0)}</td>
                  <td className="py-2 pr-2 timer-font text-muted">{fmtHM(j.total_pause_s ?? 0)}</td>
                  <td className="py-2 pr-2">{j.tasks_done ?? 0}</td>
                  <td className="py-2">
                    {j.mood ? ['', '😞', '😕', '😐', '🙂', '😄'][j.mood] : ''}
                  </td>
                </tr>
              ))}
              {periodJournal.length === 0 && (
                <tr>
                  <td colSpan={5} className="py-6 text-center text-muted">
                    Нет записей за период
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

function StatCard({ label, value, accent }: { label: string; value: string; accent?: 'work' }) {
  return (
    <div className="bg-surface rounded-lg shadow-sm p-4">
      <div className="text-xs uppercase text-muted">{label}</div>
      <div
        className="text-2xl font-bold timer-font mt-1"
        style={{ color: accent === 'work' ? 'var(--color-work)' : undefined }}
      >
        {value}
      </div>
    </div>
  );
}

function Ratio({ work, pause }: { work: number; pause: number }) {
  const total = work + pause || 1;
  return (
    <>
      <div className="flex h-3 rounded-full overflow-hidden bg-surface2">
        <div style={{ width: `${(work / total) * 100}%`, background: 'var(--color-work)' }} />
        <div style={{ width: `${(pause / total) * 100}%`, background: 'var(--color-pause)' }} />
      </div>
      <div className="flex justify-between text-xs text-muted mt-1">
        <span>
          Работа: {fmtHM(work)} ({Math.round((work / total) * 100)}%)
        </span>
        <span>Паузы: {fmtHM(pause)}</span>
      </div>
    </>
  );
}

function Heatmap({ days, max }: { days: { date: string; work_s: number }[]; max: number }) {
  // Group into weeks (columns). Each column is 7 days top-to-bottom.
  // Align to Monday-start.
  const first = parseISO(days[0].date);
  const offset = (first.getDay() + 6) % 7; // 0 = Mon
  const cells: ({ date: string; work_s: number } | null)[] = [];
  for (let i = 0; i < offset; i++) cells.push(null);
  cells.push(...days);

  const weeks: (typeof cells)[] = [];
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));

  return (
    <div className="flex gap-1 overflow-x-auto">
      {weeks.map((w, wi) => (
        <div key={wi} className="flex flex-col gap-1">
          {w.map((d, di) => {
            if (!d) return <div key={di} className="w-3 h-3" />;
            const intensity = d.work_s / max;
            const bg =
              d.work_s === 0
                ? 'var(--color-surface-2)'
                : `color-mix(in srgb, var(--color-work) ${Math.max(15, intensity * 100)}%, transparent)`;
            return (
              <div
                key={di}
                title={`${d.date}: ${fmtHM(d.work_s)}`}
                className="w-3 h-3 rounded-sm"
                style={{ background: bg }}
              />
            );
          })}
        </div>
      ))}
    </div>
  );
}
