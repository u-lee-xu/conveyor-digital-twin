import { create } from 'zustand';
import type { Mode, CylinderName, SensorName, MaterialColor } from '../types';

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
  
  // 操作
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
      [name]: { ...state.cylinders[name], extended: true },
    },
  })),

  retractCylinder: (name) => set((state) => ({
    cylinders: {
      ...state.cylinders,
      [name]: { ...state.cylinders[name], extended: false },
    },
  })),

  updateCylinderExtension: (name, extension) => set((state) => ({
    cylinders: {
      ...state.cylinders,
      [name]: { ...state.cylinders[name], currentExtension: extension },
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
  
  toggleLabels: () => set((state) => ({ showLabels: !state.showLabels })),
}));
