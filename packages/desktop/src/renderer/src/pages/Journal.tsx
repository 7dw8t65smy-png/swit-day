import { useEffect, useMemo, useState } from 'react';
import { Trash2, Plus } from 'lucide-react';
import { api } from '../api';
import type { DayTotals, JournalEntry } from '@swit/shared';
import { fmtHM, fmtClock } from '../lib/format';
import { localDateKey } from '../lib/date';

const MOOD_EMOJI = ['', '😞', '😕', '😐', '🙂', '😄'];
const MOODS = [1, 2, 3, 4, 5] as const;

/**
 * Журнал. За одну дату может быть несколько записей (на каждое
 * «Завершить день» создаётся отдельная запись), поэтому в списке слева
 * отображаем все записи по отдельности с временем, а выбор/редактирование
 * идёт по id.
 */
export default function Journal() {
  const [entries, setEntries] = useState<JournalEntry[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedTotals, setSelectedTotals] = useState<DayTotals | null>(null);
  const [search, setSearch] = useState('');
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<Partial<JournalEntry>>({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    void reload();
  }, []);

  async function reload(): Promise<void> {
    const es = await api.listJournal();
    setEntries(es);
    if (!selectedId && es.length > 0) {
      setSelectedId(es[0].id);
    }
  }

  const selected = useMemo(
    () => entries.find((e) => e.id === selectedId) ?? null,
    [entries, selectedId]
  );

  useEffect(() => {
    if (!selected) {
      setSelectedTotals(null);
      return;
    }
    api.dayTotals(selected.date).then(setSelectedTotals);
  }, [selected?.date]);

  const filtered = useMemo(() => {
    if (!search.trim()) return entries;
    const q = search.toLowerCase();
    return entries.filter(
      (e) =>
        e.date.includes(q) ||
        (e.what_done ?? '').toLowerCase().includes(q) ||
        (e.reflection ?? '').toLowerCase().includes(q)
    );
  }, [entries, search]);

  // Сколько записей за тот же день (для подписи «сессия N из M»)
  const sessionInfo = useMemo(() => {
    const byDate = new Map<string, JournalEntry[]>();
    for (const e of entries) {
      const arr = byDate.get(e.date) ?? [];
      arr.push(e);
      byDate.set(e.date, arr);
    }
    // Внутри даты — сортировка возр. created_at, чтобы первая запись = «1»
    const info = new Map<string, { idx: number; total: number }>();
    for (const [, list] of byDate) {
      const sorted = [...list].sort((a, b) => a.created_at.localeCompare(b.created_at));
      sorted.forEach((e, i) => {
        info.set(e.id, { idx: i + 1, total: sorted.length });
      });
    }
    return info;
  }, [entries]);

  function startEditing(): void {
    setDraft({
      mood: selected?.mood ?? null,
      what_done: selected?.what_done ?? '',
      reflection: selected?.reflection ?? ''
    });
    setEditing(true);
  }

  async function saveEdit(): Promise<void> {
    if (!selected) return;
    setSaving(true);
    try {
      const saved = await api.updateJournal(selected.id, {
        mood: draft.mood ?? null,
        what_done: draft.what_done ?? '',
        reflection: draft.reflection ?? ''
      });
      setEntries((cur) => cur.map((e) => (e.id === saved.id ? saved : e)));
      setEditing(false);
    } finally {
      setSaving(false);
    }
  }

  async function newEntry(): Promise<void> {
    const created = await api.createJournal({
      date: localDateKey(),
      mood: null,
      what_done: '',
      reflection: '',
      total_work_s: 0,
      total_pause_s: 0,
      tasks_done: 0
    });
    setEntries((cur) => [created, ...cur]);
    setSelectedId(created.id);
    setDraft({ mood: null, what_done: '', reflection: '' });
    setEditing(true);
  }

  async function deleteEntry(id: string): Promise<void> {
    if (!confirm('Удалить эту запись из журнала?')) return;
    await api.deleteJournal(id);
    setEntries((cur) => cur.filter((e) => e.id !== id));
    if (selectedId === id) setSelectedId(null);
  }

  return (
    <div className="p-6 grid grid-cols-[320px_1fr] gap-6 max-w-[1300px]">
      <aside className="space-y-2">
        <div className="flex items-center justify-between mb-2">
          <h1 className="text-xl font-semibold">Журнал</h1>
          <button
            onClick={newEntry}
            className="text-xs px-2.5 py-1.5 rounded-md bg-accent text-white hover:bg-accent-hover flex items-center gap-1"
          >
            <Plus size={13} /> Новая
          </button>
        </div>
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Поиск..."
          className="w-full h-9 px-3 rounded-md border border-border bg-surface text-sm mb-2"
        />
        {filtered.map((e) => {
          const info = sessionInfo.get(e.id);
          return (
            <button
              key={e.id}
              onClick={() => {
                setSelectedId(e.id);
                setEditing(false);
              }}
              className={`w-full text-left rounded-md p-3 border transition ${
                selectedId === e.id
                  ? 'border-accent bg-accent-light'
                  : 'border-border bg-surface hover:bg-surface2'
              }`}
            >
              <div className="flex items-baseline justify-between gap-2">
                <div className="font-medium text-sm">{formatDate(e.date)}</div>
                <div className="text-lg shrink-0">{e.mood ? MOOD_EMOJI[e.mood] : ''}</div>
              </div>
              <div className="text-[11px] text-muted mt-0.5 flex gap-2 items-center flex-wrap">
                <span className="timer-font">{fmtClock(e.created_at)}</span>
                {info && info.total > 1 && (
                  <span className="px-1.5 rounded bg-surface2 text-faint">
                    сессия {info.idx}/{info.total}
                  </span>
                )}
                <span>{fmtHM(e.total_work_s ?? 0)}</span>
                <span>· {e.tasks_done ?? 0} задач</span>
              </div>
              {e.what_done && (
                <div className="text-xs text-faint mt-1 line-clamp-2">{e.what_done}</div>
              )}
            </button>
          );
        })}
        {filtered.length === 0 && <div className="text-sm text-muted">Записей пока нет</div>}
      </aside>

      <main>
        {selected ? (
          <Detail
            entry={selected}
            totals={selectedTotals}
            session={sessionInfo.get(selected.id) ?? null}
            editing={editing}
            draft={draft}
            saving={saving}
            onStartEdit={startEditing}
            onCancel={() => setEditing(false)}
            onChange={(p) => setDraft((d) => ({ ...d, ...p }))}
            onSave={saveEdit}
            onDelete={() => deleteEntry(selected.id)}
          />
        ) : (
          <div className="bg-surface rounded-lg shadow-sm p-10 text-center text-muted text-sm">
            Записей пока нет. Нажмите «Новая», чтобы добавить запись.
          </div>
        )}
      </main>
    </div>
  );
}

