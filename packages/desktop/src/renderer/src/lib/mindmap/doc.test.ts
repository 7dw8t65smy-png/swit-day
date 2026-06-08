import { describe, it, expect } from 'vitest';
import type { MindMapDoc } from '@swit/shared';
import {
  createBlankDoc,
  getChildren,
  descendantIds,
  depthOf,
  addChild,
  addSibling,
  deleteNode,
  updateNode,
  toggleCollapse,
  moveNode,
  visibleNodes,
  setTheme,
  addTag,
  removeTag,
  reorderSibling,
  expandTo,
  normalizeMindMapDoc,
  promoteNode
} from './doc';

// Дерево:  root → a → a1
//                └ b
function tree(): MindMapDoc {
  return {
    rootId: 'root',
    layout: 'right',
    nodes: [
      { id: 'root', parentId: null, text: 'R' },
      { id: 'a', parentId: 'root', text: 'A' },
      { id: 'a1', parentId: 'a', text: 'A1' },
      { id: 'b', parentId: 'root', text: 'B' }
    ]
  };
}

describe('createBlankDoc', () => {
  it('создаёт документ с единственным корнем', () => {
    const doc = createBlankDoc('r', 'Идея');
    expect(doc.nodes).toHaveLength(1);
    expect(doc.nodes[0]).toMatchObject({ id: 'r', parentId: null, text: 'Идея' });
    expect(doc.rootId).toBe('r');
    expect(doc.layout).toBe('right');
  });
});

describe('normalizeMindMapDoc', () => {
  it('создаёт безопасную пустую карту для невалидного значения', () => {
    const doc = normalizeMindMapDoc(null, 'fallback');
    expect(doc.rootId).toBe('fallback');
    expect(doc.nodes).toEqual([{ id: 'fallback', parentId: null, text: 'Центральная идея' }]);
  });

  it('переподвешивает узлы с битым parentId к корню', () => {
    const doc = normalizeMindMapDoc({
      rootId: 'root',
      layout: 'right',
      nodes: [
        { id: 'root', parentId: null, text: 'R' },
        { id: 'orphan', parentId: 'missing', text: 'Lost' }
      ]
    });

    expect(doc.nodes.find((n) => n.id === 'orphan')?.parentId).toBe('root');
  });

  it('разрывает циклы в parentId', () => {
    const doc = normalizeMindMapDoc({
      rootId: 'root',
      layout: 'right',
      nodes: [
        { id: 'root', parentId: null, text: 'R' },
        { id: 'a', parentId: 'b', text: 'A' },
        { id: 'b', parentId: 'a', text: 'B' }
      ]
    });

    expect(doc.nodes.find((n) => n.id === 'a')?.parentId).toBe('root');
  });

  it('возвращает раскладку right, если сохранённое значение неизвестно', () => {
    const doc = normalizeMindMapDoc({
      rootId: 'root',
      layout: 'diagonal',
      nodes: [{ id: 'root', parentId: null, text: 'R' }]
    });

    expect(doc.layout).toBe('right');
  });
});

describe('навигация по дереву', () => {
  it('getChildren возвращает прямых детей', () => {
    expect(getChildren(tree(), 'root').map((n) => n.id)).toEqual(['a', 'b']);
  });
  it('descendantIds возвращает всё поддерево', () => {
    expect(descendantIds(tree(), 'root').sort()).toEqual(['a', 'a1', 'b']);
    expect(descendantIds(tree(), 'a')).toEqual(['a1']);
  });
  it('depthOf считает глубину от корня', () => {
    expect(depthOf(tree(), 'root')).toBe(0);
    expect(depthOf(tree(), 'a')).toBe(1);
    expect(depthOf(tree(), 'a1')).toBe(2);
  });
});

