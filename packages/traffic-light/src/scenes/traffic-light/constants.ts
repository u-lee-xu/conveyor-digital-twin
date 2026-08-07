/**
 * 交通灯 - 核心常量定义（IO 地址映射 + 时序参数）
 */

// ============================================================
// IO 变量名（跨协议统一，由网关映射到各协议地址）
// ============================================================

/** ModbusTCP 变量名 → 线圈地址 映射 */
export const MODBUS_READ_VARS = {
  BUTTON_START: 0,
  BUTTON_STOP: 1,
  BUTTON_ESTOP: 2,
  LIGHT_EW_GREEN: 10,
  LIGHT_EW_YELLOW: 11,
  LIGHT_EW_RED: 12,
  LIGHT_NS_GREEN: 13,
  LIGHT_NS_YELLOW: 14,
  LIGHT_NS_RED: 15,
} as const;

/** ModbusTCP 可写变量（按钮，写线圈） */
export const MODBUS_WRITE_VARS = {
  BUTTON_START: 0,
  BUTTON_STOP: 1,
  BUTTON_ESTOP: 2,
} as const;

/** Modbus 线圈地址（UI 显示用） */
export const MODBUS_DISPLAY_VARS = {
  BUTTON_START: 'Coil 0',
  BUTTON_STOP: 'Coil 1',
  BUTTON_ESTOP: 'Coil 2',
  LIGHT_EW_GREEN: 'Coil 10',
  LIGHT_EW_YELLOW: 'Coil 11',
  LIGHT_EW_RED: 'Coil 12',
  LIGHT_NS_GREEN: 'Coil 13',
  LIGHT_NS_YELLOW: 'Coil 14',
  LIGHT_NS_RED: 'Coil 15',
} as const;

/** S7 变量名 → M 区地址 映射（按钮 M10.x / 灯 M20.x） */
export const S7_VARS = {
  BUTTON_START: 'M10.0',
  BUTTON_STOP: 'M10.1',
  BUTTON_ESTOP: 'M10.2',
  LIGHT_EW_GREEN: 'M20.0',
  LIGHT_EW_YELLOW: 'M20.1',
  LIGHT_EW_RED: 'M20.2',
  LIGHT_NS_GREEN: 'M20.3',
  LIGHT_NS_YELLOW: 'M20.4',
  LIGHT_NS_RED: 'M20.5',
} as const;

/** S7 地址（UI 显示用） */
export const S7_DISPLAY_VARS = S7_VARS;

/** 三菱 MC 变量名 → 地址 映射（按钮 X0~X2 / 灯 Y0~Y5） */
export const MITSUBISHI_READ_VARS = {
  BUTTON_START: 'X0',
  BUTTON_STOP: 'X1',
  BUTTON_ESTOP: 'X2',
  LIGHT_EW_GREEN: 'Y0',
  LIGHT_EW_YELLOW: 'Y1',
  LIGHT_EW_RED: 'Y2',
  LIGHT_NS_GREEN: 'Y3',
  LIGHT_NS_YELLOW: 'Y4',
  LIGHT_NS_RED: 'Y5',
} as const;

/** 三菱 MC 可写变量（按钮，GX Sim2 中 MX Component 可直接写 X） */
export const MITSUBISHI_WRITE_VARS = {
  BUTTON_START: 'X0',
  BUTTON_STOP: 'X1',
  BUTTON_ESTOP: 'X2',
} as const;

/** 三菱地址（UI 显示用） */
export const MITSUBISHI_DISPLAY_VARS = MITSUBISHI_READ_VARS;

// ============================================================
// 按钮/灯 分组地址（面板 tooltip 用）
// ============================================================

export const ADDRESS = {
  BUTTON: {
    start: { coil: 0, s7: 'M10.0', mitsubishi: 'X0' },
    stop:  { coil: 1, s7: 'M10.1', mitsubishi: 'X1' },
    estop: { coil: 2, s7: 'M10.2', mitsubishi: 'X2' },
  },
  LIGHT: {
    ew: {
      green:  { coil: 10, s7: 'M20.0', mitsubishi: 'Y0' },
      yellow: { coil: 11, s7: 'M20.1', mitsubishi: 'Y1' },
      red:    { coil: 12, s7: 'M20.2', mitsubishi: 'Y2' },
    },
    ns: {
      green:  { coil: 13, s7: 'M20.3', mitsubishi: 'Y3' },
      yellow: { coil: 14, s7: 'M20.4', mitsubishi: 'Y4' },
      red:    { coil: 15, s7: 'M20.5', mitsubishi: 'Y5' },
    },
  },
} as const;

// ============================================================
// 时序参数（教师可在评分面板调整，默认 绿稳5/绿闪3/黄2，两方向独立设定）
// 红灯时长不设参数：东西红灯 = 南北(绿稳+绿闪+黄)，南北红灯 = 东西(绿稳+绿闪+黄)
// ============================================================

/** 单方向时序参数（绿灯稳定 / 绿灯闪烁 / 黄灯，秒） */
export interface DirectionTiming {
  /** 绿灯稳定时长（秒） */
  greenSteady: number;
  /** 绿灯闪烁时长（秒） */
  greenFlash: number;
  /** 黄灯时长（秒） */
  yellow: number;
}

