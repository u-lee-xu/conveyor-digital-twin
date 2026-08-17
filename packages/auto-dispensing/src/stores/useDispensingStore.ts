import { create } from 'zustand';
import {
  SLIDER_MIN_X, SLIDER_MAX_X, MAG_CAPACITY, RECIPE_LIMIT,
  type MagazineId,
} from '../scenes/auto-dispensing/constants';

export type AppMode = 'manual' | 'auto' | 'sim' | 'scoring';

/** 演示循环状态机 */
export type AutoPhase =
  | 'idle'            // 待机（启动按钮后进入 travel）
  | 'travel'          // 滑台移动中（含目标仓/取药位）
  | 'dosing'          // 在某药仓前：伸缸→缩缸（按份数重复）
  | 'tilt'            // 终点翻转倒药
  | 'returning'       // 回程至起点
  | 'wait_confirm';   // 等待人工取药确认

export interface PendingPill {
  id: string;
  mag: MagazineId;
  /** 0=刚推出，1=已在料斗内 */
  progress: number;
}

interface DispensingState {
  // ---- 滑台/电机 ----
  sliderX: number;
  motorFwd: boolean;
  motorRev: boolean;
  /** 目标 X（自动模式按目标直线移动） */
  targetX: number | null;

  // ---- 配方与药仓 ----
  recipe: Record<MagazineId, number>;
  magStock: Record<MagazineId, number>;
  /** 待落入料斗的药片（推出后飞行中） */
  pendingPills: PendingPill[];
  /** 料斗内药片计数 */
  hopperPills: number;
  /** 取药仓内药片（按药仓统计，人工取药清空） */
  binPills: Record<MagazineId, number>;

  // ---- 气缸 ----
  sendCyl: Record<MagazineId, { extended: boolean; position: number }>;
  tiltCyl: { tilted: boolean; angle: number };

  // ---- 传感器（物理世界真实反映） ----
  sensors: {
    limitStart: boolean;
    limitEnd: boolean;
    magEmpty: Record<MagazineId, boolean>;
    binHasDrug: boolean;
    mscBack: Record<MagazineId, boolean>;
    mscFront: Record<MagazineId, boolean>;
    mscTiltHold: boolean;
    mscTiltDump: boolean;
  };

  // ---- 灯塔 ----
  lamp: { green: boolean; yellow: boolean; red: boolean };

  // ---- 面板按钮（手动/演示模式的输入，仿真模式由 PLC 写入） ----
  buttons: {
    start: boolean;
    stop: boolean;
    reset: boolean;
    estop: boolean;
    confirm: boolean;
  };

  // ---- 自动流程 ----
  autoPhase: AutoPhase;
  autoCycle: number;   // 已完成配方轮数
  dosingMag: MagazineId | null;
  dosingRemain: number;

  // ---- 动作 ----
  setSliderX: (x: number) => void;
  setMotor: (fwd: boolean, rev: boolean) => void;
  setTargetX: (x: number | null) => void;
  setRecipe: (mag: MagazineId, n: number) => void;
  setMagStock: (mag: MagazineId, n: number) => void;
  setPendingPills: (pills: PendingPill[]) => void;
  addPillToHopper: () => void;
  setHopperPills: (n: number) => void;
  setBinPills: (mag: MagazineId, n: number) => void;
  clearBin: () => void;
  setSendCyl: (mag: MagazineId, extended: boolean, position: number) => void;
  setTiltCyl: (tilted: boolean, angle: number) => void;
  setLamp: (color: 'green' | 'yellow' | 'red', on: boolean) => void;
  setLamps: (lamp: DispensingState['lamp']) => void;
  setButton: (btn: keyof DispensingState['buttons'], pressed: boolean) => void;
  setAutoPhase: (phase: AutoPhase) => void;
  setDosing: (mag: MagazineId | null, remain: number) => void;
  bumpCycle: () => void;
  resetAuto: () => void;
  /** 复位全部（回起点，清状态） */
  resetAll: () => void;
}

function clampSlider(x: number) {
  return Math.min(SLIDER_MAX_X, Math.max(SLIDER_MIN_X, x));
}

const initialLamp = { green: false, yellow: false, red: false };

