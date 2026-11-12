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
  /** 防转导杆固定在移动板上、穿过缸体导套随 Z 一起伸出，长度要大于行程 */
  GUIDE_R: 0.0045, GUIDE_LEN: 0.17, GUIDE_X: 0.026,
  GUIDE_BUSH_R: 0.009, GUIDE_BUSH_LEN: 0.02,
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
 * 上电停在机械零点时负限位被挡片压住、原点未触发 = 「未回原点」；
 * 面板「回原点」按钮把两轴送到 X_ORIGIN / Y_ORIGIN，而不是机械零点 0。
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

// ============================================================
// 机位 / 部件展台（与传送带分拣、自动配药同款交互）
// ============================================================

export type Vec3 = [number, number, number];
export type GantryViewKey = 'overview' | 'top' | 'front' | 'zaxis' | 'board';

export interface GantryViewPreset {
  label: string;
  desc: string;
  camera: Vec3;
  target: Vec3;
  fov: number;
}

export const GANTRY_SCENE_CAMERA: Vec3 = [1.9, 1.25, 2.35];
export const GANTRY_SCENE_TARGET: Vec3 = [0.45, 0.18, 0.6];
export const GANTRY_SCENE_FOV = 40;

/** ?view=<key>：整机不同观察机位，CameraRig 做阻尼过渡，用户拖拽后不再拉回 */
export const GANTRY_VIEW_PRESETS: Record<GantryViewKey, GantryViewPreset> = {
  overview: { label: '整机总览', desc: '斜俯视看整机与 XY 两轴', camera: GANTRY_SCENE_CAMERA, target: GANTRY_SCENE_TARGET, fov: GANTRY_SCENE_FOV },
  top: { label: '俯视', desc: '从上方核对棋盘格与两轴行程', camera: [0.9, 2.6, 1.2], target: [0.45, 0.1, 0.6], fov: 42 },
  front: { label: '正视', desc: '从棋盘正面看 X 横梁与 Z 气缸', camera: [0.9, 0.9, 2.7], target: [0.45, 0.34, 0.6], fov: 40 },
  zaxis: { label: 'Z 轴近景', desc: '贴近核对笔形气缸、导杆与波纹吸盘', camera: [0.62, 0.72, 0.62], target: [0, 0.40, 0], fov: 32 },
  board: { label: '棋盘俯视', desc: '核对 8x8 棋盘与三颗棋子', camera: [0.52, 1.05, 0.72], target: [0.52, 0.19, 0.52], fov: 40 },
};

export type GantryPartKind = 'module' | 'carriage' | 'zaxis' | 'sensor' | 'endSupport' | 'board' | 'piece';

export interface GantryPartStage {
  label: string;
  camera: Vec3;
  target: Vec3;
  fov: number;
  /** 0.1m 标尺网格边长 */
  grid: number;
  gridY: number;
}

/** ?stage=<key>：单个部件居中于自身局部原点、1:1 真实尺度 + 0.1m 标尺网格 */
export const GANTRY_PART_STAGES: Record<GantryPartKind, GantryPartStage> = {
  module: { label: '线性模组', camera: [0.62, 0.46, 0.72], target: [0, 0.02, 0], fov: 40, grid: 0.8, gridY: -0.05 },
  carriage: { label: 'X 包梁滑块', camera: [0.30, 0.24, 0.36], target: [0, 0, 0], fov: 36, grid: 0.3, gridY: -0.06 },
  zaxis: { label: 'Z 升降总成', camera: [0.34, 0.16, 0.40], target: [0, -0.12, 0], fov: 34, grid: 0.4, gridY: -0.21 },
  sensor: { label: '接近开关与挡片', camera: [0.24, 0.16, 0.28], target: [0, -0.01, 0], fov: 34, grid: 0.24, gridY: -0.05 },
  endSupport: { label: '端部宽立板端座', camera: [0.48, 0.34, 0.56], target: [0, 0.24, 0], fov: 38, grid: 0.6, gridY: -0.02 },
  board: { label: '棋盘小桌', camera: [0.72, 0.62, 0.86], target: [0.32, 0, 0.32], fov: 42, grid: 0.9, gridY: -0.02 },
  piece: { label: '象棋棋子', camera: [0.16, 0.12, 0.18], target: [0, 0, 0], fov: 32, grid: 0.16, gridY: -0.012 },
};

/** 展台局部原点定义，组件实现必须遵守 */
export const GANTRY_PART_STAGE_ORIGIN: Record<GantryPartKind, string> = {
  module: '模组中心，长边沿 X；y=0 为模组轴线',
  carriage: '包梁滑块几何中心',
  zaxis: 'X 滑块原点；向下为 -Y，吸盘头随 Z 行程移动',
  sensor: '开关支架在型材侧面的安装点；挡片在滑块一侧',
  endSupport: '端座底部中心；立柱沿 +Y',
  board: '棋盘小桌左上角格心；y=0 为台面',
  piece: '棋子底面中心',
};

export function isGantryPartStage(s: string | null): s is GantryPartKind {
  return !!s && Object.prototype.hasOwnProperty.call(GANTRY_PART_STAGES, s);
}

export function isGantryViewKey(v: string | null): v is GantryViewKey {
  return !!v && Object.prototype.hasOwnProperty.call(GANTRY_VIEW_PRESETS, v);
}
