/**
 * 汇川龙门 XY 象棋分拣场景 —— 几何、棋盘与视觉常量（单一来源）。
 * 几何口径沿用 packages/inovance-control/src/scenes/inovance-gantry/constants.ts；
 * 视觉接入 @digital-twin/shared 的工业视觉令牌，与传送带 / 配药等场景同一套风格。
 */
import {
  INDUSTRIAL_VISUAL, INDUSTRIAL_LIGHTING, INDUSTRIAL_DETAIL,
} from '@digital-twin/shared';

/** 结构色与三点布光统一走共享令牌；只保留棋盘 / 棋子 / 气管等本场景特有颜色 */
export const GANTRY_VISUAL = {
  ...INDUSTRIAL_VISUAL,
  SCENE_LIGHTING: INDUSTRIAL_LIGHTING,
  SURFACE_GAP: INDUSTRIAL_DETAIL.SURFACE_GAP,
  BOARD_LIGHT: '#8a5836',
  BOARD_DARK: '#5b3520',
  BOARD_EDGE: '#3c2618',
  BOARD_GRID: '#3c2618',
  PIECE_RED: '#c62828',
  PIECE_BLACK: '#22262b',
  HOSE_COLOR: '#2aa7c4',
} as const;

/** 两轴行程与 Z 气缸行程，单位 mm；MM2M 把 mm 换算成 3D 世界坐标（米） */
export const GANTRY_AXIS = {
  X_TRAVEL: 450,
  Y_TRAVEL: 600,
  Z_STROKE: 50,
  MM2M: 0.001,
} as const;

/** 视觉放大系数：所有部件共用，mm → 3D 世界坐标（米）的换算唯一来源 */
export const GANTRY_VIEW_SCALE = 2;
export const toViewM = (mm: number) => mm * GANTRY_AXIS.MM2M * GANTRY_VIEW_SCALE;

/** 教学用 3x3 棋盘格（沿用旧场景 A1~C3 命名），格心坐标 = OFFSET + index*SPACING + SPACING/2 */
export const GANTRY_BOARD = {
  /** 教学落点仍沿用旧场景 3x3（A1~C3），与变量/面板/自检口径一致 */
  ROWS: 3,
  COLS: 3,
  /** 实物照片里的棋盘是多格深棕棋盘，视觉上画 8x8；落点落在左上 3x3 区 */
  VISUAL_ROWS: 8,
  VISUAL_COLS: 8,
  CELL_SPACING: 40,
  OFFSET_X: 100,
  OFFSET_Y: 100,
} as const;

export const CHESS_POSITIONS = [
  { row: 0, col: 0, label: 'A1' },
  { row: 0, col: 1, label: 'A2' },
  { row: 0, col: 2, label: 'A3' },
  { row: 1, col: 0, label: 'B1' },
  { row: 1, col: 1, label: 'B2' },
  { row: 1, col: 2, label: 'B3' },
  { row: 2, col: 0, label: 'C1' },
  { row: 2, col: 1, label: 'C2' },
  { row: 2, col: 2, label: 'C3' },
] as const;

export type ChessLabel = (typeof CHESS_POSITIONS)[number]['label'];

/** 棋盘格心的机床坐标（mm），X 对应列、Y 对应行 */
export function cellToMm(row: number, col: number): { x: number; y: number } {
  const { CELL_SPACING, OFFSET_X, OFFSET_Y } = GANTRY_BOARD;
  return {
    x: OFFSET_X + col * CELL_SPACING + CELL_SPACING / 2,
    y: OFFSET_Y + row * CELL_SPACING + CELL_SPACING / 2,
  };
}

/** 初始棋子：三颗象棋棋子摆在 A1 / B2 / C3，颜色区分红黑 */
export interface ChessPiece {
  id: string;
  name: string;
  label: ChessLabel;
  side: 'red' | 'black';
  row: number;
  col: number;
  /** 机床坐标 mm，跟随吸盘时实时变化 */
  x: number;
  y: number;
  /** 是否被吸盘吸起 */
  held: boolean;
  /** 离地高度 mm（吸起后随 Z 抬升） */
  z: number;
}

export const INITIAL_PIECES: ChessPiece[] = [
  { id: 'piece-1', name: '車', label: 'A1', side: 'red', row: 0, col: 0, ...cellToMm(0, 0), held: false, z: 0 },
  { id: 'piece-2', name: '馬', label: 'B2', side: 'black', row: 1, col: 1, ...cellToMm(1, 1), held: false, z: 0 },
  { id: 'piece-3', name: '炮', label: 'C3', side: 'red', row: 2, col: 2, ...cellToMm(2, 2), held: false, z: 0 },
];

/** 吸盘吸取判定半径（mm）：吸盘中心与格心距离小于此值才认为对准棋子 */
export const PICK_TOLERANCE = 8;

/**
 * ========== 部件细节尺寸（单一来源，参照配药项目 CYLINDER_DETAIL / SENSOR_DETAIL 口径） ==========
 * 每个部件的可见尺寸、支架、螺栓、行程都在下面集中定义，组件只引用不另写数字。
 */

