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
