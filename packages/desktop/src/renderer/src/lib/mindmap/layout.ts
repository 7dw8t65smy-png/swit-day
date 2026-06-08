import type { MindMapDoc } from '@swit/shared';
import { getChildren, visibleNodes } from './doc';

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

export function layoutMap(doc: MindMapDoc): Record<string, NodePos> {
  const visible = new Set(visibleNodes(doc).map((n) => n.id));
  const pos: Record<string, NodePos> = {};
  const vertical = doc.layout === 'tree';
  const dir = doc.layout === 'left' ? -1 : 1;

  let cursor = 0; // позиция вдоль поперечной оси (по дорожкам листьев)

  const childrenOf = (id: string): string[] =>
    getChildren(doc, id)
      .filter((c) => visible.has(c.id))
      .map((c) => c.id);

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
  return pos;
}
