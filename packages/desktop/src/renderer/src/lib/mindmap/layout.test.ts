import { describe, it, expect } from 'vitest';
import type { MindMapDoc, MindMapLayout } from '@swit/shared';
import { layoutMap, LEVEL_GAP, ROW_GAP } from './layout';

function doc(layout: MindMapLayout, nodes: MindMapDoc['nodes']): MindMapDoc {
  return { rootId: 'root', layout, nodes };
}

describe('layoutMap', () => {
  it('корень в начале координат', () => {
    const pos = layoutMap(doc('right', [{ id: 'root', parentId: null, text: 'R' }]));
    expect(pos.root).toEqual({ x: 0, y: 0 });
  });

  it('ребёнок справа на расстоянии LEVEL_GAP', () => {
    const pos = layoutMap(
      doc('right', [
        { id: 'root', parentId: null, text: 'R' },
        { id: 'a', parentId: 'root', text: 'A' }
      ])
    );
    expect(pos.a.x).toBe(LEVEL_GAP);
    expect(pos.a.y).toBe(0);
  });

  it('родитель центрируется между двумя детьми', () => {
    const pos = layoutMap(
      doc('right', [
        { id: 'root', parentId: null, text: 'R' },
        { id: 'a', parentId: 'root', text: 'A' },
        { id: 'b', parentId: 'root', text: 'B' }
      ])
    );
    expect(pos.a.y).toBe(0);
    expect(pos.b.y).toBe(ROW_GAP);
    expect(pos.root.y).toBe(ROW_GAP / 2); // ровно посередине
  });

  it('раскладка left уводит детей влево (отрицательный x)', () => {
    const pos = layoutMap(
      doc('left', [
        { id: 'root', parentId: null, text: 'R' },
        { id: 'a', parentId: 'root', text: 'A' }
      ])
    );
    expect(pos.a.x).toBe(-LEVEL_GAP);
  });

  it('свёрнутое поддерево не попадает в раскладку', () => {
    const pos = layoutMap(
      doc('right', [
        { id: 'root', parentId: null, text: 'R' },
        { id: 'a', parentId: 'root', text: 'A', collapsed: true },
        { id: 'a1', parentId: 'a', text: 'A1' }
      ])
    );
    expect(pos.a).toBeDefined();
    expect(pos.a1).toBeUndefined();
  });

  it('вертикальная раскладка tree разводит по оси Y', () => {
    const pos = layoutMap(
      doc('tree', [
        { id: 'root', parentId: null, text: 'R' },
        { id: 'a', parentId: 'root', text: 'A' }
      ])
    );
    expect(pos.root.y).toBe(0);
    expect(pos.a.y).toBeGreaterThan(0);
  });
});
