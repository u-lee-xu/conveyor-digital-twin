/**
 * 煤料智能分拣系统 - 核心常量定义
 *
 * 分区说明：
 *   LAYOUT   — 布局坐标、位置
 *   VISUAL   — 颜色、外观风格
 *   COMPONENT — 部件尺寸参数
 *   PHYSICS  — 碰撞组、物理参数、超时
 */

// ============================================================
// LAYOUT 布局坐标
// ============================================================

export const BELT_LENGTH = 2.0;
export const BELT_WIDTH = 0.45;
export const BELT_THICKNESS = 0.015;
export const BELT_SPEED = 0.008;

export const TAIL_DRUM_R = 0.045;
export const HEAD_DRUM_R = 0.045;
export const BEAM_SECTION = 0.04;

export const BELT_LAYOUT = {
  belt1: { position: [-2.4, 1.15, 0.1] as [number, number, number], rotation: 0 },
  belt2: { position: [-1.2, 0.75, 0.8] as [number, number, number], rotation: 1.5708 },
  belt3: { position: [-0.2, 0.35, 1.8] as [number, number, number], rotation: 0 },
  belt4: { position: [-1.2, 0.35, 0.1] as [number, number, number], rotation: 1.5708 },
} as const;

/** 皮带表面 Y 坐标 = 布局 Y + 滚筒半径 + 皮带厚度 + 碰撞体半高 */
const BELT_SURFACE_OFFSET = TAIL_DRUM_R + BELT_THICKNESS + 0.03;

export const BELT_SURFACE_Y = {
  belt1: BELT_LAYOUT.belt1.position[1] + BELT_SURFACE_OFFSET,
  belt2: BELT_LAYOUT.belt2.position[1] + BELT_SURFACE_OFFSET,
  belt3: BELT_LAYOUT.belt3.position[1] + BELT_SURFACE_OFFSET,
  belt4: BELT_LAYOUT.belt4.position[1] + BELT_SURFACE_OFFSET,
} as const;

export const BELT_HEIGHTS = {
  belt1: 1.15,
  belt2: 0.75,
  belt3: 0.35,
  belt4: 0.35,
} as const;

export const SORTING_STATIONS = {
  screening: { startZ: -0.2, endZ: 0.3 },
  aligner: { position: [-1.2, 0.83, 0.6] as [number, number, number] },
  xrayGate: { position: [-1.2, 0.82, 1.0] as [number, number, number], rotation: 1.5708 },
  airValveArray: { position: [-1.55, 0.87, 1.4] as [number, number, number], count: 6, spacing: 0.08, blowDir: '-x' },
};

export const DEFLECTOR_PLATES = {
  plate1to2: { position: [-0.8, 1.0, 0.1] as [number, number, number], rotation: [0, 0, 1.047] as [number, number, number], size: [0.5, 0.015, 0.55] as [number, number, number] },
  plate2to3: { position: [-1.2, 0.6, 2.15] as [number, number, number], rotation: [-1.047, 0, 0] as [number, number, number], size: [0.55, 0.015, 0.5] as [number, number, number] },
};

export const SENSOR_POSITIONS = {
  s1_belt1_entry: [-3.2, 1.3, 0.1] as [number, number, number],
  s3_belt1_exit: [-1.6, 1.3, 0.1] as [number, number, number],
  s4_belt2_entry: [-1.2, 0.9, 0.0] as [number, number, number],
  s6_belt2_exit: [-1.2, 0.9, 1.6] as [number, number, number],
  s7_belt3_entry: [-0.8, 0.5, 1.8] as [number, number, number],
  s9_belt3_exit: [0.6, 0.5, 1.8] as [number, number, number],
  s2_belt1_run: [-2.4, 1.4, -0.2] as [number, number, number],
  s5_belt2_run: [-1.5, 1.0, 0.8] as [number, number, number],
  s8_belt3_run: [-0.2, 0.6, 1.5] as [number, number, number],
  s10_pileup: [-3.2, 1.4, 0.1] as [number, number, number],
};

