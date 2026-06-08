import { create } from 'zustand';

/**
 * Глобальное состояние командной палитры (Cmd+K / Ctrl+K).
 *
 * Держим только open/close-флаг в zustand, чтобы:
 *  - один глобальный keydown-листенер (App.tsx) мог переключать палитру;
 *  - сама палитра (CommandPalette.tsx) читала это состояние и оверлеила любую страницу.
 *
 * Никакого сетевого/дискового IO здесь нет — только in-memory boolean.
 */
interface CommandPaletteState {
  isOpen: boolean;
  open: () => void;
  close: () => void;
  toggle: () => void;
}

export const useCommandPalette = create<CommandPaletteState>((set) => ({
  isOpen: false,
  open: () => set({ isOpen: true }),
  close: () => set({ isOpen: false }),
  toggle: () => set((s) => ({ isOpen: !s.isOpen }))
}));
