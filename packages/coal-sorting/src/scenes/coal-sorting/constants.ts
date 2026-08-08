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
/** belt3（筛下小料皮带）长度 — 仅覆盖 belt2 筛分区 */
export const BELT3_LENGTH = 1.4;
export const BELT_WIDTH = 0.45;
export const BELT_THICKNESS = 0.015;
export const BELT_SPEED = 0.008;

/** 皮带长度（belt3 特殊） */
export function getBeltLength(name: string): number {
  return name === 'belt3' ? BELT3_LENGTH : BELT_LENGTH;
}

export const TAIL_DRUM_R = 0.045;
export const HEAD_DRUM_R = 0.045;
export const BEAM_SECTION = 0.04;

export const BELT_LAYOUT = {
  belt1: { position: [-2.4, 1.15, 0.1] as [number, number, number], rotation: 0 },
  belt2: { position: [-1.2, 0.75, 0.8] as [number, number, number], rotation: 1.5708 },
  /** 3# 筛下小料皮带：位于 2# 筛分皮带正下方，承接漏下的小料 */
  belt3: { position: [-1.2, 0.35, 0.5] as [number, number, number], rotation: 1.5708 },
  /** 4# 大料收集皮带：承接 2# 末端落下的大料，运往大料收集箱 */
  belt4: { position: [-0.2, 0.35, 1.8] as [number, number, number], rotation: 0 },
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
  /** V形整列器位于 belt2 前半段（lx∈[0,0.5]），与整列侧向力作用区对齐 */
  aligner: { position: [-1.2, 0.83, 1.05] as [number, number, number] },
  xrayGate: { position: [-1.2, 0.82, 1.0] as [number, number, number], rotation: 1.5708 },
  airValveArray: { position: [-1.55, 0.87, 1.4] as [number, number, number], count: 6, spacing: 0.08, blowDir: '-x' },
};

/**
 * 传感器位置 — 统一规律：
 * 入口/出口传感器位于皮带中心线正上方、端部（离带面 0.09）；
 * 运行传感器位于皮带中心线正上方、皮带中部（离带面 0.09）。
 * 带面高度：belt1≈1.21 / belt2≈0.81 / belt3≈0.41
 */
export const SENSOR_POSITIONS = {
  s1_belt1_entry: [-3.4, 1.30, 0.1] as [number, number, number],
  s3_belt1_exit: [-1.4, 1.30, 0.1] as [number, number, number],
  s2_belt1_run: [-2.4, 1.30, 0.1] as [number, number, number],
  s4_belt2_entry: [-1.2, 0.90, -0.2] as [number, number, number],
  s6_belt2_exit: [-1.2, 0.90, 1.8] as [number, number, number],
  s5_belt2_run: [-1.2, 0.90, 0.8] as [number, number, number],
  s7_belt3_entry: [-1.2, 0.50, -0.2] as [number, number, number],
  s9_belt3_exit: [-1.2, 0.50, 1.2] as [number, number, number],
  s8_belt3_run: [-1.2, 0.50, 0.5] as [number, number, number],
  s10_pileup: [-3.6, 1.35, 0.1] as [number, number, number],
};

export const HOPPER_POSITION: [number, number, number] = [-3.2, 1.57, 0.1];
export const FEED_CYLINDER_POSITION: [number, number, number] = [-3.5, 1.22, -0.25];
/** 大料收集框 — belt4 尽头 */
export const COLLECTION_BOX_POSITION: [number, number, number] = [0.7, 0.1, 1.8];
/** 小料收集箱 — belt3 出口外侧 */
export const SMALL_PARTICLE_BOX_POSITION: [number, number, number] = [-1.2, 0.1, 1.6];

/**
 * 运行指示灯 — 位于各皮带中心线正上方（离带面 0.35），与传感器垂直错开
 */
