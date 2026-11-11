/**
 * 汇川龙门 XY 场景状态（单一真值）。
 *
 * 核心口径：机构运动只由「position 坐标变量」驱动 —— x.position / y.position / z
 * 是唯一位置真值，3D 每帧读取它们；本地流程与外部 PLC 都通过写这些变量来驱动，
 * 不在 3D 组件里另算位置。ETHERCAT 只是 gantryVariables.ts 里的变量/信号映射表。
 *
 * 观众端只读镜像：exportGantrySnapshot / applyBroadcast 键名成对，全部数值键。
 */
import { create } from 'zustand';
import {
  GANTRY_AXIS, GANTRY_BOARD, CHESS_POSITIONS, INITIAL_PIECES,
  cellToMm, type ChessPiece, type ChessLabel,
} from '../constants/gantryConstants';
import { GANTRY_PHASE, type GantryPhase } from '../constants/gantryVariables';

export interface AxisState {
  /** position 坐标变量（mm），3D 与 PLC 共用这一份真值 */
  position: number;
  target: number;
  speed: number;
  enabled: boolean;
  homed: boolean;
  alarm: boolean;
}

export interface CellRef { row: number; col: number }

/** PLC / 虚拟从站下发的坐标与信号帧 */
export interface GantryPlcFrame {
  xPos?: number;
  yPos?: number;
  zPos?: number;
  xTarget?: number;
  yTarget?: number;
  cylinderDown?: boolean;
  vacuum?: boolean;
  enableX?: boolean;
  enableY?: boolean;
}

interface GantryStore {
  x: AxisState;
  y: AxisState;
  /** Z 气缸下降量 mm（0 升起 / Z_STROKE 下降到底） */
  z: number;
  cylinder: { extended: boolean };
  suction: { vacuum: boolean; hasPart: boolean };
  pieces: ChessPiece[];
  heldPieceId: string | null;
  phase: GantryPhase;
  pickCell: CellRef;
  placeCell: CellRef;
  autoRunning: boolean;
  /** 位置变量由谁给：本地面板 / 外部 PLC position 变量 */
  controlSource: 'local' | 'plc';
  connected: boolean;
  estop: boolean;

  setXTarget: (v: number) => void;
  setYTarget: (v: number) => void;
  setPosition: (axis: 'x' | 'y', v: number) => void;
  setCylinder: (extended: boolean) => void;
  setSuction: (vacuum: boolean) => void;
  setServoEnable: (axis: 'x' | 'y', enabled: boolean) => void;
  setAlarm: (axis: 'x' | 'y', alarm: boolean) => void;
  selectPick: (row: number, col: number) => void;
  selectPlace: (row: number, col: number) => void;
  startAuto: () => void;
  stopAuto: () => void;
  setEstop: (on: boolean) => void;
  setConnected: (on: boolean) => void;
  setControlSource: (s: 'local' | 'plc') => void;
  setPlcFrame: (frame: GantryPlcFrame) => void;
  resetAll: () => void;
  /** 每帧推进：坐标斜坡 + 自动流程状态机 */
  tick: (delta: number) => void;
  applyBroadcast: (v: Record<string, boolean | number>) => void;
}

const clamp = (v: number, min: number, max: number) => Math.max(min, Math.min(max, v));

const defaultAxis = (): AxisState => ({
  position: 0, target: 0, speed: 120, enabled: false, homed: true, alarm: false,
});

const initialPieces = (): ChessPiece[] => INITIAL_PIECES.map((p) => ({ ...p }));

/** 找到与吸盘坐标对准、且尚未被吸起的棋子 */
function pieceAt(pieces: ChessPiece[], x: number, y: number): ChessPiece | undefined {
  return pieces.find((p) => !p.held
    && Math.abs(p.x - x) <= 8
    && Math.abs(p.y - y) <= 8);
}

const labelOf = (row: number, col: number): ChessLabel =>
  CHESS_POSITIONS.find((c) => c.row === row && c.col === col)?.label ?? 'A1';

