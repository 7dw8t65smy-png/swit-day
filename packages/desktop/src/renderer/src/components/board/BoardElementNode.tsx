import { memo, useEffect, useRef, useState } from 'react';
import { NodeResizer, type NodeProps } from '@xyflow/react';
import type { BoardElementStyle, BoardElementType } from '@swit/shared';
import { useBoard } from '../../lib/board/store';

export interface BoardNodeData {
  elementId: string;
  type: BoardElementType;
  text: string;
  style: BoardElementStyle;
  editing: boolean;
  [key: string]: unknown;
}

const MIN_W = 40;
const MIN_H = 28;

// Презентационный узел доски: рисуется по типу/стилю, ресайзится через
// NodeResizer, текст правится по двойному клику. Действия — через getState().
function BoardElementNode({ data, selected }: NodeProps): JSX.Element {
  const d = data as BoardNodeData;
  const [draft, setDraft] = useState(d.text);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (d.editing) {
      setDraft(d.text);
      requestAnimationFrame(() => {
        inputRef.current?.focus();
        inputRef.current?.select();
      });
    }
  }, [d.editing, d.text]);

  function commit(): void {
    useBoard.getState().patchElement(d.elementId, { text: draft });
    useBoard.getState().setEditing(null);
  }

  const s = d.style ?? {};
  const isEllipse = d.type === 'shape' && s.shape === 'ellipse';
  const cls = ['board-el', `board-el--${d.type}`, selected ? 'board-el--selected' : ''].join(' ');

  const boxStyle: React.CSSProperties = {
    background: s.fill ?? 'transparent',
    color: s.color ?? 'var(--color-text)',
    border: s.border ? `1.5px solid ${s.border}` : d.type === 'text' ? 'none' : undefined,
    fontSize: s.fontSize ? `${s.fontSize}px` : undefined,
    borderRadius: isEllipse ? '50%' : undefined,
    boxShadow: selected ? `0 0 0 2px var(--color-accent, #2563eb)` : undefined
  };

  return (
    <>
      <NodeResizer
        isVisible={selected}
        minWidth={MIN_W}
        minHeight={MIN_H}
        lineClassName="board-resize-line"
        handleClassName="board-resize-handle"
        onResizeEnd={(_e, p) =>
          useBoard.getState().resizeElement(d.elementId, {
            x: p.x,
            y: p.y,
            width: p.width,
            height: p.height
          })
        }
      />
      <div
        className={cls}
        style={boxStyle}
        onDoubleClick={(e) => {
          e.stopPropagation();
          useBoard.getState().setEditing(d.elementId);
        }}
      >
        {d.editing ? (
          <textarea
            ref={inputRef}
            className="board-el__input"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={commit}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                e.preventDefault();
                commit();
              } else if (e.key === 'Escape') {
                e.preventDefault();
                useBoard.getState().setEditing(null);
              }
              e.stopPropagation();
            }}
          />
        ) : (
          <span className="board-el__text">{d.text}</span>
        )}
      </div>
    </>
  );
}

export default memo(BoardElementNode, (a, b) => {
  const da = a.data as BoardNodeData;
  const db = b.data as BoardNodeData;
  return (
    a.selected === b.selected &&
    a.width === b.width &&
    a.height === b.height &&
    da.text === db.text &&
    da.type === db.type &&
    da.editing === db.editing &&
    da.style === db.style
  );
});