export const INDICATOR_POSITIONS = {
  belt1_run: [-2.4, 1.56, 0.1] as [number, number, number],
  belt2_run: [-1.2, 1.16, 0.8] as [number, number, number],
  belt3_run: [-1.2, 0.76, 0.5] as [number, number, number],
  belt4_run: [-0.2, 0.76, 1.8] as [number, number, number],
  fault: [-0.5, 1.45, 0.9] as [number, number, number],
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
  LARGE_BOX_COLOR: 0x1e3a5f,
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
  // 下料溜槽（绕 Z 倾斜，低端朝向皮带）
  HOPPER_CHUTE_LENGTH: 0.35,
  HOPPER_CHUTE_THICKNESS: 0.02,
  HOPPER_CHUTE_WIDTH: 0.3,
  HOPPER_CHUTE_Y: -0.19,
  HOPPER_CHUTE_ANGLE: 0.4,

  // 气阀喷嘴
  AIR_VALVE_RADIUS_TOP: 0.015,
  AIR_VALVE_RADIUS_BOTTOM: 0.02,
  AIR_VALVE_LENGTH: 0.12,

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

  // 过筛下落速度（m/s，小料从 belt2 漏到 belt3）
  SIEVE_FALL_VELOCITY_Y: 0.8,

  // 2# 筛分皮带入口承接段（实板）几何（局部 X 坐标）
  SIEVE_ENTRY_ZONE_CENTER: -0.7,
  SIEVE_ENTRY_ZONE_HALF: 0.3,

  // 检测容差
  BELT_DETECT_X_TOLERANCE: 0.05,
  BELT_DETECT_Y_TOLERANCE: 0.12,
  BOX_DETECT_XZ_RANGE: 0.3,
  /** 入箱判定高度上限 — 箱顶（0.3）以内才算入箱 */
  BOX_DETECT_Y_MAX_OFFSET: 0.2,
  BOX_DETECT_Y_MIN_OFFSET: -0.05,
  FALL_RECOVERY_Y: -0.5,
} as const;

// ============================================================
// PLC IO 变量名 → 协议地址映射
//   输入信号（DT → PLC，孪生写）：按钮 + 传感器 + 磁性开关
//   输出信号（PLC → DT，孪生读）：皮带运行 + 气缸电磁阀 + 分拣机 + 指示灯
// ============================================================

export const MODBUS_READ_VARS = {
  BUTTON_START: 0,
  BUTTON_STOP: 1,
  BUTTON_ESTOP: 2,
  S1_BELT1_ENTRY: 10,
  S2_BELT1_RUN: 11,
  S3_BELT1_EXIT: 12,
  S4_BELT2_ENTRY: 13,
  S5_BELT2_RUN: 14,
  S6_BELT2_EXIT: 15,
  S7_BELT3_ENTRY: 16,
  S8_BELT3_RUN: 17,
  S9_BELT3_EXIT: 18,
  S10_PILEUP: 19,
  CYL_FEED_OUT: 20,
  CYL_FEED_IN: 21,
  BELT1_RUN: 3,
  BELT2_RUN: 4,
  BELT3_RUN: 5,
  BELT4_RUN: 6,
  FEED_CYL_EXTEND: 7,
  FEED_CYL_RETRACT: 8,
  SEPARATOR_ON: 9,
  IND_BELT1_RUN: 22,
  IND_BELT2_RUN: 23,
  IND_BELT3_RUN: 24,
  IND_BELT4_RUN: 25,
  IND_FAULT: 26,
} as const;

/** DT → PLC 写入变量（按钮 + 传感器 + 磁性开关） */
export const MODBUS_WRITE_VARS = {
  BUTTON_START: 0,
  BUTTON_STOP: 1,
  BUTTON_ESTOP: 2,
  S1_BELT1_ENTRY: 10,
  S2_BELT1_RUN: 11,
  S3_BELT1_EXIT: 12,
  S4_BELT2_ENTRY: 13,
  S5_BELT2_RUN: 14,
  S6_BELT2_EXIT: 15,
  S7_BELT3_ENTRY: 16,
  S8_BELT3_RUN: 17,
  S9_BELT3_EXIT: 18,
  S10_PILEUP: 19,
  CYL_FEED_OUT: 20,
  CYL_FEED_IN: 21,
} as const;

/** Modbus 线圈地址（UI 显示用） */
export const MODBUS_DISPLAY_VARS = Object.fromEntries(
  Object.entries(MODBUS_READ_VARS).map(([k, v]) => [k, `Coil ${v}`]),
) as Record<keyof typeof MODBUS_READ_VARS, string>;

