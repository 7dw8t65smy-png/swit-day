import { describe, it, expect } from 'vitest';
import type { BoardDoc } from '@swit/shared';
import {
  createBlankBoard,
  defaultElement,
  addElement,
  updateElement,
  updateStyle,
  resizeElement,
  removeElements,
  bringToFront,
  sendToBack,
  normalizeBoardDoc,
  addConnector,
  group,
  ungroup,
  groupMembers,
  alignElements,
  distributeElements
} from './doc';

function withTwo(): BoardDoc {
  let doc = createBlankBoard();
  doc = addElement(doc, defaultElement('sticker', 'a', 0, 0));
  doc = addElement(doc, defaultElement('card', 'b', 300, 0));
  return doc;
}

describe('createBlankBoard / defaultElement', () => {
  it('пустая доска без элементов', () => {
    expect(createBlankBoard().elements).toHaveLength(0);
  });
  it('дефолтный стикер имеет размер и цвет', () => {
    const el = defaultElement('sticker', 'x', 10, 20);
    expect(el).toMatchObject({ id: 'x', type: 'sticker', x: 10, y: 20 });
    expect(el.width).toBeGreaterThan(0);
    expect(el.style?.fill).toMatch(/^#/);
  });
});

describe('addElement (иммутабельность + zIndex)', () => {
  it('добавляет поверх (zIndex растёт) и не мутирует исходный', () => {
    const doc = createBlankBoard();
    const next = addElement(doc, defaultElement('sticker', 'a', 0, 0));
    const next2 = addElement(next, defaultElement('sticker', 'b', 0, 0));
    expect(doc.elements).toHaveLength(0);
    expect(next2.elements.find((e) => e.id === 'b')!.zIndex).toBeGreaterThan(
      next2.elements.find((e) => e.id === 'a')!.zIndex
    );
  });
});

describe('updateElement / updateStyle', () => {
  it('updateElement иммутабельно меняет поля', () => {
    const doc = withTwo();
    const next = updateElement(doc, 'a', { x: 99 });
    expect(next.elements.find((e) => e.id === 'a')!.x).toBe(99);
    expect(doc.elements.find((e) => e.id === 'a')!.x).toBe(0);
  });
  it('updateElement возвращает тот же объект, если ничего не изменилось', () => {
    const doc = withTwo();
    expect(updateElement(doc, 'a', { x: 0 })).toBe(doc);
    expect(updateElement(doc, 'ghost', { x: 1 })).toBe(doc);
  });
  it('updateStyle мёржит стиль, не затирая остальное', () => {
    const doc = withTwo();
    const next = updateStyle(doc, 'a', { fill: '#000000' });
    const el = next.elements.find((e) => e.id === 'a')!;
    expect(el.style?.fill).toBe('#000000');
    expect(el.style?.fontSize).toBeGreaterThan(0); // прежний fontSize сохранён
  });
  it('updateStyle возвращает тот же объект для пустого изменения', () => {
    const doc = withTwo();
    const fill = doc.elements.find((e) => e.id === 'a')?.style?.fill;
    expect(updateStyle(doc, 'a', { fill })).toBe(doc);
  });
});

describe('resizeElement', () => {
  it('клампит минимальные размеры', () => {
    const doc = withTwo();
    const next = resizeElement(doc, 'a', { x: 0, y: 0, width: 5, height: 5 });
    const el = next.elements.find((e) => e.id === 'a')!;
    expect(el.width).toBeGreaterThanOrEqual(40);
    expect(el.height).toBeGreaterThanOrEqual(28);
  });
  it('не создаёт новую историю, если resize не меняет прямоугольник', () => {
    const doc = withTwo();
    const a = doc.elements.find((e) => e.id === 'a')!;
    expect(resizeElement(doc, 'a', a)).toBe(doc);
  });
});

describe('removeElements', () => {
  it('удаляет по списку id', () => {
    const next = removeElements(withTwo(), ['a']);
    expect(next.elements.map((e) => e.id)).toEqual(['b']);
  });
  it('пустой список — ноп (тот же объект)', () => {
    const doc = withTwo();
    expect(removeElements(doc, [])).toBe(doc);
  });
});

describe('bringToFront / sendToBack', () => {
  it('bringToFront поднимает над всеми', () => {
    const doc = withTwo(); // b выше a
    const next = bringToFront(doc, ['a']);
    const a = next.elements.find((e) => e.id === 'a')!;
    const b = next.elements.find((e) => e.id === 'b')!;
    expect(a.zIndex).toBeGreaterThan(b.zIndex);
  });
  it('sendToBack опускает ниже всех', () => {
    const doc = withTwo();
    const next = sendToBack(doc, ['b']);
    const a = next.elements.find((e) => e.id === 'a')!;
    const b = next.elements.find((e) => e.id === 'b')!;
    expect(b.zIndex).toBeLessThan(a.zIndex);
  });
  it('не трогает документ, если выбранных элементов нет', () => {
    const doc = withTwo();
    expect(bringToFront(doc, ['ghost'])).toBe(doc);
    expect(sendToBack(doc, ['ghost'])).toBe(doc);
  });
});

describe('normalizeBoardDoc', () => {
  it('пустое/мусорное → пустая доска', () => {
    expect(normalizeBoardDoc(null).elements).toHaveLength(0);
    expect(normalizeBoardDoc({ elements: 'nope' }).elements).toHaveLength(0);
  });
  it('отбрасывает элементы без id и дубли, подставляет дефолты', () => {
    const doc = normalizeBoardDoc({
      elements: [
        { id: 'ok', type: 'sticker', x: 1, y: 2 },
        { id: 'ok', type: 'card' }, // дубль id
        { type: 'text' }, // нет id
        { id: 'bad', type: 'unknown-type', width: -10 }
      ]
    });
    expect(doc.elements.map((e) => e.id)).toEqual(['ok', 'bad']);
    const bad = doc.elements.find((e) => e.id === 'bad')!;
    expect(bad.type).toBe('sticker'); // неизвестный тип → дефолт
    expect(bad.width).toBeGreaterThanOrEqual(40); // отрицательная ширина исправлена
  });
  it('выбрасывает коннектор с несуществующими концами', () => {
    const doc = normalizeBoardDoc({
      elements: [
        { id: 'a', type: 'sticker' },
        { id: 'c', type: 'connector', from: 'a', to: 'ghost' }
      ]
    });
    expect(doc.elements.map((e) => e.id)).toEqual(['a']);
  });
  it('чистит точки свободного рисунка от мусора и нечётного хвоста', () => {
    const doc = normalizeBoardDoc({
      elements: [
        {
          id: 'd',
          type: 'draw',
          points: [0, 0, Number.NaN, 0.5, 1, 1, 2]
        }
      ]
    });
    expect(doc.elements[0].points).toEqual([0, 0, 1, 1]);
  });
});

describe('addConnector', () => {
  it('создаёт коннектор между двумя элементами', () => {
    const next = addConnector(withTwo(), { id: 'c1', from: 'a', to: 'b' });
    const c = next.elements.find((e) => e.id === 'c1');
    expect(c?.type).toBe('connector');
    expect(c).toMatchObject({ from: 'a', to: 'b' });
  });
  it('отвергает петлю, несуществующие концы и дубли', () => {
    const base = addConnector(withTwo(), { id: 'c1', from: 'a', to: 'b' });
    expect(addConnector(withTwo(), { id: 'x', from: 'a', to: 'a' })).toEqual(withTwo()); // петля
    expect(addConnector(withTwo(), { id: 'x', from: 'a', to: 'ghost' })).toEqual(withTwo()); // нет цели
    expect(addConnector(base, { id: 'x', from: 'a', to: 'b' })).toBe(base); // дубль a→b
  });
});

describe('removeElements убирает зависшие коннекторы', () => {
  it('удаление элемента сносит связанные с ним коннекторы', () => {
    const withConn = addConnector(withTwo(), { id: 'c1', from: 'a', to: 'b' });
    const next = removeElements(withConn, ['a']);
    expect(next.elements.map((e) => e.id).sort()).toEqual(['b']);
  });
});

describe('group / ungroup / groupMembers', () => {
  it('группирует выбранные и находит участников', () => {
    const g = group(withTwo(), ['a', 'b'], 'g1');
    expect(groupMembers(g, 'a').sort()).toEqual(['a', 'b']);
    const u = ungroup(g, ['a']);
    expect(groupMembers(u, 'b')).toEqual(['b']);
  });
  it('меньше двух элементов — не группирует', () => {
    const doc = withTwo();
    expect(group(doc, ['a'], 'g1')).toBe(doc);
  });
  it('несуществующие элементы не создают пустую группу', () => {
    const doc = withTwo();
    expect(group(doc, ['a', 'ghost'], 'g1')).toBe(doc);
    expect(ungroup(doc, ['a'])).toBe(doc);
  });
});

describe('alignElements / distributeElements', () => {
  function three(): import('@swit/shared').BoardDoc {
    let d = createBlankBoard();
    d = addElement(d, { ...defaultElement('sticker', 'a', 0, 0), width: 100, height: 100 });
    d = addElement(d, { ...defaultElement('sticker', 'b', 200, 50), width: 100, height: 100 });
    d = addElement(d, { ...defaultElement('sticker', 'c', 500, 80), width: 100, height: 100 });
    return d;
  }
  it('align left ставит всем одинаковый x (минимальный)', () => {
    const next = alignElements(three(), ['a', 'b', 'c'], 'left');
    expect(next.elements.map((e) => e.x)).toEqual([0, 0, 0]);
  });
  it('distribute h даёт равные промежутки между краями', () => {
    const next = distributeElements(three(), ['a', 'b', 'c'], 'h');
    const byId = Object.fromEntries(next.elements.map((e) => [e.id, e]));
    // первый и последний на месте, средний — посередине промежутка
    expect(byId.a.x).toBe(0);
    expect(byId.c.x).toBe(500);
    const gap1 = byId.b.x - (byId.a.x + byId.a.width);
    const gap2 = byId.c.x - (byId.b.x + byId.b.width);
    expect(Math.abs(gap1 - gap2)).toBeLessThanOrEqual(1);
  });
  it('меньше трёх — distribute не трогает', () => {
    const doc = withTwo();
    expect(distributeElements(doc, ['a', 'b'], 'h')).toBe(doc);
  });
  it('align не создаёт новый документ, если позиции уже совпадают', () => {
    const doc = alignElements(three(), ['a', 'b', 'c'], 'left');
    expect(alignElements(doc, ['a', 'b', 'c'], 'left')).toBe(doc);
  });
});
