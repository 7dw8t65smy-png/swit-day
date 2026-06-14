// Состояние раздела «Агентства»: список агентств, выбранное агентство и его
// сущности (модели, чаттеры, закрепления, правила). Панели читают отсюда, чтобы
// не дублировать загрузки и держать данные согласованными. selectedId хранится
// в localStorage, чтобы выбранное агентство переживало перезапуск.
import { create } from 'zustand';
import type {
  Agency,
  AgencyAssignment,
  AgencyChatter,
  AgencyModel,
  AgencyPayoutRule
} from '@swit/shared';
import { api } from '../api';

const SELECTED_KEY = 'swit.agency.selected';

interface AgencyStoreState {
  agencies: Agency[];
  selectedId: string | null;
  models: AgencyModel[];
  chatters: AgencyChatter[];
  assignments: AgencyAssignment[];
  rules: AgencyPayoutRule[];
  loading: boolean;
  loadAgencies: () => Promise<void>;
  select: (id: string | null) => void;
  reloadEntities: () => Promise<void>;
  reloadAll: () => Promise<void>;
}

function readSelected(): string | null {
  try {
    return localStorage.getItem(SELECTED_KEY);
  } catch {
    return null;
  }
}

function writeSelected(id: string | null): void {
  try {
    if (id) localStorage.setItem(SELECTED_KEY, id);
    else localStorage.removeItem(SELECTED_KEY);
  } catch {
    /* недоступно — игнорируем */
  }
}

export const useAgencyStore = create<AgencyStoreState>((set, get) => ({
  agencies: [],
  selectedId: readSelected(),
  models: [],
  chatters: [],
  assignments: [],
  rules: [],
  loading: false,

  loadAgencies: async () => {
    const agencies = await api.listAgencies();
    // Если выбранное агентство исчезло (удалено/смена пространства) — берём первое.
    const saved = get().selectedId;
    const stillValid = saved && agencies.some((a) => a.id === saved);
    const nextSelected = stillValid ? saved : agencies[0]?.id ?? null;
    if (nextSelected !== saved) {
      // Выбор сменился (другое пространство/удаление) — сбрасываем сущности,
      // чтобы между loadAgencies и reloadEntities не показать чужие данные.
      writeSelected(nextSelected);
      set({ agencies, selectedId: nextSelected, models: [], chatters: [], assignments: [], rules: [] });
    } else {
      set({ agencies, selectedId: nextSelected });
    }
  },

  select: (id) => {
    if (id === get().selectedId) return;
    writeSelected(id);
    set({ selectedId: id, models: [], chatters: [], assignments: [], rules: [] });
    void get().reloadEntities();
  },

  reloadEntities: async () => {
    const id = get().selectedId;
    if (!id) {
      set({ models: [], chatters: [], assignments: [], rules: [] });
      return;
    }
    set({ loading: true });
    try {
      const [models, chatters, assignments, rules] = await Promise.all([
        api.agencyModels(id),
        api.agencyChatters(id),
        api.agencyAssignments(id),
        api.agencyPayoutRules(id)
      ]);
      // Возможна гонка при быстром переключении: применяем, только если выбор не сменился.
      if (get().selectedId === id) set({ models, chatters, assignments, rules });
    } finally {
      set({ loading: false });
    }
  },

  reloadAll: async () => {
    await get().loadAgencies();
    await get().reloadEntities();
  }
}));
