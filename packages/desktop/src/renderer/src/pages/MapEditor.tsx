import { useEffect, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  useNodesState,
  useEdgesState,
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
import type { MindMapDoc, MindMapLayout, MindMapNode } from '@swit/shared';
import { useMindMap } from '../lib/mindmap/store';
import { layoutMap } from '../lib/mindmap/layout';
import { DEFAULT_BRANCH_COLORS } from '../lib/mindmap/doc';
import MindNode, { type MindNodeData } from '../components/mindmap/MindNode';

const nodeTypes = { mind: MindNode };
const ROOT_COLOR = '#334155';

const LAYOUTS: { value: MindMapLayout; label: string; icon: typeof PanelRight }[] = [
  { value: 'right', label: 'Вправо', icon: PanelRight },
  { value: 'left', label: 'Влево', icon: PanelLeft },
  { value: 'tree', label: 'Вниз', icon: Network }
];

interface BuiltView {
  nodes: Node[];
  edges: Edge[];
}

// Один O(N) проход: индекс детей, позиции, цвета веток, глубина → ноды и рёбра.
// Раньше цвет/глубина считались на каждый рендер для каждого узла (O(N^2)).
function buildView(doc: MindMapDoc, selectedId: string | null, editingId: string | null): BuiltView {
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

  const pushNode = (n: MindMapNode, color: string, depth: number): void => {
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
      editing: n.id === editingId
    };
    nodes.push({ id: n.id, type: 'mind', position: p, selected: n.id === selectedId, data });
  };

  const root = byId.get(doc.rootId);
  if (root) pushNode(root, ROOT_COLOR, 0);

  const walk = (n: MindMapNode, color: string, depth: number): void => {
    pushNode(n, color, depth);
    if (n.parentId && pos[n.id] && pos[n.parentId]) {
      edges.push({
        id: `${n.parentId}-${n.id}`,
        source: n.parentId,
        target: n.id,
        type: 'default',
        style: { stroke: color }
      });
    }
    if (n.collapsed) return;
    for (const k of children.get(n.id) ?? []) walk(k, k.color ?? color, depth + 1);
  };

  (children.get(doc.rootId) ?? []).forEach((c, i) => {
    const color = c.color ?? DEFAULT_BRANCH_COLORS[i % DEFAULT_BRANCH_COLORS.length];
    walk(c, color, 1);
  });

  return { nodes, edges };
}

export default function MapEditor(): JSX.Element {
  const { id = '' } = useParams();
  const nav = useNavigate();

  const doc = useMindMap((s) => s.doc);
  const title = useMindMap((s) => s.title);
  const selectedId = useMindMap((s) => s.selectedId);
  const editingId = useMindMap((s) => s.editingId);
  const loading = useMindMap((s) => s.loading);
  const saving = useMindMap((s) => s.saving);
  const canUndo = useMindMap((s) => s.past.length > 0);
  const canRedo = useMindMap((s) => s.future.length > 0);

  useEffect(() => {
    void useMindMap.getState().load(id);
    return () => useMindMap.getState().reset();
  }, [id]);

  const view = useMemo(
    () => (doc ? buildView(doc, selectedId, editingId) : { nodes: [], edges: [] }),
    [doc, selectedId, editingId]
  );

  // React Flow владеет массивами (размеры/измерения), мы заменяем их при
  // изменении документа/выделения. Стабильные id → React сверяет по ключу,
  // а memo на MindNode не даёт перерисовывать неизменившиеся узлы.
  const [nodes, setNodes, onNodesChange] = useNodesState<Node>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);
  useEffect(() => {
    setNodes(view.nodes);
  }, [view.nodes, setNodes]);
  useEffect(() => {
    setEdges(view.edges);
  }, [view.edges, setEdges]);

  const onNodeClick: NodeMouseHandler = (_e, node) => useMindMap.getState().select(node.id);
  const onNodeDoubleClick: NodeMouseHandler = (_e, node) => useMindMap.getState().setEditing(node.id);
  const onPaneClick = (): void => {
    const s = useMindMap.getState();
    s.select(null);
    s.setEditing(null);
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      const s = useMindMap.getState();
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
    // h-screen (а не h-full): родитель страницы — min-h-full, поэтому height:100%
    // схлопывается в auto и холст React Flow получает 0px высоты.
    <div className="flex flex-col h-screen">
      <header className="flex items-center gap-2 px-4 py-2.5 border-b border-border bg-surface z-10">
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
          <ToolbarBtn title="Отменить (⌘Z)" disabled={!canUndo} onClick={() => useMindMap.getState().undo()}>
            <Undo2 size={16} />
          </ToolbarBtn>
          <ToolbarBtn title="Повторить (⌘⇧Z)" disabled={!canRedo} onClick={() => useMindMap.getState().redo()}>
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

      <div className="relative flex-1">
        {loading || !doc ? (
          <div className="absolute inset-0 grid place-items-center text-muted">
            <Loader2 className="animate-spin" />
          </div>
        ) : (
          <ReactFlow
            className="mind-canvas"
            nodes={nodes}
            edges={edges}
            nodeTypes={nodeTypes}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onNodeClick={onNodeClick}
            onNodeDoubleClick={onNodeDoubleClick}
            onPaneClick={onPaneClick}
            nodeOrigin={[0.5, 0.5]}
            nodesDraggable={false}
            nodesConnectable={false}
            onlyRenderVisibleElements
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
