import type {
  BoardDoc,
  BoardElement,
  BoardElementStyle,
  BoardElementType,
  BoardShapeKind
} from '@swit/shared';

// Чистые (без побочных эффектов) иммутабельные операции над документом доски.
// Возвращают НОВЫЙ doc, не меняя входной. id элементов передаёт caller (nanoid).

export const STICKER_COLORS = [
  '#FEF08A', // yellow
  '#FDE68A', // amber
  '#BBF7D0', // green
  '#BFDBFE', // blue
  '#FBCFE8', // pink
  '#DDD6FE', // violet
  '#FED7AA', // orange
  '#E2E8F0' // slate
];

export type AlignMode = 'left' | 'right' | 'top' | 'bottom' | 'centerX' | 'centerY';

const MIN_W = 40;
const MIN_H = 28;

export function createBlankBoard(): BoardDoc {
  return { elements: [] };
}

function maxZ(doc: BoardDoc): number {
  return doc.elements.reduce((m, e) => Math.max(m, e.zIndex), 0);
}

/** Базовый элемент заданного типа с дефолтными размером/стилем. */
export function defaultElement(
  type: BoardElementType,
  id: string,
  x: number,
  y: number
): Omit<BoardElement, 'zIndex'> {
  switch (type) {
    case 'text':
      return {
        id,
        type,
        x,
        y,
        width: 200,
        height: 44,
        text: 'Текст',
        style: { fill: null, color: '#0f172a', border: null, fontSize: 18 }
      };
    case 'card':
      return {
        id,
        type,
        x,
        y,
        width: 240,
        height: 128,
        text: 'Карточка',
        style: { fill: '#ffffff', color: '#0f172a', border: '#e2e8f0', fontSize: 14 }
      };
    case 'shape':
      return {
        id,
        type,
        x,
        y,
        width: 150,
        height: 110,
        text: '',
        style: { fill: '#DBEAFE', color: '#0f172a', border: '#3B82F6', fontSize: 14, shape: 'rect' }
      };
    case 'frame':
      return {
        id,
        type,
        x,
        y,
        width: 420,
        height: 300,
        text: 'Фрейм',
        style: { fill: null, color: '#64748b', border: '#cbd5e1', fontSize: 13 }
      };
    case 'image':
      return {
        id,
        type,
        x,
        y,
        width: 220,
        height: 160,
        text: '',
        style: { fill: null, color: null, border: null },
        src: null
      };
    case 'sticker':
    default:
      return {
        id,
        type: 'sticker',
        x,
        y,
        width: 180,
        height: 140,
        text: '',
        style: { fill: STICKER_COLORS[0], color: '#1f2937', border: null, fontSize: 15 }
      };
  }
}

export function addElement(doc: BoardDoc, el: Omit<BoardElement, 'zIndex'>): BoardDoc {
  const element: BoardElement = { ...el, zIndex: maxZ(doc) + 1 };
  return { ...doc, elements: [...doc.elements, element] };
}

/** Создаёт коннектор (стрелку) между двумя существующими элементами. */
export function addConnector(
  doc: BoardDoc,
  conn: { id: string; from: string; to: string; style?: BoardElementStyle }
): BoardDoc {
  if (conn.from === conn.to) return doc;
  if (!getElement(doc, conn.from) || !getElement(doc, conn.to)) return doc;
  if (doc.elements.some((e) => e.type === 'connector' && e.from === conn.from && e.to === conn.to)) {
    return doc;
  }
  const element: BoardElement = {
    id: conn.id,
    type: 'connector',
    x: 0,
    y: 0,
    width: 0,
    height: 0,
    zIndex: maxZ(doc) + 1,
    from: conn.from,
    to: conn.to,
    style: conn.style ?? { border: '#64748b' }
  };
  return { ...doc, elements: [...doc.elements, element] };
}

export function getElement(doc: BoardDoc, id: string): BoardElement | undefined {
  return doc.elements.find((e) => e.id === id);
}

export function updateElement(
  doc: BoardDoc,
  id: string,
  patch: Partial<Omit<BoardElement, 'id' | 'type' | 'style'>>
): BoardDoc {
  return {
    ...doc,
    elements: doc.elements.map((e) => (e.id === id ? { ...e, ...patch } : e))
  };
}

