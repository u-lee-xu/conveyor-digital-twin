import { create } from 'zustand';
import type { Mode, CylinderName, MaterialColor } from '../types';

type SensorName = 'feed' | 'color' | 'material';

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
  };

  // 操作
  setMode: (mode: Mode) => void;
  toggleConveyor: () => void;
  startConveyor: () => void;
  stopConveyor: () => void;
  extendCylinder: (name: CylinderName) => void;
  retractCylinder: (name: CylinderName) => void;
  setSensor: (name: SensorName, active: boolean) => void;
  updateMaterialPosition: (position: [number, number, number]) => void;
  spawnMaterial: () => void;
  clearMaterial: () => void;
  reset: () => void;
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

  spawnMaterial: () => set({
    material: {
      visible: true,
      color: Math.random() > 0.5 ? 'blue' : 'black',
      position: [-1.3, 1.06, 0.6],
    },
  }),

  clearMaterial: () => set((state) => ({
    material: {
      ...state.material,
      visible: false,
    },
  })),

  reset: () => set(initialState),
}));
