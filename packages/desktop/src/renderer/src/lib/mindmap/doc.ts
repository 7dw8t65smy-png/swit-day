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

const LAYOUTS = new Set<MindMapLayout>(['right', 'left', 'tree']);

function childIndex(doc: MindMapDoc): Map<string, MindMapNode[]> {
  const index = new Map<string, MindMapNode[]>();
  for (const n of doc.nodes) {
    if (!n.parentId) continue;
    const arr = index.get(n.parentId);
    if (arr) arr.push(n);
    else index.set(n.parentId, [n]);
  }
  return index;
}

/**
 * Принимает документ из БД/импорта и возвращает безопасную структуру для
 * редактора. Битые parentId не роняют холст: узлы переподвешиваются к корню.
 */
export function normalizeMindMapDoc(value: unknown, fallbackRootId = 'root'): MindMapDoc {
  if (!value || typeof value !== 'object') return createBlankDoc(fallbackRootId);
  const raw = value as Partial<MindMapDoc>;
  const sourceNodes = Array.isArray(raw.nodes) ? raw.nodes : [];
  const seen = new Set<string>();
  const nodes: MindMapNode[] = [];

  for (const item of sourceNodes) {
    if (!item || typeof item !== 'object') continue;
    const n = item as Partial<MindMapNode>;
    if (typeof n.id !== 'string' || !n.id.trim() || seen.has(n.id)) continue;
    seen.add(n.id);
    nodes.push({
      id: n.id,
      parentId: typeof n.parentId === 'string' ? n.parentId : null,
      text: typeof n.text === 'string' ? n.text : String(n.text ?? ''),
      color: n.color ?? null,
      emoji: n.emoji ?? null,
      note: n.note ?? null,
      priority: n.priority ?? null,
      done: !!n.done,
      tags: Array.isArray(n.tags)
        ? n.tags.filter((t): t is string => typeof t === 'string')
        : undefined,
      collapsed: !!n.collapsed
    });
  }

  let rootId =
    typeof raw.rootId === 'string' && seen.has(raw.rootId)
      ? raw.rootId
      : nodes.find((n) => !n.parentId)?.id;
  if (!rootId) {
    const doc = createBlankDoc(fallbackRootId);
    return {
      ...doc,
      theme: typeof raw.theme === 'string' ? raw.theme : undefined
    };
  }

  const ids = new Set(nodes.map((n) => n.id));
  const normalized = nodes.map((n) => {
    if (n.id === rootId) return { ...n, parentId: null };
    if (!n.parentId || n.parentId === n.id || !ids.has(n.parentId)) {
      return { ...n, parentId: rootId };
    }
    return n;
  });

  // Разрываем возможные циклы, чтобы навигация/раскладка не зависали.
  const byId = new Map(normalized.map((n) => [n.id, n]));
  const acyclic = normalized.map((n) => {
    if (n.id === rootId) return n;
    const chain = new Set<string>([n.id]);
    let parentId = n.parentId;
    while (parentId) {
      if (chain.has(parentId)) return { ...n, parentId: rootId };
      chain.add(parentId);
      parentId = byId.get(parentId)?.parentId ?? null;
    }
    return n;
  });

  return {
    rootId,
    layout: LAYOUTS.has(raw.layout as MindMapLayout) ? (raw.layout as MindMapLayout) : 'right',
    nodes: acyclic,
    theme: typeof raw.theme === 'string' ? raw.theme : undefined
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
  const children = childIndex(doc);
  const walk = (parent: string): void => {
    for (const child of children.get(parent) ?? []) {
      out.push(child.id);
      walk(child.id);
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

function patchChanges<T extends object>(target: T, patch: Partial<T>): boolean {
  return Object.entries(patch).some(([key, value]) => !Object.is(target[key as keyof T], value));
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
  const node = getNode(doc, id);
  if (!node || !patchChanges(node, patch)) return doc;
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

/**
 * Меняет местами соседний узел с предыдущим (dir=-1) или следующим (dir=1).
 * Порядок раскладки задаётся порядком узлов в doc.nodes, поэтому переставляем
 * абсолютные позиции двух соседей. Структура (parentId) не меняется.
 */
export function reorderSibling(doc: MindMapDoc, id: string, dir: -1 | 1): MindMapDoc {
  const node = getNode(doc, id);
  if (!node || !node.parentId) return doc; // корень не переставляем
  const siblings = doc.nodes.filter((n) => n.parentId === node.parentId);
  const sibIdx = siblings.findIndex((n) => n.id === id);
  const target = siblings[sibIdx + dir];
  if (!target) return doc; // край списка — ноп
  const aIdx = doc.nodes.findIndex((n) => n.id === id);
  const bIdx = doc.nodes.findIndex((n) => n.id === target.id);
  const nodes = [...doc.nodes];
  [nodes[aIdx], nodes[bIdx]] = [nodes[bIdx], nodes[aIdx]];
  return replaceNodes(doc, nodes);
}

/** Переносит узел под нового родителя. Защита от циклов и переноса корня. */
export function moveNode(doc: MindMapDoc, id: string, newParentId: string): MindMapDoc {
  const node = getNode(doc, id);
  if (!node || !node.parentId) return doc; // корень не двигаем
  if (id === newParentId) return doc;
  if (!getNode(doc, newParentId)) return doc;
  if (node.parentId === newParentId) return doc;
  // нельзя перенести узел в собственное поддерево
  if (descendantIds(doc, id).includes(newParentId)) return doc;
  return replaceNodes(
    doc,
    doc.nodes.map((n) => {
      if (n.id === id) return { ...n, parentId: newParentId };
      if (n.id === newParentId && n.collapsed) return { ...n, collapsed: false };
      return n;
    })
  );
}

/**
 * Повышает узел на уровень выше (как Shift+Tab в XMind-подобных редакторах).
 * Корень и дети корня не меняются.
 */
export function promoteNode(doc: MindMapDoc, id: string): MindMapDoc {
  const node = getNode(doc, id);
  if (!node?.parentId) return doc;
  const parent = getNode(doc, node.parentId);
  if (!parent?.parentId) return doc;
  const grandParentId = parent.parentId;
  const nodeIndex = doc.nodes.findIndex((n) => n.id === id);
  const parentIndex = doc.nodes.findIndex((n) => n.id === parent.id);
  if (nodeIndex < 0 || parentIndex < 0) return doc;

  const promoted = { ...node, parentId: grandParentId };
  const without = doc.nodes.filter((n) => n.id !== id);
  const insertAfterParent = without.findIndex((n) => n.id === parent.id) + 1;
  const nodes = [
    ...without.slice(0, insertAfterParent),
    promoted,
    ...without.slice(insertAfterParent)
  ];
  return replaceNodes(doc, nodes);
}

export function setLayout(doc: MindMapDoc, layout: MindMapLayout): MindMapDoc {
  return { ...doc, layout };
}

export function setTheme(doc: MindMapDoc, theme: string): MindMapDoc {
  if (doc.theme === theme) return doc;
  return { ...doc, theme };
}

const MAX_TAGS = 12;

/** Добавляет тег узлу: триммит, игнорирует пустые и дубликаты, ограничивает кол-во. */
export function addTag(doc: MindMapDoc, id: string, raw: string): MindMapDoc {
  const tag = raw.trim();
  if (!tag) return doc;
  const node = getNode(doc, id);
  if (!node) return doc;
  const tags = node.tags ?? [];
  if (tags.includes(tag) || tags.length >= MAX_TAGS) return doc;
  return updateNode(doc, id, { tags: [...tags, tag] });
}

export function removeTag(doc: MindMapDoc, id: string, tag: string): MindMapDoc {
  const node = getNode(doc, id);
  if (!node || !node.tags?.includes(tag)) return doc;
  return updateNode(doc, id, { tags: node.tags.filter((t) => t !== tag) });
}

/** Раскрывает всех предков узла (чтобы он стал видимым). Иммутабельно. */
export function expandTo(doc: MindMapDoc, id: string): MindMapDoc {
  const ancestors = new Set<string>();
  let cur = getNode(doc, id);
  while (cur && cur.parentId) {
    ancestors.add(cur.parentId);
    cur = getNode(doc, cur.parentId);
  }
  if (ancestors.size === 0) return doc;
  let changed = false;
  const nodes = doc.nodes.map((n) => {
    if (ancestors.has(n.id) && n.collapsed) {
      changed = true;
      return { ...n, collapsed: false };
    }
    return n;
  });
  return changed ? replaceNodes(doc, nodes) : doc;
}

/** Узлы, видимые на холсте (не под свёрнутым предком). */
export function visibleNodes(doc: MindMapDoc): MindMapNode[] {
  const hidden = new Set<string>();
  const children = childIndex(doc);
  const hideChildren = (parent: string): void => {
    for (const child of children.get(parent) ?? []) {
      hidden.add(child.id);
      hideChildren(child.id);
    }
  };
  for (const n of doc.nodes) {
    if (n.collapsed) {
      hideChildren(n.id);
    }
  }
  return doc.nodes.filter((n) => !hidden.has(n.id));
}