describe('addChild / addSibling (иммутабельность)', () => {
  it('addChild добавляет дочерний и не мутирует исходный', () => {
    const doc = tree();
    const next = addChild(doc, 'a', 'a2', 'A2');
    expect(doc.nodes).toHaveLength(4); // исходный не тронут
    expect(getChildren(next, 'a').map((n) => n.id)).toEqual(['a1', 'a2']);
  });
  it('addChild раскрывает свёрнутого родителя', () => {
    const doc = updateNode(tree(), 'a', { collapsed: true });
    const next = addChild(doc, 'a', 'a2');
    expect(next.nodes.find((n) => n.id === 'a')?.collapsed).toBe(false);
  });
  it('addSibling добавляет под того же родителя', () => {
    const next = addSibling(tree(), 'a', 'c');
    expect(getChildren(next, 'root').map((n) => n.id)).toEqual(['a', 'b', 'c']);
  });
  it('addSibling у корня добавляет дочерний (у корня нет соседа)', () => {
    const next = addSibling(tree(), 'root', 'c');
    expect(next.nodes.find((n) => n.id === 'c')?.parentId).toBe('root');
  });
});

describe('deleteNode', () => {
  it('удаляет узел вместе с поддеревом', () => {
    const next = deleteNode(tree(), 'a');
    expect(next.nodes.map((n) => n.id).sort()).toEqual(['b', 'root']);
  });
  it('корень удалить нельзя', () => {
    expect(deleteNode(tree(), 'root').nodes).toHaveLength(4);
  });
});

describe('updateNode / toggleCollapse', () => {
  it('updateNode иммутабельно меняет поля', () => {
    const doc = tree();
    const next = updateNode(doc, 'a', { text: 'AA', color: '#fff' });
    expect(next.nodes.find((n) => n.id === 'a')).toMatchObject({ text: 'AA', color: '#fff' });
    expect(doc.nodes.find((n) => n.id === 'a')?.text).toBe('A'); // не мутирован
  });
  it('updateNode возвращает тот же объект, если значения не изменились', () => {
    const doc = tree();
    expect(updateNode(doc, 'a', { text: 'A' })).toBe(doc);
  });
  it('toggleCollapse сворачивает узел с детьми', () => {
    expect(toggleCollapse(tree(), 'a').nodes.find((n) => n.id === 'a')?.collapsed).toBe(true);
  });
  it('toggleCollapse игнорирует лист без детей', () => {
    expect(
      toggleCollapse(tree(), 'a1').nodes.find((n) => n.id === 'a1')?.collapsed
    ).toBeUndefined();
  });
});

describe('moveNode', () => {
  it('переносит узел под нового родителя', () => {
    const next = moveNode(tree(), 'a1', 'b');
    expect(next.nodes.find((n) => n.id === 'a1')?.parentId).toBe('b');
  });
  it('не переносит узел под того же родителя', () => {
    const doc = tree();
    expect(moveNode(doc, 'a1', 'a')).toBe(doc);
  });
  it('раскрывает нового родителя при переносе', () => {
    const doc = updateNode(tree(), 'b', { collapsed: true });
    const next = moveNode(doc, 'a1', 'b');
    expect(next.nodes.find((n) => n.id === 'b')?.collapsed).toBe(false);
  });
  it('не переносит в собственное поддерево (защита от цикла)', () => {
    const next = moveNode(tree(), 'a', 'a1');
    expect(next.nodes.find((n) => n.id === 'a')?.parentId).toBe('root'); // без изменений
  });
  it('корень не двигается', () => {
    const next = moveNode(tree(), 'root', 'a');
    expect(next.nodes.find((n) => n.id === 'root')?.parentId).toBeNull();
  });
});

describe('promoteNode', () => {
  it('поднимает узел на уровень выше', () => {
    const next = promoteNode(tree(), 'a1');
    expect(next.nodes.find((n) => n.id === 'a1')?.parentId).toBe('root');
    expect(getChildren(next, 'root').map((n) => n.id)).toEqual(['a', 'a1', 'b']);
  });

  it('не трогает корень и детей корня', () => {
    const doc = tree();
    expect(promoteNode(doc, 'root')).toBe(doc);
    expect(promoteNode(doc, 'a')).toBe(doc);
  });
});

