/** MD520 独立设备的应用态：运行模式与 PLC 连接配置，不持久化。 */
import { create } from 'zustand';

export type VfdAppMode = 'manual' | 'sim';

export interface VfdPlcConfig {
  host: string;
  port: number;
  unitId: number;
  protocol: 'modbus' | 's7' | 'mitsubishi';
  rack: number;
  slot: number;
}

/** 独立虚拟 PLC :1507；接实体 PLC 时从连接预设切换 */
const DEFAULT_CONFIG: VfdPlcConfig = {
  host: '127.0.0.1',
  port: 1507,
  unitId: 1,
  protocol: 'modbus',
  rack: 0,
  slot: 1,
};

interface VfdAppStore {
  mode: VfdAppMode;
  plcConfig: VfdPlcConfig;
  connected: boolean;
  setMode: (mode: VfdAppMode) => void;
  setPlcConfig: (config: Partial<VfdPlcConfig>) => void;
  setConnected: (connected: boolean) => void;
}

export const useVfdAppStore = create<VfdAppStore>((set) => ({
  mode: 'manual',
  plcConfig: DEFAULT_CONFIG,
  connected: false,
  setMode: (mode) => set({ mode }),
  setPlcConfig: (config) => set((s) => ({ plcConfig: { ...s.plcConfig, ...config } })),
  setConnected: (connected) => set({ connected }),
}));