export const useDispensingStore = create<DispensingState>((set, get) => ({
  sliderX: SLIDER_MIN_X,
  motorFwd: false,
  motorRev: false,
  targetX: null,

  recipe: { A: 2, B: 1, C: 1 },
  magStock: { A: MAG_CAPACITY, B: MAG_CAPACITY, C: MAG_CAPACITY },
  pendingPills: [],
  hopperPills: 0,
  binPills: { A: 0, B: 0, C: 0 },

  sendCyl: {
    A: { extended: false, position: 0 },
    B: { extended: false, position: 0 },
    C: { extended: false, position: 0 },
  },
  tiltCyl: { tilted: false, angle: 0 },

  sensors: {
    limitStart: true,
    limitEnd: false,
    magEmpty: { A: false, B: false, C: false },
    binHasDrug: false,
    mscBack: { A: true, B: true, C: true },
    mscFront: { A: false, B: false, C: false },
    mscTiltHold: true,
    mscTiltDump: false,
  },

  lamp: initialLamp,

  buttons: { start: false, stop: false, reset: false, estop: false, confirm: false },

  autoPhase: 'idle',
  autoCycle: 0,
  dosingMag: null,
  dosingRemain: 0,

  setSliderX: (x) => set({ sliderX: clampSlider(x) }),
  setMotor: (fwd, rev) => {
    const s = get();
    set({ motorFwd: fwd, motorRev: rev });
    // 电机启动时清除自动目标（避免与演示目标冲突；演示模式自行设置）
    if (fwd || rev) set({ targetX: null });
    void s;
  },
  setTargetX: (x) => set({ targetX: x }),
  setRecipe: (mag, n) =>
    set((s) => ({ recipe: { ...s.recipe, [mag]: Math.min(RECIPE_LIMIT, Math.max(0, n)) } })),
  setMagStock: (mag, n) =>
    set((s) => ({
      magStock: { ...s.magStock, [mag]: Math.max(0, n) },
      sensors: { ...s.sensors, magEmpty: { ...s.sensors.magEmpty, [mag]: n <= 0 } },
    })),
  setPendingPills: (pills) => set({ pendingPills: pills }),
  addPillToHopper: () => set((s) => ({ hopperPills: s.hopperPills + 1 })),
  setHopperPills: (n) => set({ hopperPills: n }),
  setBinPills: (mag, n) =>
    set((s) => {
      const binPills = { ...s.binPills, [mag]: n };
      const binHasDrug = Object.values(binPills).some((v) => v > 0);
      return { binPills, sensors: { ...s.sensors, binHasDrug } };
    }),
  clearBin: () =>
    set((s) => ({
      binPills: { A: 0, B: 0, C: 0 },
      sensors: { ...s.sensors, binHasDrug: false },
    })),
  setSendCyl: (mag, extended, position) =>
    set((s) => ({
      sendCyl: { ...s.sendCyl, [mag]: { extended, position } },
      sensors: {
        ...s.sensors,
        mscBack: { ...s.sensors.mscBack, [mag]: !extended },
        mscFront: { ...s.sensors.mscFront, [mag]: extended },
      },
    })),
  setTiltCyl: (tilted, angle) =>
    set((s) => ({
      tiltCyl: { tilted, angle },
      sensors: { ...s.sensors, mscTiltDump: tilted, mscTiltHold: !tilted },
    })),
  setLamp: (color, on) => set((s) => ({ lamp: { ...s.lamp, [color]: on } })),
  setLamps: (lamp) => set({ lamp }),
  setButton: (btn, pressed) => set((s) => ({ buttons: { ...s.buttons, [btn]: pressed } })),
  setAutoPhase: (phase) => set({ autoPhase: phase }),
  setDosing: (dosingMag, dosingRemain) => set({ dosingMag, dosingRemain }),
  bumpCycle: () => set((s) => ({ autoCycle: s.autoCycle + 1 })),
  resetAuto: () =>
    set({
      autoPhase: 'idle',
      dosingMag: null,
      dosingRemain: 0,
      targetX: null,
      motorFwd: false,
      motorRev: false,
    }),
  resetAll: () =>
    set((s) => ({
      sliderX: SLIDER_MIN_X,
      targetX: null,
      motorFwd: false,
      motorRev: false,
      hopperPills: 0,
      pendingPills: [],
      sendCyl: {
        A: { extended: false, position: 0 },
        B: { extended: false, position: 0 },
        C: { extended: false, position: 0 },
      },
      tiltCyl: { tilted: false, angle: 0 },
      sensors: {
        limitStart: true,
        limitEnd: false,
        magEmpty: s.sensors.magEmpty,
        binHasDrug: s.sensors.binHasDrug,
        mscBack: { A: true, B: true, C: true },
        mscFront: { A: false, B: false, C: false },
        mscTiltHold: true,
        mscTiltDump: false,
      },
      lamp: initialLamp,
      buttons: { start: false, stop: false, reset: false, estop: false, confirm: false },
      autoPhase: 'idle',
      dosingMag: null,
      dosingRemain: 0,
    })),
}));

export type { MagazineId };