export const S7_VARS = {
  BUTTON_START: 'M0.0',
  BUTTON_STOP: 'M0.1',
  BUTTON_ESTOP: 'M0.2',
  S1_BELT1_ENTRY: 'M20.0',
  S2_BELT1_RUN: 'M20.1',
  S3_BELT1_EXIT: 'M20.2',
  S4_BELT2_ENTRY: 'M20.3',
  S5_BELT2_RUN: 'M20.4',
  S6_BELT2_EXIT: 'M20.5',
  S7_BELT3_ENTRY: 'M20.6',
  S8_BELT3_RUN: 'M20.7',
  S9_BELT3_EXIT: 'M21.0',
  S10_PILEUP: 'M21.1',
  CYL_FEED_OUT: 'M21.2',
  CYL_FEED_IN: 'M21.3',
  BELT1_RUN: 'M10.0',
  BELT2_RUN: 'M10.1',
  BELT3_RUN: 'M10.2',
  BELT4_RUN: 'M10.3',
  FEED_CYL_EXTEND: 'M10.4',
  FEED_CYL_RETRACT: 'M10.5',
  SEPARATOR_ON: 'M10.6',
  IND_BELT1_RUN: 'M11.0',
  IND_BELT2_RUN: 'M11.1',
  IND_BELT3_RUN: 'M11.2',
  IND_BELT4_RUN: 'M11.3',
  IND_FAULT: 'M11.4',
} as const;

/** S7 地址（UI 显示用） */
export const S7_DISPLAY_VARS = S7_VARS;

/** 三菱 MC 变量名 → 地址（X 输入 / Y 输出） */
export const MITSUBISHI_READ_VARS = {
  BUTTON_START: 'X0',
  BUTTON_STOP: 'X1',
  BUTTON_ESTOP: 'X2',
  S1_BELT1_ENTRY: 'X3',
  S2_BELT1_RUN: 'X4',
  S3_BELT1_EXIT: 'X5',
  S4_BELT2_ENTRY: 'X6',
  S5_BELT2_RUN: 'X7',
  S6_BELT2_EXIT: 'X10',
  S7_BELT3_ENTRY: 'X11',
  S8_BELT3_RUN: 'X12',
  S9_BELT3_EXIT: 'X13',
  S10_PILEUP: 'X14',
  CYL_FEED_OUT: 'X15',
  CYL_FEED_IN: 'X16',
  BELT1_RUN: 'Y0',
  BELT2_RUN: 'Y1',
  BELT3_RUN: 'Y2',
  BELT4_RUN: 'Y3',
  FEED_CYL_EXTEND: 'Y4',
  FEED_CYL_RETRACT: 'Y5',
  SEPARATOR_ON: 'Y6',
  IND_BELT1_RUN: 'Y7',
  IND_BELT2_RUN: 'Y10',
  IND_BELT3_RUN: 'Y11',
  IND_BELT4_RUN: 'Y12',
  IND_FAULT: 'Y13',
} as const;

/** DT → PLC 写入（按钮 + 传感器 + 磁性开关，直接写 X 地址 — GX Sim2 中 MX Component 可写 X） */
export const MITSUBISHI_WRITE_VARS = {
  BUTTON_START: 'X0',
  BUTTON_STOP: 'X1',
  BUTTON_ESTOP: 'X2',
  S1_BELT1_ENTRY: 'X3',
  S2_BELT1_RUN: 'X4',
  S3_BELT1_EXIT: 'X5',
  S4_BELT2_ENTRY: 'X6',
  S5_BELT2_RUN: 'X7',
  S6_BELT2_EXIT: 'X10',
  S7_BELT3_ENTRY: 'X11',
  S8_BELT3_RUN: 'X12',
  S9_BELT3_EXIT: 'X13',
  S10_PILEUP: 'X14',
  CYL_FEED_OUT: 'X15',
  CYL_FEED_IN: 'X16',
} as const;

/** 三菱地址（UI 显示用） */
export const MITSUBISHI_DISPLAY_VARS = MITSUBISHI_READ_VARS;