export interface TimingParams {
  /** 东西方向时序 */
  ew: DirectionTiming;
  /** 南北方向时序 */
  ns: DirectionTiming;
}

export const TIMING_DEFAULTS: TimingParams = {
  ew: { greenSteady: 5, greenFlash: 3, yellow: 2 },
  ns: { greenSteady: 5, greenFlash: 3, yellow: 2 },
};

/** 方向绿灯+绿闪+黄 总时长（秒） */
export function dirDuration(d: DirectionTiming): number {
  return d.greenSteady + d.greenFlash + d.yellow;
}

/**
 * 红灯时长（自动派生，不可自由设定）：
 * 东西红灯 = 南北(绿稳+绿闪+黄)，南北红灯 = 东西(绿稳+绿闪+黄)
 * 即传入对方方向的时序参数
 */
export function derivedRed(opposite: DirectionTiming): number {
  return dirDuration(opposite);
}

/** 一个完整循环时长（秒）= 东西(绿+闪+黄) + 南北(绿+闪+黄) */
export function cycleDuration(p: TimingParams): number {
  return dirDuration(p.ew) + dirDuration(p.ns);
}

/** 时长判定容差（±40% 窗口） */
export const TIMING_TOLERANCE = 0.4;

/** 评分模式轮询间隔（ms）—— 需 ≤400ms 才能捕捉 1Hz 绿闪 */
export const SCORING_POLL_INTERVAL = {
  modbus: 250,
  s7: 300,
  mitsubishi: 300,
} as const;

/** 时长判定窗口 [target*(1-容差), target*(1+容差)] */
export function durationWindow(targetMs: number): [number, number] {
  return [targetMs * (1 - TIMING_TOLERANCE), targetMs * (1 + TIMING_TOLERANCE)];
}

export function inDurationWindow(measuredMs: number, targetMs: number): boolean {
  const [lo, hi] = durationWindow(targetMs);
  return measuredMs >= lo && measuredMs <= hi;
}

/** 绿闪相位时长判定窗口（1Hz=0.5s，容差 ±0.3s，兼顾轮询误差） */
export function flashPhaseInWindow(measuredMs: number): boolean {
  return measuredMs >= 200 && measuredMs <= 800;
}

// ============================================================
// 3D 场景布局
// ============================================================

/** 道路半宽（道路总宽 = 2×） */
export const ROAD_HALF_WIDTH = 1.5;
/** 路口半边长（路口 = 两路重叠区 = 道路宽） */
export const INTERSECTION_HALF = ROAD_HALF_WIDTH;
/** 道路长度（每方向延伸） */
export const ROAD_LENGTH = 8;
/** 地面尺寸 */
export const GROUND_SIZE = 20;
/** 灯杆坐标（四角，[x, z]，x+ 东 / x- 西 / z+ 南 / z- 北） */
export const POLE_CORNERS: [number, number][] = [
  [1.55, 1.55],   // 东南
  [-1.55, 1.55],  // 西南
  [-1.55, -1.55], // 西北
  [1.55, -1.55],  // 东北
];
/** 灯杆高度 */
export const POLE_HEIGHT = 1.95;
/** 横臂长度（路宽 3 的 1/3，从角点垂直道路挂向路口内） */
export const ARM_LENGTH = 1.0;
/** 横臂离杆顶高度 */
export const ARM_OFFSET = 0.15;

// ============================================================
// 信号灯头（仿真实红黄绿信号灯：黑色灯壳 + 三个圆镜 + 遮阳罩）
// ============================================================

/** 灯壳尺寸（宽 × 高 × 深） */
export const HEAD_WIDTH = 0.5;
export const HEAD_HEIGHT = 1.0;
export const HEAD_DEPTH = 0.15;
/** 灯壳圆角 */
export const HEAD_ROUND_RADIUS = 0.045;
/** 灯镜半径/厚度 */
export const LENS_RADIUS = 0.12;
export const LENS_THICKNESS = 0.025;
/** 灯镜中心间距 */
export const LENS_SPACING = 0.31;
/** 灯镜嵌槽环 */
export const BEZEL_RADIUS = LENS_RADIUS + 0.012;
export const BEZEL_TUBE = 0.01;
/** 遮阳罩（外张圆台，前端直径大） */
export const HOOD_RADIUS_FRONT = 0.16;
export const HOOD_RADIUS_BACK = 0.125;
export const HOOD_DEPTH = 0.06;
/** 灯头距横臂悬挂深度 */
export const HEAD_HANG_DEPTH = 0.28;
/** 灯头整体缩放系数（立柱/横臂不变，仅缩小灯头与外框） */
export const HEAD_SCALE = 0.65;
/** 灯头到路口中心方向偏移（相对横臂端） */
export const HEAD_CENTER_OFFSET = 0;

/** 灯色定义 */
export const LAMP_COLORS = {
  red: '#ff3b30',
  yellow: '#ffb400',
  green: '#2ee96b',
} as const;

/** 灯盘点亮/熄灭发光强度 */
export const LAMP_EMISSIVE_ON = 1.6;
export const LAMP_EMISSIVE_OFF = 0.03;

/** 灯壳颜色 */
export const HEAD_COLOR = '#1a222c';
/** 遮阳罩颜色 */
export const HOOD_COLOR = '#0b1016';
/** 灯镜熄灭时颜色 */
export const LENS_OFF_COLOR = '#10161d';