export const HOPPER_POSITION: [number, number, number] = [-3.2, 1.57, 0.1];
export const FEED_CYLINDER_POSITION: [number, number, number] = [-3.5, 1.22, -0.25];
export const COLLECTION_BOX_POSITION: [number, number, number] = [0.7, 0.1, 1.8];
export const IMPURITY_BOX_POSITION: [number, number, number] = [-1.8, 0.1, 1.4];
export const SMALL_PARTICLE_BOX_POSITION: [number, number, number] = [-1.2, 0.1, 0.2];

export const INDICATOR_POSITIONS = {
  belt1_run: [-2.4, 1.65, -0.3] as [number, number, number],
  belt2_run: [-1.5, 1.25, 0.8] as [number, number, number],
  belt3_run: [-0.2, 0.85, 1.5] as [number, number, number],
  belt4_run: [-1.5, 0.65, 0.1] as [number, number, number],
  fault: [-1.5, 1.35, 0.8] as [number, number, number],
};

export type IndicatorName = keyof typeof INDICATOR_POSITIONS;

export const MATERIAL_SIZE = 0.08;
export const MATERIAL_SPAWN_POSITION: [number, number, number] = [-3.2, BELT_SURFACE_Y.belt1 + MATERIAL_SIZE / 2, 0.1];
export const MAX_MATERIALS = 20;
export const S_RANGE = 0.15;
export const FEED_CYLINDER_RETRACT = -0.15;
export const FEED_CYLINDER_EXTEND = 0.15;

// ============================================================
// VISUAL 视觉风格
// ============================================================

export const VISUAL = {
  // 皮带
  FRAME_COLOR: 0x334155,
  ROLLER_COLOR: 0x94A3B8,
  MOTOR_COLOR: 0x1D4ED8,
  BELT_STOP: 0x1E293B,
  BELT_RUN: 0x0F172A,
  BELT_SIEVE: 0x1e293b,
  BELT_SIEVE_OPACITY: 0.5,

  // 指示灯
  INDICATOR_HOUSING: 0x475569,
  INDICATOR_OFF: 0x1e293b,
  INDICATOR_RUN_COLOR: 0x22C55E,
  INDICATOR_FAULT_COLOR: 0xEF4444,
  INDICATOR_EMISSIVE_INTENSITY: 2,
  MOTOR_EMISSIVE_INTENSITY: 0.5,

  // 物料
  COAL_COLOR: 0x111827,
  STONE_COLOR: 0x94a3b8,

  // 收集箱
  COAL_BOX_COLOR: 0x1e3a5f,
  STONE_BOX_COLOR: 0x451a03,
  SMALL_BOX_COLOR: 0x1e293b,
  BOX_OPACITY: 0.8,

  // 传感器
  SENSOR_ON_COLOR: 'green' as const,
  SENSOR_OFF_COLOR: 'red' as const,

  // 料斗
  HOPPER_BODY_COLOR: 0x1e293b,
  HOPPER_RIM_COLOR: 0x475569,

  // 气缸
  CYLINDER_PLATE_COLOR: 0x64748b,

  // 整列器/X射线
  ALIGNER_COLOR: 0x64748b,
  XRAY_FRAME_COLOR: 0x334155,
  XRAY_ACTIVE_COLOR: 0x22c55e,
  XRAY_INACTIVE_COLOR: 0x1e293b,

  // 电机外壳
  MOTOR_HOUSING_COLOR: 0x334155,
} as const;

// ============================================================
// COMPONENT 部件尺寸
// ============================================================

