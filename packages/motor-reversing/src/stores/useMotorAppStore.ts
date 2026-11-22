/** 应用态：模式与连接状态，不持久化、不进快照。 */
import { create } from 'zustand';

export type MotorMode = 'manual' | 'auto' | 'sim';

interface MotorAppStore {
  mode: MotorMode;
  setMode: (mode: MotorMode) => void;
  plcConnected: boolean;
  setPlcConnected: (on: boolean) => void;
}

export const useMotorAppStore = create<MotorAppStore>((set) => ({
  mode: 'manual',
  setMode: (mode) => set({ mode }),
  plcConnected: false,
  setPlcConnected: (plcConnected) => set({ plcConnected }),
}));
