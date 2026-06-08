import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { nanoid } from 'nanoid';
import { Plus, Copy, Trash2, Network, Loader2 } from 'lucide-react';
import type { MindMap, MindMapDoc } from '@swit/shared';
import { api } from '../api';
import { pushToast } from '../hooks/useToasts';
import { createBlankDoc, DEFAULT_BRANCH_COLORS } from '../lib/mindmap/doc';

interface Template {
  key: string;
  title: string;
  hint: string;
  build: () => { title: string; doc: MindMapDoc };
}

function withChildren(rootText: string, children: string[]): { title: string; doc: MindMapDoc } {
  const rootId = nanoid();
  const doc = createBlankDoc(rootId, rootText);
  const nodes = [...doc.nodes];
  for (const text of children) nodes.push({ id: nanoid(), parentId: rootId, text });
  return { title: rootText, doc: { ...doc, nodes } };
}

const TEMPLATES: Template[] = [
  {
    key: 'blank',
    title: 'Пустая карта',
    hint: 'Чистый холст с одним узлом',
    build: () => {
      const id = nanoid();
      return { title: 'Новая карта', doc: createBlankDoc(id) };
    }
  },
  {
    key: 'project',
    title: 'План проекта',
    hint: 'Цели · Этапы · Команда · Риски',
    build: () => withChildren('Проект', ['Цели', 'Этапы', 'Команда', 'Риски', 'Сроки'])
  },
  {
    key: 'brainstorm',
    title: 'Брейншторм',
    hint: 'Зачем · Для кого · Фишки · Шаги',
    build: () => withChildren('Идея', ['Зачем', 'Для кого', 'Фишки', 'Каналы', 'Следующие шаги'])
  },
  {
    key: 'week',
    title: 'Недельный обзор',
    hint: 'Итоги · Приоритеты · Привычки',
    build: () => withChildren('Неделя', ['Итоги', 'Приоритеты', 'Привычки', 'Заметки'])
  }
];

function parseDoc(m: MindMap): MindMapDoc | null {
  try {
    return JSON.parse(m.content) as MindMapDoc;
  } catch {
    return null;
  }
}

