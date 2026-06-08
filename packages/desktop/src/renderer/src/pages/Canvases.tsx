import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { nanoid } from 'nanoid';
import { Plus, Copy, Trash2, Network, LayoutDashboard, Loader2 } from 'lucide-react';
import type { Board, BoardDoc, BoardElement, BoardElementType, MindMap, MindMapDoc } from '@swit/shared';
import { api } from '../api';
import { pushToast } from '../hooks/useToasts';
import { createBlankDoc, normalizeMindMapDoc } from '../lib/mindmap/doc';
import { getTheme } from '../lib/mindmap/themes';
import { toSvg } from '../lib/mindmap/exporters';
import { createBlankBoard, defaultElement, normalizeBoardDoc } from '../lib/board/doc';

type Kind = 'map' | 'board';
type Filter = 'all' | Kind;

interface CanvasItem {
  kind: Kind;
  id: string;
  title: string;
  updatedAt: string;
  preview: string | null;
  count: number;
}

interface MapTemplate {
  key: string;
  title: string;
  hint: string;
  build: () => { title: string; doc: MindMapDoc };
}
interface BoardTemplate {
  key: string;
  title: string;
  hint: string;
  build: () => { title: string; doc: BoardDoc };
}

// --- шаблоны карт ---
function withChildren(rootText: string, children: string[]): { title: string; doc: MindMapDoc } {
  const rootId = nanoid();
  const doc = createBlankDoc(rootId, rootText);
  const nodes = [...doc.nodes];
  for (const text of children) nodes.push({ id: nanoid(), parentId: rootId, text });
  return { title: rootText, doc: { ...doc, nodes } };
}

const MAP_TEMPLATES: MapTemplate[] = [
  { key: 'blank', title: 'Пустая карта', hint: 'Один узел', build: () => ({ title: 'Новая карта', doc: createBlankDoc(nanoid()) }) },
  { key: 'project', title: 'План проекта', hint: 'Цели · Этапы · Риски', build: () => withChildren('Проект', ['Цели', 'Этапы', 'Команда', 'Риски', 'Сроки']) },
  { key: 'brainstorm', title: 'Брейншторм', hint: 'Зачем · Для кого · Фишки', build: () => withChildren('Идея', ['Зачем', 'Для кого', 'Фишки', 'Каналы', 'Следующие шаги']) },
  { key: 'swot', title: 'SWOT-анализ', hint: 'S · W · O · T', build: () => withChildren('SWOT', ['Сильные стороны', 'Слабые стороны', 'Возможности', 'Угрозы']) }
];

// --- шаблоны досок ---
function el(type: BoardElementType, x: number, y: number, text: string): BoardElement {
  return { ...defaultElement(type, nanoid(), x, y), text, zIndex: 1 };
}
const BOARD_TEMPLATES: BoardTemplate[] = [
  { key: 'blank', title: 'Пустая доска', hint: 'Чистый холст', build: () => ({ title: 'Новая доска', doc: createBlankBoard() }) },
  {
    key: 'ideas',
    title: 'Доска идей',
    hint: 'Заголовок и стикеры',
    build: () => ({
      title: 'Идеи',
      doc: {
        elements: [
          { ...el('text', 40, 20, 'Идеи'), width: 240, height: 48, style: { fontSize: 28, color: '#0f172a' } },
          el('sticker', 40, 100, 'Зачем?'),
          el('sticker', 250, 100, 'Для кого?'),
          el('sticker', 460, 100, 'Фишки')
        ]
      }
    })
  },
  {
    key: 'kanban',
    title: 'Канбан',
    hint: 'Сделать · В работе · Готово',
    build: () => ({
      title: 'Канбан',
      doc: { elements: [el('card', 40, 40, 'Сделать'), el('card', 320, 40, 'В работе'), el('card', 600, 40, 'Готово')] }
    })
  }
];

function mapItem(m: MindMap): CanvasItem {
  let preview: string | null = null;
  let count = 0;
  try {
    const doc = normalizeMindMapDoc(JSON.parse(m.content), m.id);
    count = doc.nodes.length;
    preview = `data:image/svg+xml;utf8,${encodeURIComponent(toSvg(doc, getTheme(doc.theme)))}`;
  } catch {
    /* битый документ — без превью */
  }
  return { kind: 'map', id: m.id, title: m.title, updatedAt: m.updated_at, preview, count };
}