export function updateStyle(doc: BoardDoc, id: string, stylePatch: BoardElementStyle): BoardDoc {
  return {
    ...doc,
    elements: doc.elements.map((e) =>
      e.id === id ? { ...e, style: { ...e.style, ...stylePatch } } : e
    )
  };
}

export function moveElement(doc: BoardDoc, id: string, x: number, y: number): BoardDoc {
  return updateElement(doc, id, { x, y });
}

export function resizeElement(
  doc: BoardDoc,
  id: string,
  rect: { x: number; y: number; width: number; height: number }
): BoardDoc {
  return updateElement(doc, id, {
    x: rect.x,
    y: rect.y,
    width: Math.max(MIN_W, rect.width),
    height: Math.max(MIN_H, rect.height)
  });
}

/** Удаляет элементы по id, а также коннекторы, ссылающиеся на удалённые. */
export function removeElements(doc: BoardDoc, ids: string[]): BoardDoc {
  const drop = new Set(ids);
  if (drop.size === 0) return doc;
  const elements = doc.elements.filter(
    (e) =>
      !drop.has(e.id) &&
      !(e.type === 'connector' && ((e.from && drop.has(e.from)) || (e.to && drop.has(e.to))))
  );
  return elements.length === doc.elements.length ? doc : { ...doc, elements };
}

/** Поднимает элементы выше всех (сохраняя их взаимный порядок). */
export function bringToFront(doc: BoardDoc, ids: string[]): BoardDoc {
  const lift = new Set(ids);
  if (lift.size === 0) return doc;
  let z = maxZ(doc);
  return {
    ...doc,
    elements: doc.elements.map((e) => (lift.has(e.id) ? { ...e, zIndex: ++z } : e))
  };
}

/** Опускает элементы ниже всех. */
export function sendToBack(doc: BoardDoc, ids: string[]): BoardDoc {
  const sink = new Set(ids);
  if (sink.size === 0) return doc;
  const minZ = doc.elements.reduce((m, e) => Math.min(m, e.zIndex), 0);
  let z = minZ;
  return {
    ...doc,
    elements: doc.elements.map((e) => (sink.has(e.id) ? { ...e, zIndex: --z } : e))
  };
}

export function group(doc: BoardDoc, ids: string[], groupId: string): BoardDoc {
  const set = new Set(ids);
  if (set.size < 2) return doc;
  return { ...doc, elements: doc.elements.map((e) => (set.has(e.id) ? { ...e, groupId } : e)) };
}

export function ungroup(doc: BoardDoc, ids: string[]): BoardDoc {
  const set = new Set(ids);
  return {
    ...doc,
    elements: doc.elements.map((e) => (set.has(e.id) && e.groupId ? { ...e, groupId: null } : e))
  };
}

/** id всех элементов в той же группе, что и заданный (включая его). */
export function groupMembers(doc: BoardDoc, id: string): string[] {
  const el = getElement(doc, id);
  if (!el?.groupId) return [id];
  return doc.elements.filter((e) => e.groupId === el.groupId).map((e) => e.id);
}

// Выравнивание/распределение работают по «коробочным» элементам (не коннекторам).
function boxes(doc: BoardDoc, ids: string[]): BoardElement[] {
  const set = new Set(ids);
  return doc.elements.filter((e) => set.has(e.id) && e.type !== 'connector');
}

export function alignElements(doc: BoardDoc, ids: string[], mode: AlignMode): BoardDoc {
  const els = boxes(doc, ids);
  if (els.length < 2) return doc;
  const minX = Math.min(...els.map((e) => e.x));
  const maxR = Math.max(...els.map((e) => e.x + e.width));
  const minY = Math.min(...els.map((e) => e.y));
  const maxB = Math.max(...els.map((e) => e.y + e.height));
  const cx = (minX + maxR) / 2;
  const cy = (minY + maxB) / 2;
  const idset = new Set(els.map((e) => e.id));

  const place = (e: BoardElement): Partial<BoardElement> => {
    switch (mode) {
      case 'left':
        return { x: minX };
      case 'right':
        return { x: maxR - e.width };
      case 'top':
        return { y: minY };
      case 'bottom':
        return { y: maxB - e.height };
      case 'centerX':
        return { x: Math.round(cx - e.width / 2) };
      case 'centerY':
        return { y: Math.round(cy - e.height / 2) };
    }
  };
  return {
    ...doc,
    elements: doc.elements.map((e) => (idset.has(e.id) ? { ...e, ...place(e) } : e))
  };
}

