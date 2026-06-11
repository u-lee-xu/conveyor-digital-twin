/**
 * 气动机械手 - 核心常量定义
 */

// ============================================================
// LAYOUT 布局坐标
// ============================================================

/** 机架底座位置 */
export const BASE_POSITION: [number, number, number] = [0, 0.1, 0];

/** 机架尺寸 */
export const FRAME_WIDTH = 0.08;
export const FRAME_HEIGHT = 2.0;
export const FRAME_DEPTH = 0.08;

/** 横梁 Y 坐标 */
export const BEAM_Y = FRAME_HEIGHT - 0.1;

// ============================================================
// COMPONENT 部件尺寸
// ============================================================

export const COMPONENT = {
  // 前后气缸（横向，固定在支架横梁下方，沿 Z 轴）
  FORWARD_CYLINDER_BODY_RADIUS: 0.045,
  FORWARD_CYLINDER_BODY_LENGTH: 0.70,
  FORWARD_CYLINDER_ROD_RADIUS: 0.016,
  FORWARD_CYLINDER_STROKE: 0.35,

  // 升降气缸（竖直，缸体固定在前后推杆末端，推杆向下）
  LIFT_CYLINDER_BODY_RADIUS: 0.035,
  LIFT_CYLINDER_BODY_LENGTH: 0.70,
  LIFT_CYLINDER_ROD_RADIUS: 0.012,
  LIFT_CYLINDER_STROKE: 0.35,

  // 平行气动夹爪（固定在升降推杆末端）
  GRIPPER_BODY_SIZE: [0.175, 0.07, 0.10] as [number, number, number],  // 本体 宽X / 高Y / 深Z
  GRIPPER_JAW_W: 0.03,     // 手指竖直爪宽(X)
  GRIPPER_JAW_H: 0.10,     // 手指竖直爪高(Y，从本体底部向下)
  GRIPPER_JAW_D: 0.06,     // 手指竖直爪深(Z)
  GRIPPER_PAD_W: 0.04,     // 夹持垫内伸宽度(X)
  GRIPPER_PAD_H: 0.015,    // 夹持垫高(Y)
  GRIPPER_OPEN_DISTANCE: 0.04,   // 单侧手指张开行程
  GRIPPER_SLIDER_H: 0.018, // 滑块厚度

  // 连接件
  MOUNT_PLATE_SIZE: [0.06, 0.015, 0.06] as [number, number, number],   // 气缸间连接板

  // 磁性开关
  MAG_SENSOR_SIZE: 0.015,

  // 指示灯
  INDICATOR_RADIUS: 0.05,
  INDICATOR_HEIGHT: 0.02,

  // 机架（单立柱）
  BEAM_THICKNESS: 0.06,
  BEAM_LENGTH: 0.6,
  POST_SIZE: [0.08, 1.4, 0.08] as [number, number, number],
  BASE_SIZE: [0.45, 0.05, 0.4] as [number, number, number],

  // 单立柱顶部悬臂支架（向前伸出，固定前后气缸缸体）
  CANTILEVER_SIZE: [0.06, 0.04, 0.35] as [number, number, number],

  // 物料工件（放置在地面供夹取）
  WORKPIECE_SIZE: [0.08, 0.06, 0.08] as [number, number, number],  // 方块工件 宽X/高Y/深Z

  // 前后气缸安装位置（缸体中心 Y，在悬臂下方）
  FORWARD_MOUNT_Y: 1.72,
} as const;

// ============================================================
// VISUAL 视觉风格
// ============================================================

export const VISUAL = {
  FRAME_COLOR: 0x5A6A7A,
  BEAM_COLOR: 0x4A5A6A,
  BASE_COLOR: 0x3D4F5F,
  CYLINDER_BODY_COLOR: 0x8899AA,
  CYLINDER_ROD_COLOR: 0xC8CED6,
  CYLINDER_END_CAP_COLOR: 0x6B7B8B,
  GRIPPER_BODY_COLOR: 0x5A6A7A,
  GRIPPER_FINGER_COLOR: 0x4A5568,
  MOUNT_PLATE_COLOR: 0x6B7B8B,
  MAG_SENSOR_ON: 0x22C55E,
  MAG_SENSOR_OFF: 0x64748B,

  INDICATOR_RUNNING: 0x22C55E,
  INDICATOR_HOME: 0x3B82F6,
  INDICATOR_PROCESSING: 0xF59E0B,
  INDICATOR_ALARM: 0xEF4444,
  INDICATOR_OFF: 0x1e293b,
} as const;

// ============================================================
// STRUCT 结构几何常量（消除硬编码）
// ============================================================

