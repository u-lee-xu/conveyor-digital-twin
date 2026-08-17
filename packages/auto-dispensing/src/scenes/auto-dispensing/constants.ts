/**
 * 自动配药系统 - 核心常量定义
 *
 * 分区说明：
 *   LAYOUT    — 布局坐标、位置
 *   VISUAL    — 颜色、外观风格
 *   COMPONENT — 部件尺寸参数
 *   ADDRESS   — PLC 变量地址表（与 websocket-server/mock-addresses.js 保持一致）
 */

// ============================================================
// LAYOUT 布局坐标
// ============================================================

/** 传送轴总长（X 方向） */
export const AXIS_LENGTH = 2.2;
/** 滑台料斗行程起点（X）— 起始限位位 */
export const SLIDER_MIN_X = 0.25;
/** 滑台料斗行程终点（X）— 终点限位位（翻转取药位） */
export const SLIDER_MAX_X = 1.95;

/** 传动轴高度（Y，轴心） */
export const AXIS_Y = 1.0;
/** 滑台顶部平台高度 */
export const SLIDER_TOP_Y = 1.1;

/** 药仓位置（X，均匀分布），料斗停该位接药 */
export const MAGAZINE_X = {
  A: 0.68,
  B: 1.1,
  C: 1.52,
} as const;
export type MagazineId = 'A' | 'B' | 'C';

/** 取药仓位置 */
export const COLLECT_BIN_X = SLIDER_MAX_X + 0.28;
/** 灯塔立杆位置 */
export const LIGHT_TOWER_X = SLIDER_MIN_X - 0.42;

/** 控制柜位置 */
export const CABINET_POSITION: [number, number, number] = [-0.1, 0.55, 0.52];

// ============================================================
// COMPONENT 部件尺寸参数
// ============================================================

export const AXIS_R = 0.015;
export const SUPPORT_TUBE_R = 0.035;

/** 滑台（滑块）尺寸 */
export const SLIDER_SIZE: [number, number, number] = [0.16, 0.09, 0.22];

/** 滚珠丝杆/导轨轴高（= 滑块中心：光杆和丝杆从滑块中间水平穿过） */
export const SCREW_Y = SLIDER_TOP_Y + SLIDER_SIZE[1] / 2;
/** 导轨半径 */
export const TRACK_R = 0.013;
/** 导轨中心高度（与丝杆同高，从滑块中间穿过） */
export const TRACK_Y = SCREW_Y;
/** 料斗上口尺寸（X×Z） */
export const HOPPER_TOP: [number, number, number] = [0.14, 0.1, 0.18];
/** 药片（小圆柱）半径/厚度 */
export const PILL_R = 0.016;
export const PILL_H = 0.011;
/** 药仓通道内截面尺寸（X×Z 限制药片单列堆叠） */
export const MAG_TUBE_INNER: [number, number, number] = [PILL_R * 2.3, 0.28, PILL_R * 2.3];
/** 药仓壁厚 */
export const MAG_WALL = 0.008;
/** 药仓容量（每仓最多堆叠药片数） */
export const MAG_CAPACITY = 10;

/** 通道底出口 Y（药片飞出点） */
export const CHUTE_Y = 1.42;
/** 料斗开口 Y（接药）：料斗挂在滑块 +X 侧旋转气缸轴上，轴高=滑块中心 1.145，斗深 0.11，口上移 0.025 */
export const HOPPER_OPEN_Y = SLIDER_TOP_Y + SLIDER_SIZE[1] / 2 + 0.135 - 0.01;
/** 料斗口中心相对滑块中心的 X 偏移（料斗挂在滑块 +Z 侧面旋转气缸轴上，向 +X 略偏便于倒药） */
export const HOPPER_OFFSET_X = 0.02;

/** 送药气缸缸体尺寸 */
export const CYL_BODY: [number, number, number] = [0.12, 0.035, 0.035];
/** CYL_FEED_STROKE 推杆行程（推出 1 粒 + 余量） */
export const CYL_FEED_STROKE = PILL_H * 1.8 * 2;
/** 翻转缸行程 */
export const CYL_TILT_STROKE = 0.06;

/** 取药仓尺寸 */
export const COLLECT_BIN_SIZE: [number, number, number] = [0.22, 0.14, 0.26];

