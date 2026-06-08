import type { MindMapDoc, MindMapNode, MindMapLayout } from '@swit/shared';

// Чистые (без побочных эффектов) операции над документом интеллект-карты.
// Все функции иммутабельны: возвращают НОВЫЙ doc, не меняя входной.
// id новых узлов передаётся снаружи (caller генерит nanoid) — так функции
// детерминированы и легко тестируются.

export const DEFAULT_BRANCH_COLORS = [
  '#2563EB', // blue
  '#7C3AED', // violet
  '#DB2777', // pink
  '#EA580C', // orange
  '#059669', // emerald
  '#0891B2', // cyan
  '#CA8A04', // amber
  '#DC2626' // red
];

export function createBlankDoc(rootId: string, rootText = 'Центральная идея'): MindMapDoc {
  return {
    rootId,
    layout: 'right',
    nodes: [{ id: rootId, parentId: null, text: rootText }]
  };
}

export function getNode(doc: MindMapDoc, id: string): MindMapNode | undefined {
  return doc.nodes.find((n) => n.id === id);
}

export function getChildren(doc: MindMapDoc, id: string): MindMapNode[] {
  return doc.nodes.filter((n) => n.parentId === id);
}

/** id всех потомков узла (без него самого). */
export function descendantIds(doc: MindMapDoc, id: string): string[] {
  const out: string[] = [];
  const walk = (parent: string): void => {
    for (const child of doc.nodes) {
      if (child.parentId === parent) {
        out.push(child.id);
        walk(child.id);
      }
    }
  };
  walk(id);
  return out;
}

/** Глубина узла от корня (корень = 0). */
export function depthOf(doc: MindMapDoc, id: string): number {
  let depth = 0;
  let cur = getNode(doc, id);
  while (cur && cur.parentId) {
    depth += 1;
    cur = getNode(doc, cur.parentId);
  }
  return depth;
}

// Цвет ветки: у узлов 1-го уровня берём из палитры по индексу, глубже —
// наследуем цвет предка. Явно заданный node.color имеет приоритет.
export function branchColor(doc: MindMapDoc, id: string): string {
  const node = getNode(doc, id);
  if (!node) return DEFAULT_BRANCH_COLORS[0];
  if (node.color) return node.color;
  if (!node.parentId) return '#334155'; // корень — нейтральный
  // поднимаемся до узла 1-го уровня
  let cur = node;
  const chain: MindMapNode[] = [];
  while (cur.parentId) {
    chain.push(cur);
    const parent = getNode(doc, cur.parentId);
    if (!parent) break;
    cur = parent;
  }
  const firstLevel = chain[chain.length - 1];
  if (firstLevel.color) return firstLevel.color;
  const siblings = getChildren(doc, doc.rootId);
  const idx = siblings.findIndex((n) => n.id === firstLevel.id);
  return DEFAULT_BRANCH_COLORS[(idx < 0 ? 0 : idx) % DEFAULT_BRANCH_COLORS.length];
}

function replaceNodes(doc: MindMapDoc, nodes: MindMapNode[]): MindMapDoc {
  return { ...doc, nodes };
}

export function addChild(doc: MindMapDoc, parentId: string, newId: string, text = ''): MindMapDoc {
  if (!getNode(doc, parentId)) return doc;
  const child: MindMapNode = { id: newId, parentId, text };
  // Добавляем дочерний — родитель раскрывается.
  const nodes = doc.nodes.map((n) =>
    n.id === parentId && n.collapsed ? { ...n, collapsed: false } : n
  );
  return replaceNodes(doc, [...nodes, child]);
}

export function addSibling(doc: MindMapDoc, nodeId: string, newId: string, text = ''): MindMapDoc {
  const node = getNode(doc, nodeId);
  if (!node) return doc;
  // У корня нет соседа — добавляем дочерний.
  if (!node.parentId) return addChild(doc, nodeId, newId, text);
  return addChild(doc, node.parentId, newId, text);
}

/** Удаляет узел вместе с поддеревом. Корень удалить нельзя. */
export function deleteNode(doc: MindMapDoc, id: string): MindMapDoc {
  const node = getNode(doc, id);
  if (!node || !node.parentId) return doc; // корень не трогаем
  const toRemove = new Set([id, ...descendantIds(doc, id)]);
  return replaceNodes(
    doc,
    doc.nodes.filter((n) => !toRemove.has(n.id))
  );
}

export function updateNode(
  doc: MindMapDoc,
  id: string,
  patch: Partial<Omit<MindMapNode, 'id' | 'parentId'>>
): MindMapDoc {
  return replaceNodes(
    doc,
    doc.nodes.map((n) => (n.id === id ? { ...n, ...patch } : n))
  );
}

export function toggleCollapse(doc: MindMapDoc, id: string): MindMapDoc {
  const node = getNode(doc, id);
  if (!node) return doc;
  // Сворачивать имеет смысл только узлы с детьми.
  if (getChildren(doc, id).length === 0) return doc;
  return updateNode(doc, id, { collapsed: !node.collapsed });
}

/** Переносит узел под нового родителя. Защита от циклов и переноса корня. */
export function moveNode(doc: MindMapDoc, id: string, newParentId: string): MindMapDoc {
  const node = getNode(doc, id);
  if (!node || !node.parentId) return doc; // корень не двигаем
  if (id === newParentId) return doc;
  if (!getNode(doc, newParentId)) return doc;
  // нельзя перенести узел в собственное поддерево
  if (descendantIds(doc, id).includes(newParentId)) return doc;
  return replaceNodes(
    doc,
    doc.nodes.map((n) => (n.id === id ? { ...n, parentId: newParentId } : n))
  );
}

export function setLayout(doc: MindMapDoc, layout: MindMapLayout): MindMapDoc {
  return { ...doc, layout };
}

/** Узлы, видимые на холсте (не под свёрнутым предком). */
export function visibleNodes(doc: MindMapDoc): MindMapNode[] {
  const hidden = new Set<string>();
  for (const n of doc.nodes) {
    if (n.collapsed) {
      for (const d of descendantIds(doc, n.id)) hidden.add(d);
    }
  }
  return doc.nodes.filter((n) => !hidden.has(n.id));
}
