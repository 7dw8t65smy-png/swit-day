import { memo, useEffect, useRef, useState } from 'react';
import { NodeResizer, Handle, Position, type NodeProps } from '@xyflow/react';
import type { BoardElementStyle, BoardElementType } from '@swit/shared';
import { useBoard } from '../../lib/board/store';

export interface BoardNodeData {
  elementId: string;
  type: BoardElementType;
  text: string;
  style: BoardElementStyle;
  editing: boolean;
  src?: string | null;
  points?: number[];
  [key: string]: unknown;
}

const MIN_W = 40;
const MIN_H = 28;
const EDITABLE: ReadonlySet<BoardElementType> = new Set(['sticker', 'text', 'card', 'shape', 'frame']);

function drawPath(points?: number[]): string {
  if (!points || points.length < 4) return '';
  let d = `M ${points[0] * 100} ${points[1] * 100}`;
  for (let i = 2; i < points.length; i += 2) d += ` L ${points[i] * 100} ${points[i + 1] * 100}`;
  return d;
}

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

  const noBox = d.type === 'text' || d.type === 'image' || d.type === 'draw';
  const boxStyle: React.CSSProperties = {
    background: s.fill ?? 'transparent',
    color: s.color ?? 'var(--color-text)',
    border: noBox
      ? 'none'
      : s.border
        ? `1.5px ${d.type === 'frame' ? 'dashed' : 'solid'} ${s.border}`
        : undefined,
    fontSize: s.fontSize ? `${s.fontSize}px` : undefined,
    borderRadius: isEllipse ? '50%' : undefined,
    boxShadow: selected ? `0 0 0 2px var(--color-accent, #2563eb)` : undefined
  };

  let content: JSX.Element;
  if (d.editing && EDITABLE.has(d.type)) {
    content = (
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
    );
  } else if (d.type === 'image') {
    content = d.src ? (
      <img className="board-img" src={d.src} alt="" draggable={false} />
    ) : (
      <span className="board-el__text text-muted">Нет изображения</span>
    );
  } else if (d.type === 'draw') {
    content = (
      <svg className="board-draw" viewBox="0 0 100 100" preserveAspectRatio="none">
        <path
          d={drawPath(d.points)}
          fill="none"
          stroke={s.border ?? s.color ?? 'var(--color-text)'}
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
          vectorEffect="non-scaling-stroke"
        />
      </svg>
    );
  } else if (d.type === 'frame') {
    content = <span className="board-frame__title">{d.text || 'Фрейм'}</span>;
  } else {
    content = <span className="board-el__text">{d.text}</span>;
  }

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
      <Handle id="t" type="target" position={Position.Top} className="board-handle" />
      <Handle id="s" type="source" position={Position.Bottom} className="board-handle" />
      <div
        className={cls}
        style={boxStyle}
        onDoubleClick={(e) => {
          if (!EDITABLE.has(d.type)) return;
          e.stopPropagation();
          useBoard.getState().setEditing(d.elementId);
        }}
      >
        {content}
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
    da.style === db.style &&
    da.src === db.src &&
    da.points === db.points
  );
});