describe('visibleNodes', () => {
  it('скрывает потомков свёрнутого узла', () => {
    const doc = updateNode(tree(), 'a', { collapsed: true });
    expect(
      visibleNodes(doc)
        .map((n) => n.id)
        .sort()
    ).toEqual(['a', 'b', 'root']);
  });
  it('показывает всё, когда ничего не свёрнуто', () => {
    expect(visibleNodes(tree())).toHaveLength(4);
  });
});

describe('setTheme', () => {
  it('иммутабельно задаёт тему', () => {
    const doc = tree();
    const next = setTheme(doc, 'aurora');
    expect(next.theme).toBe('aurora');
    expect(doc.theme).toBeUndefined();
  });
  it('возвращает тот же объект, если тема не изменилась (ноп)', () => {
    const doc = setTheme(tree(), 'aurora');
    expect(setTheme(doc, 'aurora')).toBe(doc);
  });
});

describe('addTag / removeTag', () => {
  it('addTag добавляет тег и триммит пробелы', () => {
    const next = addTag(tree(), 'a', '  срочно ');
    expect(next.nodes.find((n) => n.id === 'a')?.tags).toEqual(['срочно']);
  });
  it('addTag игнорирует пустые и дубликаты', () => {
    const once = addTag(tree(), 'a', 'x');
    expect(addTag(once, 'a', 'x')).toBe(once); // дубликат — ноп
    expect(addTag(tree(), 'a', '   ')).toEqual(tree()); // пустой — без изменений
  });
  it('addTag не мутирует исходный документ', () => {
    const doc = tree();
    addTag(doc, 'a', 'тег');
    expect(doc.nodes.find((n) => n.id === 'a')?.tags).toBeUndefined();
  });
  it('removeTag убирает тег', () => {
    const withTags = addTag(addTag(tree(), 'a', 'one'), 'a', 'two');
    const next = removeTag(withTags, 'a', 'one');
    expect(next.nodes.find((n) => n.id === 'a')?.tags).toEqual(['two']);
  });
  it('removeTag — ноп, если тега нет', () => {
    const doc = addTag(tree(), 'a', 'one');
    expect(removeTag(doc, 'a', 'missing')).toBe(doc);
  });
});

describe('reorderSibling', () => {
  it('двигает соседа вниз (порядок раскладки меняется)', () => {
    const next = reorderSibling(tree(), 'a', 1);
    expect(getChildren(next, 'root').map((n) => n.id)).toEqual(['b', 'a']);
  });
  it('двигает соседа вверх', () => {
    const down = reorderSibling(tree(), 'a', 1); // [b, a]
    const up = reorderSibling(down, 'a', -1); // обратно [a, b]
    expect(getChildren(up, 'root').map((n) => n.id)).toEqual(['a', 'b']);
  });
  it('на краю списка — ноп (возвращает тот же объект)', () => {
    const doc = tree();
    expect(reorderSibling(doc, 'a', -1)).toBe(doc); // 'a' уже первый
    expect(reorderSibling(doc, 'b', 1)).toBe(doc); // 'b' уже последний
  });
  it('корень не переставляется', () => {
    const doc = tree();
    expect(reorderSibling(doc, 'root', 1)).toBe(doc);
  });
  it('структура (parentId) сохраняется', () => {
    const next = reorderSibling(tree(), 'a', 1);
    expect(next.nodes.find((n) => n.id === 'a1')?.parentId).toBe('a');
  });
});

describe('expandTo', () => {
  it('раскрывает свёрнутого предка', () => {
    const collapsed = updateNode(tree(), 'a', { collapsed: true });
    const next = expandTo(collapsed, 'a1');
    expect(next.nodes.find((n) => n.id === 'a')?.collapsed).toBe(false);
  });
  it('ноп, если предки уже раскрыты', () => {
    const doc = tree();
    expect(expandTo(doc, 'a1')).toBe(doc);
  });
  it('ноп для корня', () => {
    const doc = tree();
    expect(expandTo(doc, 'root')).toBe(doc);
  });
});
