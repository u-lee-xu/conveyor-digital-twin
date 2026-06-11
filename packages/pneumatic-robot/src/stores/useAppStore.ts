import { create } from 'zustand';

export type AppMode = 'manual' | 'sim';

interface AppStoreState {
  mode: AppMode;
  setMode: (mode: AppMode) => void;

  /** 仿真模式 - 运行状态 */
  simRunning: boolean;
  simEStop: boolean;       // 急停
  setSimRunning: (running: boolean) => void;
  setSimEStop: (estop: boolean) => void;
}

export const useAppStore = create<AppStoreState>((set) => ({
  mode: 'manual',
  setMode: (mode) => set({ mode }),

  simRunning: false,
  simEStop: false,
  setSimRunning: (running) => set({ simRunning: running }),
  setSimEStop: (estop) => set({ simEStop: estop }),
}));