export function distributeElements(doc: BoardDoc, ids: string[], axis: 'h' | 'v'): BoardDoc {
  const els = boxes(doc, ids);
  if (els.length < 3) return doc;
  const horizontal = axis === 'h';
  const sizeOf = (e: BoardElement): number => (horizontal ? e.width : e.height);
  const startOf = (e: BoardElement): number => (horizontal ? e.x : e.y);
  const sorted = [...els].sort((a, b) => startOf(a) - startOf(b));
  const first = sorted[0];
  const last = sorted[sorted.length - 1];
  const span = startOf(last) + sizeOf(last) - startOf(first);
  const sumSize = sorted.reduce((s, e) => s + sizeOf(e), 0);
  const gap = (span - sumSize) / (sorted.length - 1);

  const newStart = new Map<string, number>();
  let cursor = startOf(first);
  for (const e of sorted) {
    newStart.set(e.id, Math.round(cursor));
    cursor += sizeOf(e) + gap;
  }
  return {
    ...doc,
    elements: doc.elements.map((e) => {
      const v = newStart.get(e.id);
      if (v === undefined) return e;
      return horizontal ? { ...e, x: v } : { ...e, y: v };
    })
  };
}

const TYPES: ReadonlySet<string> = new Set([
  'sticker',
  'text',
  'card',
  'shape',
  'connector',
  'frame',
  'image',
  'draw'
]);
const SHAPES: ReadonlySet<string> = new Set(['rect', 'ellipse', 'diamond']);

function num(v: unknown, fallback: number): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : fallback;
}

function normalizeStyle(value: unknown): BoardElementStyle {
  if (!value || typeof value !== 'object') return {};
  const s = value as Partial<BoardElementStyle>;
  const out: BoardElementStyle = {};
  if (typeof s.fill === 'string' || s.fill === null) out.fill = s.fill;
  if (typeof s.color === 'string' || s.color === null) out.color = s.color;
  if (typeof s.border === 'string' || s.border === null) out.border = s.border;
  if (typeof s.fontSize === 'number') out.fontSize = s.fontSize;
  if (typeof s.shape === 'string' && SHAPES.has(s.shape)) out.shape = s.shape as BoardShapeKind;
  return out;
}

/**
 * Приводит документ из БД/импорта к безопасной структуре. Битые/неполные
 * элементы не роняют холст: невалидные отбрасываются, поля получают дефолты.
 */
export function normalizeBoardDoc(value: unknown): BoardDoc {
  if (!value || typeof value !== 'object') return createBlankBoard();
  const raw = value as Partial<BoardDoc>;
  const source = Array.isArray(raw.elements) ? raw.elements : [];
  const seen = new Set<string>();
  const elements: BoardElement[] = [];

  for (let i = 0; i < source.length; i++) {
    const item = source[i];
    if (!item || typeof item !== 'object') continue;
    const e = item as Partial<BoardElement>;
    if (typeof e.id !== 'string' || !e.id.trim() || seen.has(e.id)) continue;
    const type =
      typeof e.type === 'string' && TYPES.has(e.type) ? (e.type as BoardElementType) : 'sticker';
    seen.add(e.id);
    elements.push({
      id: e.id,
      type,
      x: num(e.x, 0),
      y: num(e.y, 0),
      width: Math.max(MIN_W, num(e.width, 180)),
      height: Math.max(MIN_H, num(e.height, 140)),
      zIndex: num(e.zIndex, i + 1),
      text: typeof e.text === 'string' ? e.text : e.text == null ? null : String(e.text),
      style: normalizeStyle(e.style),
      from: typeof e.from === 'string' ? e.from : undefined,
      to: typeof e.to === 'string' ? e.to : undefined,
      src: typeof e.src === 'string' ? e.src : undefined,
      points: Array.isArray(e.points) ? e.points.filter((n): n is number => typeof n === 'number') : undefined,
      groupId: typeof e.groupId === 'string' ? e.groupId : undefined
    });
  }

  // Отбрасываем коннекторы, ссылающиеся на несуществующие элементы.
  const ids = new Set(elements.map((el) => el.id));
  const clean = elements.filter(
    (el) => el.type !== 'connector' || (!!el.from && ids.has(el.from) && !!el.to && ids.has(el.to))
  );

  return { elements: clean };
}
