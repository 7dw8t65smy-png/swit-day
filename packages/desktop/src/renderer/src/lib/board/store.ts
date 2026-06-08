import { create } from 'zustand';
import { nanoid } from 'nanoid';
import type { BoardDoc, BoardElement, BoardElementStyle, BoardElementType } from '@swit/shared';
import { api } from '../../api';
import { pushToast } from '../../hooks/useToasts';
import * as ops from './doc';
import type { AlignMode } from './doc';

const SAVE_DEBOUNCE_MS = 600;
const MAX_HISTORY = 120;

// Таймеры сохранения привязаны к конкретной доске: быстрый переход между
// досками не теряет несохранённые правки (как в mindmap store).
const saveTimers = new Map<string, ReturnType<typeof setTimeout>>();

interface BoardState {
  boardId: string | null;
  title: string;
  doc: BoardDoc | null;
  selectedIds: string[];
  editingId: string | null;
  loading: boolean;
  saving: boolean;
  past: BoardDoc[];
  future: BoardDoc[];

  load: (id: string) => Promise<void>;
  reset: () => void;
  setTitle: (t: string) => void;
  select: (ids: string[]) => void;
  toggleSelect: (id: string) => void;
  setEditing: (id: string | null) => void;

  apply: (fn: (doc: BoardDoc) => BoardDoc) => void;
  addElement: (type: BoardElementType, x: number, y: number) => string | null;
  patchElement: (id: string, patch: Partial<Omit<BoardElement, 'id' | 'type' | 'style'>>) => void;
  styleSelected: (patch: BoardElementStyle) => void;
  moveElement: (id: string, x: number, y: number) => void;
  resizeElement: (
    id: string,
    rect: { x: number; y: number; width: number; height: number }
  ) => void;
  removeSelected: () => void;
  bringToFront: () => void;
  sendToBack: () => void;
  addConnector: (from: string, to: string) => void;
  addImage: (src: string, x: number, y: number) => string | null;
  addDrawing: (el: Omit<BoardElement, 'zIndex'>) => string | null;
  group: () => void;
  ungroup: () => void;
  align: (mode: AlignMode) => void;
  distribute: (axis: 'h' | 'v') => void;
  selectGroup: (id: string) => void;

  undo: () => void;
  redo: () => void;
}

function scheduleSave(get: () => BoardState, set: (p: Partial<BoardState>) => void): void {
  const { boardId, doc, title } = get();
  if (!boardId || !doc) return;

  const old = saveTimers.get(boardId);
  if (old) clearTimeout(old);

  const timer = setTimeout(() => {
    saveTimers.delete(boardId);
    void (async () => {
      if (get().boardId === boardId) set({ saving: true });
      try {
        await api.updateBoard(boardId, { title, content: JSON.stringify(doc) });
      } catch {
        pushToast({ kind: 'error', message: 'Не удалось сохранить доску' });
      } finally {
        if (get().boardId === boardId) set({ saving: false });
      }
    })();
  }, SAVE_DEBOUNCE_MS);

  saveTimers.set(boardId, timer);
}

function parseStoredBoard(content: string): BoardDoc {
  try {
    return ops.normalizeBoardDoc(JSON.parse(content));
  } catch {
    return ops.createBlankBoard();
  }
}

export const useBoard = create<BoardState>((set, get) => ({
  boardId: null,
  title: '',
  doc: null,
  selectedIds: [],
  editingId: null,
  loading: false,
  saving: false,
  past: [],
  future: [],

  load: async (id) => {
    set({ loading: true });
    try {
      const row = await api.getBoard(id);
      const doc = parseStoredBoard(row.content);
      set({
        boardId: row.id,
        title: row.title,
        doc,
        selectedIds: [],
        editingId: null,
        past: [],
        future: [],
        loading: false
      });
    } catch {
      pushToast({ kind: 'error', message: 'Не удалось открыть доску' });
      set({ loading: false });
    }
  },

  reset: () =>
    set({
      boardId: null,
      title: '',
      doc: null,
      selectedIds: [],
      editingId: null,
      past: [],
      future: []
    }),

  setTitle: (t) => {
    set({ title: t });
    scheduleSave(get, set);
  },

  select: (ids) => set({ selectedIds: ids }),
  toggleSelect: (id) =>
    set((s) => ({
      selectedIds: s.selectedIds.includes(id)
        ? s.selectedIds.filter((x) => x !== id)
        : [...s.selectedIds, id]
    })),
  setEditing: (id) => set({ editingId: id }),

  apply: (fn) => {
    const cur = get().doc;
    if (!cur) return;
    const next = fn(cur);
    if (next === cur) return;
    const past = [...get().past, cur].slice(-MAX_HISTORY);
    set({ doc: next, past, future: [] });
    scheduleSave(get, set);
  },

  addElement: (type, x, y) => {
    if (!get().doc) return null;
    const id = nanoid();
    get().apply((d) => ops.addElement(d, ops.defaultElement(type, id, x, y)));
    set({ selectedIds: [id], editingId: type === 'text' || type === 'card' ? id : null });
    return id;
  },

  patchElement: (id, patch) => get().apply((d) => ops.updateElement(d, id, patch)),

  styleSelected: (patch) => {
    const ids = get().selectedIds;
    if (!ids.length) return;
    get().apply((d) => ids.reduce((acc, id) => ops.updateStyle(acc, id, patch), d));
  },

  moveElement: (id, x, y) => get().apply((d) => ops.moveElement(d, id, x, y)),
  resizeElement: (id, rect) => get().apply((d) => ops.resizeElement(d, id, rect)),

  removeSelected: () => {
    const ids = get().selectedIds;
    if (!ids.length) return;
    get().apply((d) => ops.removeElements(d, ids));
    set({ selectedIds: [], editingId: null });
  },

  bringToFront: () => {
    const ids = get().selectedIds;
    if (ids.length) get().apply((d) => ops.bringToFront(d, ids));
  },
  sendToBack: () => {
    const ids = get().selectedIds;
    if (ids.length) get().apply((d) => ops.sendToBack(d, ids));
  },

  addConnector: (from, to) => {
    if (!get().doc) return;
    const id = nanoid();
    get().apply((d) => ops.addConnector(d, { id, from, to }));
  },
  addImage: (src, x, y) => {
    if (!get().doc) return null;
    const id = nanoid();
    get().apply((d) => ops.addElement(d, { ...ops.defaultElement('image', id, x, y), src }));
    set({ selectedIds: [id], editingId: null });
    return id;
  },
  addDrawing: (el) => {
    if (!get().doc) return null;
    get().apply((d) => ops.addElement(d, el));
    set({ selectedIds: [el.id], editingId: null });
    return el.id;
  },
  group: () => {
    const ids = get().selectedIds;
    if (ids.length < 2) return;
    const gid = nanoid();
    get().apply((d) => ops.group(d, ids, gid));
  },
  ungroup: () => {
    const ids = get().selectedIds;
    if (ids.length) get().apply((d) => ops.ungroup(d, ids));
  },
  align: (mode) => {
    const ids = get().selectedIds;
    if (ids.length >= 2) get().apply((d) => ops.alignElements(d, ids, mode));
  },
  distribute: (axis) => {
    const ids = get().selectedIds;
    if (ids.length >= 3) get().apply((d) => ops.distributeElements(d, ids, axis));
  },
  selectGroup: (id) => {
    const d = get().doc;
    if (!d) return;
    set({ selectedIds: ops.groupMembers(d, id) });
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
