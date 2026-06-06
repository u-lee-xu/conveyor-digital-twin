/**
 * 传送带分拣场景 - 场景常量定义
 * 从 shared/constants.ts 迁移，作为场景特定配置
 *
 * 分区说明：
 *   LAYOUT   — 布局坐标、位置
 *   VISUAL   — 颜色、外观风格
 *   COMPONENT — 部件尺寸参数
 *   PHYSICS  — 碰撞组、物理参数
 */

// ============================================================
// LAYOUT 布局坐标
// ============================================================

// 传感器位置参数
export const SENSORS = {
  feed: -1.3,
  color: -0.2,
  material: 0.9,
} as const;

// 气缸位置参数
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
export const CONVEYOR_Z_MAX = 0.35;

// 传感器参数
export const SENSOR_RANGE = 0.15;

// 物料参数
export const MATERIAL_INITIAL_POSITION: [number, number, number] = [-1.3, 1.10, 0.6];

// 3D对象位置
export const CYLINDER_POSITIONS = {
  feed: [-1.3, 1.12, 1.2] as [number, number, number],
  sorting1: [-0.2, 1.12, 0.8] as [number, number, number],
  sorting2: [0.9, 1.12, 0.8] as [number, number, number],
} as const;

export const SENSOR_POSITIONS = {
  feed: [-1.3, 1.45, 0] as [number, number, number],
  color: [-0.2, 1.45, 0] as [number, number, number],
  material: [0.9, 1.45, 0] as [number, number, number],
} as const;

export const MATERIAL_TABLE_POSITION: [number, number, number] = [-1.3, 0.98, 0.6];

// 气缸行程参数
export const CYLINDER_RETRACT_POS = -0.22;
export const CYLINDER_EXTEND_POS_FEED = 0.405;
export const CYLINDER_EXTEND_POS_SORT = 0.33;
export const CYLINDER_LIMIT_ZONE = 0.04;

// ============================================================
// VISUAL 视觉风格
// ============================================================

export const VISUAL = {
  // 传感器指示灯
  SENSOR_ACTIVE_COLOR: 0x22C55E,
  SENSOR_INACTIVE_COLOR: 0x1F2937,
  SENSOR_EMISSIVE_INTENSITY: 1.5,

  // 气缸LED
  LED_ACTIVE_COLOR: 0x10B981,
  LED_INACTIVE_COLOR: 0x1F2937,
  LED_EMISSIVE_INTENSITY: 2.0,

  // 信号灯塔
  TOWER_RED_ACTIVE: 0xFF0000,
  TOWER_RED_DARK: 0x3B0000,
  TOWER_YELLOW_ACTIVE: 0xEAB308,
  TOWER_YELLOW_DARK: 0x3B2F08,
  TOWER_GREEN_ACTIVE: 0x22C55E,
  TOWER_GREEN_DARK: 0x0B3B1A,
  TOWER_BASE_COLOR: 0x1F2937,
  TOWER_POLE_COLOR: 0x374151,
  TOWER_DOME_EMISSIVE_INTENSITY: 4.0,
  TOWER_GLOW_EMISSIVE_INTENSITY: 2.0,

  // 物料
  MATERIAL_BLUE_COLOR: 0x3B82F6,
  MATERIAL_BLACK_COLOR: 0x374151,

  // 标签颜色方案
  LABEL_COLORS: {
    blue: { bg: 'rgba(59,130,246,0.4)', border: 'rgba(96,165,250,0.6)', text: '#dbeafe' },
    green: { bg: 'rgba(34,197,94,0.4)', border: 'rgba(74,222,128,0.6)', text: '#dcfce7' },
    orange: { bg: 'rgba(245,158,11,0.4)', border: 'rgba(251,191,36,0.6)', text: '#fef3c7' },
    purple: { bg: 'rgba(168,85,247,0.4)', border: 'rgba(192,132,252,0.6)', text: '#f3e8ff' },
    gray: { bg: 'rgba(107,114,128,0.4)', border: 'rgba(156,163,175,0.6)', text: '#f1f5f9' },
    yellow: { bg: 'rgba(234,179,8,0.4)', border: 'rgba(250,204,21,0.6)', text: '#fef9c3' },
  } as Record<string, { bg: string; border: string; text: string }>,
} as const;

