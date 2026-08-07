import { create } from 'zustand';

export type AppMode = 'manual' | 'auto' | 'sim' | 'scoring';

interface AppStoreState {
  mode: AppMode;
  setMode: (mode: AppMode) => void;

  /** 仿真模式 - 运行状态 */
  simRunning: boolean;
  simEStop: boolean;       // 急停
  setSimRunning: (running: boolean) => void;
  setSimEStop: (estop: boolean) => void;

  /** 演示模式 - 状态显示 */
  demoRunning: boolean;
  demoEStop: boolean;      // 急停
  demoPhase: string;       // 当前相位文本（如"东西绿·南北红"）
  demoCountdown: { ew: number; ns: number };  // 两方向当前相位剩余秒数（独立计时）
  setDemoRunning: (running: boolean) => void;
  setDemoEStop: (estop: boolean) => void;
  setDemoPhase: (phase: string) => void;
  setDemoCountdown: (ew: number, ns: number) => void;
}

export const useAppStore = create<AppStoreState>((set) => ({
  mode: 'manual',
  setMode: (mode) => set({ mode }),

  simRunning: false,
  simEStop: false,
  setSimRunning: (running) => set({ simRunning: running }),
  setSimEStop: (estop) => set({ simEStop: estop }),

  demoRunning: false,
  demoEStop: false,
  demoPhase: '待机',
  demoCountdown: { ew: 0, ns: 0 },
  setDemoRunning: (running) => set({ demoRunning: running }),
  setDemoEStop: (estop) => set({ demoEStop: estop }),
  setDemoPhase: (phase) => set({ demoPhase: phase }),
  setDemoCountdown: (ew, ns) => set({ demoCountdown: { ew, ns } }),
}));
