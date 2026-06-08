import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { nanoid } from 'nanoid';
import { Plus, Copy, Trash2, LayoutDashboard, Loader2 } from 'lucide-react';
import type { Board, BoardDoc, BoardElement, BoardElementType } from '@swit/shared';
import { api } from '../api';
import { pushToast } from '../hooks/useToasts';
import { createBlankBoard, defaultElement, normalizeBoardDoc } from '../lib/board/doc';

interface Template {
  key: string;
  title: string;
  hint: string;
  build: () => { title: string; doc: BoardDoc };
}

function el(type: BoardElementType, x: number, y: number, text: string): BoardElement {
  return { ...defaultElement(type, nanoid(), x, y), text, zIndex: 1 };
}

const TEMPLATES: Template[] = [
  {
    key: 'blank',
    title: 'Пустая доска',
    hint: 'Чистый холст',
    build: () => ({ title: 'Новая доска', doc: createBlankBoard() })
  },
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
      doc: {
        elements: [
          el('card', 40, 40, 'Сделать'),
          el('card', 320, 40, 'В работе'),
          el('card', 600, 40, 'Готово')
        ]
      }
    })
  }
];

function parseDoc(b: Board): BoardDoc | null {
  try {
    return normalizeBoardDoc(JSON.parse(b.content));
  } catch {
    return null;
  }
}

function previewSrc(doc: BoardDoc | null): string | null {
  if (!doc || doc.elements.length === 0) return null;
  try {
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
        const rx =
          e.type === 'shape' && e.style?.shape === 'ellipse' ? Math.min(e.width, e.height) / 2 : 12;
        return `<rect x="${x}" y="${y}" width="${e.width}" height="${e.height}" rx="${rx}" fill="${fill}" stroke="${stroke}" stroke-width="2"/>`;
      })
      .join('');
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}"><rect width="100%" height="100%" fill="#f8fafc"/>${rects}</svg>`;
    return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
  } catch {
    return null;
  }
}

export default function Boards(): JSX.Element {
  const nav = useNavigate();
  const [boards, setBoards] = useState<Board[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);

  async function load(): Promise<void> {
    try {
      setBoards(await api.listBoards());
    } catch {
      pushToast({ kind: 'error', message: 'Не удалось загрузить доски' });
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
      const row = await api.createBoard({ title, content: JSON.stringify(doc) });
      nav(`/boards/${row.id}`);
    } catch {
      pushToast({ kind: 'error', message: 'Не удалось создать доску' });
      setCreating(false);
    }
  }

  async function duplicate(id: string): Promise<void> {
    try {
      await api.duplicateBoard(id);
      await load();
    } catch {
      pushToast({ kind: 'error', message: 'Не удалось дублировать' });
    }
  }

  async function remove(id: string): Promise<void> {
    if (!confirm('Удалить доску? Действие необратимо.')) return;
    try {
      await api.deleteBoard(id);
      setBoards((prev) => prev.filter((b) => b.id !== id));
    } catch {
      pushToast({ kind: 'error', message: 'Не удалось удалить' });
    }
  }

  return (
    <div className="h-full overflow-y-auto px-8 py-7 max-w-[1100px] mx-auto w-full">
      <header className="mb-7">
        <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2.5">
          <LayoutDashboard className="text-accent" size={24} /> Доски
        </h1>
        <p className="text-sm text-muted mt-1">
          Свободные доски: стикеры, текст, карточки и фигуры. Двойной клик — правка текста,
          перетаскивание — свободное.
        </p>
      </header>

      <section className="mb-9">
        <div className="text-xs uppercase tracking-wide text-muted mb-3">Создать</div>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          {TEMPLATES.map((tpl) => (
            <button
              key={tpl.key}
              onClick={() => create(tpl)}
              disabled={creating}
              className="group relative text-left rounded-xl border border-border bg-surface p-4 hover:border-accent hover:-translate-y-0.5 transition-all overflow-hidden disabled:opacity-60"
              style={{ boxShadow: '0 1px 2px rgba(15,23,42,0.05)' }}
            >
              <div className="flex items-center gap-2 font-semibold text-sm">
                {tpl.key === 'blank' ? <Plus size={15} /> : <LayoutDashboard size={15} />} {tpl.title}
              </div>
              <div className="text-xs text-muted mt-1.5 leading-snug">{tpl.hint}</div>
            </button>
          ))}
        </div>
      </section>

      <section>
        <div className="text-xs uppercase tracking-wide text-muted mb-3">
          Мои доски {boards.length > 0 && <span className="text-faint">· {boards.length}</span>}
        </div>

        {loading ? (
          <div className="grid place-items-center py-16 text-muted">
            <Loader2 className="animate-spin" />
          </div>
        ) : boards.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border py-14 text-center text-muted">
            Пока нет досок. Выберите шаблон выше, чтобы начать.
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {boards.map((b) => (
              <BoardCard
                key={b.id}
                board={b}
                onOpen={() => nav(`/boards/${b.id}`)}
                onDuplicate={() => duplicate(b.id)}
                onDelete={() => remove(b.id)}
              />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function BoardCard({
  board,
  onOpen,
  onDuplicate,
  onDelete
}: {
  board: Board;
  onOpen: () => void;
  onDelete: () => void;
  onDuplicate: () => void;
}): JSX.Element {
  const doc = useMemo(() => parseDoc(board), [board]);
  const preview = useMemo(() => previewSrc(doc), [doc]);
  const count = doc?.elements.length ?? 0;

  return (
    <div
      onClick={onOpen}
      className="group relative rounded-xl border border-border bg-surface overflow-hidden cursor-pointer hover:border-accent hover:-translate-y-0.5 transition-all"
      style={{ boxShadow: '0 1px 2px rgba(15,23,42,0.05)' }}
    >
      <div className="relative h-28 bg-surface2 overflow-hidden grid place-items-center">
        {preview ? (
          <img src={preview} alt="" className="w-full h-full object-contain p-2" draggable={false} />
        ) : (
          <LayoutDashboard className="text-faint" size={22} />
        )}
      </div>

      <div className="p-3.5">
        <div className="font-semibold text-sm truncate">{board.title || 'Без названия'}</div>
        <div className="text-xs text-muted mt-1 flex items-center gap-2">
          <span>{count} элем.</span>
          <span className="text-faint">·</span>
          <span>{new Date(board.updated_at).toLocaleDateString('ru-RU')}</span>
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
