import { create } from 'zustand';
import type { Mode, CylinderName, SensorName, MaterialColor } from '../types';

// 同步模式物料状态
interface SyncMaterial {
  visible: boolean;
  color: MaterialColor;
  position: [number, number, number];
  startTime: number | null;  // 物料开始移动的时间
  detectedColor: MaterialColor | null;  // 检测到的颜色
  phase: 0 | 1 | 2;  // 0: 未开始, 1: 第1段动画, 2: 第2段动画
}

// 检测结果记录
interface DetectionRecord {
  timestamp: number;
  color: MaterialColor;
  sortedBy: 'sorting1' | 'sorting2';
}

interface DeviceStore {
  // 状态
  mode: Mode;
  conveyorRunning: boolean;
  cylinders: {
    feed: { extended: boolean };
    sorting1: { extended: boolean };
    sorting2: { extended: boolean };
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
    onConveyor: boolean; // 标记物料是否在传送带上（已推出）
    conveyorDelay: number; // 传送带延迟（毫秒），物料到达传送带中心后的停顿时间
  };
  
  // 同步模式状态
  syncMaterial: SyncMaterial;
  detectionHistory: DetectionRecord[];

  // 操作
  setMode: (mode: Mode) => void;
  toggleConveyor: () => void;
  startConveyor: () => void;
  stopConveyor: () => void;
  extendCylinder: (name: CylinderName) => void;
  retractCylinder: (name: CylinderName) => void;
  setSensor: (name: SensorName, active: boolean) => void;
  updateMaterialPosition: (position: [number, number, number]) => void;
  setMaterialOnConveyor: (onConveyor: boolean) => void;
  setMaterialConveyorDelay: (delay: number) => void;
  spawnMaterial: () => void;
  clearMaterial: () => void;
  reset: () => void;
  
  // 同步模式操作
  spawnSyncMaterial: (color: MaterialColor) => void;
  updateSyncMaterial: (updates: Partial<SyncMaterial>) => void;
  clearSyncMaterial: () => void;
  addDetectionRecord: (record: DetectionRecord) => void;
  clearDetectionHistory: () => void;
}

const initialState = {
  mode: 'manual' as Mode,
  conveyorRunning: false,
  cylinders: {
    feed: { extended: false },
    sorting1: { extended: false },
    sorting2: { extended: false },
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
  syncMaterial: {
    visible: false,
    color: 'blue' as MaterialColor,
    position: [-1.3, 1.06, 0] as [number, number, number],
    startTime: null,
    detectedColor: null,
    phase: 0 as 0 | 1 | 2,
  },
  detectionHistory: [] as DetectionRecord[],
};

export const useDeviceStore = create<DeviceStore>((set) => ({
  ...initialState,

  setMode: (mode) => set({ mode }),

  toggleConveyor: () => set((state) => ({ 
    conveyorRunning: !state.conveyorRunning 
  })),

  startConveyor: () => set({ conveyorRunning: true }),

  stopConveyor: () => set({ conveyorRunning: false }),

  extendCylinder: (name) => set((state) => ({
    cylinders: {
      ...state.cylinders,
      [name]: { extended: true },
    },
  })),

  retractCylinder: (name) => set((state) => ({
    cylinders: {
      ...state.cylinders,
      [name]: { extended: false },
    },
  })),

  setSensor: (name, active) => set((state) => ({
    sensors: {
      ...state.sensors,
      [name]: active,
    },
  })),

  updateMaterialPosition: (position) => set((state) => ({
    material: {
      ...state.material,
      position,
    },
  })),

  setMaterialOnConveyor: (onConveyor) => set((state) => ({
    material: {
      ...state.material,
      onConveyor,
    },
  })),

  setMaterialConveyorDelay: (delay) => set((state) => ({
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
  
  // 同步模式操作
  spawnSyncMaterial: (color) => set({
    syncMaterial: {
      visible: true,
      color,
      position: [-1.3, 1.06, 0],
      startTime: Date.now(),
      detectedColor: null,
      phase: 1,
    },
  }),

  updateSyncMaterial: (updates) => set((state) => ({
    syncMaterial: {
      ...state.syncMaterial,
      ...updates,
    },
  })),

  clearSyncMaterial: () => set((state) => ({
    syncMaterial: {
      ...state.syncMaterial,
      visible: false,
      startTime: null,
      detectedColor: null,
      phase: 0,
    },
  })),

  addDetectionRecord: (record) => set((state) => ({
    detectionHistory: [...state.detectionHistory, record],
  })),

  clearDetectionHistory: () => set({ detectionHistory: [] }),
}));