function boardPreview(doc: BoardDoc): string | null {
  if (doc.elements.length === 0) return null;
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const e of doc.elements) {
    minX = Math.min(minX, e.x);
    minY = Math.min(minY, e.y);
    maxX = Math.max(maxX, e.x + e.width);
    maxY = Math.max(maxY, e.y + e.height);
  }
  const pad = 24;
  const w = Math.round(maxX - minX + pad * 2);
  const h = Math.round(maxY - minY + pad * 2);
  const rects = [...doc.elements]
    .sort((a, b) => a.zIndex - b.zIndex)
    .map((e) => {
      const x = e.x - minX + pad;
      const y = e.y - minY + pad;
      const fill = e.style?.fill ?? '#ffffff';
      const stroke = e.style?.border ?? (e.style?.fill ? 'none' : '#cbd5e1');
      const rx = e.type === 'shape' && e.style?.shape === 'ellipse' ? Math.min(e.width, e.height) / 2 : 12;
      return `<rect x="${x}" y="${y}" width="${e.width}" height="${e.height}" rx="${rx}" fill="${fill}" stroke="${stroke}" stroke-width="2"/>`;
    })
    .join('');
  return `data:image/svg+xml;utf8,${encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}"><rect width="100%" height="100%" fill="#f8fafc"/>${rects}</svg>`
  )}`;
}

function boardItem(b: Board): CanvasItem {
  let preview: string | null = null;
  let count = 0;
  try {
    const doc = normalizeBoardDoc(JSON.parse(b.content));
    count = doc.elements.length;
    preview = boardPreview(doc);
  } catch {
    /* битый документ — без превью */
  }
  return { kind: 'board', id: b.id, title: b.title, updatedAt: b.updated_at, preview, count };
}

export default function Canvases(): JSX.Element {
  const nav = useNavigate();
  const [maps, setMaps] = useState<MindMap[]>([]);
  const [boards, setBoards] = useState<Board[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [filter, setFilter] = useState<Filter>('all');
  const [createKind, setCreateKind] = useState<Kind>('map');

  async function load(): Promise<void> {
    try {
      const [m, b] = await Promise.all([api.listMaps(), api.listBoards()]);
      setMaps(m);
      setBoards(b);
    } catch {
      pushToast({ kind: 'error', message: 'Не удалось загрузить холсты' });
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  const items = useMemo(() => {
    const all = [...maps.map(mapItem), ...boards.map(boardItem)];
    all.sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1));
    return filter === 'all' ? all : all.filter((i) => i.kind === filter);
  }, [maps, boards, filter]);

  async function createMap(tpl: MapTemplate): Promise<void> {
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
  async function createBoard(tpl: BoardTemplate): Promise<void> {
    if (creating) return;
    setCreating(true);
    try {
      const { title, doc } = tpl.build();
      const row = await api.createBoard({ title, content: JSON.stringify(doc) });
      nav(`/boards/${row.id}`);
    } catch {
      pushToast({ kind: 'error', message: 'Не удалось создать доску' });
      setCreating(false);
    }
  }

  async function duplicate(item: CanvasItem): Promise<void> {
    try {
      if (item.kind === 'map') await api.duplicateMap(item.id);
      else await api.duplicateBoard(item.id);
      await load();
    } catch {
      pushToast({ kind: 'error', message: 'Не удалось дублировать' });
    }
  }

  async function remove(item: CanvasItem): Promise<void> {
    if (!confirm('Удалить? Действие необратимо.')) return;
    try {
      if (item.kind === 'map') {
        await api.deleteMap(item.id);
        setMaps((prev) => prev.filter((m) => m.id !== item.id));
      } else {
        await api.deleteBoard(item.id);
        setBoards((prev) => prev.filter((b) => b.id !== item.id));
      }
    } catch {
      pushToast({ kind: 'error', message: 'Не удалось удалить' });
    }
  }

  return (
    <div className="h-full overflow-y-auto px-8 py-7 max-w-[1100px] mx-auto w-full">
      <header className="mb-7">
        <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2.5">
          <LayoutDashboard className="text-accent" size={24} /> Холсты
        </h1>
        <p className="text-sm text-muted mt-1">
          Интеллект-карты (структура деревом) и свободные доски (стикеры, фигуры, стрелки) — в одном месте.
        </p>
      </header>

      {/* Создать */}
      <section className="mb-9">
        <div className="flex items-center justify-between mb-3">
          <div className="text-xs uppercase tracking-wide text-muted">Создать</div>
          <Segmented
            value={createKind}
            onChange={(v) => setCreateKind(v as Kind)}
            options={[
              { value: 'map', label: 'Карта' },
              { value: 'board', label: 'Доска' }
            ]}
          />
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {createKind === 'map'
            ? MAP_TEMPLATES.map((tpl) => (
                <TemplateCard
                  key={tpl.key}
                  title={tpl.title}
                  hint={tpl.hint}
                  blank={tpl.key === 'blank'}
                  kind="map"
                  disabled={creating}
                  onClick={() => createMap(tpl)}
                />
              ))
            : BOARD_TEMPLATES.map((tpl) => (
                <TemplateCard
                  key={tpl.key}
                  title={tpl.title}
                  hint={tpl.hint}
                  blank={tpl.key === 'blank'}
                  kind="board"
                  disabled={creating}
                  onClick={() => createBoard(tpl)}
                />
              ))}
        </div>
      </section>

      {/* Список */}
      <section>
        <div className="flex items-center justify-between mb-3">
          <div className="text-xs uppercase tracking-wide text-muted">
            Все холсты {items.length > 0 && <span className="text-faint">· {items.length}</span>}
          </div>
          <Segmented
            value={filter}
            onChange={(v) => setFilter(v as Filter)}
            options={[
              { value: 'all', label: 'Все' },
              { value: 'map', label: 'Карты' },
              { value: 'board', label: 'Доски' }
            ]}
          />
        </div>

        {loading ? (
          <div className="grid place-items-center py-16 text-muted">
            <Loader2 className="animate-spin" />
          </div>
        ) : items.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border py-14 text-center text-muted">
            Пусто. Создайте карту или доску выше.
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {items.map((item) => (
              <ItemCard
                key={`${item.kind}-${item.id}`}
                item={item}
                onOpen={() => nav(`/${item.kind === 'map' ? 'maps' : 'boards'}/${item.id}`)}
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

function Segmented({
  value,
  onChange,
  options
}: {
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
}): JSX.Element {
  return (
    <div className="inline-flex rounded-lg border border-border bg-surface p-0.5 gap-0.5">
      {options.map((o) => (
        <button
          key={o.value}
          onClick={() => onChange(o.value)}
          className={`px-3 py-1 rounded-md text-xs font-medium transition ${
            value === o.value ? 'bg-accent text-white' : 'text-muted hover:text-ink'
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

function TemplateCard({
  title,
  hint,
  blank,
  kind,
  disabled,
  onClick
}: {
  title: string;
  hint: string;
  blank: boolean;
  kind: Kind;
  disabled: boolean;
  onClick: () => void;
}): JSX.Element {
  const Icon = blank ? Plus : kind === 'map' ? Network : LayoutDashboard;
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="group relative text-left rounded-xl border border-border bg-surface p-4 hover:border-accent hover:-translate-y-0.5 transition-all overflow-hidden disabled:opacity-60"
      style={{ boxShadow: '0 1px 2px rgba(15,23,42,0.05)' }}
    >
      <div className="flex items-center gap-2 font-semibold text-sm">
        <Icon size={15} /> {title}
      </div>
      <div className="text-xs text-muted mt-1.5 leading-snug">{hint}</div>
    </button>
  );
}

function ItemCard({
  item,
  onOpen,
  onDuplicate,
  onDelete
}: {
  item: CanvasItem;
  onOpen: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
}): JSX.Element {
  const Icon = item.kind === 'map' ? Network : LayoutDashboard;
  const unit = item.kind === 'map' ? 'узл.' : 'элем.';
  return (
    <div
      onClick={onOpen}
      className="group relative rounded-xl border border-border bg-surface overflow-hidden cursor-pointer hover:border-accent hover:-translate-y-0.5 transition-all"
      style={{ boxShadow: '0 1px 2px rgba(15,23,42,0.05)' }}
    >
      <div className="relative h-28 bg-surface2 overflow-hidden grid place-items-center">
        {item.preview ? (
          <img src={item.preview} alt="" className="w-full h-full object-contain p-2" draggable={false} />
        ) : (
          <Icon className="text-faint" size={22} />
        )}
        <span className="absolute top-2 left-2 inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-surface/90 border border-border text-[11px] font-medium text-muted">
          <Icon size={11} /> {item.kind === 'map' ? 'Карта' : 'Доска'}
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
