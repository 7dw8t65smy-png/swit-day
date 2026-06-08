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
  removeTag
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
  it('не переносит в собственное поддерево (защита от цикла)', () => {
    const next = moveNode(tree(), 'a', 'a1');
    expect(next.nodes.find((n) => n.id === 'a')?.parentId).toBe('root'); // без изменений
  });
  it('корень не двигается', () => {
    const next = moveNode(tree(), 'root', 'a');
    expect(next.nodes.find((n) => n.id === 'root')?.parentId).toBeNull();
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
