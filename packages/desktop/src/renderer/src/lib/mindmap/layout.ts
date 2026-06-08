import type { MindMapDoc } from '@swit/shared';
import { visibleNodes } from './doc';

// Чистая авто-раскладка дерева. Возвращает координаты каждого ВИДИМОГО узла
// (свёрнутые поддеревья пропускаются).
//
// Алгоритм («tidy tree», упрощённый): листья занимают подряд идущие «дорожки»,
// родитель центрируется по поперечной оси между первым и последним ребёнком.
// Главная ось (от корня) задаётся глубиной.

export interface NodePos {
  x: number;
  y: number;
}

// Шаг между уровнями и высота «дорожки» листа. Должны превышать размеры ноды.
export const LEVEL_GAP = 260;
export const ROW_GAP = 76;

const layoutCache = new WeakMap<MindMapDoc, Record<string, NodePos>>();

/**
 * Раскладка с мемоизацией по ссылке документа. Документы иммутабельны (любая
 * правка создаёт новый объект), поэтому ссылка — корректный ключ кэша, а
 * возвращаемый объект только читается. Дедуплицирует повторные вызовы из
 * buildMind / findDropTarget / onNodeDragStop в пределах одного состояния.
 */
export function layoutMap(doc: MindMapDoc): Record<string, NodePos> {
  const cached = layoutCache.get(doc);
  if (cached) return cached;
  const result = computeLayout(doc);
  layoutCache.set(doc, result);
  return result;
}

function computeLayout(doc: MindMapDoc): Record<string, NodePos> {
  const visibleList = visibleNodes(doc);
  if (!visibleList.some((n) => n.id === doc.rootId)) return {};

  const visible = new Set(visibleList.map((n) => n.id));
  const children = new Map<string, string[]>();
  for (const n of visibleList) {
    if (!n.parentId) continue;
    const arr = children.get(n.parentId);
    if (arr) arr.push(n.id);
    else children.set(n.parentId, [n.id]);
  }
  const pos: Record<string, NodePos> = {};
  const vertical = doc.layout === 'tree';
  const dir = doc.layout === 'left' ? -1 : 1;

  let cursor = 0; // позиция вдоль поперечной оси (по дорожкам листьев)

  const childrenOf = (id: string): string[] =>
    children.get(id)?.filter((c) => visible.has(c)) ?? [];

  // Возвращает координату центра узла вдоль поперечной оси.
  const place = (id: string, depth: number): number => {
    const main = depth * (vertical ? ROW_GAP * 1.6 : LEVEL_GAP) * (vertical ? 1 : dir);
    const kids = childrenOf(id);

    let cross: number;
    if (kids.length === 0) {
      cross = cursor * (vertical ? LEVEL_GAP : ROW_GAP);
      cursor += 1;
    } else {
      const childCross = kids.map((k) => place(k, depth + 1));
      cross = (childCross[0] + childCross[childCross.length - 1]) / 2;
    }

    pos[id] = vertical ? { x: cross, y: main } : { x: main, y: cross };
    return cross;
  };

  place(doc.rootId, 0);

  // Ручные позиции (fx/fy): узел встаёт в заданную точку, а его поддерево
  // сдвигается вместе с ним. Обходим дерево от корня, накапливая смещение,
  // чтобы вложенные ручные позиции корректно перекрывали унаследованное.
  const byId = new Map(visibleList.map((n) => [n.id, n]));
  const applyManual = (id: string, ox: number, oy: number): void => {
    const auto = pos[id];
    if (!auto) return;
    const node = byId.get(id);
    let x: number;
    let y: number;
    let nextOx: number;
    let nextOy: number;
    if (node && typeof node.fx === 'number' && typeof node.fy === 'number') {
      x = node.fx;
      y = node.fy;
      nextOx = node.fx - auto.x;
      nextOy = node.fy - auto.y;
    } else {
      x = auto.x + ox;
      y = auto.y + oy;
      nextOx = ox;
      nextOy = oy;
    }
    pos[id] = { x, y };
    for (const child of childrenOf(id)) applyManual(child, nextOx, nextOy);
  };
  applyManual(doc.rootId, 0, 0);

  return pos;
}
