/** 龙门场景应用态：模式与连接状态，不持久化 */
import { create } from 'zustand';

export type GantryMode = 'manual' | 'sim';

interface GantryAppStore {
  mode: GantryMode;
  setMode: (mode: GantryMode) => void;
}

export const useGantryAppStore = create<GantryAppStore>((set) => ({
  mode: 'manual',
  setMode: (mode) => set({ mode }),
}));
