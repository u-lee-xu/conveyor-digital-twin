/** 龙门场景应用态：模式与连接状态，不持久化。三模式与配药场景一致。 */
import { create } from 'zustand';

export type GantryMode = 'manual' | 'auto' | 'sim';

interface GantryAppStore {
  mode: GantryMode;
  setMode: (mode: GantryMode) => void;
  plcConnected: boolean;
  setPlcConnected: (on: boolean) => void;
}

export const useGantryAppStore = create<GantryAppStore>((set) => ({
  mode: 'manual',
  setMode: (mode) => set({ mode }),
  plcConnected: false,
  setPlcConnected: (plcConnected) => set({ plcConnected }),
}));
