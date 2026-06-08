import { describe, it, expect } from 'vitest';
import type { MindMapDoc } from '@swit/shared';
import { toMarkdown, toOpml, toSvg } from './exporters';
import { getTheme } from './themes';

// root «Идея» → a «Цели» (done, tag x, note) → a1 «Шаг & план»
function doc(): MindMapDoc {
  return {
    rootId: 'root',
    layout: 'right',
    nodes: [
      { id: 'root', parentId: null, text: 'Идея' },
      { id: 'a', parentId: 'root', text: 'Цели', done: true, tags: ['x'], note: 'важно' },
      { id: 'a1', parentId: 'a', text: 'Шаг & план' }
    ]
  };
}

describe('toMarkdown', () => {
  const md = toMarkdown(doc(), 'Моя карта');
  it('начинается с заголовка карты', () => {
    expect(md.startsWith('# Моя карта')).toBe(true);
  });
  it('содержит корень и вложенные узлы', () => {
    expect(md).toContain('- Идея');
    expect(md).toContain('Цели');
    expect(md).toContain('Шаг & план');
  });
  it('зачёркивает выполненные, выводит теги и заметку', () => {
    expect(md).toContain('~~Цели~~');
    expect(md).toContain('#x');
    expect(md).toContain('_важно_');
  });
});

describe('toOpml', () => {
  const opml = toOpml(doc(), 'Моя карта');
  it('валидная XML-обёртка OPML', () => {
    expect(opml).toContain('<?xml version="1.0"');
    expect(opml).toContain('<opml version="2.0">');
    expect(opml).toContain('text="Идея"');
  });
  it('экранирует спецсимволы', () => {
    expect(opml).toContain('Шаг &amp; план');
    expect(opml).not.toContain('Шаг & план');
  });
  it('заметка идёт в атрибут', () => {
    expect(opml).toContain('_note="важно"');
  });
});

describe('toSvg', () => {
  const svg = toSvg(doc(), getTheme('aurora'));
  it('возвращает корректный svg c viewBox', () => {
    expect(svg).toContain('<svg');
    expect(svg).toContain('viewBox=');
  });
  it('рисует текст узлов (экранированный)', () => {
    expect(svg).toContain('Идея');
    expect(svg).toContain('Шаг &amp; план');
  });
  it('пустую (нулевую) карту не роняет', () => {
    const empty: MindMapDoc = { rootId: 'r', layout: 'right', nodes: [] };
    expect(toSvg(empty, getTheme())).toContain('<svg');
  });
});
