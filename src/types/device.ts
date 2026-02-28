// 运行模式类型
export type Mode = 'manual' | 'auto' | 'sync' | 'sim';

// 气缸状态
export interface CylinderState {
  extended: boolean;
}

// 气缸名称
export type CylinderName = 'feed' | 'sorting1' | 'sorting2';

// 所有气缸状态
export interface CylindersState {
  feed: CylinderState;
  sorting1: CylinderState;
  sorting2: CylinderState;
}

// 传感器状态
export interface SensorsState {
  feed: boolean;      // 上料传感器
  color: boolean;     // 色标传感器
  material: boolean;  // 物料传感器
}

// 物料颜色
export type MaterialColor = 'blue' | 'black';

// 物料状态
export interface MaterialState {
  visible: boolean;
  color: MaterialColor;
  position: [number, number, number];
}

// 完整设备状态
export interface DeviceState {
  mode: Mode;
  conveyorRunning: boolean;
  cylinders: CylindersState;
  sensors: SensorsState;
  material: MaterialState;
}

// 设备操作
export interface DeviceActions {
  setMode: (mode: Mode) => void;
  toggleConveyor: () => void;
  startConveyor: () => void;
  stopConveyor: () => void;
  extendCylinder: (name: CylinderName) => void;
  retractCylinder: (name: CylinderName) => void;
  spawnMaterial: () => void;
  clearMaterial: () => void;
  reset: () => void;
}
