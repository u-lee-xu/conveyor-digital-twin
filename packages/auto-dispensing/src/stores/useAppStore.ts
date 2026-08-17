import { create } from 'zustand';

export type AppMode = 'manual' | 'auto' | 'sim' | 'scoring';

interface AppStoreState {
  mode: AppMode;
  setMode: (mode: AppMode) => void;
  isConnected: boolean;
  setConnected: (connected: boolean) => void;
  /** 仿真模式 - 运行状态 */
  simRunning: boolean;
  simEStop: boolean;
  setSimRunning: (running: boolean) => void;
  setSimEStop: (estop: boolean) => void;
  /** 三维场景部件标签显隐 */
  showLabels: boolean;
  setShowLabels: (show: boolean) => void;
}

export const useAppStore = create<AppStoreState>((set) => ({
  mode: 'manual',
  setMode: (mode) => set({ mode }),
  isConnected: false,
  setConnected: (connected) => set({ isConnected: connected }),
  simRunning: false,
  simEStop: false,
  setSimRunning: (running) => set({ simRunning: running }),
  setSimEStop: (estop) => set({ simEStop: estop }),
  showLabels: true,
  setShowLabels: (show) => set({ showLabels: show }),
}));