export const useGantryStore = create<GantryStore>((set, get) => ({
  x: defaultAxis(),
  y: defaultAxis(),
  z: 0,
  cylinder: { extended: false },
  suction: { vacuum: false, hasPart: false },
  pieces: initialPieces(),
  heldPieceId: null,
  phase: GANTRY_PHASE.IDLE,
  pickCell: { row: 0, col: 0 },
  placeCell: { row: 2, col: 0 },
  autoRunning: false,
  controlSource: 'local',
  connected: false,
  estop: false,

  setXTarget: (v) => set((s) => ({ x: { ...s.x, target: clamp(v, 0, GANTRY_AXIS.X_TRAVEL) } })),
  setYTarget: (v) => set((s) => ({ y: { ...s.y, target: clamp(v, 0, GANTRY_AXIS.Y_TRAVEL) } })),
  setPosition: (axis, v) => set((s) => {
    const max = axis === 'x' ? GANTRY_AXIS.X_TRAVEL : GANTRY_AXIS.Y_TRAVEL;
    return { [axis]: { ...s[axis], position: clamp(v, 0, max) } } as Partial<GantryStore>;
  }),
  setCylinder: (extended) => set({ cylinder: { extended } }),
  setSuction: (vacuum) => set({ suction: { vacuum, hasPart: vacuum } }),
  setServoEnable: (axis, enabled) => set((s) => ({
    [axis]: { ...s[axis], enabled },
  } as Partial<GantryStore>)),
  setAlarm: (axis, alarm) => set((s) => ({
    [axis]: { ...s[axis], alarm },
  } as Partial<GantryStore>)),
  selectPick: (row, col) => set({ pickCell: { row: clamp(row, 0, GANTRY_BOARD.ROWS - 1), col: clamp(col, 0, GANTRY_BOARD.COLS - 1) } }),
  selectPlace: (row, col) => set({ placeCell: { row: clamp(row, 0, GANTRY_BOARD.ROWS - 1), col: clamp(col, 0, GANTRY_BOARD.COLS - 1) } }),
  startAuto: () => set((s) => ({
    autoRunning: true,
    phase: GANTRY_PHASE.MOVE_TO_PICK,
    controlSource: 'local',
    cylinder: { extended: false },
    suction: { vacuum: false, hasPart: false },
    x: { ...s.x, enabled: true },
    y: { ...s.y, enabled: true },
  })),
  stopAuto: () => set({ autoRunning: false, phase: GANTRY_PHASE.IDLE }),
  setEstop: (on) => set({ estop: on, autoRunning: on ? false : get().autoRunning }),
  setConnected: (on) => set({ connected: on }),
  setControlSource: (controlSource) => set({ controlSource }),

  /** 外部 PLC position 坐标变量写入：只改变量，不碰 3D */
  setPlcFrame: (frame) => set((s) => {
    const patch: Partial<GantryStore> = { controlSource: 'plc' };
    if (typeof frame.xPos === 'number' && Number.isFinite(frame.xPos)) {
      patch.x = { ...s.x, position: clamp(frame.xPos, 0, GANTRY_AXIS.X_TRAVEL) };
    }
    if (typeof frame.yPos === 'number' && Number.isFinite(frame.yPos)) {
      patch.y = { ...s.y, position: clamp(frame.yPos, 0, GANTRY_AXIS.Y_TRAVEL) };
    }
    if (typeof frame.zPos === 'number' && Number.isFinite(frame.zPos)) {
      patch.z = clamp(frame.zPos, 0, GANTRY_AXIS.Z_STROKE);
    }
    if (typeof frame.xTarget === 'number') patch.x = { ...(patch.x ?? s.x), target: clamp(frame.xTarget, 0, GANTRY_AXIS.X_TRAVEL) };
    if (typeof frame.yTarget === 'number') patch.y = { ...(patch.y ?? s.y), target: clamp(frame.yTarget, 0, GANTRY_AXIS.Y_TRAVEL) };
    if (typeof frame.cylinderDown === 'boolean') patch.cylinder = { extended: frame.cylinderDown };
    if (typeof frame.vacuum === 'boolean') patch.suction = { vacuum: frame.vacuum, hasPart: frame.vacuum };
    if (typeof frame.enableX === 'boolean') patch.x = { ...(patch.x ?? s.x), enabled: frame.enableX };
    if (typeof frame.enableY === 'boolean') patch.y = { ...(patch.y ?? s.y), enabled: frame.enableY };
    return patch;
  }),

  resetAll: () => set({
    x: defaultAxis(), y: defaultAxis(), z: 0,
    cylinder: { extended: false }, suction: { vacuum: false, hasPart: false },
    pieces: initialPieces(), heldPieceId: null,
    phase: GANTRY_PHASE.IDLE, autoRunning: false,
    pickCell: { row: 0, col: 0 }, placeCell: { row: 2, col: 0 },
    estop: false, controlSource: 'local',
  }),

  tick: (delta) => {
    const s = get();
    const dt = Math.min(delta, 0.05);
    if (s.estop) return;

    // 1) position 坐标变量斜坡：本地自动流程时向 target 逼近；PLC 给定则直接采用外部值
    let x = s.x;
    let y = s.y;
    if (s.controlSource === 'local') {
      const move = (axis: AxisState) => {
        const diff = axis.target - axis.position;
        const step = Math.min(Math.abs(diff), axis.speed * dt);
        return { ...axis, position: axis.position + Math.sign(diff) * step };
      };
      x = move(s.x);
      y = move(s.y);
    }

    // 2) Z 气缸跟随 extended 平滑
    const zTarget = s.cylinder.extended ? GANTRY_AXIS.Z_STROKE : 0;
    const zDiff = zTarget - s.z;
    const zStep = Math.min(Math.abs(zDiff), 150 * dt);
    const z = s.z + Math.sign(zDiff) * zStep;

    // 3) 被吸起的棋子跟随吸盘坐标与 Z 高度
    let pieces = s.pieces;
    if (s.heldPieceId) {
      pieces = s.pieces.map((p) => (p.id === s.heldPieceId
        ? { ...p, x: x.position, y: y.position, z: GANTRY_AXIS.Z_STROKE - z, held: true }
        : p));
    }

    const patch: Partial<GantryStore> = { x, y, z, pieces };

    // 4) 自动吸取 → 移动 → 放置状态机（只写 position 坐标变量与信号）
    if (s.autoRunning && s.controlSource === 'local') {
      const zDown = z >= GANTRY_AXIS.Z_STROKE - 0.6;
      const zUp = z <= 0.6;
      let phase = s.phase;
      let cylinder = s.cylinder;
      let suction = s.suction;
      let heldPieceId = s.heldPieceId;
      let nextPieces = pieces;

      switch (phase) {
        case GANTRY_PHASE.MOVE_TO_PICK: {
          const c = cellToMm(s.pickCell.row, s.pickCell.col);
          x = { ...x, target: c.x };
          y = { ...y, target: c.y };
          // 必须用刚写入的新 target 判定，不能用帧初的 inPos，否则会跳过整段移动
          if (Math.abs(x.position - x.target) < 0.6 && Math.abs(y.position - y.target) < 0.6) {
            phase = GANTRY_PHASE.Z_DOWN_PICK;
            cylinder = { extended: true };
          }
          break;
        }
        case GANTRY_PHASE.Z_DOWN_PICK:
          if (zDown) {
            phase = GANTRY_PHASE.VACUUM_ON;
            suction = { vacuum: true, hasPart: true };
            const found = pieceAt(nextPieces, x.position, y.position);
            if (found) heldPieceId = found.id;
          }
          break;
        case GANTRY_PHASE.VACUUM_ON:
          if (suction.vacuum) { phase = GANTRY_PHASE.Z_UP_PICK; cylinder = { extended: false }; }
          break;
        case GANTRY_PHASE.Z_UP_PICK:
          if (zUp && heldPieceId) {
            phase = GANTRY_PHASE.MOVE_TO_PLACE;
            const c = cellToMm(s.placeCell.row, s.placeCell.col);
            x = { ...x, target: c.x };
            y = { ...y, target: c.y };
          }
          break;
        case GANTRY_PHASE.MOVE_TO_PLACE:
          if (Math.abs(x.position - x.target) < 0.6 && Math.abs(y.position - y.target) < 0.6) {
            phase = GANTRY_PHASE.Z_DOWN_PLACE;
            cylinder = { extended: true };
          }
          break;
        case GANTRY_PHASE.Z_DOWN_PLACE:
          if (zDown) { phase = GANTRY_PHASE.VACUUM_OFF; suction = { vacuum: false, hasPart: false }; }
          break;
        case GANTRY_PHASE.VACUUM_OFF: {
          const c = cellToMm(s.placeCell.row, s.placeCell.col);
          nextPieces = nextPieces.map((p) => (p.id === heldPieceId
            ? { ...p, row: s.placeCell.row, col: s.placeCell.col, label: labelOf(s.placeCell.row, s.placeCell.col),
              x: c.x, y: c.y, z: 0, held: false }
            : p));
          heldPieceId = null;
          phase = GANTRY_PHASE.Z_UP_PLACE;
          cylinder = { extended: false };
          break;
        }
        case GANTRY_PHASE.Z_UP_PLACE:
          if (zUp) { phase = GANTRY_PHASE.DONE; }
          break;
        case GANTRY_PHASE.DONE:
          phase = GANTRY_PHASE.IDLE;
          break;
        default:
          break;
      }
      patch.x = x; patch.y = y; patch.cylinder = cylinder; patch.suction = suction;
      patch.heldPieceId = heldPieceId; patch.pieces = nextPieces; patch.phase = phase;
      if (phase === GANTRY_PHASE.IDLE) patch.autoRunning = false;
    }

    set(patch);
  },

  /** 观众只读镜像：数值键，Number.isFinite 守卫，禁止 !! 布尔化 */
  applyBroadcast: (v) => {
    const num = (key: string): number | undefined => {
      const x = v[key];
      return typeof x === 'number' && Number.isFinite(x) ? x : undefined;
    };
    const patch: Partial<GantryStore> = {};
    const s = get();
    const xPos = num('GANTRY_X_POS');
    const yPos = num('GANTRY_Y_POS');
    const zPos = num('GANTRY_Z_POS');
    const phase = num('GANTRY_PHASE');
    if (xPos !== undefined) patch.x = { ...s.x, position: xPos };
    if (yPos !== undefined) patch.y = { ...s.y, position: yPos };
    if (zPos !== undefined) patch.z = zPos;
    if (phase !== undefined) patch.phase = clamp(Math.trunc(phase), 0, 9) as GantryPhase;
    if (num('GANTRY_CYL_DOWN') !== undefined) patch.cylinder = { extended: num('GANTRY_CYL_DOWN') === 1 };
    if (num('GANTRY_VACUUM') !== undefined) patch.suction = { vacuum: num('GANTRY_VACUUM') === 1, hasPart: num('GANTRY_VACUUM') === 1 };
    const pieces = s.pieces.map((p, i) => {
      const row = num(`GANTRY_PIECE_${i + 1}_ROW`);
      const col = num(`GANTRY_PIECE_${i + 1}_COL`);
      const held = num(`GANTRY_PIECE_${i + 1}_HELD`);
      if (row === undefined || col === undefined) return p;
      const c = cellToMm(row, col);
      return { ...p, row, col, label: labelOf(row, col), x: c.x, y: c.y, held: held === 1 };
    });
    patch.pieces = pieces;
    patch.heldPieceId = pieces.find((p) => p.held)?.id ?? null;
    set(patch);
  },
}));

/** 主控上报：与 applyBroadcast 键名一一对应 */
export function exportGantrySnapshot(): Record<string, number> {
  const s = useGantryStore.getState();
  const out: Record<string, number> = {
    GANTRY_X_POS: Math.round(s.x.position * 100) / 100,
    GANTRY_Y_POS: Math.round(s.y.position * 100) / 100,
    GANTRY_Z_POS: Math.round(s.z * 100) / 100,
    GANTRY_PHASE: s.phase,
    GANTRY_CYL_DOWN: s.cylinder.extended ? 1 : 0,
    GANTRY_VACUUM: s.suction.vacuum ? 1 : 0,
    GANTRY_HAS_PART: s.suction.hasPart ? 1 : 0,
    GANTRY_X_ENABLE: s.x.enabled ? 1 : 0,
    GANTRY_Y_ENABLE: s.y.enabled ? 1 : 0,
  };
  s.pieces.forEach((p, i) => {
    out[`GANTRY_PIECE_${i + 1}_ROW`] = p.row;
    out[`GANTRY_PIECE_${i + 1}_COL`] = p.col;
    out[`GANTRY_PIECE_${i + 1}_HELD`] = p.held ? 1 : 0;
  });
  return out;
}
