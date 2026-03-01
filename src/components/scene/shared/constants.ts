// 场景常量 - 位置、速度、范围等

// 传感器X轴位置
export const SENSORS = {
  feed: -1.3,
  color: -0.2,
  material: 0.9,
} as const;

// 气缸X轴位置
export const CYLINDERS = {
  feed: -1.3,
  sorting1: -0.2,
  sorting2: 0.9,
} as const;

// 传送带参数
export const CONVEYOR_SPEED = 0.01;
export const CONVEYOR_END_X = 1.8;
export const CONVEYOR_START_X = -1.75;
export const CONVEYOR_Z_MIN = -0.3;
export const CONVEYOR_Z_MAX = 0.5;

// 传感器检测范围
export const SENSOR_RANGE = 0.15;

// 物料初始位置
export const MATERIAL_INITIAL_POSITION: [number, number, number] = [-1.3, 1.06, 0.6];

// 气缸3D位置
export const CYLINDER_POSITIONS = {
  feed: [-1.3, 1.10, 1.2] as [number, number, number],
  sorting1: [-0.2, 1.10, 0.8] as [number, number, number],
  sorting2: [0.9, 1.10, 0.8] as [number, number, number],
} as const;

// 传感器3D位置
export const SENSOR_POSITIONS = {
  feed: [-1.3, 1.45, 0] as [number, number, number],
  color: [-0.2, 1.45, 0] as [number, number, number],
  material: [0.9, 1.45, 0] as [number, number, number],
} as const;

// 物料台位置
export const MATERIAL_TABLE_POSITION: [number, number, number] = [-1.3, 0.98, 0.6];
