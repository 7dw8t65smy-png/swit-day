import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { nanoid } from 'nanoid';
import { Plus, Copy, Trash2, Network, LayoutDashboard, Layers, Loader2 } from 'lucide-react';
import type { Board, BoardDoc, Canvas, CanvasDoc, MindMap, MindMapDoc } from '@swit/shared';
import { api } from '../api';
import { pushToast } from '../hooks/useToasts';
import { normalizeMindMapDoc } from '../lib/mindmap/doc';
import { getTheme } from '../lib/mindmap/themes';
import { toSvg } from '../lib/mindmap/exporters';
import { normalizeBoardDoc } from '../lib/board/doc';
import { blankCanvasContent } from '../lib/canvas/store';

type Kind = 'canvas' | 'map' | 'board';
type Filter = 'all' | Kind;

interface Item {
  kind: Kind;
  id: string;
  title: string;
  updatedAt: string;
  preview: string | null;
  count: number;
}

function mapSvg(doc: MindMapDoc): string {
  return `data:image/svg+xml;utf8,${encodeURIComponent(toSvg(doc, getTheme(doc.theme)))}`;
}

function boardSvg(doc: BoardDoc): string | null {
  const boxes = doc.elements.filter((e) => e.type !== 'connector');
  if (boxes.length === 0) return null;
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const e of boxes) {
    minX = Math.min(minX, e.x);
    minY = Math.min(minY, e.y);
    maxX = Math.max(maxX, e.x + e.width);
    maxY = Math.max(maxY, e.y + e.height);
  }
  const pad = 24;
  const w = Math.round(maxX - minX + pad * 2);
  const h = Math.round(maxY - minY + pad * 2);
  const rects = [...boxes]
    .sort((a, b) => a.zIndex - b.zIndex)
    .map((e) => {
      const x = e.x - minX + pad;
      const y = e.y - minY + pad;
      const fill = e.style?.fill ?? '#ffffff';
      const stroke = e.style?.border ?? (e.style?.fill ? 'none' : '#cbd5e1');
      const rx =
        e.type === 'shape' && e.style?.shape === 'ellipse' ? Math.min(e.width, e.height) / 2 : 12;
      return `<rect x="${x}" y="${y}" width="${e.width}" height="${e.height}" rx="${rx}" fill="${fill}" stroke="${stroke}" stroke-width="2"/>`;
    })
    .join('');
  return `data:image/svg+xml;utf8,${encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}"><rect width="100%" height="100%" fill="#f8fafc"/>${rects}</svg>`
  )}`;
}

function mapItem(m: MindMap): Item {
  let preview: string | null = null;
  let count = 0;
  try {
    const doc = normalizeMindMapDoc(JSON.parse(m.content), m.id);
    count = doc.nodes.length;
    preview = mapSvg(doc);
  } catch {
    /* битый */
  }
  return { kind: 'map', id: m.id, title: m.title, updatedAt: m.updated_at, preview, count };
}

function boardItem(b: Board): Item {
  let preview: string | null = null;
  let count = 0;
  try {
    const doc = normalizeBoardDoc(JSON.parse(b.content));
    count = doc.elements.length;
    preview = boardSvg(doc);
  } catch {
    /* битый */
  }
  return { kind: 'board', id: b.id, title: b.title, updatedAt: b.updated_at, preview, count };
}

function canvasItem(c: Canvas): Item {
  let preview: string | null = null;
  let count = 0;
  try {
    const parsed = JSON.parse(c.content) as Partial<CanvasDoc>;
    const mindmap = normalizeMindMapDoc(parsed?.mindmap ?? null, c.id);
    const board = normalizeBoardDoc(parsed?.board ?? null);
    count = mindmap.nodes.length + board.elements.length;
    preview = mindmap.nodes.length > 1 ? mapSvg(mindmap) : boardSvg(board);
  } catch {
    /* битый */
  }
  return { kind: 'canvas', id: c.id, title: c.title, updatedAt: c.updated_at, preview, count };
}

const KIND_META: Record<Kind, { label: string; icon: typeof Network; route: string }> = {
  canvas: { label: 'Холст', icon: Layers, route: 'canvas' },
  map: { label: 'Карта', icon: Network, route: 'maps' },
  board: { label: 'Доска', icon: LayoutDashboard, route: 'boards' }
};

export default function Canvases(): JSX.Element {
  const nav = useNavigate();
  const [canvases, setCanvases] = useState<Canvas[]>([]);
  const [maps, setMaps] = useState<MindMap[]>([]);
  const [boards, setBoards] = useState<Board[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [filter, setFilter] = useState<Filter>('all');

  async function load(): Promise<void> {
    try {
      const [c, m, b] = await Promise.all([api.listCanvases(), api.listMaps(), api.listBoards()]);
      setCanvases(c);
      setMaps(m);
      setBoards(b);
    } catch {
      pushToast({ kind: 'error', message: 'Не удалось загрузить' });
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  const items = useMemo(() => {
    const all = [...canvases.map(canvasItem), ...maps.map(mapItem), ...boards.map(boardItem)];
    all.sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1));
    return filter === 'all' ? all : all.filter((i) => i.kind === filter);
  }, [canvases, maps, boards, filter]);

  async function createCanvas(): Promise<void> {
    if (creating) return;
    setCreating(true);
    try {
      const row = await api.createCanvas({
        title: 'Новый холст',
        content: blankCanvasContent(nanoid())
      });
      nav(`/canvas/${row.id}`);
    } catch {
      pushToast({ kind: 'error', message: 'Не удалось создать холст' });
      setCreating(false);
    }
  }

  async function duplicate(item: Item): Promise<void> {
    try {
      if (item.kind === 'canvas') await api.duplicateCanvas(item.id);
      else if (item.kind === 'map') await api.duplicateMap(item.id);
      else await api.duplicateBoard(item.id);
      await load();
    } catch {
      pushToast({ kind: 'error', message: 'Не удалось дублировать' });
    }
  }

  async function remove(item: Item): Promise<void> {
    if (!confirm('Удалить? Действие необратимо.')) return;
    try {
      if (item.kind === 'canvas') {
        await api.deleteCanvas(item.id);
        setCanvases((p) => p.filter((x) => x.id !== item.id));
      } else if (item.kind === 'map') {
        await api.deleteMap(item.id);
        setMaps((p) => p.filter((x) => x.id !== item.id));
      } else {
        await api.deleteBoard(item.id);
        setBoards((p) => p.filter((x) => x.id !== item.id));
      }
    } catch {
      pushToast({ kind: 'error', message: 'Не удалось удалить' });
    }
  }

  const hasLegacy = maps.length > 0 || boards.length > 0;

  return (
    <div className="h-full overflow-y-auto px-8 py-7 max-w-[1100px] mx-auto w-full">
      <header className="mb-7">
        <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2.5">
          <Layers className="text-accent" size={24} /> Холсты
        </h1>
        <p className="text-sm text-muted mt-1">
          Один холст: дерево-карта и свободные элементы (стикеры, фигуры, стрелки, рисунок) вместе.
        </p>
      </header>

      <section className="mb-9">
        <button
          onClick={createCanvas}
          disabled={creating}
          className="group inline-flex items-center gap-2 rounded-xl bg-accent text-white px-5 py-3 font-semibold text-sm hover:opacity-90 transition disabled:opacity-60"
          style={{ boxShadow: '0 8px 24px -12px rgba(37,99,235,0.7)' }}
        >
          {creating ? <Loader2 className="animate-spin" size={16} /> : <Plus size={16} />}
          Новый холст
        </button>
      </section>

      <section>
        <div className="flex items-center justify-between mb-3">
          <div className="text-xs uppercase tracking-wide text-muted">
            Все {items.length > 0 && <span className="text-faint">· {items.length}</span>}
          </div>
          <div className="inline-flex rounded-lg border border-border bg-surface p-0.5 gap-0.5">
            {(['all', 'canvas', ...(hasLegacy ? (['map', 'board'] as const) : [])] as Filter[]).map(
              (f) => (
                <button
                  key={f}
                  onClick={() => setFilter(f)}
                  className={`px-3 py-1 rounded-md text-xs font-medium transition ${
                    filter === f ? 'bg-accent text-white' : 'text-muted hover:text-ink'
                  }`}
                >
                  {f === 'all'
                    ? 'Все'
                    : f === 'canvas'
                      ? 'Холсты'
                      : f === 'map'
                        ? 'Карты'
                        : 'Доски'}
                </button>
              )
            )}
          </div>
        </div>

        {loading ? (
          <div className="grid place-items-center py-16 text-muted">
            <Loader2 className="animate-spin" />
          </div>
        ) : items.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border py-14 text-center text-muted">
            Пусто. Нажмите «Новый холст», чтобы начать.
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {items.map((item) => (
              <ItemCard
                key={`${item.kind}-${item.id}`}
                item={item}
                onOpen={() => nav(`/${KIND_META[item.kind].route}/${item.id}`)}
                onDuplicate={() => duplicate(item)}
                onDelete={() => remove(item)}
              />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function ItemCard({
  item,
  onOpen,
  onDuplicate,
  onDelete
}: {
  item: Item;
  onOpen: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
}): JSX.Element {
  const meta = KIND_META[item.kind];
  const Icon = meta.icon;
  const unit = item.kind === 'map' ? 'узл.' : item.kind === 'board' ? 'элем.' : 'эл.';
  return (
    <div
      onClick={onOpen}
      className="group relative rounded-xl border border-border bg-surface overflow-hidden cursor-pointer hover:border-accent hover:-translate-y-0.5 transition-all"
      style={{ boxShadow: '0 1px 2px rgba(15,23,42,0.05)' }}
    >
      <div className="relative h-28 bg-surface2 overflow-hidden grid place-items-center">
        {item.preview ? (
          <img
            src={item.preview}
            alt=""
            className="w-full h-full object-contain p-2"
            draggable={false}
          />
        ) : (
          <Icon className="text-faint" size={22} />
        )}
        <span className="absolute top-2 left-2 inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-surface/90 border border-border text-[11px] font-medium text-muted">
          <Icon size={11} /> {meta.label}
        </span>
      </div>

      <div className="p-3.5">
        <div className="font-semibold text-sm truncate">{item.title || 'Без названия'}</div>
        <div className="text-xs text-muted mt-1 flex items-center gap-2">
          <span>
            {item.count} {unit}
          </span>
          <span className="text-faint">·</span>
          <span>{new Date(item.updatedAt).toLocaleDateString('ru-RU')}</span>
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
