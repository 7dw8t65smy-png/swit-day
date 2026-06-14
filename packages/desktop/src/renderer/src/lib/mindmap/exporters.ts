import type { MindMapDoc, MindMapNode } from '@swit/shared';
import { getChildren, visibleNodes } from './doc';
import { layoutMap } from './layout';
import type { MindMapThemeDef } from './themes';

// Экспорт карты в Markdown, OPML и SVG. Чистые функции (без IO):
// принимают документ, возвращают строку. Файл сохраняет вызывающий код.

function escapeXml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function oneLine(s: string): string {
  return s.replace(/\s+/g, ' ').trim();
}

// Пропускаем только безопасные CSS-цвета в SVG-атрибуты, чтобы пользовательская
// строка цвета (узла/элемента) не могла «выйти» из атрибута и внедрить разметку
// в экспортируемый SVG. Невалидное значение → null (берётся цвет ветки/темы).
const SAFE_COLOR = /^(#[0-9a-fA-F]{3,8}|rgba?\([0-9.,%\s]+\)|hsla?\([0-9.,%\s]+\)|[a-zA-Z]{1,20})$/;
export function safeColor(value: string | null | undefined): string | null {
  if (typeof value !== 'string') return null;
  const v = value.trim();
  return v.length <= 32 && SAFE_COLOR.test(v) ? v : null;
}

// --- Markdown ---

export function toMarkdown(doc: MindMapDoc, title: string): string {
  const lines: string[] = [`# ${title.trim() || 'Карта'}`, ''];

  const walk = (node: MindMapNode, depth: number): void => {
    const indent = '  '.repeat(depth);
    const tags = node.tags?.length ? ' ' + node.tags.map((t) => `#${t}`).join(' ') : '';
    let label = (node.emoji ? `${node.emoji} ` : '') + (node.text || 'Без названия');
    if (node.done) label = `~~${label}~~`;
    lines.push(`${indent}- ${label}${tags}`);
    if (node.note?.trim()) {
      lines.push(`${'  '.repeat(depth + 1)}- _${oneLine(node.note)}_`);
    }
    for (const child of getChildren(doc, node.id)) walk(child, depth + 1);
  };

  const root = doc.nodes.find((n) => n.id === doc.rootId);
  if (root) walk(root, 0);
  return lines.join('\n') + '\n';
}

// --- OPML ---

export function toOpml(doc: MindMapDoc, title: string): string {
  const walk = (node: MindMapNode, depth: number): string => {
    const indent = '  '.repeat(depth + 2);
    const kids = getChildren(doc, node.id);
    const note = node.note?.trim() ? ` _note="${escapeXml(oneLine(node.note))}"` : '';
    const text = ` text="${escapeXml(node.text || 'Без названия')}"`;
    if (kids.length === 0) return `${indent}<outline${text}${note} />`;
    const inner = kids.map((k) => walk(k, depth + 1)).join('\n');
    return `${indent}<outline${text}${note}>\n${inner}\n${indent}</outline>`;
  };

  const root = doc.nodes.find((n) => n.id === doc.rootId);
  const body = root ? walk(root, 0) : '';
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<opml version="2.0">',
    '  <head>',
    `    <title>${escapeXml(title.trim() || 'Карта')}</title>`,
    '  </head>',
    '  <body>',
    body,
    '  </body>',
    '</opml>',
    ''
  ].join('\n');
}

// --- SVG ---

/** Цвет каждого видимого узла по правилам веток + темы (как на холсте). */
function resolveColors(doc: MindMapDoc, theme: MindMapThemeDef): Map<string, string> {
  const colors = new Map<string, string>();
  colors.set(doc.rootId, theme.rootColor);
  const walk = (node: MindMapNode, color: string): void => {
    colors.set(node.id, safeColor(node.color) ?? color);
    for (const child of getChildren(doc, node.id))
      walk(child, safeColor(child.color) ?? colors.get(node.id)!);
  };
  getChildren(doc, doc.rootId).forEach((c, i) => {
    walk(c, safeColor(c.color) ?? theme.branchColors[i % theme.branchColors.length]);
  });
  return colors;
}

