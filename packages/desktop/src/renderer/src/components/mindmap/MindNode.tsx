import { useEffect, useRef, useState } from 'react';
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
  [key: string]: unknown;
}

export default function MindNode({ data, selected }: NodeProps) {
  const d = data as MindNodeData;
  const editing = useMindMap((s) => s.editingId === d.nodeId);
  const setEditing = useMindMap((s) => s.setEditing);
  const patchNode = useMindMap((s) => s.patchNode);
  const toggleCollapse = useMindMap((s) => s.toggleCollapse);

  const [draft, setDraft] = useState(d.label);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (editing) {
      setDraft(d.label);
      requestAnimationFrame(() => {
        inputRef.current?.focus();
        inputRef.current?.select();
      });
    }
  }, [editing, d.label]);

  function commit(): void {
    const text = draft.trim();
    patchNode(d.nodeId, { text: text.length ? text : 'Без названия' });
    setEditing(null);
  }

  const tint = `${d.color}1a`; // ~10% alpha
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

      {editing ? (
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
              setEditing(null);
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
            toggleCollapse(d.nodeId);
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
