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

  it('не создаёт фантомную позицию, если rootId отсутствует в nodes', () => {
    const pos = layoutMap(doc('right', [{ id: 'a', parentId: null, text: 'A' }]));
    expect(pos).toEqual({});
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

describe('layoutMap — ручные позиции (fx/fy)', () => {
  it('узел с fx/fy встаёт в заданную точку', () => {
    const pos = layoutMap(
      doc('right', [
        { id: 'root', parentId: null, text: 'R' },
        { id: 'a', parentId: 'root', text: 'A', fx: 500, fy: 200 }
      ])
    );
    expect(pos.a).toEqual({ x: 500, y: 200 });
  });

  it('поддерево сдвигается вместе с вручную перемещённым узлом', () => {
    // авто: a=(LEVEL_GAP,0), a1=(2*LEVEL_GAP,0). Двигаем a в (0,300) →
    // дельта (-LEVEL_GAP,300) применяется и к потомку a1.
    const pos = layoutMap(
      doc('right', [
        { id: 'root', parentId: null, text: 'R' },
        { id: 'a', parentId: 'root', text: 'A', fx: 0, fy: 300 },
        { id: 'a1', parentId: 'a', text: 'A1' }
      ])
    );
    expect(pos.a).toEqual({ x: 0, y: 300 });
    expect(pos.a1).toEqual({ x: LEVEL_GAP, y: 300 });
  });

  it('без ручных позиций авто-раскладка не смещается', () => {
    const pos = layoutMap(
      doc('right', [
        { id: 'root', parentId: null, text: 'R' },
        { id: 'a', parentId: 'root', text: 'A' }
      ])
    );
    expect(pos.a).toEqual({ x: LEVEL_GAP, y: 0 });
  });
});