export const STRUCT = {
  /** 端盖厚度 */
  END_CAP_THICKNESS: 0.03,
  /** 端盖相对缸体半径的放大系数 */
  END_CAP_RADIUS_RATIO: 1.12,
  /** 推杆末端连接头半径放大系数 */
  ROD_TIP_HEAD_RADIUS_RATIO: 1.5,
  /** 推杆末端连接头厚度 */
  ROD_TIP_HEAD_THICKNESS: 0.02,
  /** 收缩时推杆末端头外露出前端盖的距离 */
  ROD_TIP_PROTRUDE: 0.04,
  /** 端盖与缸体之间的微间隙 */
  CAP_GAP: 0.01,
  /** 气缸体与支架之间的安装间隙 */
  MOUNT_GAP: 0.01,
  /** 连接板之间间隙 */
  PLATE_GAP: 0.005,
  /** 磁性开关距离缸体外表面 */
  SENSOR_STANDOFF: 0.01,
  /** 磁性开关距缸体端部内缩量 */
  SENSOR_INSET: 0.06,
  /** 磁性开关显示大小 */
  SENSOR_DISPLAY_SIZE: 0.0375,
  /** 缸体网格分段数 */
  BODY_SEGMENTS: 24,
  /** 端盖网格分段数 */
  CAP_SEGMENTS: 16,
  /** 推杆网格分段数 */
  ROD_SEGMENTS: 12,
  /** 指示灯半径 */
  INDICATOR_RADIUS: 0.04,
  /** 指示灯间距 */
  INDICATOR_SPACING: 0.12,
} as const;

/**
 * 计算推杆末端头中心在气缸本地空间 Y 坐标。
 * 气缸沿 Y 轴，缸体中心在 origin，推杆从 +Y 端伸出。
 * 缩回时末端头外露在前端盖外。position: 0=完全缩回, 1=完全伸出
 */
export function rodTipLocalY(bodyLength: number, strokeLength: number, position: number): number {
  const halfBody = bodyLength / 2;
  const frontCapEnd = halfBody + STRUCT.CAP_GAP + STRUCT.END_CAP_THICKNESS;
  const tipRetracted = frontCapEnd + STRUCT.ROD_TIP_PROTRUDE + STRUCT.ROD_TIP_HEAD_THICKNESS / 2;
  return tipRetracted + position * strokeLength;
}

// ============================================================
// ANIMATION 动画参数
// ============================================================

export const ANIMATION = {
  /** 气缸运动速度（单位/秒） */
  CYLINDER_SPEED: 0.6,
  /** 磁性开关触发阈值 */
  MAG_THRESHOLD: 0.05,
} as const;

// ============================================================
// S7 变量名 → 地址 映射（用于 read-vars / write-vars）
// ============================================================

export const S7_VARS = {
  BUTTON_START: 'M0.0',
  BUTTON_ESTOP: 'M0.1',
  BUTTON_STOP:  'M0.2',
  MAG_FORWARD_REAR:  'M0.3',
  MAG_FORWARD_FRONT: 'M0.4',
  MAG_LIFT_REAR:     'M0.5',
  MAG_LIFT_FRONT:    'M0.6',
  MAG_CLAMP_OPEN:    'M0.7',
  MAG_CLAMP_CLOSE:   'M1.0',
  SOLENOID_FORWARD_RETRACT: 'M10.0',
  SOLENOID_FORWARD_EXTEND:  'M10.1',
  SOLENOID_LIFT_RETRACT:    'M10.2',
  SOLENOID_LIFT_EXTEND:     'M10.3',
  SOLENOID_CLAMP_OPEN:      'M10.4',
  SOLENOID_CLAMP_CLOSE:     'M10.5',
  INDICATOR_ORIGIN:     'M10.6',
  INDICATOR_WORKING:    'M10.7',
  INDICATOR_PROCESSING: 'M11.0',
  INDICATOR_ALARM:      'M11.1',
} as const;

// ============================================================
// 三菱 MC 变量名 → 地址 映射
// GX Simulator 2 中 MX Component 可直接写入 X 设备，
// 因此读写均直接使用 X/Y 地址。
// ============================================================

/** 读取全部 PLC 状态（按钮 X + 磁性开关 X + 电磁阀 Y + 指示灯 Y） */
export const MITSUBISHI_READ_VARS = {
  BUTTON_START: 'X0',
  BUTTON_ESTOP: 'X1',
  BUTTON_STOP:  'X2',
  MAG_FORWARD_REAR:  'X3',
  MAG_FORWARD_FRONT: 'X4',
  MAG_LIFT_REAR:     'X5',
  MAG_LIFT_FRONT:    'X6',
  MAG_CLAMP_OPEN:    'X7',
  MAG_CLAMP_CLOSE:   'X10',
  SOLENOID_FORWARD_RETRACT: 'Y0',
  SOLENOID_FORWARD_EXTEND:  'Y1',
  SOLENOID_LIFT_RETRACT:    'Y2',
  SOLENOID_LIFT_EXTEND:     'Y3',
  SOLENOID_CLAMP_OPEN:      'Y4',
  SOLENOID_CLAMP_CLOSE:     'Y5',
  INDICATOR_ORIGIN:     'Y6',
  INDICATOR_WORKING:    'Y7',
  INDICATOR_PROCESSING: 'Y10',
  INDICATOR_ALARM:      'Y11',
} as const;

