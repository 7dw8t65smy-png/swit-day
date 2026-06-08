import { create } from 'zustand';
import { nanoid } from 'nanoid';
import type { MindMapDoc, MindMapLayout, MindMapNode } from '@swit/shared';
import { api } from '../../api';
import { pushToast } from '../../hooks/useToasts';
import * as ops from './doc';

const SAVE_DEBOUNCE_MS = 600;
const MAX_HISTORY = 120;

let saveTimer: ReturnType<typeof setTimeout> | null = null;

interface MindMapState {
  mapId: string | null;
  title: string;
  doc: MindMapDoc | null;
  selectedId: string | null;
  editingId: string | null;
  loading: boolean;
  saving: boolean;
  past: MindMapDoc[];
  future: MindMapDoc[];

  load: (id: string) => Promise<void>;
  reset: () => void;
  setTitle: (t: string) => void;
  select: (id: string | null) => void;
  setEditing: (id: string | null) => void;

  /** История-осознающая мутация документа. */
  apply: (fn: (doc: MindMapDoc) => MindMapDoc) => void;
  addChild: (parentId: string) => string | null;
  addSibling: (nodeId: string) => string | null;
  removeNode: (id: string) => void;
  patchNode: (id: string, patch: Partial<Omit<MindMapNode, 'id' | 'parentId'>>) => void;
  toggleCollapse: (id: string) => void;
  setLayout: (layout: MindMapLayout) => void;
  setTheme: (theme: string) => void;
  addTag: (id: string, tag: string) => void;
  removeTag: (id: string, tag: string) => void;
  reorderSibling: (id: string, dir: -1 | 1) => void;
  moveNode: (id: string, newParentId: string) => void;
  /** Раскрывает предков узла и выделяет его (для перехода из поиска). */
  reveal: (id: string) => void;

  undo: () => void;
  redo: () => void;
}

function scheduleSave(get: () => MindMapState, set: (p: Partial<MindMapState>) => void): void {
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    void (async () => {
      const { mapId, doc, title } = get();
      if (!mapId || !doc) return;
      set({ saving: true });
      try {
        await api.updateMap(mapId, { title, content: JSON.stringify(doc) });
      } catch {
        pushToast({ kind: 'error', message: 'Не удалось сохранить карту' });
      } finally {
        set({ saving: false });
      }
    })();
  }, SAVE_DEBOUNCE_MS);
}

export const useMindMap = create<MindMapState>((set, get) => ({
  mapId: null,
  title: '',
  doc: null,
  selectedId: null,
  editingId: null,
  loading: false,
  saving: false,
  past: [],
  future: [],

  load: async (id) => {
    set({ loading: true });
    try {
      const row = await api.getMap(id);
      const doc = JSON.parse(row.content) as MindMapDoc;
      set({
        mapId: row.id,
        title: row.title,
        doc,
        selectedId: doc.rootId,
        editingId: null,
        past: [],
        future: [],
        loading: false
      });
    } catch {
      pushToast({ kind: 'error', message: 'Не удалось открыть карту' });
      set({ loading: false });
    }
  },

  reset: () =>
    set({
      mapId: null,
      title: '',
      doc: null,
      selectedId: null,
      editingId: null,
      past: [],
      future: []
    }),

  setTitle: (t) => {
    set({ title: t });
    scheduleSave(get, set);
  },

  select: (id) => set({ selectedId: id }),
  setEditing: (id) => set({ editingId: id }),

  apply: (fn) => {
    const cur = get().doc;
    if (!cur) return;
    const next = fn(cur);
    if (next === cur) return; // операция-ноп — не засоряем историю
    const past = [...get().past, cur].slice(-MAX_HISTORY);
    set({ doc: next, past, future: [] });
    scheduleSave(get, set);
  },

  addChild: (parentId) => {
    if (!get().doc) return null;
    const id = nanoid();
    get().apply((d) => ops.addChild(d, parentId, id));
    set({ selectedId: id, editingId: id });
    return id;
  },

  addSibling: (nodeId) => {
    if (!get().doc) return null;
    const id = nanoid();
    get().apply((d) => ops.addSibling(d, nodeId, id));
    set({ selectedId: id, editingId: id });
    return id;
  },

  removeNode: (id) => {
    const cur = get().doc;
    if (!cur) return;
    const parent = ops.getNode(cur, id)?.parentId ?? cur.rootId;
    get().apply((d) => ops.deleteNode(d, id));
    set({ selectedId: parent, editingId: null });
  },

  patchNode: (id, patch) => get().apply((d) => ops.updateNode(d, id, patch)),
  toggleCollapse: (id) => get().apply((d) => ops.toggleCollapse(d, id)),
  setLayout: (layout) => get().apply((d) => ops.setLayout(d, layout)),
  setTheme: (theme) => get().apply((d) => ops.setTheme(d, theme)),
  addTag: (id, tag) => get().apply((d) => ops.addTag(d, id, tag)),
  removeTag: (id, tag) => get().apply((d) => ops.removeTag(d, id, tag)),
  reorderSibling: (id, dir) => get().apply((d) => ops.reorderSibling(d, id, dir)),
  moveNode: (id, newParentId) => get().apply((d) => ops.moveNode(d, id, newParentId)),
  reveal: (id) => {
    get().apply((d) => ops.expandTo(d, id));
    set({ selectedId: id });
  },

  undo: () => {
    const { past, doc, future } = get();
    if (!doc || past.length === 0) return;
    const prev = past[past.length - 1];
    set({ doc: prev, past: past.slice(0, -1), future: [doc, ...future].slice(0, MAX_HISTORY) });
    scheduleSave(get, set);
  },

  redo: () => {
    const { future, doc, past } = get();
    if (!doc || future.length === 0) return;
    const next = future[0];
    set({ doc: next, future: future.slice(1), past: [...past, doc].slice(-MAX_HISTORY) });
    scheduleSave(get, set);
  }
}));
