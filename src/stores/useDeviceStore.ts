import { create } from 'zustand';
import type { Mode, CylinderName, SensorName, MaterialColor } from '../types';

export interface TraceEntry {
  timestamp: number;
  coils: boolean[];
}

export type ScoringItemStatus = 'pending' | 'passed' | 'failed' | 'skipped';

export interface ScoringLogEntry {
  id: string;
  itemId: string;
  label: string;
  status: ScoringItemStatus;
  points: number;
  time: number;
}

interface DeviceStore {
  mode: Mode;
  plcConfig: {
    host: string;
    port: number;
    unitId: number;
  };
  conveyorRunning: boolean;
  cylinders: {
    feed: { extended: boolean; currentExtension: number };
    sorting1: { extended: boolean; currentExtension: number };
    sorting2: { extended: boolean; currentExtension: number };
  };
  sensors: {
    feed: boolean;
    color: boolean;
    material: boolean;
  };
  material: {
    visible: boolean;
    color: MaterialColor;
    position: [number, number, number];
    onConveyor: boolean;
    conveyorDelay: number;
  };

  isRecording: boolean;
  recordedTrace: TraceEntry[];

  score: number;
  scoringStatus: Record<string, ScoringItemStatus>;
  scoringLog: ScoringLogEntry[];
  passedItems: { id: string; message: string; points: number; time: number }[];
  isScoringRunning: boolean;
  scoringPrompt: string;

  isConnected: boolean;
  setConnected: (connected: boolean) => void;
  setPlcConfig: (config: Partial<{ host: string; port: number; unitId: number }>) => void;

  startRecording: () => void;
  stopRecording: () => void;
  addTraceEntry: (coils: boolean[]) => void;
  clearTrace: () => void;

  markScoringItem: (itemId: string, status: ScoringItemStatus, label: string, points: number) => void;
  markItemsSkipped: (items: { itemId: string; label: string; points: number }[]) => void;
  addPassedItem: (message: string, points?: number) => void;
  resetScore: () => void;
  setScoringRunning: (running: boolean) => void;
  setScoringPrompt: (prompt: string) => void;
  randomizeState: () => void;

  setMode: (mode: Mode) => void;
  toggleConveyor: () => void;
  startConveyor: () => void;
  stopConveyor: () => void;
  extendCylinder: (name: CylinderName) => void;
  retractCylinder: (name: CylinderName) => void;
  updateCylinderExtension: (name: CylinderName, extension: number) => void;
  setSensor: (name: SensorName, active: boolean) => void;
  updateMaterialPosition: (position: [number, number, number]) => void;
  setMaterialOnConveyor: (onConveyor: boolean) => void;
  setMaterialConveyorDelay: (delay: number) => void;
  spawnMaterial: () => void;
  clearMaterial: () => void;
  reset: () => void;
  showLabels: boolean;
  toggleLabels: () => void;
}

const initialState = {
  mode: 'manual' as Mode,
  plcConfig: getInitialPlcConfig(),
  showLabels: true,
  conveyorRunning: false,
  cylinders: {
    feed: { extended: false, currentExtension: -0.22 },
    sorting1: { extended: false, currentExtension: -0.22 },
    sorting2: { extended: false, currentExtension: -0.22 },
  },
  sensors: {
    feed: false,
    color: false,
    material: false,
  },
  material: {
    visible: false,
    color: 'blue' as MaterialColor,
    position: [-1.3, 1.06, 0.6] as [number, number, number],
    onConveyor: false,
    conveyorDelay: 0,
  },
  isRecording: false,
  recordedTrace: [],
  score: 0,
  scoringStatus: {} as Record<string, ScoringItemStatus>,
  scoringLog: [],
  passedItems: [],
  isScoringRunning: false,
  scoringPrompt: '',
  isConnected: false,
};

function getInitialPlcConfig() {
  const fallback = {
    host: '127.0.0.1',
    port: 502,
    unitId: 1,
  };

  if (typeof window === 'undefined') {
    return fallback;
  }

  try {
    const raw = window.localStorage.getItem('plc-config');
    if (!raw) return fallback;
    const parsed = JSON.parse(raw);
    return {
      host: typeof parsed.host === 'string' && parsed.host.trim() ? parsed.host : fallback.host,
      port: Number.isInteger(parsed.port) ? parsed.port : fallback.port,
      unitId: Number.isInteger(parsed.unitId) ? parsed.unitId : fallback.unitId,
    };
  } catch {
    return fallback;
  }
}

function persistPlcConfig(config: { host: string; port: number; unitId: number }) {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem('plc-config', JSON.stringify(config));
}

