import { create } from 'zustand';
import type { CanvasDoc } from '@swit/shared';
import { api } from '../../api';
import { pushToast } from '../../hooks/useToasts';
import { useMindMap } from '../mindmap/store';
import { useBoard } from '../board/store';
import { createBlankDoc, normalizeMindMapDoc } from '../mindmap/doc';
import { createBlankBoard, normalizeBoardDoc } from '../board/doc';

// Координатор единого холста. Документ = карта (useMindMap) + доска (useBoard) +
// origin. Под-сторы гидрируем БЕЗ mapId/boardId, чтобы их собственный автосейв
// не сработал (он рано выходит при отсутствии id) — сохраняем всё вместе сами.

const SAVE_DEBOUNCE_MS = 600;
const ROOT_FALLBACK = 'root';

let saveTimer: ReturnType<typeof setTimeout> | null = null;
let unsubs: Array<() => void> = [];

interface CanvasMetaState {
  canvasId: string | null;
  title: string;
  originX: number;
  originY: number;
  loading: boolean;
  saving: boolean;
  load: (id: string) => Promise<void>;
  reset: () => void;
  setTitle: (t: string) => void;
  setOrigin: (x: number, y: number) => void;
  scheduleSave: () => void;
}

function buildContent(get: () => CanvasMetaState): string {
  const { originX, originY } = get();
  const doc: CanvasDoc = {
    mindmap: useMindMap.getState().doc ?? createBlankDoc(ROOT_FALLBACK),
    board: useBoard.getState().doc ?? createBlankBoard(),
    origin: { x: originX, y: originY }
  };
  return JSON.stringify(doc);
}

export const useCanvasMeta = create<CanvasMetaState>((set, get) => ({
  canvasId: null,
  title: '',
  originX: 0,
  originY: 0,
  loading: false,
  saving: false,

  scheduleSave: () => {
    const { canvasId } = get();
    if (!canvasId) return;
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      saveTimer = null;
      const id = get().canvasId;
      if (!id) return;
      const content = buildContent(get);
      const title = get().title;
      set({ saving: true });
      void api
        .updateCanvas(id, { title, content })
        .catch(() => pushToast({ kind: 'error', message: 'Не удалось сохранить холст' }))
        .finally(() => {
          if (get().canvasId === id) set({ saving: false });
        });
    }, SAVE_DEBOUNCE_MS);
  },

  load: async (id) => {
    set({ loading: true });
    try {
      const row = await api.getCanvas(id);
      const parsed = JSON.parse(row.content) as Partial<CanvasDoc>;
      const mindmap = normalizeMindMapDoc(parsed?.mindmap ?? null, ROOT_FALLBACK);
      const board = normalizeBoardDoc(parsed?.board ?? null);
      const ox = typeof parsed?.origin?.x === 'number' ? parsed.origin.x : 0;
      const oy = typeof parsed?.origin?.y === 'number' ? parsed.origin.y : 0;

      // Гидрируем под-сторы без id — их scheduleSave станет no-op.
      useMindMap.setState({
        mapId: null,
        title: '',
        doc: mindmap,
        selectedId: null,
        editingId: null,
        past: [],
        future: []
      });
      useBoard.setState({
        boardId: null,
        title: '',
        doc: board,
        selectedIds: [],
        editingId: null,
        past: [],
        future: []
      });

      set({ canvasId: id, title: row.title, originX: ox, originY: oy, loading: false });

      // Любое изменение документа карты/доски → отложенное сохранение всего холста.
      unsubs.forEach((u) => u());
      unsubs = [
        useMindMap.subscribe((s, prev) => {
          if (s.doc !== prev.doc) get().scheduleSave();
        }),
        useBoard.subscribe((s, prev) => {
          if (s.doc !== prev.doc) get().scheduleSave();
        })
      ];
    } catch {
      pushToast({ kind: 'error', message: 'Не удалось открыть холст' });
      set({ loading: false });
    }
  },

  reset: () => {
    unsubs.forEach((u) => u());
    unsubs = [];
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = null;
    useMindMap.getState().reset();
    useBoard.getState().reset();
    set({ canvasId: null, title: '', originX: 0, originY: 0, saving: false });
  },

  setTitle: (t) => {
    set({ title: t });
    get().scheduleSave();
  },

  setOrigin: (x, y) => {
    set({ originX: x, originY: y });
    get().scheduleSave();
  }
}));

/** Контент пустого холста: только корень карты, доска пустая. */
export function blankCanvasContent(rootId: string, rootText = 'Центральная идея'): string {
  const doc: CanvasDoc = {
    mindmap: createBlankDoc(rootId, rootText),
    board: createBlankBoard(),
    origin: { x: 0, y: 0 }
  };
  return JSON.stringify(doc);
}
