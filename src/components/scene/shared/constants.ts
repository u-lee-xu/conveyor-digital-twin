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
export const CONVEYOR_Z_MIN = -0.35;
export const CONVEYOR_Z_MAX = 0.35; // 缩小范围，仅包含传送带宽度

// 传感器检测范围
export const SENSOR_RANGE = 0.15;

// 物料初始位置 - Z=0.6，配合 1.3 长度气缸
export const MATERIAL_INITIAL_POSITION: [number, number, number] = [-1.3, 1.06, 0.6];

// 气缸3D位置 - 已统一外观规格，通过 Z 偏移实现推杆露出
export const CYLINDER_POSITIONS = {
  feed: [-1.3, 1.12, 1.2] as [number, number, number],
  sorting1: [-0.2, 1.12, 0.8] as [number, number, number], 
  sorting2: [0.9, 1.12, 0.8] as [number, number, number],
} as const;

// 传感器3D位置
export const SENSOR_POSITIONS = {
  feed: [-1.3, 1.45, 0] as [number, number, number],
  color: [-0.2, 1.45, 0] as [number, number, number],
  material: [0.9, 1.45, 0] as [number, number, number],
} as const;

// 物料台位置 - Z=0.6
export const MATERIAL_TABLE_POSITION: [number, number, number] = [-1.3, 0.98, 0.6];

// 磁性开关（限位开关）阈值 - 活塞杆Y坐标
// 只有在行程两端的 LIMIT_ZONE 范围内，对应限位信号才为 ON
export const CYLINDER_RETRACT_POS = -0.22;       // 完全缩回时活塞杆Y坐标
export const CYLINDER_EXTEND_POS_FEED = 0.405;   // 上料气缸完全伸出Y坐标
export const CYLINDER_EXTEND_POS_SORT = 0.33;    // 分拣气缸完全伸出Y坐标
export const CYLINDER_LIMIT_ZONE = 0.04;          // 限位触发区域宽度（约行程的6%）