// ============================================================
// COMPONENT 部件尺寸
// ============================================================

export const COMPONENT = {
  // 传送带
  CONVEYOR_LENGTH: 3.5,
  CONVEYOR_WIDTH: 0.6,
  CONVEYOR_HEIGHT: 1.0,
  CONVEYOR_SURFACE_Y: 1.0,
  ROLLER_COUNT: 12,
  ROLLER_RADIUS: 0.06,
  ROLLER_SPEED: 0.03,

  // 物料
  MATERIAL_HALF_SIZE: 0.07,
  MATERIAL_TABLE_HALF_XZ: 0.25,
  MATERIAL_TABLE_HALF_Y: 0.025,
  MATERIAL_TABLE_LEG_OFFSET: 0.12,
  MATERIAL_TABLE_LEG_HEIGHT: 0.5,

  // 气缸
  CYLINDER_BODY_HALF_LEN: 0.4,
  CYLINDER_ROD_LEN: 0.7,
  CYLINDER_PUSH_PLATE_HALF: [0.1, 0.09, 0.02] as [number, number, number],
  CYLINDER_SMOOTH_FACTOR: 0.12,
  CYLINDER_THRESHOLD: 0.001,
  CYLINDER_SURFACE_OFFSET: 0.72,
  CYLINDER_PUSH_OFFSET: 0.02,
  CYLINDER_PUSH_TARGET_OFFSET: 0.12,

  // 信号灯塔
  TOWER_MODULE_RADIUS: 0.065,
  TOWER_MODULE_HEIGHT: 0.13,
  TOWER_DOME_RADIUS: 0.065,
  TOWER_BASE_RADIUS_TOP: 0.075,
  TOWER_BASE_RADIUS_BOTTOM: 0.09,
  TOWER_BASE_HEIGHT: 0.04,
  TOWER_POLE_RADIUS: 0.025,
  TOWER_POLE_HEIGHT: 0.22,
  TOWER_GAP: 0.015,
  TOWER_GLOW_RADIUS: 0.03,
  TOWER_GLOW_OFFSET: 0.025,
  TOWER_POSITION: [1.6, 0.98, -0.5] as [number, number, number],

  // 传感器
  SENSOR_BULB_SCALE: 1.5,
  SENSOR_BULB_RADIUS: 0.012,
  SENSOR_BULB_OFFSET_Y: 0.06,
  SENSOR_BULB_OFFSET_Z: 0.04,
} as const;

// ============================================================
// PHYSICS 物理参数
// ============================================================

export const PHYSICS = {
  // 传送带碰撞
  CONVEYOR_BELT_FRICTION: 1.5,
  CONVEYOR_BELT_HALF_Y: 0.02,

  // 物料碰撞
  MATERIAL_FRICTION: 0.6,
  MATERIAL_RESTITUTION: 0.0,
  MATERIAL_LINEAR_DAMPING: 0.5,
  MATERIAL_ANGULAR_DAMPING: 0.8,
  MATERIAL_TABLE_FRICTION: 1.0,

  // 推板检测范围
  PUSH_DETECT_RANGE_X: 0.35,
  PUSH_DETECT_RANGE_Y: 0.4,

  // 传感器检测范围
  SENSOR_DETECT_RANGE_X: 0.2,
  SENSOR_DETECT_RANGE_Z: 0.35,

  // 掉落回收
  FALL_RECOVERY_Y: -1,
  CONVEYOR_Z_MARGIN: 0.05,
} as const;
