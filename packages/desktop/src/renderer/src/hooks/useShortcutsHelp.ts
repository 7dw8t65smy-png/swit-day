import { create } from 'zustand';

/**
 * Глобальное состояние оверлея «Горячие клавиши» (открывается по `?`).
 *
 * Зеркалит подход useCommandPalette: держим только open/close-флаг в zustand,
 * чтобы единственный глобальный keydown-листенер (App.tsx) переключал оверлей,
 * а сам ShortcutsHelp.tsx читал состояние и оверлеил любую страницу.
 *
 * Никакого сетевого/дискового IO здесь нет — только in-memory boolean.
 */
interface ShortcutsHelpState {
  isOpen: boolean;
  open: () => void;
  close: () => void;
  toggle: () => void;
}

export const useShortcutsHelp = create<ShortcutsHelpState>((set) => ({
  isOpen: false,
  open: () => set({ isOpen: true }),
  close: () => set({ isOpen: false }),
  toggle: () => set((s) => ({ isOpen: !s.isOpen }))
}));
