import { memo, useEffect, useRef, useState } from 'react';
import { Handle, Position, type NodeProps } from '@xyflow/react';
import { ChevronRight } from 'lucide-react';
import { useMindMap } from '../../lib/mindmap/store';

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

  return (
    <div
      className={[
        'mind-node group',
        d.isRoot ? 'mind-node--root' : '',
        selected ? 'mind-node--selected' : ''
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
        <span className="mind-node__label" style={{ color: d.isRoot ? '#fff' : 'var(--color-text)' }}>
          {d.label || 'Без названия'}
        </span>
      )}

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
    da.editing === db.editing
  );
});
