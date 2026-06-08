import { describe, it, expect } from 'vitest';
import type { MindMapDoc, MindMapLayout } from '@swit/shared';
import { updateNode } from './doc';
import { navTarget, findDropTarget } from './nav';
import { layoutMap } from './layout';

// Дерево:  root → a → a1
//                └ b
function tree(layout: MindMapLayout = 'right'): MindMapDoc {
  return {
    rootId: 'root',
    layout,
    nodes: [
      { id: 'root', parentId: null, text: 'R' },
      { id: 'a', parentId: 'root', text: 'A' },
      { id: 'a1', parentId: 'a', text: 'A1' },
      { id: 'b', parentId: 'root', text: 'B' }
    ]
  };
}

describe('navTarget — горизонтальная раскладка (right)', () => {
  it('к ребёнку (ArrowRight → первый ребёнок)', () => {
    expect(navTarget(tree(), 'root', 'ArrowRight')).toBe('a');
  });
  it('к родителю (ArrowLeft)', () => {
    expect(navTarget(tree(), 'a', 'ArrowLeft')).toBe('root');
  });
  it('между соседями (ArrowDown/ArrowUp)', () => {
    expect(navTarget(tree(), 'a', 'ArrowDown')).toBe('b');
    expect(navTarget(tree(), 'b', 'ArrowUp')).toBe('a');
  });
  it('нет соседа/родителя — null', () => {
    expect(navTarget(tree(), 'a1', 'ArrowDown')).toBeNull();
    expect(navTarget(tree(), 'root', 'ArrowLeft')).toBeNull();
  });
  it('свёрнутый узел не пускает к ребёнку', () => {
    const collapsed = updateNode(tree(), 'a', { collapsed: true });
    expect(navTarget(collapsed, 'a', 'ArrowRight')).toBeNull();
  });
});

describe('navTarget — раскладка left (зеркально)', () => {
  it('к ребёнку — ArrowLeft, к родителю — ArrowRight', () => {
    expect(navTarget(tree('left'), 'root', 'ArrowLeft')).toBe('a');
    expect(navTarget(tree('left'), 'a', 'ArrowRight')).toBe('root');
  });
});

describe('navTarget — раскладка tree (вертикальная)', () => {
  it('к ребёнку — ArrowDown, к родителю — ArrowUp', () => {
    expect(navTarget(tree('tree'), 'root', 'ArrowDown')).toBe('a');
    expect(navTarget(tree('tree'), 'a', 'ArrowUp')).toBe('root');
  });
  it('между соседями — ArrowLeft/ArrowRight', () => {
    expect(navTarget(tree('tree'), 'a', 'ArrowRight')).toBe('b');
    expect(navTarget(tree('tree'), 'b', 'ArrowLeft')).toBe('a');
  });
});

describe('findDropTarget', () => {
  it('возвращает узел под точкой дропа', () => {
    const doc = tree();
    const pos = layoutMap(doc);
    expect(findDropTarget(doc, 'a1', pos.b)).toBe('b');
  });
  it('исключает себя, поддерево и текущего родителя', () => {
    const doc = tree();
    const pos = layoutMap(doc);
    // a1 нельзя бросить на собственного родителя 'a'
    const r = findDropTarget(doc, 'a1', pos.a);
    expect(r).not.toBe('a');
    expect(r).not.toBe('a1');
  });
  it('узел нельзя бросить в собственное поддерево', () => {
    const doc = tree();
    const pos = layoutMap(doc);
    expect(findDropTarget(doc, 'a', pos.a1)).not.toBe('a1');
  });
  it('далеко от всех узлов — null', () => {
    const doc = tree();
    expect(findDropTarget(doc, 'a1', { x: 99999, y: 99999 })).toBeNull();
  });
  it('умеет искать цель по фактическим позициям после ручного drag', () => {
    const doc = tree();
    const pos = layoutMap(doc);
    const livePos = {
      ...pos,
      b: { x: 900, y: 900 }
    };

    expect(findDropTarget(doc, 'a1', livePos.b, 130, livePos)).toBe('b');
    expect(findDropTarget(doc, 'a1', pos.b, 130, livePos)).toBeNull();
  });
});
