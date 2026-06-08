import type { MindMapDoc } from '@swit/shared';
import { getNode, getChildren, descendantIds } from './doc';
import { layoutMap, type NodePos } from './layout';

// Навигация с клавиатуры и геометрия для drag-to-reparent.
// Чистые функции: зависят только от документа (и точки курсора для дропа).

export type ArrowKey = 'ArrowUp' | 'ArrowDown' | 'ArrowLeft' | 'ArrowRight';

/**
 * Куда перейти стрелкой от узла fromId с учётом раскладки.
 * Горизонтальные (right/left): к ребёнку/родителю — по горизонтали,
 * между соседями — по вертикали. tree (вниз) — наоборот.
 */
export function navTarget(doc: MindMapDoc, fromId: string, arrow: ArrowKey): string | null {
  const node = getNode(doc, fromId);
  if (!node) return null;

  const horizontal = doc.layout !== 'tree';
  const childArrow: ArrowKey = horizontal
    ? doc.layout === 'left'
      ? 'ArrowLeft'
      : 'ArrowRight'
    : 'ArrowDown';
  const parentArrow: ArrowKey = horizontal
    ? doc.layout === 'left'
      ? 'ArrowRight'
      : 'ArrowLeft'
    : 'ArrowUp';
  const prevArrow: ArrowKey = horizontal ? 'ArrowUp' : 'ArrowLeft';
  const nextArrow: ArrowKey = horizontal ? 'ArrowDown' : 'ArrowRight';

  if (arrow === childArrow) {
    if (node.collapsed) return null;
    const kids = getChildren(doc, fromId);
    return kids.length ? kids[0].id : null;
  }
  if (arrow === parentArrow) {
    return node.parentId ?? null;
  }
  if (arrow === prevArrow || arrow === nextArrow) {
    if (!node.parentId) return null;
    const sibs = getChildren(doc, node.parentId);
    const i = sibs.findIndex((n) => n.id === fromId);
    const j = arrow === prevArrow ? i - 1 : i + 1;
    return sibs[j]?.id ?? null;
  }
  return null;
}

const DROP_THRESHOLD = 130;

/**
 * Ближайший допустимый узел для переноса draggedId в точку point.
 * Исключает сам узел, его поддерево и текущего родителя (туда смысла нет).
 * Возвращает null, если рядом нет подходящей цели.
 */
export function findDropTarget(
  doc: MindMapDoc,
  draggedId: string,
  point: NodePos,
  threshold = DROP_THRESHOLD,
  positions: Record<string, NodePos> = layoutMap(doc)
): string | null {
  const dragged = getNode(doc, draggedId);
  if (!dragged) return null;

  const banned = new Set<string>([draggedId, ...descendantIds(doc, draggedId)]);
  if (dragged.parentId) banned.add(dragged.parentId);

  let best: string | null = null;
  let bestDist = threshold * threshold;
  for (const n of doc.nodes) {
    if (banned.has(n.id)) continue;
    const p = positions[n.id];
    if (!p) continue;
    const dx = p.x - point.x;
    const dy = p.y - point.y;
    const dist = dx * dx + dy * dy;
    if (dist < bestDist) {
      bestDist = dist;
      best = n.id;
    }
  }
  return best;
}