/** 接近开关 + 固定支架 + 随滑块移动的金属挡片（感应片） */
export const SENSOR_DETAIL = {
  BODY_W: 0.024, BODY_H: 0.036, BODY_D: 0.018,
  LED_R: 0.007,
  /** L 形固定支架：一端夹在模组型材 T 槽侧面，一端托住开关，消除「悬浮」 */
  BRACKET_W: 0.014, BRACKET_T: 0.005,
  BRACKET_ARM: 0.046,       // 模组侧面 → 开关中心
  BRACKET_RISE: 0.026,      // 竖直吊板高度
  /** 金属挡片：固定在移动滑块上，随滑块经过开关感应面 */
  FLAG_W: 0.026, FLAG_H: 0.018, FLAG_T: 0.002,
  FLAG_ARM: 0.030,          // 滑块 → 挡片的伸出臂
  MOUNT_SIDE: 0.050,        // 开关中心离模组轴线
} as const;

/** 笔形升降气缸：缸体固定、活塞杆随 Z 行程伸缩，任何位置都不与缸体脱开 */
export const CYLINDER_DETAIL = {
  BODY_R: 0.016, BODY_LEN: 0.062,
  CAP_R: 0.018, CAP_T: 0.006,
  GUIDE_R: 0.0045, GUIDE_LEN: 0.075, GUIDE_X: 0.026,
  ROD_R: 0.007,
  /** 缸体底面到吸盘支架顶面的基准距离（缩回时） */
  ROD_BASE: 0.052,
  /** 活塞杆顶端必须始终埋进缸体内这一小段，靠这个重叠量保证不脱开 */
  ROD_OVERLAP: 0.018,
  HEAD_BRACKET_T: 0.008,
  BRASS_R: 0.005, BRASS_LEN: 0.016,
} as const;

/** 包梁式 X 滑块 */
export const CARRIAGE_DETAIL = {
  W: 0.075, H: 0.062, D: 0.090,
  BOLT_X: 0.025, BOLT_Z: 0.030,
  PLATE_W: 0.055, PLATE_T: 0.012, PLATE_D: 0.060,
} as const;

/** 两端宽立板端座 */
export const END_SUPPORT_DETAIL = {
  W: 0.085, D: 0.050,
  FLANGE_W: 0.090, FLANGE_T: 0.014, FLANGE_D: 0.075,
  Z: -0.075,
} as const;

/** 线性模组型材 / 导轨 / 丝杆 */
export const MODULE_DETAIL = {
  SECTION: 0.062, HALF: 0.031,
  RAIL_W: 0.007, RAIL_H: 0.004, RAIL_OFFSET: 0.018,
  SCREW_R: 0.006, BEARING_R: 0.013, BEARING_LEN: 0.014,
  BOLT_PITCH: 0.09,
} as const;

/**
 * X / Y 两轴各 3 个接近开关（STEP 的「光遮断器固定片」「GTH8-感应片」）：
 *   两个终端限位在轴两端，原点传感器在原点方向终端限位的内侧（往行程内 25mm）。
 * Y 轴：负限位 0 / 原点 20 / 正限位 600；X 轴：负限位 0 / 原点 25 / 正限位 450。
 * 上电停在机械零点时负限位被挡片压住、原点未触发 = 「未回零」。
 */
export const GANTRY_SENSOR = {
  Y_ORIGIN: 20, Y_END_MINUS: 0, Y_END_PLUS: GANTRY_AXIS.Y_TRAVEL,
  Y_ORIGIN_MM: 20, Y_END_MINUS_MM: 0, Y_END_PLUS_MM: 588,
  X_END_MINUS: 0, X_ORIGIN: 25, X_END_PLUS: GANTRY_AXIS.X_TRAVEL,
  X_END_MINUS_MM: 0, X_ORIGIN_MM: 25, X_END_PLUS_MM: 438,
  TOLERANCE: 8,
  END_TOLERANCE: 4,
  SIDE_X: SENSOR_DETAIL.MOUNT_SIDE,
  // 兼容旧引用，统一从 SENSOR_DETAIL 取值
  BODY_W: SENSOR_DETAIL.BODY_W,
  BODY_H: SENSOR_DETAIL.BODY_H,
  BODY_D: SENSOR_DETAIL.BODY_D,
  LED_R: SENSOR_DETAIL.LED_R,
} as const;

export interface GantrySensorState {
  /** Y 轴 3 个（保留旧键名，兼容既有快照 / 面板 / 自检） */
  origin: boolean;
  endMinus: boolean;
  endPlus: boolean;
  /** X 轴 3 个：两端限位 + 原点在原点侧限位内侧 */
  xOrigin: boolean;
  xEndMinus: boolean;
  xEndPlus: boolean;
}

/** 由 X / Y 的 position 坐标变量派生 6 路 PLC 输入（面板 / 观众 / 自检同源） */
export function computeSensors(yMm: number, xMm = 0): GantrySensorState {
  const s = GANTRY_SENSOR;
  return {
    origin: Math.abs(yMm - s.Y_ORIGIN) <= s.TOLERANCE,
    endMinus: yMm <= s.Y_END_MINUS + s.END_TOLERANCE,
    endPlus: yMm >= s.Y_END_PLUS - s.END_TOLERANCE,
    xOrigin: Math.abs(xMm - s.X_ORIGIN) <= s.TOLERANCE,
    xEndMinus: xMm <= s.X_END_MINUS + s.END_TOLERANCE,
    xEndPlus: xMm >= s.X_END_PLUS - s.END_TOLERANCE,
  };
}