export default function Maps(): JSX.Element {
  const nav = useNavigate();
  const [maps, setMaps] = useState<MindMap[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);

  async function load(): Promise<void> {
    try {
      setMaps(await api.listMaps());
    } catch {
      pushToast({ kind: 'error', message: 'Не удалось загрузить карты' });
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  async function create(tpl: Template): Promise<void> {
    if (creating) return;
    setCreating(true);
    try {
      const { title, doc } = tpl.build();
      const row = await api.createMap({ title, content: JSON.stringify(doc) });
      nav(`/maps/${row.id}`);
    } catch {
      pushToast({ kind: 'error', message: 'Не удалось создать карту' });
      setCreating(false);
    }
  }

  async function duplicate(id: string): Promise<void> {
    try {
      await api.duplicateMap(id);
      await load();
    } catch {
      pushToast({ kind: 'error', message: 'Не удалось дублировать' });
    }
  }

  async function remove(id: string): Promise<void> {
    if (!confirm('Удалить карту? Действие необратимо.')) return;
    try {
      await api.deleteMap(id);
      setMaps((prev) => prev.filter((m) => m.id !== id));
    } catch {
      pushToast({ kind: 'error', message: 'Не удалось удалить' });
    }
  }

  return (
    <div className="h-full overflow-y-auto px-8 py-7 max-w-[1100px] mx-auto w-full">
      <header className="mb-7">
        <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2.5">
          <Network className="text-accent" size={24} /> Карты
        </h1>
        <p className="text-sm text-muted mt-1">
          Интеллект-карты для идей, планов и структур. Tab — дочерний узел, Enter — соседний.
        </p>
      </header>

      {/* Шаблоны */}
      <section className="mb-9">
        <div className="text-xs uppercase tracking-wide text-muted mb-3">Создать</div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {TEMPLATES.map((tpl, i) => (
            <button
              key={tpl.key}
              onClick={() => create(tpl)}
              disabled={creating}
              className="group relative text-left rounded-xl border border-border bg-surface p-4 hover:border-accent hover:-translate-y-0.5 transition-all overflow-hidden disabled:opacity-60"
              style={{ boxShadow: '0 1px 2px rgba(15,23,42,0.05)' }}
            >
              <span
                className="absolute inset-x-0 top-0 h-1"
                style={{ background: DEFAULT_BRANCH_COLORS[i % DEFAULT_BRANCH_COLORS.length] }}
              />
              <div className="flex items-center gap-2 font-semibold text-sm">
                {tpl.key === 'blank' ? <Plus size={15} /> : <Network size={15} />} {tpl.title}
              </div>
              <div className="text-xs text-muted mt-1.5 leading-snug">{tpl.hint}</div>
            </button>
          ))}
        </div>
      </section>

      {/* Список */}
      <section>
        <div className="text-xs uppercase tracking-wide text-muted mb-3">
          Мои карты {maps.length > 0 && <span className="text-faint">· {maps.length}</span>}
        </div>

        {loading ? (
          <div className="grid place-items-center py-16 text-muted">
            <Loader2 className="animate-spin" />
          </div>
        ) : maps.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border py-14 text-center text-muted">
            Пока нет карт. Выберите шаблон выше, чтобы начать.
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {maps.map((m) => (
              <MapCard
                key={m.id}
                map={m}
                doc={parseDoc(m)}
                onOpen={() => nav(`/maps/${m.id}`)}
                onDuplicate={() => duplicate(m.id)}
                onDelete={() => remove(m.id)}
              />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function MapCard({
  map,
  doc,
  onOpen,
  onDuplicate,
  onDelete
}: {
  map: MindMap;
  doc: MindMapDoc | null;
  onOpen: () => void;
  onDelete: () => void;
  onDuplicate: () => void;
}): JSX.Element {
  const nodeCount = doc?.nodes.length ?? 0;
  const branchColors = (doc?.nodes ?? [])
    .filter((n) => n.parentId === doc?.rootId)
    .slice(0, 6)
    .map((_, i) => DEFAULT_BRANCH_COLORS[i % DEFAULT_BRANCH_COLORS.length]);

  return (
    <div
      onClick={onOpen}
      className="group relative rounded-xl border border-border bg-surface overflow-hidden cursor-pointer hover:border-accent hover:-translate-y-0.5 transition-all"
      style={{ boxShadow: '0 1px 2px rgba(15,23,42,0.05)' }}
    >
      {/* Мини-превью: «созвездие» цветов веток */}
      <div className="relative h-24 bg-surface2 overflow-hidden">
        <div className="absolute left-4 top-1/2 -translate-y-1/2 w-3 h-3 rounded-full bg-ink/70" />
        {branchColors.map((c, i) => (
          <span
            key={i}
            className="absolute w-2.5 h-2.5 rounded-full"
            style={{
              background: c,
              left: `${30 + i * 11}%`,
              top: `${28 + ((i * 37) % 50)}%`,
              boxShadow: `0 0 0 4px ${c}22`
            }}
          />
        ))}
      </div>

      <div className="p-3.5">
        <div className="font-semibold text-sm truncate">{map.title || 'Без названия'}</div>
        <div className="text-xs text-muted mt-1 flex items-center gap-2">
          <span>{nodeCount} узлов</span>
          <span className="text-faint">·</span>
          <span>{new Date(map.updated_at).toLocaleDateString('ru-RU')}</span>
        </div>
      </div>

      <div className="absolute top-2 right-2 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
        <button
          onClick={(e) => {
            e.stopPropagation();
            onDuplicate();
          }}
          className="p-1.5 rounded-md bg-surface/90 border border-border text-muted hover:text-ink"
          title="Дублировать"
        >
          <Copy size={13} />
        </button>
        <button
          onClick={(e) => {
            e.stopPropagation();
            onDelete();
          }}
          className="p-1.5 rounded-md bg-surface/90 border border-border text-muted hover:text-danger"
          title="Удалить"
        >
          <Trash2 size={13} />
        </button>
      </div>
    </div>
  );
}
