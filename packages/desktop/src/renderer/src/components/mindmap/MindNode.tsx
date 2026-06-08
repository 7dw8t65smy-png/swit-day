import { memo, useEffect, useRef, useState } from 'react';
import { Handle, Position, type NodeProps } from '@xyflow/react';
import { ChevronRight, Flag, FileText, Check } from 'lucide-react';
import type { MindMapPriority } from '@swit/shared';
import { useMindMap } from '../../lib/mindmap/store';

export const PRIORITY_COLOR: Record<MindMapPriority, string> = {
  high: '#DC2626',
  medium: '#EA580C',
  low: '#0891B2'
};

export interface MindNodeData {
  nodeId: string;
  label: string;
  color: string;
  emoji?: string | null;
  isRoot: boolean;
  depth: number;
  collapsed?: boolean;
  hasChildren: boolean;
  childCount: number;
  horizontal: boolean;
  editing: boolean;
  priority?: MindMapPriority | null;
  done?: boolean;
  tags?: string[];
  hasNote?: boolean;
  [key: string]: unknown;
}

// Презентационная нода БЕЗ подписок на стор — действия дёргаем через getState().
// Это убирает 4×N подписок и лишние перерисовки при любом изменении стора.
function MindNode({ data, selected }: NodeProps): JSX.Element {
  const d = data as MindNodeData;
  const [draft, setDraft] = useState(d.label);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (d.editing) {
      setDraft(d.label);
      requestAnimationFrame(() => {
        inputRef.current?.focus();
        inputRef.current?.select();
      });
    }
  }, [d.editing, d.label]);

  function commit(): void {
    const text = draft.trim();
    useMindMap.getState().patchNode(d.nodeId, { text: text.length ? text : 'Без названия' });
    useMindMap.getState().setEditing(null);
  }

  const tint = `${d.color}1a`;
  const sourceSide = d.horizontal ? Position.Right : Position.Bottom;
  const targetSide = d.horizontal ? Position.Left : Position.Top;
  const tags = d.tags ?? [];
  const hasMeta = tags.length > 0 || d.hasNote;

  return (
    <div
      className={[
        'mind-node group',
        d.isRoot ? 'mind-node--root' : '',
        selected ? 'mind-node--selected' : '',
        d.done ? 'mind-node--done' : ''
      ].join(' ')}
      style={{
        ['--branch' as string]: d.color,
        background: d.isRoot ? d.color : 'var(--color-surface)',
        borderColor: selected ? d.color : 'var(--color-border)',
        boxShadow: selected ? `0 0 0 2px ${d.color}55, 0 8px 24px -12px ${d.color}aa` : undefined
      }}
    >
      <Handle type="target" position={targetSide} className="mind-handle" />

      {!d.isRoot && <span className="mind-node__bar" style={{ background: d.color }} aria-hidden />}

      <div className="mind-node__body">
        <div className="mind-node__main">
          {d.done && !d.isRoot ? (
            <span className="mind-node__check" aria-label="Выполнено">
              <Check size={12} strokeWidth={3} />
            </span>
          ) : null}

          {d.priority && !d.isRoot ? (
            <Flag
              size={13}
              className="mind-node__flag"
              style={{ color: PRIORITY_COLOR[d.priority] }}
              aria-label={`Приоритет: ${d.priority}`}
            />
          ) : null}

          {d.emoji ? <span className="mind-node__emoji">{d.emoji}</span> : null}

          {d.editing ? (
            <textarea
              ref={inputRef}
              className="mind-node__input"
              value={draft}
              rows={1}
              onChange={(e) => setDraft(e.target.value)}
              onBlur={commit}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  commit();
                } else if (e.key === 'Escape') {
                  e.preventDefault();
                  useMindMap.getState().setEditing(null);
                }
                e.stopPropagation();
              }}
            />
          ) : (
            <span
              className="mind-node__label"
              style={{ color: d.isRoot ? '#fff' : 'var(--color-text)' }}
            >
              {d.label || 'Без названия'}
            </span>
          )}
        </div>

        {hasMeta ? (
          <div className="mind-node__meta">
            {tags.map((t) => (
              <span key={t} className="mind-node__tag" style={{ borderColor: `${d.color}55` }}>
                {t}
              </span>
            ))}
            {d.hasNote ? (
              <FileText size={12} className="mind-node__noteicon" aria-label="Есть заметка" />
            ) : null}
          </div>
        ) : null}
      </div>

      {!d.isRoot && <span className="mind-node__tint" style={{ background: tint }} aria-hidden />}

      {d.hasChildren && (
        <button
          type="button"
          className="mind-node__toggle"
          title={d.collapsed ? 'Развернуть' : 'Свернуть'}
          style={{ color: d.isRoot ? '#fff' : d.color }}
          onClick={(e) => {
            e.stopPropagation();
            useMindMap.getState().toggleCollapse(d.nodeId);
          }}
        >
          {d.collapsed ? (
            <span className="mind-node__count">{d.childCount}</span>
          ) : (
            <ChevronRight size={14} className="mind-node__chev" />
          )}
        </button>
      )}

      <Handle type="source" position={sourceSide} className="mind-handle" />
    </div>
  );
}

function sameTags(a?: string[], b?: string[]): boolean {
  if (a === b) return true;
  if (!a || !b || a.length !== b.length) return false;
  return a.every((t, i) => t === b[i]);
}

// Перерисовываем узел только когда реально поменялись его поля/выделение —
// при кликах/правке других узлов этот не трогаем.
export default memo(MindNode, (a, b) => {
  const da = a.data as MindNodeData;
  const db = b.data as MindNodeData;
  return (
    a.selected === b.selected &&
    da.label === db.label &&
    da.color === db.color &&
    da.emoji === db.emoji &&
    da.isRoot === db.isRoot &&
    da.collapsed === db.collapsed &&
    da.hasChildren === db.hasChildren &&
    da.childCount === db.childCount &&
    da.horizontal === db.horizontal &&
    da.editing === db.editing &&
    da.priority === db.priority &&
    da.done === db.done &&
    da.hasNote === db.hasNote &&
    sameTags(da.tags, db.tags)
  );
});