export const useDeviceStore = create<DeviceStore>((set) => ({
  ...initialState,

  setMode: (mode: Mode) => set({ mode }),
  setConnected: (connected: boolean) => set({ isConnected: connected }),
  setPlcConfig: (config) => set((state) => {
    const nextConfig = {
      ...state.plcConfig,
      ...config,
    };
    persistPlcConfig(nextConfig);
    return { plcConfig: nextConfig };
  }),
  setScoringRunning: (running: boolean) => set({ isScoringRunning: running }),

  randomizeState: () => set((state) => ({
    conveyorRunning: true,
    cylinders: {
      feed: { extended: true, currentExtension: state.cylinders.feed.currentExtension },
      sorting1: { extended: true, currentExtension: state.cylinders.sorting1.currentExtension },
      sorting2: { extended: true, currentExtension: state.cylinders.sorting2.currentExtension },
    }
  })),

  toggleConveyor: () => set((state) => ({
    conveyorRunning: !state.conveyorRunning
  })),
  startConveyor: () => set({ conveyorRunning: true }),
  stopConveyor: () => set({ conveyorRunning: false }),

  extendCylinder: (name: CylinderName) => set((state) => ({
    cylinders: {
      ...state.cylinders,
      [name]: { ...state.cylinders[name], extended: true },
    },
  })),
  retractCylinder: (name: CylinderName) => set((state) => ({
    cylinders: {
      ...state.cylinders,
      [name]: { ...state.cylinders[name], extended: false },
    },
  })),
  updateCylinderExtension: (name: CylinderName, extension: number) => set((state) => {
    if (Math.abs(state.cylinders[name].currentExtension - extension) < 0.0001) return state;
    return {
      cylinders: {
        ...state.cylinders,
        [name]: { ...state.cylinders[name], currentExtension: extension },
      },
    };
  }),

  setSensor: (name: SensorName, active: boolean) => set((state) => {
    if (state.sensors[name] === active) return state;
    return {
      sensors: {
        ...state.sensors,
        [name]: active,
      },
    };
  }),

  updateMaterialPosition: (position: [number, number, number]) => set((state) => {
    const old = state.material.position;
    if (
      Math.abs(old[0] - position[0]) < 0.0001 &&
      Math.abs(old[1] - position[1]) < 0.0001 &&
      Math.abs(old[2] - position[2]) < 0.0001
    ) return state;
    return {
      material: {
        ...state.material,
        position,
      },
    };
  }),
  setMaterialOnConveyor: (onConveyor: boolean) => set((state) => ({
    material: {
      ...state.material,
      onConveyor,
    },
  })),
  setMaterialConveyorDelay: (delay: number) => set((state) => ({
    material: {
      ...state.material,
      conveyorDelay: delay,
    },
  })),
  spawnMaterial: () => set({
    material: {
      visible: true,
      color: Math.random() > 0.5 ? 'blue' : 'black',
      position: [-1.3, 1.06, 0.6],
      onConveyor: false,
      conveyorDelay: 0,
    },
  }),
  clearMaterial: () => set((state) => ({
    material: {
      ...state.material,
      visible: false,
      onConveyor: false,
      conveyorDelay: 0,
    },
  })),

  reset: () => set(initialState),
  toggleLabels: () => set((state) => ({ showLabels: !state.showLabels })),

  startRecording: () => set({ isRecording: true, recordedTrace: [] }),
  stopRecording: () => set({ isRecording: false }),
  addTraceEntry: (coils: boolean[]) => set((state) => {
    if (!state.isRecording && !state.isScoringRunning) return state;
    const newTrace = [...state.recordedTrace, { timestamp: Date.now(), coils }];
    if (newTrace.length > 3000) newTrace.splice(0, newTrace.length - 3000);
    return {
      recordedTrace: newTrace,
    };
  }),
  clearTrace: () => set({ recordedTrace: [] }),

  markScoringItem: (itemId: string, status: ScoringItemStatus, label: string, points: number) => set((state) => {
    const currentStatus = state.scoringStatus[itemId];
    if (currentStatus && currentStatus !== 'pending') return state;

    const logId = Math.random().toString(36).substr(2, 9);
    const now = Date.now();

    const newLogEntry: ScoringLogEntry = {
      id: logId,
      itemId,
      label,
      status,
      points: status === 'passed' ? points : 0,
      time: now,
    };

    const newPassedItem = status === 'passed'
      ? [{ id: logId, message: label, points, time: now }]
      : [];

    return {
      scoringStatus: { ...state.scoringStatus, [itemId]: status },
      scoringLog: [...state.scoringLog, newLogEntry],
      passedItems: [...state.passedItems, ...newPassedItem],
      score: status === 'passed' ? Math.min(100, state.score + points) : state.score,
    };
  }),

  markItemsSkipped: (items: { itemId: string; label: string; points: number }[]) => set((state) => {
    const newStatus = { ...state.scoringStatus };
    const newLog: ScoringLogEntry[] = [];
    const now = Date.now();

    for (const item of items) {
      const currentStatus = newStatus[item.itemId];
      if (currentStatus && currentStatus !== 'pending') continue;

      newStatus[item.itemId] = 'skipped';
      newLog.push({
        id: Math.random().toString(36).substr(2, 9),
        itemId: item.itemId,
        label: item.label,
        status: 'skipped',
        points: 0,
        time: now,
      });
    }

    return {
      scoringStatus: newStatus,
      scoringLog: [...state.scoringLog, ...newLog],
    };
  }),

  addPassedItem: (message: string, points = 0) => set((state) => {
    const isDuplicate = state.passedItems.some(item => item.message === message);
    if (isDuplicate) return state;
    const id = Math.random().toString(36).substr(2, 9);
    const now = Date.now();
    return {
      score: Math.min(100, state.score + points),
      passedItems: [...state.passedItems, { id, message, points, time: now }],
      scoringLog: [...state.scoringLog, {
        id,
        itemId: id,
        label: message,
        status: 'passed' as ScoringItemStatus,
        points,
        time: now,
      }],
    };
  }),

  resetScore: () => set({
    score: 0,
    scoringStatus: {},
    scoringLog: [],
    passedItems: [],
    scoringPrompt: '',
  }),

  setScoringPrompt: (prompt: string) => set({
    scoringPrompt: prompt,
  }),
}));
