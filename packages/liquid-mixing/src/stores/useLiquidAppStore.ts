/** 液体混装应用态：模式与连接状态，不持久化、不进快照。 */
import { create } from 'zustand';

export type LiquidMode = 'manual' | 'auto' | 'sim';

interface LiquidAppStore {
  mode: LiquidMode;
  setMode: (mode: LiquidMode) => void;
  plcConnected: boolean;
  setPlcConnected: (on: boolean) => void;
}

export const useLiquidAppStore = create<LiquidAppStore>((set) => ({
  mode: 'manual',
  setMode: (mode) => set({ mode }),
  plcConnected: false,
  setPlcConnected: (plcConnected) => set({ plcConnected }),
}));
