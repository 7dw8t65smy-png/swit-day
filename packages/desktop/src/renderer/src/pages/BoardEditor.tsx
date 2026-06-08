import { useEffect, useMemo, useRef, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { nanoid } from 'nanoid';
import {
  ReactFlow,
  Background,
  BackgroundVariant,
  Controls,
  MiniMap,
  MarkerType,
  useNodesState,
  useEdgesState,
  SelectionMode,
  type Node,
  type Edge,
  type NodeMouseHandler,
  type OnNodeDrag,
  type OnSelectionChangeParams,
  type ReactFlowInstance
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import '../components/board/board.css';
import {
  ArrowLeft,
  Undo2,
  Redo2,
  Loader2,
  StickyNote,
  Type as TypeIcon,
  Square,
  Shapes,
  Frame as FrameIcon,
  Image as ImageIcon,
  Spline,
  Pencil,
  Grid3x3,
  Trash2,
  SlidersHorizontal
} from 'lucide-react';
import type { BoardElementType } from '@swit/shared';
import { useBoard } from '../lib/board/store';
import { moveElement, groupMembers } from '../lib/board/doc';
import BoardElementNode from '../components/board/BoardElementNode';
import BoardInspector from '../components/board/BoardInspector';

const nodeTypes = { board: BoardElementNode };
const GRID = 16;
const CONNECTOR_COLOR = '#64748b';
const DRAW_COLOR = '#0f172a';

type Mode = 'select' | 'connect' | 'draw';

const ADD_TOOLS: { type: BoardElementType; label: string; icon: typeof StickyNote }[] = [
  { type: 'sticker', label: 'Стикер', icon: StickyNote },
  { type: 'text', label: 'Текст', icon: TypeIcon },
  { type: 'card', label: 'Карточка', icon: Square },
  { type: 'shape', label: 'Фигура', icon: Shapes },
  { type: 'frame', label: 'Фрейм', icon: FrameIcon }
];

export default function BoardEditor(): JSX.Element {
  const { id = '' } = useParams();
  const nav = useNavigate();

  const doc = useBoard((s) => s.doc);
  const title = useBoard((s) => s.title);
  const selectedIds = useBoard((s) => s.selectedIds);
  const editingId = useBoard((s) => s.editingId);
  const loading = useBoard((s) => s.loading);
  const saving = useBoard((s) => s.saving);
  const canUndo = useBoard((s) => s.past.length > 0);
  const canRedo = useBoard((s) => s.future.length > 0);

  const [snap, setSnap] = useState(true);
  const [inspectorOpen, setInspectorOpen] = useState(true);
  const [mode, setMode] = useState<Mode>('select');
  const [pendingFrom, setPendingFrom] = useState<string | null>(null);
  const [previewPts, setPreviewPts] = useState<number[]>([]);

  const rfRef = useRef<ReactFlowInstance | null>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const lastSelKey = useRef('');
  const drawingRef = useRef(false);
  const clientPtsRef = useRef<number[]>([]);
  const rectRef = useRef<DOMRect | null>(null);

  useEffect(() => {
    void useBoard.getState().load(id);
    return () => useBoard.getState().reset();
  }, [id]);

  // Сброс инструментов при смене документа.
  useEffect(() => {
    setMode('select');
    setPendingFrom(null);
  }, [id]);

  const view: Node[] = useMemo(() => {
    if (!doc) return [];
    const sel = new Set(selectedIds);
    return doc.elements
      .filter((el) => el.type !== 'connector')
      .map((el) => ({
        id: el.id,
        type: 'board',
        position: { x: el.x, y: el.y },
        style: { width: el.width, height: el.height },
        zIndex: el.zIndex,
        selected: sel.has(el.id),
        data: {
          elementId: el.id,
          type: el.type,
          text: el.text ?? '',
          style: el.style ?? {},
          src: el.src,
          points: el.points,
          editing: el.id === editingId
        }
      }));
  }, [doc, selectedIds, editingId]);

  const edgeView: Edge[] = useMemo(() => {
    if (!doc) return [];
    const sel = new Set(selectedIds);
    return doc.elements
      .filter((el) => el.type === 'connector' && el.from && el.to)
      .map((el) => {
        const color = el.style?.border ?? CONNECTOR_COLOR;
        return {
          id: el.id,
          source: el.from as string,
          target: el.to as string,
          sourceHandle: 's',
          targetHandle: 't',
          markerEnd: { type: MarkerType.ArrowClosed, color },
          style: { stroke: color, strokeWidth: 2 },
          selected: sel.has(el.id)
        };
      });
  }, [doc, selectedIds]);

  const [nodes, setNodes, onNodesChange] = useNodesState<Node>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);
  useEffect(() => {
    setNodes(view);
  }, [view, setNodes]);
  useEffect(() => {
    setEdges(edgeView);
  }, [edgeView, setEdges]);

  const onSelectionChange = (params: OnSelectionChangeParams): void => {
    const base = [...params.nodes.map((n) => n.id), ...params.edges.map((e) => e.id)];
    const d = useBoard.getState().doc;
    const expanded = new Set(base);
    if (d) for (const nid of base) for (const m of groupMembers(d, nid)) expanded.add(m);
    const ids = [...expanded];
    const key = [...ids].sort().join(',');
    if (key === lastSelKey.current) return;
    lastSelKey.current = key;
    useBoard.getState().select(ids);
  };

  const onNodeDragStop: OnNodeDrag = (_e, _node, dragged) => {
    const ups = dragged.map((n) => ({ id: n.id, x: n.position.x, y: n.position.y }));
    if (!ups.length) return;
    useBoard.getState().apply((d) => ups.reduce((acc, u) => moveElement(acc, u.id, u.x, u.y), d));
  };

  const onNodeClick: NodeMouseHandler = (_e, node) => {
    if (mode !== 'connect') return;
    if (!pendingFrom) {
      setPendingFrom(node.id);
    } else if (pendingFrom !== node.id) {
      useBoard.getState().addConnector(pendingFrom, node.id);
      setPendingFrom(null);
      setMode('select');
    }
  };

  function centerFlow(): { x: number; y: number } {
    const inst = rfRef.current;
    const wrap = wrapRef.current;
    if (!inst || !wrap) return { x: 0, y: 0 };
    const r = wrap.getBoundingClientRect();
    return inst.screenToFlowPosition({ x: r.left + r.width / 2, y: r.top + r.height / 2 });
  }

  function addAtCenter(type: BoardElementType): void {
    const p = centerFlow();
    useBoard.getState().addElement(type, Math.round(p.x - 90), Math.round(p.y - 60));
  }

  function onFile(e: React.ChangeEvent<HTMLInputElement>): void {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const src = String(reader.result);
      const p = centerFlow();
      useBoard.getState().addImage(src, Math.round(p.x - 110), Math.round(p.y - 80));
    };
    reader.readAsDataURL(file);
  }

  // --- Freehand ---
  function onDrawDown(e: React.PointerEvent): void {
    if (mode !== 'draw') return;
    e.preventDefault();
    drawingRef.current = true;
    rectRef.current = wrapRef.current?.getBoundingClientRect() ?? null;
    clientPtsRef.current = [e.clientX, e.clientY];
    const r = rectRef.current;
    setPreviewPts(r ? [e.clientX - r.left, e.clientY - r.top] : []);
    (e.target as Element).setPointerCapture?.(e.pointerId);
  }
  function onDrawMove(e: React.PointerEvent): void {
    if (!drawingRef.current) return;
    clientPtsRef.current.push(e.clientX, e.clientY);
    const r = rectRef.current;
    if (r) setPreviewPts((p) => [...p, e.clientX - r.left, e.clientY - r.top]);
  }
  function onDrawUp(): void {
    if (!drawingRef.current) return;
    drawingRef.current = false;
    finalizeDraw();
    setPreviewPts([]);
    setMode('select');
  }
  function finalizeDraw(): void {
    const inst = rfRef.current;
    const client = clientPtsRef.current;
    clientPtsRef.current = [];
    if (!inst || client.length < 4) return;
    const flow: number[] = [];
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (let i = 0; i < client.length; i += 2) {
      const p = inst.screenToFlowPosition({ x: client[i], y: client[i + 1] });
      flow.push(p.x, p.y);
      minX = Math.min(minX, p.x);
      minY = Math.min(minY, p.y);
      maxX = Math.max(maxX, p.x);
      maxY = Math.max(maxY, p.y);
    }
    const w = Math.max(1, maxX - minX);
    const h = Math.max(1, maxY - minY);
    if (w < 6 && h < 6) return;
    const points: number[] = [];
    for (let i = 0; i < flow.length; i += 2) {
      points.push((flow[i] - minX) / w, (flow[i + 1] - minY) / h);
    }
    useBoard.getState().addDrawing({
      id: nanoid(),
      type: 'draw',
      x: Math.round(minX),
      y: Math.round(minY),
      width: Math.round(w),
      height: Math.round(h),
      text: '',
      style: { border: DRAW_COLOR },
      points
    });
  }

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      const s = useBoard.getState();
      if (s.editingId) return;
      const target = e.target as HTMLElement | null;
      if (target && ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName)) return;

      const mod = e.metaKey || e.ctrlKey;
      if (mod && e.key.toLowerCase() === 'g') {
        e.preventDefault();
        if (e.shiftKey) s.ungroup();
        else s.group();
        return;
      }
      if (mod && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        if (e.shiftKey) s.redo();
        else s.undo();
        return;
      }
      if (e.key === 'Delete' || e.key === 'Backspace') {
        if (s.selectedIds.length) {
          e.preventDefault();
          s.removeSelected();
        }
      } else if (e.key === 'Escape') {
        s.select([]);
        s.setEditing(null);
        setMode('select');
        setPendingFrom(null);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const previewPath =
    previewPts.length >= 4
      ? previewPts.reduce(
          (acc, _v, i) =>
            i % 2 === 0 ? acc + `${i === 0 ? 'M' : 'L'} ${previewPts[i]} ${previewPts[i + 1]} ` : acc,
          ''
        )
      : '';

  return (
    <div className="flex flex-col h-screen">
      <header className="flex items-center gap-2 px-4 py-2.5 border-b border-border bg-surface z-10">
        <button
          onClick={() => nav('/boards')}
          className="p-2 rounded-md hover:bg-surface2 text-muted hover:text-ink"
          title="К списку досок"
        >
          <ArrowLeft size={16} />
        </button>
        <input
          value={title}
          onChange={(e) => useBoard.getState().setTitle(e.target.value)}
          placeholder="Без названия"
          className="font-semibold text-base bg-transparent outline-none px-1 min-w-0 flex-1 max-w-[420px]"
        />

        <div className="flex items-center gap-1 ml-auto">
          <ToolBtn title="Отменить (⌘Z)" disabled={!canUndo} onClick={() => useBoard.getState().undo()}>
            <Undo2 size={16} />
          </ToolBtn>
          <ToolBtn title="Повторить (⌘⇧Z)" disabled={!canRedo} onClick={() => useBoard.getState().redo()}>
            <Redo2 size={16} />
          </ToolBtn>

          <span className="w-px h-5 bg-border mx-1" />

          <ToolBtn title="Привязка к сетке" active={snap} onClick={() => setSnap((v) => !v)}>
            <Grid3x3 size={16} />
          </ToolBtn>
          <ToolBtn
            title="Удалить выбранное (Delete)"
            disabled={selectedIds.length === 0}
            onClick={() => useBoard.getState().removeSelected()}
          >
            <Trash2 size={16} />
          </ToolBtn>
          <ToolBtn title="Панель свойств" active={inspectorOpen} onClick={() => setInspectorOpen((v) => !v)}>
            <SlidersHorizontal size={16} />
          </ToolBtn>

          <span className="text-xs text-muted w-16 text-right tabular-nums">
            {saving ? 'Сохр…' : 'Сохранено'}
          </span>
        </div>
      </header>

      <div className="flex flex-1 min-h-0">
        {/* Левая панель инструментов */}
        <div className="board-toolbar">
          {ADD_TOOLS.map(({ type, label, icon: Icon }) => (
            <button
              key={type}
              className="board-tool"
              title={`Добавить: ${label}`}
              onClick={() => addAtCenter(type)}
            >
              <Icon size={18} />
              <span className="board-tool__label">{label}</span>
            </button>
          ))}
          <button className="board-tool" title="Картинка" onClick={() => fileRef.current?.click()}>
            <ImageIcon size={18} />
            <span className="board-tool__label">Картинка</span>
          </button>
          <button
            className={['board-tool', mode === 'connect' ? 'board-tool--on' : ''].join(' ')}
            title="Соединить два элемента"
            onClick={() => {
              setMode((m) => (m === 'connect' ? 'select' : 'connect'));
              setPendingFrom(null);
            }}
          >
            <Spline size={18} />
            <span className="board-tool__label">Связь</span>
          </button>
          <button
            className={['board-tool', mode === 'draw' ? 'board-tool--on' : ''].join(' ')}
            title="Свободное рисование"
            onClick={() => setMode((m) => (m === 'draw' ? 'select' : 'draw'))}
          >
            <Pencil size={18} />
            <span className="board-tool__label">Перо</span>
          </button>
          <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={onFile} />
        </div>

        <div ref={wrapRef} className="relative flex-1 min-w-0">
          {loading || !doc ? (
            <div className="absolute inset-0 grid place-items-center text-muted">
              <Loader2 className="animate-spin" />
            </div>
          ) : (
            <ReactFlow
              className="board-canvas"
              nodes={nodes}
              edges={edges}
              nodeTypes={nodeTypes}
              onNodesChange={onNodesChange}
              onEdgesChange={onEdgesChange}
              onSelectionChange={onSelectionChange}
              onNodeDragStop={onNodeDragStop}
              onNodeClick={onNodeClick}
              onInit={(inst) => (rfRef.current = inst)}
              onPaneClick={() => {
                useBoard.getState().select([]);
                useBoard.getState().setEditing(null);
              }}
              snapToGrid={snap}
              snapGrid={[GRID, GRID]}
              selectionOnDrag={mode === 'select'}
              nodesDraggable={mode === 'select'}
              panOnDrag={[1, 2]}
              panOnScroll
              zoomOnScroll={false}
              selectionMode={SelectionMode.Partial}
              deleteKeyCode={null}
              minZoom={0.2}
              maxZoom={2.5}
              proOptions={{ hideAttribution: true }}
            >
              <Background variant={BackgroundVariant.Dots} gap={GRID} size={1} />
              <Controls showInteractive={false} />
              <MiniMap pannable zoomable maskColor="rgba(15,23,42,0.06)" />
            </ReactFlow>
          )}

          {/* Слой рисования: перехватывает указатель только в режиме «Перо». */}
          {mode === 'draw' && (
            <div
              className="board-draw-layer"
              onPointerDown={onDrawDown}
              onPointerMove={onDrawMove}
              onPointerUp={onDrawUp}
              onPointerLeave={onDrawUp}
            >
              {previewPath && (
                <svg className="board-draw-preview">
                  <path d={previewPath} fill="none" stroke={DRAW_COLOR} strokeWidth={2} strokeLinecap="round" />
                </svg>
              )}
            </div>
          )}

          {mode === 'connect' && (
            <div className="board-hint">
              {pendingFrom ? 'Выберите второй элемент' : 'Выберите первый элемент'} · Esc — отмена
            </div>
          )}
        </div>

        {inspectorOpen && <BoardInspector onClose={() => setInspectorOpen(false)} />}
      </div>
    </div>
  );
}

function ToolBtn({
  children,
  title,
  onClick,
  disabled,
  active
}: {
  children: React.ReactNode;
  title: string;
  onClick: () => void;
  disabled?: boolean;
  active?: boolean;
}): JSX.Element {
  return (
    <button
      type="button"
      title={title}
      onClick={onClick}
      disabled={disabled}
      className={[
        'p-2 rounded-md transition-colors',
        active ? 'bg-accent/15 text-accent' : 'text-muted hover:text-ink hover:bg-surface2',
        disabled ? 'opacity-40 cursor-not-allowed' : ''
      ].join(' ')}
    >
      {children}
    </button>
  );
}