export const COMPONENT = {
  // 指示灯
  INDICATOR_BASE_RADIUS: 0.03,
  INDICATOR_BASE_HEIGHT: 0.06,
  INDICATOR_BULB_RADIUS: 0.025,
  INDICATOR_BULB_OFFSET_Y: 0.04,

  // 传感器
  SENSOR_RADIUS: 0.02,

  // V形整列器
  ALIGNER_BOARD_LENGTH: 0.5,
  ALIGNER_BOARD_HEIGHT: 0.12,
  ALIGNER_BOARD_THICKNESS: 0.02,
  ALIGNER_OFFSET: 0.13,
  ALIGNER_ANGLE: 0.27,
  ALIGNER_Y: 0.05,

  // 收集箱
  BOX_SIZE: 0.6,
  BOX_HEIGHT: 0.2,
  BOX_LABEL_Y: 0.3,

  // 料斗
  HOPPER_BODY_SIZE: 0.3,
  HOPPER_BODY_Y: 0.1,
  HOPPER_RIM_SIZE: 0.4,
  HOPPER_RIM_THICKNESS: 0.02,
  HOPPER_RIM_Y: 0.2,
  HOPPER_LABEL_Y: 0.3,

  // 气缸推板
  CYLINDER_PLATE_THICKNESS: 0.02,
  CYLINDER_PLATE_HEIGHT: 0.1,
  CYLINDER_PLATE_WIDTH: 0.36,
  CYLINDER_COLLIDER_HALF_X: 0.01,
  CYLINDER_COLLIDER_HALF_Y: 0.05,
  CYLINDER_COLLIDER_HALF_Z: 0.18,
  CYLINDER_SMOOTH_FACTOR: 0.1,
  CYLINDER_THRESHOLD: 0.001,

  // X射线龙门
  XRAY_PILLAR_SIZE: 0.04,
  XRAY_PILLAR_HEIGHT: 0.5,
  XRAY_PILLAR_OFFSET: 0.3,
  XRAY_PILLAR_Y: 0.25,
  XRAY_BEAM_WIDTH: 0.1,
  XRAY_BEAM_HEIGHT: 0.08,
  XRAY_BEAM_LENGTH: 0.7,
  XRAY_BEAM_Y: 0.5,
  XRAY_LABEL_Y: 0.6,

  // 电机
  MOTOR_HOUSING_SIZE: [0.18, 0.18, 0.1] as [number, number, number],
  MOTOR_BODY_RADIUS: 0.06,
  MOTOR_BODY_LENGTH: 0.2,
  MOTOR_BODY_OFFSET_X: -0.2,
} as const;

// ============================================================
// PHYSICS 物理参数
// ============================================================

export const PHYSICS = {
  // 碰撞组
  BELT_COLLISION_GROUP: (0x0001 << 16) | 0x0003,
  MAT_COLLISION_GROUP: (0x0002 << 16) | 0x0001,

  // 碰撞体摩擦
  BELT_FRICTION: 2.0,
  MAT_DEFAULT_FRICTION: 0.5,
  MAT_RESTITUTION: 0.1,

  // 状态机超时（毫秒）
  TRANSITION_TIMEOUT: 3000,
  SIEVING_TIMEOUT: 5000,
  BLOWN_TIMEOUT: 3000,

  // 筛分冲量
  SIEVE_IMPULSE_XY: 0.005,
  SIEVE_IMPULSE_Y_BASE: 0.008,

  // 气吹冲量
  BLOWN_IMPULSE_X: -0.15,
  BLOWN_IMPULSE_Y: 0.02,
  BLOWN_IMPULSE_DURATION: 100,

  // 整列侧向力
  ALIGN_LATERAL_FACTOR: 0.2,

  // 检测容差
  BELT_DETECT_X_TOLERANCE: 0.05,
  BELT_DETECT_Y_TOLERANCE: 0.12,
  BOX_DETECT_XZ_RANGE: 0.3,
  BOX_DETECT_Y_MAX_OFFSET: 0.3,
  BOX_DETECT_Y_MIN_OFFSET: -0.05,
  FALL_RECOVERY_Y: -0.5,
} as const;