/** 控制柜尺寸 */
export const CABINET_SIZE: [number, number, number] = [0.34, 0.5, 0.2];
/** 灯塔头直径/高度 */
export const LIGHT_DOME_R = 0.045;
export const LIGHT_POLE_H = 0.55;
export const LIGHT_POLE_Y = 1.15;

// ============================================================
// VISUAL 颜色、外观风格
// ============================================================

export const VISUAL = {
  BASE_COLOR: '#374151',         // 底架
  AXIS_COLOR: '#94a3b8',         // 传动轴
  SLIDER_COLOR: '#f59e0b',       // 滑台
  HOPPER_COLOR: '#fbbf24',       // 料斗
  TUBE_COLOR: '#94a3b8',         // 药仓通道（半透明感用材质控制）
  TUBE_BACK_COLOR: '#475569',
  CYL_BODY_COLOR: '#64748b',     // 气缸缸体
  CYL_ROD_COLOR: '#e2e8f0',      // 推杆
  MAG_COLOR: { A: '#f87171', B: '#4ade80', C: '#60a5fa' }, // 药仓标签/底座色
  PILL_COLOR: { A: '#dc2626', B: '#16a34a', C: '#2563eb' }, // 药片颜色
  BIN_COLOR: '#f97316',          // 取药仓
  CABINET_COLOR: '#1e3a5f',      // 控制柜
  LAMP_DARK: '#334155',
  LAMP_GREEN: '#22c55e',
  LAMP_YELLOW: '#eab308',
  LAMP_RED: '#ef4444',
} as const;

// ============================================================
// ADDRESS PLC 变量地址表
// ============================================================
// 与 websocket-server/mock-addresses.js 的 DISPENSING_* 组保持一致（node mock-addresses.js --check 校验）
// 约定：地址 0-9  物理按钮输入
//       地址 10-29 传感器/磁性开关输入
//       地址 30-39 电机/气缸/灯塔输出（可写）
//       寄存器 100+ 编码器位置

export const MODBUS_READ_VARS = {
  // —— 输入：按钮（0-4）——
  BUTTON_START: 0,
  BUTTON_STOP: 1,
  BUTTON_RESET: 2,
  BUTTON_ESTOP: 3,
  BUTTON_CONFIRM: 4,      // 取药确认
  // —— 输入：限位/传感器（10-14）——
  S_LIMIT_START: 10,      // 起始限位
  S_LIMIT_END: 11,        // 终点限位
  S_MAG_A_EMPTY: 12,      // A 空仓
  S_MAG_B_EMPTY: 13,
  S_MAG_C_EMPTY: 14,
  S_BIN_HAS_DRUG: 15,     // 取药仓有药
  // —— 输入：磁性开关（20-27）——
  MSC_A_BACK: 20,   // A 送药缸 退回位
  MSC_A_FRONT: 21,  // A 送药缸 伸出位
  MSC_B_BACK: 22,
  MSC_B_FRONT: 23,
  MSC_C_BACK: 24,
  MSC_C_FRONT: 25,
  MSC_TILT_HOLD: 26, // 翻转缸 盛药位
  MSC_TILT_DUMP: 27, // 翻转缸 翻转位
  // —— 输出：电机（30-31）——
  MOTOR_FWD: 30,
  MOTOR_REV: 31,
  // —— 输出：气缸（32-35）——
  CYL_SEND_A: 32,
  CYL_SEND_B: 33,
  CYL_SEND_C: 34,
  CYL_TILT: 35,
  // —— 输出：灯塔（36-38）——
  LAMP_GREEN: 36,
  LAMP_YELLOW: 37,
  LAMP_RED: 38,
  // —— 编码器位置（8 位二进制，孪生→PLC 输入，0.01m=1 脉冲）——
  ENCODER_BIT0: 40,
  ENCODER_BIT1: 41,
  ENCODER_BIT2: 42,
  ENCODER_BIT3: 43,
  ENCODER_BIT4: 44,
  ENCODER_BIT5: 45,
  ENCODER_BIT6: 46,
  ENCODER_BIT7: 47,
} as const;

export type DispensingVarName = keyof typeof MODBUS_READ_VARS;

/** Modbus 寄存器：编码器位置（脉冲计数，模拟 100 脉冲/米） */
export const ENCODER_REG = 120;

