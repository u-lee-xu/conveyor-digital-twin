/** MD520 独立设备的应用态：运行模式与 PLC 连接配置，不持久化。 */
import { create } from 'zustand';

export type VfdAppMode = 'manual' | 'sim';
/** 三菱连接目标：仿真器可用 X/Y，实物 PLC 无实际接线统一用 M 区 */
export type VfdMitsubishiTarget = 'simulator' | 'real';

export interface VfdPlcConfig {
  host: string;
  port: number;
  unitId: number;
  protocol: 'modbus' | 's7' | 'mitsubishi';
  rack: number;
  slot: number;
}

/** 教学交付默认连外部 PLC 仿真软件 / 实物 PLC 的 Modbus TCP :502；现场 IP 在连接面板填写 */
const DEFAULT_CONFIG: VfdPlcConfig = {
  host: '127.0.0.1',
  port: 502,
  unitId: 1,
  protocol: 'modbus',
  rack: 0,
  slot: 1,
};

interface VfdAppStore {
  mode: VfdAppMode;
  plcConfig: VfdPlcConfig;
  connected: boolean;
  /** 不持久化：刷新回默认仿真档，避免上次实验的实体档污染新会话 */
  mitsubishiProfile: VfdMitsubishiTarget;
  setMode: (mode: VfdAppMode) => void;
  setPlcConfig: (config: Partial<VfdPlcConfig>) => void;
  setConnected: (connected: boolean) => void;
  setMitsubishiProfile: (target: VfdMitsubishiTarget) => void;
}

export const useVfdAppStore = create<VfdAppStore>((set) => ({
  mode: 'manual',
  plcConfig: DEFAULT_CONFIG,
  connected: false,
  mitsubishiProfile: 'simulator',
  setMode: (mode) => set({ mode }),
  setPlcConfig: (config) => set((s) => ({ plcConfig: { ...s.plcConfig, ...config } })),
  setConnected: (connected) => set({ connected }),
  setMitsubishiProfile: (target) => set({ mitsubishiProfile: target }),
}));
