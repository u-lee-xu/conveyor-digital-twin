import { create } from 'zustand';

export type AppMode = 'manual' | 'auto' | 'sim' | 'scoring';

interface AppStoreState {
  mode: AppMode;
  setMode: (mode: AppMode) => void;
  isConnected: boolean;
  setConnected: (connected: boolean) => void;
  plcConfig: {
    host: string;
    port: number;
    unitId: number;
    protocol: 'modbus' | 's7';
    rack: number;
    slot: number;
  };
  setPlcConfig: (config: Partial<AppStoreState['plcConfig']>) => void;
  showLabels: boolean;
  toggleLabels: () => void;
}

function getInitialPlcConfig() {
  const fallback = {
    host: '127.0.0.1',
    port: 502,
    unitId: 1,
    protocol: 'modbus' as const,
    rack: 0,
    slot: 1,
  };

  if (typeof window === 'undefined') return fallback;

  try {
    const raw = window.localStorage.getItem('plc-config');
    if (!raw) return fallback;
    const parsed = JSON.parse(raw);
    return {
      host: typeof parsed.host === 'string' && parsed.host.trim() ? parsed.host : fallback.host,
      port: Number.isInteger(parsed.port) ? parsed.port : fallback.port,
      unitId: Number.isInteger(parsed.unitId) ? parsed.unitId : fallback.unitId,
      protocol: (parsed.protocol === 's7' ? 's7' : 'modbus') as 'modbus' | 's7',
      rack: Number.isInteger(parsed.rack) ? parsed.rack : fallback.rack,
      slot: Number.isInteger(parsed.slot) ? parsed.slot : fallback.slot,
    };
  } catch {
    return fallback;
  }
}

function persistPlcConfig(config: AppStoreState['plcConfig']) {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem('plc-config', JSON.stringify(config));
}

export const useAppStore = create<AppStoreState>((set) => ({
  mode: 'manual',
  setMode: (mode) => set({ mode }),
  isConnected: false,
  setConnected: (connected) => set({ isConnected: connected }),
  plcConfig: getInitialPlcConfig(),
  setPlcConfig: (config) => set((state) => {
    const nextConfig = { ...state.plcConfig, ...config };
    persistPlcConfig(nextConfig);
    return { plcConfig: nextConfig };
  }),
  showLabels: true,
  toggleLabels: () => set((state) => ({ showLabels: !state.showLabels })),
}));
