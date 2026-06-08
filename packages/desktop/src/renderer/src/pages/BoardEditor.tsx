import { useEffect, useMemo, useRef, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  ReactFlow,
  Background,
  BackgroundVariant,
  Controls,
  MiniMap,
  useNodesState,
  SelectionMode,
  type Node,
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
  Grid3x3,
  Trash2,
  SlidersHorizontal
} from 'lucide-react';
import type { BoardElementType } from '@swit/shared';
import { useBoard } from '../lib/board/store';
import { moveElement } from '../lib/board/doc';
import BoardElementNode from '../components/board/BoardElementNode';
import BoardInspector from '../components/board/BoardInspector';

const nodeTypes = { board: BoardElementNode };
const GRID = 16;

const TOOLS: { type: BoardElementType; label: string; icon: typeof StickyNote }[] = [
  { type: 'sticker', label: 'Стикер', icon: StickyNote },
  { type: 'text', label: 'Текст', icon: TypeIcon },
  { type: 'card', label: 'Карточка', icon: Square },
  { type: 'shape', label: 'Фигура', icon: Shapes }
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
  const rfRef = useRef<ReactFlowInstance | null>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const lastSelKey = useRef('');

  useEffect(() => {
    void useBoard.getState().load(id);
    return () => useBoard.getState().reset();
  }, [id]);

  const view: Node[] = useMemo(() => {
    if (!doc) return [];
    const sel = new Set(selectedIds);
    return doc.elements.map((el) => ({
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
        editing: el.id === editingId
      }
    }));
  }, [doc, selectedIds, editingId]);

  const [nodes, setNodes, onNodesChange] = useNodesState<Node>([]);
  useEffect(() => {
    setNodes(view);
  }, [view, setNodes]);

  const onSelectionChange = (params: OnSelectionChangeParams): void => {
    const ids = params.nodes.map((n) => n.id);
    const key = [...ids].sort().join(',');
    if (key === lastSelKey.current) return;
    lastSelKey.current = key;
    useBoard.getState().select(ids);
  };

  // Сохраняем позиции всех перетащенных узлов одним шагом истории.
  const onNodeDragStop: OnNodeDrag = (_e, _node, dragged) => {
    const ups = dragged.map((n) => ({ id: n.id, x: n.position.x, y: n.position.y }));
    if (!ups.length) return;
    useBoard.getState().apply((d) => ups.reduce((acc, u) => moveElement(acc, u.id, u.x, u.y), d));
  };

  function addAtCenter(type: BoardElementType): void {
    const inst = rfRef.current;
    const wrap = wrapRef.current;
    if (!inst || !wrap) {
      useBoard.getState().addElement(type, 0, 0);
      return;
    }
    const r = wrap.getBoundingClientRect();
    const p = inst.screenToFlowPosition({ x: r.left + r.width / 2, y: r.top + r.height / 2 });
    useBoard.getState().addElement(type, Math.round(p.x - 90), Math.round(p.y - 60));
  }

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      const s = useBoard.getState();
      if (s.editingId) return;
      const target = e.target as HTMLElement | null;
      if (target && ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName)) return;

      const mod = e.metaKey || e.ctrlKey;
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
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

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
          {TOOLS.map(({ type, label, icon: Icon }) => (
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
              nodeTypes={nodeTypes}
              onNodesChange={onNodesChange}
              onSelectionChange={onSelectionChange}
              onNodeDragStop={onNodeDragStop}
              onInit={(inst) => (rfRef.current = inst)}
              onPaneClick={() => {
                useBoard.getState().select([]);
                useBoard.getState().setEditing(null);
              }}
              snapToGrid={snap}
              snapGrid={[GRID, GRID]}
              selectionOnDrag
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