function formatDate(iso: string): string {
  const d = new Date(iso + 'T00:00:00');
  const weekday = d.toLocaleDateString('ru-RU', { weekday: 'short' });
  const day = d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' });
  return `${day} · ${weekday}`;
}

function Detail({
  entry,
  totals,
  session,
  editing,
  draft,
  saving,
  onStartEdit,
  onCancel,
  onChange,
  onSave,
  onDelete
}: {
  entry: JournalEntry;
  totals: DayTotals | null;
  session: { idx: number; total: number } | null;
  editing: boolean;
  draft: Partial<JournalEntry>;
  saving: boolean;
  onStartEdit: () => void;
  onCancel: () => void;
  onChange: (p: Partial<JournalEntry>) => void;
  onSave: () => Promise<void>;
  onDelete: () => void;
}): JSX.Element {
  const segments = totals?.segments ?? [];
  const totalDuration = segments.reduce((a, s) => a + s.duration_s, 0) || 1;

  return (
    <div className="space-y-4">
      <div className="bg-surface rounded-lg shadow-sm p-6">
        <div className="flex items-start justify-between">
          <div>
            <div className="text-xs uppercase text-muted">
              День
              {session && session.total > 1 && (
                <span className="ml-2 text-faint normal-case">
                  · сессия {session.idx} из {session.total}
                </span>
              )}
            </div>
            <h2 className="text-2xl font-semibold mt-1">{formatDate(entry.date)}</h2>
            <div className="text-xs text-muted mt-1 timer-font">
              Сохранено в {fmtClock(entry.created_at)}
            </div>
            {entry.mood && <div className="text-3xl mt-2">{MOOD_EMOJI[entry.mood]}</div>}
          </div>
          {!editing && (
            <div className="flex items-center gap-2">
              <button
                onClick={onDelete}
                title="Удалить запись"
                className="p-2 rounded-md text-danger border border-border hover:bg-surface2"
              >
                <Trash2 size={14} />
              </button>
              <button
                onClick={onStartEdit}
                className="px-3 py-1.5 rounded-md text-sm border border-border hover:bg-surface2"
              >
                Редактировать
              </button>
            </div>
          )}
        </div>

        <div className="grid grid-cols-4 gap-3 mt-5 pt-4 border-t border-border">
          <Cell label="Работа" value={fmtHM(entry.total_work_s ?? 0)} accent="work" />
          <Cell label="Паузы/перерывы" value={fmtHM(entry.total_pause_s ?? 0)} accent="pause" />
          <Cell label="Начал в" value={fmtClock(totals?.day_started_at ?? null)} />
          <Cell label="Задач готово" value={String(entry.tasks_done ?? 0)} />
        </div>

        {segments.length > 0 && (
          <div className="mt-4 flex h-2 rounded-full overflow-hidden bg-surface2">
            {segments.map((s, i) => (
              <div
                key={i}
                title={`${labelType(s.type)} · ${fmtHM(s.duration_s)}`}
                style={{
                  width: `${(s.duration_s / totalDuration) * 100}%`,
                  background:
                    s.type === 'work'
                      ? 'var(--color-work)'
                      : s.type === 'break'
                        ? 'var(--color-break)'
                        : 'var(--color-pause)'
                }}
              />
            ))}
          </div>
        )}
      </div>

      <div className="bg-surface rounded-lg shadow-sm p-6">
        {editing ? (
          <>
            <div>
              <label className="text-xs uppercase text-muted">Настроение</label>
              <div className="flex gap-2 mt-2">
                {MOODS.map((m) => (
                  <button
                    key={m}
                    onClick={() => onChange({ mood: m })}
                    className={`flex-1 py-3 rounded-md border text-2xl ${
                      draft.mood === m
                        ? 'border-accent bg-accent-light'
                        : 'border-border hover:bg-surface2'
                    }`}
                  >
                    {MOOD_EMOJI[m]}
                  </button>
                ))}
              </div>
            </div>
            <div className="mt-4">
              <label className="text-xs uppercase text-muted">Что сделано</label>
              <textarea
                value={draft.what_done ?? ''}
                onChange={(e) => onChange({ what_done: e.target.value })}
                rows={4}
                className="w-full mt-1 p-3 rounded-md border border-border bg-surface text-sm focus:outline-none focus:border-accent resize-none"
              />
            </div>
            <div className="mt-4">
              <label className="text-xs uppercase text-muted">Рефлексия</label>
              <textarea
                value={draft.reflection ?? ''}
                onChange={(e) => onChange({ reflection: e.target.value })}
                rows={4}
                className="w-full mt-1 p-3 rounded-md border border-border bg-surface text-sm focus:outline-none focus:border-accent resize-none"
              />
            </div>
            <div className="flex gap-2 mt-4 justify-end">
              <button
                onClick={onCancel}
                disabled={saving}
                className="px-3 py-1.5 rounded-md text-sm border border-border"
              >
                Отмена
              </button>
              <button
                onClick={onSave}
                disabled={saving}
                className="px-4 py-1.5 rounded-md text-sm bg-accent text-white hover:bg-accent-hover disabled:opacity-50"
              >
                {saving ? 'Сохраняем...' : 'Сохранить'}
              </button>
            </div>
          </>
        ) : (
          <>
            <Section title="Что сделано" text={entry.what_done} />
            <Section title="Рефлексия" text={entry.reflection} />
          </>
        )}
      </div>
    </div>
  );
}

function labelType(t: 'work' | 'break' | 'pause'): string {
  return t === 'work' ? 'Работа' : t === 'break' ? 'Перерыв' : 'Пауза';
}

function Section({ title, text }: { title: string; text: string | null | undefined }): JSX.Element {
  return (
    <div className="mt-3 first:mt-0">
      <div className="text-xs uppercase text-muted mb-1">{title}</div>
      {text ? (
        <div className="text-sm whitespace-pre-wrap">{text}</div>
      ) : (
        <div className="text-sm text-faint italic">пусто</div>
      )}
    </div>
  );
}

function Cell({
  label,
  value,
  accent
}: {
  label: string;
  value: string;
  accent?: 'work' | 'pause';
}): JSX.Element {
  const color =
    accent === 'work' ? 'var(--color-work)' : accent === 'pause' ? 'var(--color-pause)' : undefined;
  return (
    <div className="bg-surface2 rounded-md p-3">
      <div className="text-[11px] uppercase text-muted">{label}</div>
      <div
        className="text-base font-semibold timer-font mt-0.5"
        style={color ? { color } : undefined}
      >
        {value}
      </div>
    </div>
  );
}
