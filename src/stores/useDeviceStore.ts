import { create } from 'zustand';
import type { Mode, CylinderName, SensorName, MaterialColor } from '../types';

export interface TraceEntry {
  timestamp: number;
  coils: boolean[];
}

interface DeviceStore {
  // 状态
  mode: Mode;
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
  
  // 录制相关
  isRecording: boolean;
  recordedTrace: TraceEntry[];
  
  // 评分系统
  score: number;
  penalties: { id: string; message: string; points: number; time: number }[];
  passedItems: { id: string; message: string; time: number }[];
  isScoringRunning: boolean;
  
  // 连接状态
  isConnected: boolean;
  setConnected: (connected: boolean) => void;
  
  // 录制操作
  startRecording: () => void;
  stopRecording: () => void;
  addTraceEntry: (coils: boolean[]) => void;
  clearTrace: () => void;
  
  // 评分操作
  addPenalty: (message: string, points: number) => void;
  addPassedItem: (message: string) => void;
  resetScore: () => void;
  setScoringRunning: (running: boolean) => void;
  randomizeState: () => void;
  
  // 基础设备操作
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
  
  // 场景控制
  showLabels: boolean;
  toggleLabels: () => void;
}

const initialState = {
  mode: 'manual' as Mode,
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
  score: 100,
  penalties: [],
  passedItems: [],
  isScoringRunning: false,
  isConnected: false,
};

export const useDeviceStore = create<DeviceStore>((set) => ({
  ...initialState,

  setMode: (mode: Mode) => set({ mode }),
  
  setConnected: (connected: boolean) => set({ isConnected: connected }),

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

  updateCylinderExtension: (name: CylinderName, extension: number) => set((state) => ({
    cylinders: {
      ...state.cylinders,
      [name]: { ...state.cylinders[name], currentExtension: extension },
    },
  })),

  setSensor: (name: SensorName, active: boolean) => set((state) => ({
    sensors: {
      ...state.sensors,
      [name]: active,
    },
  })),

  updateMaterialPosition: (position: [number, number, number]) => set((state) => ({
    material: {
      ...state.material,
      position,
    },
  })),

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
    return {
      recordedTrace: [...state.recordedTrace, { timestamp: Date.now(), coils }]
    };
  }),

  clearTrace: () => set({ recordedTrace: [] }),

  addPenalty: (message: string, points: number) => set((state) => {
    const now = Date.now();
    const isDuplicate = state.penalties.some(p => p.message === message && (now - p.time < 3000));
    if (isDuplicate) return state;

    return {
      score: Math.max(0, state.score - points),
      penalties: [...state.penalties, { id: Math.random().toString(36).substr(2, 9), message, points, time: now }]
    };
  }),

  addPassedItem: (message: string) => set((state) => {
    const isDuplicate = state.passedItems.some(item => item.message === message);
    if (isDuplicate) return state;
    return {
      passedItems: [...state.passedItems, { id: Math.random().toString(36).substr(2, 9), message, time: Date.now() }]
    };
  }),

  resetScore: () => set({ score: 100, penalties: [], passedItems: [] }),
}));