/** DT→PLC 写入（按钮 + 磁性开关，直接写入 X 地址 — GX Sim2 中 MX Component 可写 X） */
export const MITSUBISHI_WRITE_VARS = {
  BUTTON_START: 'X0',
  BUTTON_ESTOP: 'X1',
  BUTTON_STOP:  'X2',
  MAG_FORWARD_REAR:  'X3',
  MAG_FORWARD_FRONT: 'X4',
  MAG_LIFT_REAR:     'X5',
  MAG_LIFT_FRONT:    'X6',
  MAG_CLAMP_OPEN:    'X7',
  MAG_CLAMP_CLOSE:   'X10',
} as const;

/** CSV 文档地址（用于 UI 显示，与机械手.csv 一致） */
export const MITSUBISHI_DISPLAY_VARS = {
  BUTTON_START: 'X0',
  BUTTON_ESTOP: 'X1',
  BUTTON_STOP:  'X2',
  MAG_FORWARD_REAR:  'X3',
  MAG_FORWARD_FRONT: 'X4',
  MAG_LIFT_REAR:     'X5',
  MAG_LIFT_FRONT:    'X6',
  MAG_CLAMP_OPEN:    'X7',
  MAG_CLAMP_CLOSE:   'X10',
  SOLENOID_FORWARD_RETRACT: 'Y0',
  SOLENOID_FORWARD_EXTEND:  'Y1',
  SOLENOID_LIFT_RETRACT:    'Y2',
  SOLENOID_LIFT_EXTEND:     'Y3',
  SOLENOID_CLAMP_OPEN:      'Y4',
  SOLENOID_CLAMP_CLOSE:     'Y5',
  INDICATOR_ORIGIN:     'Y6',
  INDICATOR_WORKING:    'Y7',
  INDICATOR_PROCESSING: 'Y10',
  INDICATOR_ALARM:      'Y11',
} as const;

export const ADDRESS = {
  /** 面板按钮 — Coil 0~2（三菱直接写入 X 地址） */
  BUTTON: {
    start: { coil: 0, s7: 'M0.0', mitsubishi: 'X0' },
    estop: { coil: 1, s7: 'M0.1', mitsubishi: 'X1' },
    stop:  { coil: 2, s7: 'M0.2', mitsubishi: 'X2' },
  },

  /** 磁性开关 — Coil 3~8（三菱直接写入 X 地址） */
  MAG: {
    forward: {
      rear:  { coil: 3, s7: 'M0.3', mitsubishi: 'X3' },
      front: { coil: 4, s7: 'M0.4', mitsubishi: 'X4' },
    },
    lift: {
      rear:  { coil: 5, s7: 'M0.5', mitsubishi: 'X5' },
      front: { coil: 6, s7: 'M0.6', mitsubishi: 'X6' },
    },
    clamp: {
      open:  { coil: 7, s7: 'M0.7', mitsubishi: 'X7' },
      close: { coil: 8, s7: 'M1.0', mitsubishi: 'X10' },
    },
  },

  /** 电磁阀线圈（双线圈）— Coil 10~15（三菱 Y 设备，PLC 输出可读可写） */
  SOLENOID: {
    forward: { retract: { coil: 10, s7: 'M10.0', mitsubishi: 'Y0' }, extend: { coil: 11, s7: 'M10.1', mitsubishi: 'Y1' } },
    lift:    { retract: { coil: 12, s7: 'M10.2', mitsubishi: 'Y2' }, extend: { coil: 13, s7: 'M10.3', mitsubishi: 'Y3' } },
    clamp:   { open:   { coil: 14, s7: 'M10.4', mitsubishi: 'Y4' }, close:  { coil: 15, s7: 'M10.5', mitsubishi: 'Y5' } },
  },

  /** 指示灯 — Coil 16~19（三菱 Y 设备，PLC 输出可读可写） */
  INDICATOR: {
    origin:     { coil: 16, s7: 'M10.6', mitsubishi: 'Y6'  },
    working:    { coil: 17, s7: 'M10.7', mitsubishi: 'Y7'  },
    processing: { coil: 18, s7: 'M11.0', mitsubishi: 'Y10' },
    alarm:      { coil: 19, s7: 'M11.1', mitsubishi: 'Y11' },
  },
} as const;