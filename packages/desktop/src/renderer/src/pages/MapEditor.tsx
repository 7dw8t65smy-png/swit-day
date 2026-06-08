import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
  type NodeMouseHandler,
  type OnNodeDrag,
  type ReactFlowInstance
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
  Network,
  SlidersHorizontal,
  Search,
  Crosshair
} from 'lucide-react';
import type { MindMapDoc, MindMapLayout, MindMapNode } from '@swit/shared';
import { useMindMap } from '../lib/mindmap/store';
import { layoutMap } from '../lib/mindmap/layout';
import { descendantIds } from '../lib/mindmap/doc';
import { navTarget, findDropTarget, type ArrowKey } from '../lib/mindmap/nav';
import { getTheme, type MindMapThemeDef } from '../lib/mindmap/themes';
import MindNode, { type MindNodeData } from '../components/mindmap/MindNode';
import BranchEdge from '../components/mindmap/BranchEdge';
import Inspector from '../components/mindmap/Inspector';
import MapSearch from '../components/mindmap/MapSearch';
import ThemeMenu from '../components/mindmap/ThemeMenu';
import ExportMenu from '../components/mindmap/ExportMenu';

const nodeTypes = { mind: MindNode };
const edgeTypes = { branch: BranchEdge };

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
function buildView(
  doc: MindMapDoc,
  selectedId: string | null,
  editingId: string | null,
  theme: MindMapThemeDef
): BuiltView {
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
      editing: n.id === editingId,
      priority: n.priority ?? null,
      done: n.done,
      tags: n.tags,
      hasNote: !!(n.note && n.note.trim())
    };
    nodes.push({ id: n.id, type: 'mind', position: p, selected: n.id === selectedId, data });
  };

  const root = byId.get(doc.rootId);
  if (root) pushNode(root, theme.rootColor, 0);

  const walk = (n: MindMapNode, color: string, depth: number): void => {
    pushNode(n, color, depth);
    if (n.parentId && pos[n.id] && pos[n.parentId]) {
      edges.push({
        id: `${n.parentId}-${n.id}`,
        source: n.parentId,
        target: n.id,
        type: 'branch',
        data: { color, depth }
      });
    }
    if (n.collapsed) return;
    for (const k of children.get(n.id) ?? []) walk(k, k.color ?? color, depth + 1);
  };

  (children.get(doc.rootId) ?? []).forEach((c, i) => {
    const color = c.color ?? theme.branchColors[i % theme.branchColors.length];
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

  const [inspectorOpen, setInspectorOpen] = useState(true);
  const [searchOpen, setSearchOpen] = useState(false);
  const rfRef = useRef<ReactFlowInstance | null>(null);

  useEffect(() => {
    void useMindMap.getState().load(id);
    return () => useMindMap.getState().reset();
  }, [id]);

  // Зум к выбранному узлу и его поддереву.
  const focusSelected = useCallback(() => {
    const s = useMindMap.getState();
    const d = s.doc;
    const sel = s.selectedId;
    if (!d || !sel || !rfRef.current) return;
    const ids = [sel, ...descendantIds(d, sel)].map((i) => ({ id: i }));
    rfRef.current.fitView({ nodes: ids, duration: 450, padding: 0.4, maxZoom: 1.3 });
  }, []);

  // Переход к узлу из поиска: раскрыть предков, выделить, центрировать.
  const jumpTo = useCallback((nodeId: string) => {
    const s = useMindMap.getState();
    if (!s.doc) return;
    s.reveal(nodeId);
    const d = useMindMap.getState().doc;
    const p = d ? layoutMap(d)[nodeId] : undefined;
    if (p && rfRef.current) rfRef.current.setCenter(p.x, p.y, { zoom: 1.1, duration: 450 });
    setSearchOpen(false);
  }, []);

  const theme = getTheme(doc?.theme);
  const view = useMemo(
    () => (doc ? buildView(doc, selectedId, editingId, theme) : { nodes: [], edges: [] }),
    [doc, selectedId, editingId, theme]
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

  // Drag-to-reparent: бросаем узел рядом с другим — он становится новым
  // родителем. Если цели нет — возвращаем узел на место (раскладка пересчитается).
  const onNodeDragStop: OnNodeDrag = (_e, node) => {
    const s = useMindMap.getState();
    if (!s.doc || node.id === s.doc.rootId) {
      setNodes(view.nodes);
      return;
    }
    const target = findDropTarget(s.doc, node.id, { x: node.position.x, y: node.position.y });
    if (target) {
      s.moveNode(node.id, target);
      s.select(node.id);
    } else {
      setNodes(view.nodes);
    }
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      const s = useMindMap.getState();
      if (s.editingId) return;
      const target = e.target as HTMLElement | null;
      if (target && ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName)) return;

      const mod = e.metaKey || e.ctrlKey;
      if (mod && e.key.toLowerCase() === 'f') {
        e.preventDefault();
        setSearchOpen(true);
        return;
      }
      if (mod && e.key === '.') {
        e.preventDefault();
        focusSelected();
        return;
      }
      if (mod && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        if (e.shiftKey) s.redo();
        else s.undo();
        return;
      }
      const sel = s.selectedId;
      if (!sel || !s.doc) return;

      if (e.key.startsWith('Arrow')) {
        e.preventDefault();
        const horizontal = s.doc.layout !== 'tree';
        const prevArrow = horizontal ? 'ArrowUp' : 'ArrowLeft';
        const nextArrow = horizontal ? 'ArrowDown' : 'ArrowRight';
        if (e.altKey && (e.key === prevArrow || e.key === nextArrow)) {
          s.reorderSibling(sel, e.key === prevArrow ? -1 : 1);
        } else {
          const next = navTarget(s.doc, sel, e.key as ArrowKey);
          if (next) s.select(next);
        }
        return;
      }

      if (e.key === 'Tab') {
        e.preventDefault();
        s.addChild(sel);
      } else if (e.key === 'Enter') {
        e.preventDefault();
        s.addSibling(sel);
      } else if (e.key === 'Delete' || e.key === 'Backspace') {
        if (sel !== s.doc.rootId) {
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
  }, [focusSelected]);

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

          <ThemeMenu />

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

          <span className="w-px h-5 bg-border mx-1" />

          <ToolbarBtn title="Поиск (⌘F)" active={searchOpen} onClick={() => setSearchOpen(true)}>
            <Search size={16} />
          </ToolbarBtn>
          <ToolbarBtn title="Фокус на ветке (⌘.)" disabled={!selectedId} onClick={focusSelected}>
            <Crosshair size={16} />
          </ToolbarBtn>
          <ExportMenu />

          <span className="w-px h-5 bg-border mx-1" />

          <ToolbarBtn
            title="Панель свойств"
            active={inspectorOpen}
            onClick={() => setInspectorOpen((v) => !v)}
          >
            <SlidersHorizontal size={16} />
          </ToolbarBtn>

          <span className="text-xs text-muted w-16 text-right tabular-nums">
            {saving ? 'Сохр…' : 'Сохранено'}
          </span>
        </div>
      </header>

      <div className="flex flex-1 min-h-0">
        <div className="relative flex-1 min-w-0">
          {loading || !doc ? (
            <div className="absolute inset-0 grid place-items-center text-muted">
              <Loader2 className="animate-spin" />
            </div>
          ) : (
            <ReactFlow
              className={['mind-canvas', theme.canvasClass].filter(Boolean).join(' ')}
              nodes={nodes}
              edges={edges}
              nodeTypes={nodeTypes}
              edgeTypes={edgeTypes}
              onNodesChange={onNodesChange}
              onEdgesChange={onEdgesChange}
              onNodeClick={onNodeClick}
              onNodeDoubleClick={onNodeDoubleClick}
              onNodeDragStop={onNodeDragStop}
              onPaneClick={onPaneClick}
              onInit={(inst) => (rfRef.current = inst)}
              nodeOrigin={[0.5, 0.5]}
              nodesDraggable
              nodesConnectable={false}
              disableKeyboardA11y
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

          {searchOpen && <MapSearch onJump={jumpTo} onClose={() => setSearchOpen(false)} />}
        </div>

        {inspectorOpen && <Inspector onClose={() => setInspectorOpen(false)} />}
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