// ----- S7（M 区） -----
export const S7_VARS = {
  BUTTON_START: 'M0.0',
  BUTTON_STOP: 'M0.1',
  BUTTON_RESET: 'M0.2',
  BUTTON_ESTOP: 'M0.3',
  BUTTON_CONFIRM: 'M0.4',
  S_LIMIT_START: 'M20.0',
  S_LIMIT_END: 'M20.1',
  S_MAG_A_EMPTY: 'M20.2',
  S_MAG_B_EMPTY: 'M20.3',
  S_MAG_C_EMPTY: 'M20.4',
  S_BIN_HAS_DRUG: 'M20.5',
  MSC_A_BACK: 'M20.6', MSC_A_FRONT: 'M20.7',
  MSC_B_BACK: 'M21.0', MSC_B_FRONT: 'M21.1',
  MSC_C_BACK: 'M21.2', MSC_C_FRONT: 'M21.3',
  MSC_TILT_HOLD: 'M21.4', MSC_TILT_DUMP: 'M21.5',
  MOTOR_FWD: 'M30.0',
  MOTOR_REV: 'M30.1',
  CYL_SEND_A: 'M30.2',
  CYL_SEND_B: 'M30.3',
  CYL_SEND_C: 'M30.4',
  CYL_TILT: 'M30.5',
  LAMP_GREEN: 'M30.6',
  LAMP_YELLOW: 'M30.7',
  LAMP_RED: 'M31.0',
  ENCODER_BIT0: 'M31.1',
  ENCODER_BIT1: 'M31.2',
  ENCODER_BIT2: 'M31.3',
  ENCODER_BIT3: 'M31.4',
  ENCODER_BIT4: 'M31.5',
  ENCODER_BIT5: 'M31.6',
  ENCODER_BIT6: 'M31.7',
  ENCODER_BIT7: 'M32.0',
} as const;

// ----- 三菱（X/Y） -----
export const MITSUBISHI_READ_VARS = {
  BUTTON_START: 'X0',
  BUTTON_STOP: 'X1',
  BUTTON_RESET: 'X2',
  BUTTON_ESTOP: 'X3',
  BUTTON_CONFIRM: 'X4',
  S_LIMIT_START: 'X10',
  S_LIMIT_END: 'X11',
  S_MAG_A_EMPTY: 'X12',
  S_MAG_B_EMPTY: 'X13',
  S_MAG_C_EMPTY: 'X14',
  S_BIN_HAS_DRUG: 'X15',
  MSC_A_BACK: 'X20', MSC_A_FRONT: 'X21',
  MSC_B_BACK: 'X22', MSC_B_FRONT: 'X23',
  MSC_C_BACK: 'X24', MSC_C_FRONT: 'X25',
  MSC_TILT_HOLD: 'X26', MSC_TILT_DUMP: 'X27',
  ENCODER_BIT0: 'X30', ENCODER_BIT1: 'X31', ENCODER_BIT2: 'X32', ENCODER_BIT3: 'X33',
  ENCODER_BIT4: 'X34', ENCODER_BIT5: 'X35', ENCODER_BIT6: 'X36', ENCODER_BIT7: 'X37',
} as const;
export const MITSUBISHI_WRITE_VARS = {
  MOTOR_FWD: 'Y0',
  MOTOR_REV: 'Y1',
  CYL_SEND_A: 'Y2',
  CYL_SEND_B: 'Y3',
  CYL_SEND_C: 'Y4',
  CYL_TILT: 'Y5',
  LAMP_GREEN: 'Y6',
  LAMP_YELLOW: 'Y7',
  LAMP_RED: 'Y8',
} as const;

export const MODBUS_DISPLAY_VARS = Object.fromEntries(
  Object.entries(MODBUS_READ_VARS).map(([k, v]) => [k, `Coil ${v}`]),
) as Record<keyof typeof MODBUS_READ_VARS, string>;

export const S7_DISPLAY_VARS = S7_VARS;
export const MITSUBISHI_DISPLAY_VARS = { ...MITSUBISHI_READ_VARS, ...MITSUBISHI_WRITE_VARS };

// ============================================================
// 配方
// ============================================================

export const RECIPE_LIMIT = 9; // 每仓 0~9 份

/** 编码器脉冲换算：0.01m = 1 脉冲（与 mock PLC 一致） */
export const PULSES_PER_M = 100;

export const MAGAZINE_LABELS: Record<MagazineId, string> = { A: 'A 药', B: 'B 药', C: 'C 药' };