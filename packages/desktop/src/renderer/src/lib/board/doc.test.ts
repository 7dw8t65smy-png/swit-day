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
  normalizeBoardDoc
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
  it('updateStyle мёржит стиль, не затирая остальное', () => {
    const doc = withTwo();
    const next = updateStyle(doc, 'a', { fill: '#000000' });
    const el = next.elements.find((e) => e.id === 'a')!;
    expect(el.style?.fill).toBe('#000000');
    expect(el.style?.fontSize).toBeGreaterThan(0); // прежний fontSize сохранён
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
});
