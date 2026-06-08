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
import '../components/mindmap/mindmap.css';
import '../components/board/board.css';
import {
  ArrowLeft,
  Undo2,
  Redo2,
  Loader2,
  PanelRight,
  PanelLeft,
  Network,
  Plus,
  CornerDownRight,
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
import type { BoardElementType, MindMapDoc, MindMapLayout, MindMapNode, BoardDoc } from '@swit/shared';
import { useCanvasMeta } from '../lib/canvas/store';
import { useMindMap } from '../lib/mindmap/store';
import { useBoard } from '../lib/board/store';
import { layoutMap } from '../lib/mindmap/layout';
import { navTarget, findDropTarget, type ArrowKey } from '../lib/mindmap/nav';
import { getTheme, type MindMapThemeDef } from '../lib/mindmap/themes';
import { moveElement as boardMove } from '../lib/board/doc';
import MindNode, { type MindNodeData } from '../components/mindmap/MindNode';
import BranchEdge from '../components/mindmap/BranchEdge';
import BoardElementNode from '../components/board/BoardElementNode';
import Inspector from '../components/mindmap/Inspector';
import BoardInspector from '../components/board/BoardInspector';
import ThemeMenu from '../components/mindmap/ThemeMenu';

const nodeTypes = { mind: MindNode, board: BoardElementNode };
const edgeTypes = { branch: BranchEdge };
const GRID = 16;
const CONNECTOR_COLOR = '#64748b';
const DRAW_COLOR = '#0f172a';

type Mode = 'select' | 'connect' | 'draw';

const LAYOUTS: { value: MindMapLayout; icon: typeof PanelRight; label: string }[] = [
  { value: 'right', icon: PanelRight, label: 'Вправо' },
  { value: 'left', icon: PanelLeft, label: 'Влево' },
  { value: 'tree', icon: Network, label: 'Вниз' }
];

const BOARD_TOOLS: { type: BoardElementType; label: string; icon: typeof StickyNote }[] = [
  { type: 'sticker', label: 'Стикер', icon: StickyNote },
  { type: 'text', label: 'Текст', icon: TypeIcon },
  { type: 'card', label: 'Карточка', icon: Square },
  { type: 'shape', label: 'Фигура', icon: Shapes },
  { type: 'frame', label: 'Фрейм', icon: FrameIcon }
];

// --- сборка узлов карты (с тем же data, что в редакторе карт) + сдвиг origin ---
function buildMind(
  doc: MindMapDoc,
  theme: MindMapThemeDef,
  selectedId: string | null,
  editingId: string | null,
  ox: number,
  oy: number
): { nodes: Node[]; edges: Edge[] } {
  const byId = new Map<string, MindMapNode>();
  const children = new Map<string, MindMapNode[]>();
  for (const n of doc.nodes) {
    byId.set(n.id, n);
    if (n.parentId) {
      const arr = children.get(n.parentId);
      if (arr) arr.push(n);
      else children.set(n.parentId, [n]);
    }
  }
  const pos = layoutMap(doc);
  const horizontal = doc.layout !== 'tree';
  const nodes: Node[] = [];
  const edges: Edge[] = [];

  const push = (n: MindMapNode, color: string, depth: number): void => {
    const p = pos[n.id];
    if (!p) return;
    const kids = children.get(n.id) ?? [];
    const data: MindNodeData = {
      nodeId: n.id,
      label: n.text,
      color,
      emoji: n.emoji ?? null,
      isRoot: n.id === doc.rootId,
      depth,
      collapsed: n.collapsed,
      hasChildren: kids.length > 0,
      childCount: kids.length,
      horizontal,
      editing: n.id === editingId,
      priority: n.priority ?? null,
      done: n.done,
      tags: n.tags,
      hasNote: !!(n.note && n.note.trim())
    };
    nodes.push({
      id: n.id,
      type: 'mind',
      position: { x: p.x + ox, y: p.y + oy },
      origin: [0.5, 0.5],
      selected: n.id === selectedId,
      data
    });
  };

  const root = byId.get(doc.rootId);
  if (root) push(root, theme.rootColor, 0);

  const walk = (n: MindMapNode, color: string, depth: number): void => {
    push(n, color, depth);
    if (n.parentId && pos[n.id] && pos[n.parentId]) {
      edges.push({ id: `${n.parentId}-${n.id}`, source: n.parentId, target: n.id, type: 'branch', data: { color, depth } });
    }
    if (n.collapsed) return;
    for (const k of children.get(n.id) ?? []) walk(k, k.color ?? color, depth + 1);
  };
  (children.get(doc.rootId) ?? []).forEach((c, i) => {
    walk(c, c.color ?? theme.branchColors[i % theme.branchColors.length], 1);
  });

  return { nodes, edges };
}

function buildBoard(doc: BoardDoc, sel: Set<string>, editingId: string | null): { nodes: Node[]; edges: Edge[] } {
  const nodes: Node[] = [];
  const edges: Edge[] = [];
  for (const el of doc.elements) {
    if (el.type === 'connector') {
      if (el.from && el.to) {
        const color = el.style?.border ?? CONNECTOR_COLOR;
        edges.push({
          id: el.id,
          source: el.from,
          target: el.to,
          sourceHandle: 's',
          targetHandle: 't',
          markerEnd: { type: MarkerType.ArrowClosed, color },
          style: { stroke: color, strokeWidth: 2 },
          selected: sel.has(el.id)
        });
      }
      continue;
    }
    nodes.push({
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
    });
  }
  return { nodes, edges };
}

export default function CanvasEditor(): JSX.Element {
  const { id = '' } = useParams();
  const nav = useNavigate();

  const title = useCanvasMeta((s) => s.title);
  const originX = useCanvasMeta((s) => s.originX);
  const originY = useCanvasMeta((s) => s.originY);
  const loading = useCanvasMeta((s) => s.loading);
  const saving = useCanvasMeta((s) => s.saving);

  const mindDoc = useMindMap((s) => s.doc);
  const mindSelectedId = useMindMap((s) => s.selectedId);
  const mindEditingId = useMindMap((s) => s.editingId);
  const mindPast = useMindMap((s) => s.past.length);
  const mindFuture = useMindMap((s) => s.future.length);

  const boardDoc = useBoard((s) => s.doc);
  const boardSelectedIds = useBoard((s) => s.selectedIds);
  const boardEditingId = useBoard((s) => s.editingId);
  const boardPast = useBoard((s) => s.past.length);
  const boardFuture = useBoard((s) => s.future.length);

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
    void useCanvasMeta.getState().load(id);
    return () => useCanvasMeta.getState().reset();
  }, [id]);

  useEffect(() => {
    setMode('select');
    setPendingFrom(null);
  }, [id]);

  const theme = getTheme(mindDoc?.theme);

  const view = useMemo(() => {
    const mind = mindDoc
      ? buildMind(mindDoc, theme, mindSelectedId, mindEditingId, originX, originY)
      : { nodes: [], edges: [] };
    const board = boardDoc
      ? buildBoard(boardDoc, new Set(boardSelectedIds), boardEditingId)
      : { nodes: [], edges: [] };
    return { nodes: [...mind.nodes, ...board.nodes], edges: [...mind.edges, ...board.edges] };
  }, [mindDoc, boardDoc, theme, mindSelectedId, mindEditingId, boardSelectedIds, boardEditingId, originX, originY]);

  const [nodes, setNodes, onNodesChange] = useNodesState<Node>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);
  useEffect(() => {
    setNodes(view.nodes);
  }, [view.nodes, setNodes]);
  useEffect(() => {
    setEdges(view.edges);
  }, [view.edges, setEdges]);

  const mindIds = useMemo(() => new Set((mindDoc?.nodes ?? []).map((n) => n.id)), [mindDoc]);
  const activePanel: 'mind' | 'board' = mindSelectedId ? 'mind' : 'board';

  const onSelectionChange = (params: OnSelectionChangeParams): void => {
    const mindSel: string[] = [];
    const boardSel: string[] = [];
    for (const n of params.nodes) (mindIds.has(n.id) ? mindSel : boardSel).push(n.id);
    for (const e of params.edges) boardSel.push(e.id); // коннекторы — это доска
    const key = `m:${[...mindSel].sort().join(',')}|b:${[...boardSel].sort().join(',')}`;
    if (key === lastSelKey.current) return;
    lastSelKey.current = key;
    useMindMap.getState().select(mindSel[0] ?? null);
    useBoard.getState().select(boardSel);
  };

  const onNodeDragStop: OnNodeDrag = (_e, _node, dragged) => {
    let changed = false;
    const boardMoves: { id: string; x: number; y: number }[] = [];
    for (const n of dragged) {
      if (mindIds.has(n.id)) {
        const mdoc = useMindMap.getState().doc;
        if (!mdoc || n.id === mdoc.rootId) continue;
        const point = { x: n.position.x - originX, y: n.position.y - originY };
        const target = findDropTarget(mdoc, n.id, point);
        if (target) {
          useMindMap.getState().moveNode(n.id, target);
          changed = true;
        }
      } else {
        boardMoves.push({ id: n.id, x: n.position.x, y: n.position.y });
      }
    }
    if (boardMoves.length) {
      useBoard.getState().apply((d) => boardMoves.reduce((acc, m) => boardMove(acc, m.id, m.x, m.y), d));
      changed = true;
    }
    if (!changed) setNodes(view.nodes); // ничего не поменялось → вернуть узлы карты на место
  };

  const onNodeClick: NodeMouseHandler = (_e, node) => {
    if (mode !== 'connect') return;
    if (mindIds.has(node.id)) return; // соединять можно только элементы доски
    if (!pendingFrom) {
      setPendingFrom(node.id);
    } else if (pendingFrom !== node.id && !mindIds.has(pendingFrom)) {
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

  function addBoardAtCenter(type: BoardElementType): void {
    const p = centerFlow();
    useBoard.getState().addElement(type, Math.round(p.x - 90), Math.round(p.y - 60));
  }

  function onFile(e: React.ChangeEvent<HTMLInputElement>): void {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const p = centerFlow();
      useBoard.getState().addImage(String(reader.result), Math.round(p.x - 110), Math.round(p.y - 80));
    };
    reader.readAsDataURL(file);
  }

  // --- freehand ---
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
    for (let i = 0; i < flow.length; i += 2) points.push((flow[i] - minX) / w, (flow[i + 1] - minY) / h);
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
      const m = useMindMap.getState();
      const b = useBoard.getState();
      if (m.editingId || b.editingId) return;
      const target = e.target as HTMLElement | null;
      if (target && ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName)) return;

      const mod = e.metaKey || e.ctrlKey;
      const onMind = !!m.selectedId;
      const onBoard = b.selectedIds.length > 0;

      if (mod && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        const useBoardHist = onBoard || (!onMind && b.past.length > 0);
        if (e.shiftKey) useBoardHist ? b.redo() : m.redo();
        else useBoardHist ? b.undo() : m.undo();
        return;
      }
      if (mod && e.key.toLowerCase() === 'g') {
        e.preventDefault();
        if (e.shiftKey) b.ungroup();
        else b.group();
        return;
      }
      if (e.key === 'Escape') {
        m.select(null);
        m.setEditing(null);
        b.select([]);
        b.setEditing(null);
        setMode('select');
        setPendingFrom(null);
        return;
      }
      if (e.key === 'Delete' || e.key === 'Backspace') {
        if (onBoard) {
          e.preventDefault();
          b.removeSelected();
        } else if (onMind && m.doc && m.selectedId !== m.doc.rootId) {
          e.preventDefault();
          m.removeNode(m.selectedId as string);
        }
        return;
      }

      // дальше — операции карты, только когда выбран узел карты
      if (!onMind || !m.doc) return;
      const sel = m.selectedId as string;
      if (e.key === 'Tab') {
        e.preventDefault();
        m.addChild(sel);
      } else if (e.key === 'Enter') {
        e.preventDefault();
        m.addSibling(sel);
      } else if (e.key === 'F2') {
        e.preventDefault();
        m.setEditing(sel);
      } else if (e.key.startsWith('Arrow')) {
        e.preventDefault();
        const horizontal = m.doc.layout !== 'tree';
        const prev = horizontal ? 'ArrowUp' : 'ArrowLeft';
        const next = horizontal ? 'ArrowDown' : 'ArrowRight';
        if (e.altKey && (e.key === prev || e.key === next)) m.reorderSibling(sel, e.key === prev ? -1 : 1);
        else {
          const t = navTarget(m.doc, sel, e.key as ArrowKey);
          if (t) m.select(t);
        }
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const canUndo = mindPast > 0 || boardPast > 0;
  const canRedo = mindFuture > 0 || boardFuture > 0;
  const rootSelected = !!mindDoc && mindSelectedId === mindDoc.rootId;

  const previewPath =
    previewPts.length >= 4
      ? previewPts.reduce((acc, _v, i) => (i % 2 === 0 ? acc + `${i === 0 ? 'M' : 'L'} ${previewPts[i]} ${previewPts[i + 1]} ` : acc), '')
      : '';

  return (
    <div className="flex flex-col h-screen">
      <header className="flex items-center gap-2 px-4 py-2.5 border-b border-border bg-surface z-10">
        <button onClick={() => nav('/canvas')} className="p-2 rounded-md hover:bg-surface2 text-muted hover:text-ink" title="К списку">
          <ArrowLeft size={16} />
        </button>
        <input
          value={title}
          onChange={(e) => useCanvasMeta.getState().setTitle(e.target.value)}
          placeholder="Без названия"
          className="font-semibold text-base bg-transparent outline-none px-1 min-w-0 flex-1 max-w-[360px]"
        />

        <div className="flex items-center gap-1 ml-auto">
          <Btn title="Отменить (⌘Z)" disabled={!canUndo} onClick={() => (boardPast > 0 && !mindSelectedId ? useBoard.getState().undo() : useMindMap.getState().undo())}>
            <Undo2 size={16} />
          </Btn>
          <Btn title="Повторить (⌘⇧Z)" disabled={!canRedo} onClick={() => (boardFuture > 0 && !mindSelectedId ? useBoard.getState().redo() : useMindMap.getState().redo())}>
            <Redo2 size={16} />
          </Btn>

          <span className="w-px h-5 bg-border mx-1" />

          <Btn title="Дочерний узел (Tab)" disabled={!mindSelectedId} onClick={() => mindSelectedId && useMindMap.getState().addChild(mindSelectedId)}>
            <Plus size={16} />
          </Btn>
          <Btn title="Соседний узел (Enter)" disabled={!mindSelectedId} onClick={() => mindSelectedId && useMindMap.getState().addSibling(mindSelectedId)}>
            <CornerDownRight size={16} />
          </Btn>
          {LAYOUTS.map(({ value, icon: Icon, label }) => (
            <Btn key={value} title={`Раскладка: ${label}`} active={mindDoc?.layout === value} onClick={() => useMindMap.getState().setLayout(value)}>
              <Icon size={16} />
            </Btn>
          ))}
          <ThemeMenu />

          <span className="w-px h-5 bg-border mx-1" />

          <Btn title="Привязка к сетке" active={snap} onClick={() => setSnap((v) => !v)}>
            <Grid3x3 size={16} />
          </Btn>
          <Btn
            title="Удалить выбранное (Delete)"
            disabled={!mindSelectedId && boardSelectedIds.length === 0}
            onClick={() => {
              if (boardSelectedIds.length) useBoard.getState().removeSelected();
              else if (mindSelectedId && !rootSelected) useMindMap.getState().removeNode(mindSelectedId);
            }}
          >
            <Trash2 size={16} />
          </Btn>
          <Btn title="Панель свойств" active={inspectorOpen} onClick={() => setInspectorOpen((v) => !v)}>
            <SlidersHorizontal size={16} />
          </Btn>

          <span className="text-xs text-muted w-16 text-right tabular-nums">{saving ? 'Сохр…' : 'Сохранено'}</span>
        </div>
      </header>

      <div className="flex flex-1 min-h-0">
        <div className="board-toolbar">
          {BOARD_TOOLS.map(({ type, label, icon: Icon }) => (
            <button key={type} className="board-tool" title={`Добавить: ${label}`} onClick={() => addBoardAtCenter(type)}>
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
            title="Соединить два элемента доски"
            onClick={() => {
              setMode((mo) => (mo === 'connect' ? 'select' : 'connect'));
              setPendingFrom(null);
            }}
          >
            <Spline size={18} />
            <span className="board-tool__label">Связь</span>
          </button>
          <button className={['board-tool', mode === 'draw' ? 'board-tool--on' : ''].join(' ')} title="Свободное рисование" onClick={() => setMode((mo) => (mo === 'draw' ? 'select' : 'draw'))}>
            <Pencil size={18} />
            <span className="board-tool__label">Перо</span>
          </button>
          <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={onFile} />
        </div>

        <div ref={wrapRef} className="relative flex-1 min-w-0">
          {loading || (!mindDoc && !boardDoc) ? (
            <div className="absolute inset-0 grid place-items-center text-muted">
              <Loader2 className="animate-spin" />
            </div>
          ) : (
            <ReactFlow
              className="board-canvas"
              nodes={nodes}
              edges={edges}
              nodeTypes={nodeTypes}
              edgeTypes={edgeTypes}
              onNodesChange={onNodesChange}
              onEdgesChange={onEdgesChange}
              onSelectionChange={onSelectionChange}
              onNodeDragStop={onNodeDragStop}
              onNodeClick={onNodeClick}
              onInit={(inst) => (rfRef.current = inst)}
              onPaneClick={() => {
                useMindMap.getState().select(null);
                useMindMap.getState().setEditing(null);
                useBoard.getState().select([]);
                useBoard.getState().setEditing(null);
              }}
              snapToGrid={snap}
              snapGrid={[GRID, GRID]}
              selectionOnDrag={mode === 'select'}
              nodesDraggable={mode === 'select'}
              disableKeyboardA11y
              panOnDrag={[1, 2]}
              panOnScroll
              zoomOnScroll={false}
              selectionMode={SelectionMode.Partial}
              deleteKeyCode={null}
              minZoom={0.2}
              maxZoom={2.5}
              fitView
              fitViewOptions={{ padding: 0.3, maxZoom: 1.1 }}
              proOptions={{ hideAttribution: true }}
            >
              <Background variant={BackgroundVariant.Dots} gap={GRID} size={1} />
              <Controls showInteractive={false} />
              <MiniMap pannable zoomable maskColor="rgba(15,23,42,0.06)" />
            </ReactFlow>
          )}

          {mode === 'draw' && (
            <div className="board-draw-layer" onPointerDown={onDrawDown} onPointerMove={onDrawMove} onPointerUp={onDrawUp} onPointerLeave={onDrawUp}>
              {previewPath && (
                <svg className="board-draw-preview">
                  <path d={previewPath} fill="none" stroke={DRAW_COLOR} strokeWidth={2} strokeLinecap="round" />
                </svg>
              )}
            </div>
          )}
          {mode === 'connect' && <div className="board-hint">{pendingFrom ? 'Выберите второй элемент' : 'Выберите первый элемент доски'} · Esc — отмена</div>}
        </div>

        {inspectorOpen && (activePanel === 'mind' ? <Inspector onClose={() => setInspectorOpen(false)} /> : <BoardInspector onClose={() => setInspectorOpen(false)} />)}
      </div>
    </div>
  );
}

function Btn({
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