const NODE_H = 36;
const CHAR_W = 7.4;
const PAD_X = 14;
const MARGIN = 40;

function nodeWidth(node: MindMapNode): number {
  const label = (node.emoji ? `${node.emoji} ` : '') + (node.text || 'Без названия');
  return Math.min(240, Math.max(56, label.length * CHAR_W + PAD_X * 2));
}

function fitText(node: MindMapNode, width: number): string {
  const label = (node.emoji ? `${node.emoji} ` : '') + (node.text || 'Без названия');
  const cap = Math.floor((width - PAD_X * 2) / CHAR_W);
  return label.length > cap ? label.slice(0, Math.max(1, cap - 1)) + '…' : label;
}

export function toSvg(doc: MindMapDoc, theme: MindMapThemeDef): string {
  const pos = layoutMap(doc);
  const visible = visibleNodes(doc);
  const colors = resolveColors(doc, theme);
  const horizontal = doc.layout !== 'tree';

  interface Box {
    x: number;
    y: number;
    w: number;
    node: MindMapNode;
  }
  const boxes = new Map<string, Box>();
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const n of visible) {
    const p = pos[n.id];
    if (!p) continue;
    const w = nodeWidth(n);
    const box: Box = { x: p.x - w / 2, y: p.y - NODE_H / 2, w, node: n };
    boxes.set(n.id, box);
    minX = Math.min(minX, box.x);
    minY = Math.min(minY, box.y);
    maxX = Math.max(maxX, box.x + w);
    maxY = Math.max(maxY, box.y + NODE_H);
  }
  if (!boxes.size) {
    return '<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100"></svg>';
  }

  const vw = maxX - minX + MARGIN * 2;
  const vh = maxY - minY + MARGIN * 2;
  const ox = -minX + MARGIN;
  const oy = -minY + MARGIN;

  const edges: string[] = [];
  for (const n of visible) {
    if (!n.parentId) continue;
    const p = pos[n.parentId];
    const c = pos[n.id];
    if (!p || !c || !boxes.has(n.parentId)) continue;
    const px = p.x + ox;
    const py = p.y + oy;
    const cx = c.x + ox;
    const cy = c.y + oy;
    const d = horizontal
      ? `M${px},${py} C${(px + cx) / 2},${py} ${(px + cx) / 2},${cy} ${cx},${cy}`
      : `M${px},${py} C${px},${(py + cy) / 2} ${cx},${(py + cy) / 2} ${cx},${cy}`;
    edges.push(
      `<path d="${d}" fill="none" stroke="${colors.get(n.id)}" stroke-width="2.5" stroke-linecap="round"/>`
    );
  }

  const rects: string[] = [];
  for (const [, box] of boxes) {
    const n = box.node;
    const color = colors.get(n.id) ?? theme.rootColor;
    const isRoot = n.id === doc.rootId;
    const x = box.x + ox;
    const y = box.y + oy;
    const cx = x + box.w / 2;
    const cy = y + NODE_H / 2 + 4.5;
    const fill = isRoot ? color : '#ffffff';
    const textColor = isRoot ? '#ffffff' : '#0f172a';
    const stroke = isRoot ? 'none' : color;
    rects.push(
      `<g>` +
        `<rect x="${x}" y="${y}" width="${box.w}" height="${NODE_H}" rx="11" fill="${fill}" stroke="${stroke}" stroke-width="1.5"/>` +
        `<text x="${cx}" y="${cy}" text-anchor="middle" font-family="-apple-system, Segoe UI, sans-serif" font-size="13.5" font-weight="${isRoot ? 700 : 500}" fill="${textColor}">${escapeXml(fitText(n, box.w))}</text>` +
        `</g>`
    );
  }

  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${Math.round(vw)}" height="${Math.round(vh)}" viewBox="0 0 ${Math.round(vw)} ${Math.round(vh)}">`,
    `<rect width="100%" height="100%" fill="#ffffff"/>`,
    edges.join(''),
    rects.join(''),
    `</svg>`
  ].join('\n');
}
