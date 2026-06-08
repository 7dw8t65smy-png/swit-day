import { useCallback, useEffect, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  type Node,
  type Edge,
  type NodeMouseHandler
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import '../components/mindmap/mindmap.css';
import {
  ArrowLeft,
  Plus,
  Trash2,
  Undo2,
  Redo2,
  Loader2,
  PanelRight,
  PanelLeft,
  Network
} from 'lucide-react';
import type { MindMapLayout } from '@swit/shared';
import { useMindMap } from '../lib/mindmap/store';
import { layoutMap } from '../lib/mindmap/layout';
import { branchColor, depthOf, getChildren, visibleNodes } from '../lib/mindmap/doc';
import MindNode from '../components/mindmap/MindNode';

const nodeTypes = { mind: MindNode };

const LAYOUTS: { value: MindMapLayout; label: string; icon: typeof PanelRight }[] = [
  { value: 'right', label: 'Вправо', icon: PanelRight },
  { value: 'left', label: 'Влево', icon: PanelLeft },
  { value: 'tree', label: 'Вниз', icon: Network }
];

export default function MapEditor(): JSX.Element {
  const { id = '' } = useParams();
  const nav = useNavigate();

  const doc = useMindMap((s) => s.doc);
  const title = useMindMap((s) => s.title);
  const selectedId = useMindMap((s) => s.selectedId);
  const loading = useMindMap((s) => s.loading);
  const saving = useMindMap((s) => s.saving);
  const canUndo = useMindMap((s) => s.past.length > 0);
  const canRedo = useMindMap((s) => s.future.length > 0);

  useEffect(() => {
    void useMindMap.getState().load(id);
    return () => useMindMap.getState().reset();
  }, [id]);

  const pos = useMemo(() => (doc ? layoutMap(doc) : {}), [doc]);

  const rfNodes = useMemo<Node[]>(() => {
    if (!doc) return [];
    return visibleNodes(doc).map((n) => {
      const kids = getChildren(doc, n.id);
      return {
        id: n.id,
        type: 'mind',
        position: pos[n.id] ?? { x: 0, y: 0 },
        selected: n.id === selectedId,
        data: {
          nodeId: n.id,
          label: n.text,
          color: branchColor(doc, n.id),
          emoji: n.emoji ?? null,
          isRoot: n.id === doc.rootId,
          depth: depthOf(doc, n.id),
          collapsed: n.collapsed,
          hasChildren: kids.length > 0,
          childCount: kids.length,
          horizontal: doc.layout !== 'tree'
        }
      };
    });
  }, [doc, pos, selectedId]);

  const rfEdges = useMemo<Edge[]>(() => {
    if (!doc) return [];
    const vis = new Set(visibleNodes(doc).map((n) => n.id));
    return doc.nodes
      .filter((n) => n.parentId && vis.has(n.id) && vis.has(n.parentId))
      .map((n) => ({
        id: `${n.parentId}-${n.id}`,
        source: n.parentId as string,
        target: n.id,
        type: 'default',
        style: { stroke: branchColor(doc, n.id) }
      }));
  }, [doc]);

  const onNodeClick = useCallback<NodeMouseHandler>((_e, node) => {
    useMindMap.getState().select(node.id);
  }, []);
  const onNodeDoubleClick = useCallback<NodeMouseHandler>((_e, node) => {
    useMindMap.getState().setEditing(node.id);
  }, []);
  const onPaneClick = useCallback(() => {
    const s = useMindMap.getState();
    s.select(null);
    s.setEditing(null);
  }, []);

  // Горячие клавиши в стиле xmind. Состояние читаем из getState(),
  // чтобы не пересоздавать слушатель на каждое изменение.
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      const s = useMindMap.getState();
      if (s.editingId) return; // правка ноды — её textarea сама обрабатывает
      const target = e.target as HTMLElement | null;
      if (target && ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName)) return;

      const mod = e.metaKey || e.ctrlKey;
      if (mod && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        if (e.shiftKey) s.redo();
        else s.undo();
        return;
      }
      const sel = s.selectedId;
      if (!sel) return;

      if (e.key === 'Tab') {
        e.preventDefault();
        s.addChild(sel);
      } else if (e.key === 'Enter') {
        e.preventDefault();
        s.addSibling(sel);
      } else if (e.key === 'Delete' || e.key === 'Backspace') {
        if (s.doc && sel !== s.doc.rootId) {
          e.preventDefault();
          s.removeNode(sel);
        }
      } else if (e.key === 'F2') {
        e.preventDefault();
        s.setEditing(sel);
      } else if (e.key === 'Escape') {
        s.select(null);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const rootSelected = !!doc && selectedId === doc.rootId;

  return (
    <div className="flex flex-col h-full">
      {/* Тулбар */}
      <header className="flex items-center gap-2 px-4 py-2.5 border-b border-border bg-surface/80 backdrop-blur z-10">
        <button
          onClick={() => nav('/maps')}
          className="p-2 rounded-md hover:bg-surface2 text-muted hover:text-ink"
          title="К списку карт"
        >
          <ArrowLeft size={16} />
        </button>
        <input
          value={title}
          onChange={(e) => useMindMap.getState().setTitle(e.target.value)}
          placeholder="Без названия"
          className="font-semibold text-base bg-transparent outline-none px-1 min-w-0 flex-1 max-w-[420px]"
        />

        <div className="flex items-center gap-1 ml-auto">
          <ToolbarBtn
            title="Отменить (⌘Z)"
            disabled={!canUndo}
            onClick={() => useMindMap.getState().undo()}
          >
            <Undo2 size={16} />
          </ToolbarBtn>
          <ToolbarBtn
            title="Повторить (⌘⇧Z)"
            disabled={!canRedo}
            onClick={() => useMindMap.getState().redo()}
          >
            <Redo2 size={16} />
          </ToolbarBtn>

          <span className="w-px h-5 bg-border mx-1" />

          {LAYOUTS.map(({ value, label, icon: Icon }) => (
            <ToolbarBtn
              key={value}
              title={`Раскладка: ${label}`}
              active={doc?.layout === value}
              onClick={() => useMindMap.getState().setLayout(value)}
            >
              <Icon size={16} />
            </ToolbarBtn>
          ))}

          <span className="w-px h-5 bg-border mx-1" />

          <ToolbarBtn
            title="Добавить узел (Tab)"
            disabled={!selectedId}
            onClick={() => selectedId && useMindMap.getState().addChild(selectedId)}
          >
            <Plus size={16} />
          </ToolbarBtn>
          <ToolbarBtn
            title="Удалить узел (Delete)"
            disabled={!selectedId || rootSelected}
            onClick={() => selectedId && useMindMap.getState().removeNode(selectedId)}
          >
            <Trash2 size={16} />
          </ToolbarBtn>

          <span className="text-xs text-muted w-16 text-right tabular-nums">
            {saving ? 'Сохр…' : 'Сохранено'}
          </span>
        </div>
      </header>

      {/* Холст */}
      <div className="relative flex-1">
        {loading || !doc ? (
          <div className="absolute inset-0 grid place-items-center text-muted">
            <Loader2 className="animate-spin" />
          </div>
        ) : (
          <ReactFlow
            className="mind-canvas"
            nodes={rfNodes}
            edges={rfEdges}
            nodeTypes={nodeTypes}
            onNodesChange={() => {}}
            onNodeClick={onNodeClick}
            onNodeDoubleClick={onNodeDoubleClick}
            onPaneClick={onPaneClick}
            nodesDraggable={false}
            nodesConnectable={false}
            fitView
            fitViewOptions={{ padding: 0.3, maxZoom: 1.1 }}
            minZoom={0.2}
            maxZoom={2}
            proOptions={{ hideAttribution: true }}
          >
            <Background />
            <Controls showInteractive={false} />
            <MiniMap
              pannable
              zoomable
              nodeColor={(n) => (n.data as { color?: string })?.color ?? '#94a3b8'}
              maskColor="rgba(15,23,42,0.06)"
            />
          </ReactFlow>
        )}
      </div>
    </div>
  );
}

function ToolbarBtn({
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
