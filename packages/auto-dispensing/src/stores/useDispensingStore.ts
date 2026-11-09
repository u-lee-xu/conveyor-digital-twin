import { create } from 'zustand';
import {
  SLIDER_MIN_X, SLIDER_MAX_X, MAG_CAPACITY, RECIPE_LIMIT,
  PULSES_PER_M, ENCODER_PULSES_MAX, LIMIT_ENTER_TOL, LIMIT_EXIT_TOL,
  type MagazineId,
} from '../scenes/auto-dispensing/constants';
import { SOLENOID_DEFAULT, SOLENOID_TYPES, type SolenoidType } from '../scenes/auto-dispensing/solenoid';

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
  /**
   * 倒药飞行（dumpingPills）的 0→1 插值进度。
   * 接药段（pendingPills）已改为物理刚体，改由「位置越过料斗口」结算，
   * 这里保留字段只为两种飞行数组共用一个类型，接药项恒为 0。
   */
  progress: number;
}

interface DispensingState {
  // ---- 滑台/电机 ----
  sliderX: number;
  motorFwd: boolean;
  motorRev: boolean;
  /**
   * 手动点动中：Y0/Y1 线圈照常置位，但滑台位移由面板按 MANUAL_JOG.STEP 发离散脉冲，
   * rAF 不能再按演示连续速度推进，否则「点一次」会被放大成几十毫米。
   */
  jogActive: boolean;
  /** 目标 X（自动模式按目标直线移动） */
  targetX: number | null;

  // ---- 位置反馈（原点/终点传感器 + 增量式编码器数据寄存器）----
  /**
   * 数据寄存器读数（脉冲）：原点 = 0，随滑台 +X 前进递增、随 -X 后退递减。
   * 这是**增量式**计数器——由每次位移的增量累加得到，而不是把绝对坐标直接写入；
   * 只有回到原点传感器（Z 相）时才校准归零。
   */
  encoderPulses: number;
  /** 浮点脉冲累计器：保留不足 1 脉冲的位移，避免每帧小位移被取整吃掉 */
  encoderAccum: number;
  /** 最近一次计数方向：1=前进(+), -1=后退(-), 0=静止 */
  encoderDir: 1 | -1 | 0;

  // ---- 配方与药仓 ----
  recipe: Record<MagazineId, number>;
  magStock: Record<MagazineId, number>;
  /** 待落入料斗的药片（推出后飞行中） */
  pendingPills: PendingPill[];
  /** 翻转倒药后抛向取药仓的药片（飞行中） */
  dumpingPills: PendingPill[];
  /** 料斗内药片计数 */
  hopperPills: number;
  /** 料斗内药片来源（倒药时按来源着色并计入取药仓，sum === hopperPills） */
  hopperStock: Record<MagazineId, number>;
  /** 取药仓内药片（按药仓统计，人工取药清空） */
  binPills: Record<MagazineId, number>;

  // ---- 气缸 ----
  sendCyl: Record<MagazineId, { extended: boolean; position: number }>;
  /**
   * 「本行程已出药」真值：伸到位上升沿置 true，完全缩回置 false。
   * 视觉药片堆（PillStack）与防重复出药共用这一个状态，
   * 不再从 position 反推，避免半程缩回时药片凭空消失却没有刚体。
   */
  dispensed: Record<MagazineId, boolean>;
  tiltCyl: { tilted: boolean; angle: number };

  // ---- 传感器（物理世界真实反映） ----
  sensors: {
    /** 原点传感器：滑台回到起点触发，兼作增量编码器回零基准 */
    limitStart: boolean;
    /** 终点传感器：滑台到达放药位触发 */
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

  /**
   * 控制柜「手动 / 自动」两位选择开关的物理档位。
   * 它是设备输入元件（PLC 输入 X5/C5/M0.5 与 X6/C6/M0.6 互锁），
   * 不再只读跟随 AppMode：拨动会写 PLC，观众端按广播快照跟随。
   */
  selectorAuto: boolean;

  /**
   * 电磁阀接线类型（单电控 / 双电控）。这是**物理硬件选型**，不是运行态：
   * `resetAll()` 不重置它，也不随自动流程复位；由仿真面板切换，
   * 并经广播快照同步到观众端 store，保证主控与观众口径一致。
   */
  solenoidType: SolenoidType;

  // ---- 自动流程 ----
  autoPhase: AutoPhase;
  autoCycle: number;   // 已完成配方轮数
  dosingMag: MagazineId | null;
  dosingRemain: number;

  // ---- 动作 ----
  /** 设置滑块位置：位移增量驱动编码器寄存器，并刷新原点/终点传感器 */
  setSliderX: (x: number) => void;
  /** 观众端 / PLC 回读：直接按寄存器脉冲对齐滑块与累计器（寄存器即真值） */
  setEncoderPulses: (pulses: number) => void;
  setMotor: (fwd: boolean, rev: boolean) => void;
  /** 手动点动占用电机时置位，让 rAF 的连续速度驱动让位给离散步进 */
  setJogActive: (active: boolean) => void;
  setTargetX: (x: number | null) => void;
  setRecipe: (mag: MagazineId, n: number) => void;
  setMagStock: (mag: MagazineId, n: number) => void;
  /**
   * 人工补药：四仓一次性补满 MAG_CAPACITY，并清除空仓传感器。
   * 与 resetAll（只回原点/清状态）分离，因为真实设备里「加药」和「复位」是两道独立操作；
   * 手动模式推空药仓后必须靠它恢复，否则 spawnPill 永远返回 false。
   */
  refillAll: () => void;
  setPendingPills: (pills: PendingPill[]) => void;
  setDumpingPills: (pills: PendingPill[]) => void;
  addPillToHopper: (mag: MagazineId) => void;
  /** 物理世界：某一粒药越过料斗口 → 只结算这一粒，避免与兜底超时重复计数 */
  landPill: (id: string) => void;
  setHopperPills: (n: number) => void;
  /** 倒药：清空料斗（调用前先读 hopperStock 生成抛落药片） */
  clearHopper: () => void;
  setBinPills: (mag: MagazineId, n: number) => void;
  clearBin: () => void;
  setSendCyl: (mag: MagazineId, extended: boolean, position: number) => void;
  /** 标记本行程已出药 / 已完全缩回解锁；由统一伸到位事件驱动 */
  setDispensed: (mag: MagazineId, value: boolean) => void;
  setTiltCyl: (tilted: boolean, angle: number) => void;
  setLamp: (color: 'green' | 'yellow' | 'red', on: boolean) => void;
  setLamps: (lamp: DispensingState['lamp']) => void;
  setButton: (btn: keyof DispensingState['buttons'], pressed: boolean) => void;
  /** 拨动两位选择开关；调用方负责同时写 PLC 两个互锁输入点 */
  setSelectorAuto: (auto: boolean) => void;
  /** 切换电磁阀接线类型；只接受单一来源里声明的两种取值 */
  setSolenoidType: (type: SolenoidType) => void;
  setAutoPhase: (phase: AutoPhase) => void;
  setDosing: (mag: MagazineId | null, remain: number) => void;
  bumpCycle: () => void;
  resetAuto: () => void;
  /** 复位全部（回起点，清状态，编码器归零） */
  resetAll: () => void;
}

function clampSlider(x: number) {
  return Math.min(SLIDER_MAX_X, Math.max(SLIDER_MIN_X, x));
}

function clampPulses(n: number) {
  return Math.min(ENCODER_PULSES_MAX, Math.max(0, Math.round(n)));
}

/**
 * 原点 / 终点接近开关的滞回判定。
 * 进入用窄阈值、离开用宽阈值：滑块在边界微抖时信号不会反复翻转，
 * 也保证 PLC 读到的是稳定的传感器电平。
 */
function limitSignals(x: number, prev: { limitStart: boolean; limitEnd: boolean }) {
  const onStart = x <= SLIDER_MIN_X + LIMIT_ENTER_TOL;
  const onEnd = x >= SLIDER_MAX_X - LIMIT_ENTER_TOL;
  const offStart = x > SLIDER_MIN_X + LIMIT_EXIT_TOL;
  const offEnd = x < SLIDER_MAX_X - LIMIT_EXIT_TOL;
  return {
    limitStart: onStart || (!offStart && prev.limitStart),
    limitEnd: onEnd || (!offEnd && prev.limitEnd),
  };
}

const initialLamp = { green: false, yellow: false, red: false };

export const useDispensingStore = create<DispensingState>((set, get) => ({
  sliderX: SLIDER_MIN_X,
  motorFwd: false,
  motorRev: false,
  jogActive: false,
  targetX: null,

  encoderPulses: 0,
  encoderAccum: 0,
  encoderDir: 0,

  recipe: { A: 2, B: 1, C: 1, D: 1 },
  magStock: { A: MAG_CAPACITY, B: MAG_CAPACITY, C: MAG_CAPACITY, D: MAG_CAPACITY },
  pendingPills: [],
  dumpingPills: [],
  hopperPills: 0,
  hopperStock: { A: 0, B: 0, C: 0, D: 0 },
  binPills: { A: 0, B: 0, C: 0, D: 0 },

  sendCyl: {
    A: { extended: false, position: 0 },
    B: { extended: false, position: 0 },
    C: { extended: false, position: 0 },
    D: { extended: false, position: 0 },
  },
  dispensed: { A: false, B: false, C: false, D: false },
  tiltCyl: { tilted: false, angle: 0 },

  sensors: {
    limitStart: true,
    limitEnd: false,
    magEmpty: { A: false, B: false, C: false, D: false },
    binHasDrug: false,
    mscBack: { A: true, B: true, C: true, D: true },
    mscFront: { A: false, B: false, C: false, D: false },
    mscTiltHold: true,
    mscTiltDump: false,
  },

  lamp: initialLamp,

  buttons: { start: false, stop: false, reset: false, estop: false, confirm: false },
  selectorAuto: false,
  solenoidType: SOLENOID_DEFAULT,

  autoPhase: 'idle',
  autoCycle: 0,
  dosingMag: null,
  dosingRemain: 0,

  /**
   * 滑台位置的唯一写入口。所有来源（手动按钮、演示状态机、PLC 输出、观众广播）
   * 都经此函数，因此传感器与增量编码器不会漏更新或各自算一套。
   */
  setSliderX: (x) => set((s) => {
    const next = clampSlider(x);
    const delta = next - s.sliderX;

    // 增量式：只把「本次位移」折成脉冲累加，不直接写绝对位置
    let accum = s.encoderAccum + delta * PULSES_PER_M;
    let pulses = clampPulses(accum);
    const dir: 1 | -1 | 0 = delta > 1e-9 ? 1 : delta < -1e-9 ? -1 : 0;

    const lim = limitSignals(next, s.sensors);
    // 增量式编码器的 Z 相：回到原点传感器即校准归零（唯一的绝对基准）
    if (lim.limitStart) { accum = 0; pulses = 0; }

    const sensorsChanged = lim.limitStart !== s.sensors.limitStart || lim.limitEnd !== s.sensors.limitEnd;
    return {
      sliderX: next,
      encoderAccum: accum,
      encoderPulses: pulses,
      encoderDir: dir,
      sensors: sensorsChanged ? { ...s.sensors, ...lim } : s.sensors,
    };
  }),

  setEncoderPulses: (pulses) => set((s) => {
    const p = clampPulses(pulses);
    const x = clampSlider(SLIDER_MIN_X + p / PULSES_PER_M);
    const lim = limitSignals(x, s.sensors);
    return {
      sliderX: x,
      encoderAccum: p,
      encoderPulses: p,
      encoderDir: 0,
      sensors: { ...s.sensors, ...lim },
    };
  }),

  setMotor: (fwd, rev) => {
    const s = get();
    set({ motorFwd: fwd, motorRev: rev });
    // 电机启动时清除自动目标（避免与演示目标冲突；演示模式自行设置）
    if (fwd || rev) set({ targetX: null });
    void s;
  },
  setJogActive: (active) => set({ jogActive: active }),
  setTargetX: (x) => set({ targetX: x }),
  setRecipe: (mag, n) =>
    set((s) => ({ recipe: { ...s.recipe, [mag]: Math.min(RECIPE_LIMIT, Math.max(0, n)) } })),
  setMagStock: (mag, n) =>
    set((s) => ({
      magStock: { ...s.magStock, [mag]: Math.max(0, n) },
      sensors: { ...s.sensors, magEmpty: { ...s.sensors.magEmpty, [mag]: n <= 0 } },
    })),
  refillAll: () =>
    set((s) => ({
      magStock: { A: MAG_CAPACITY, B: MAG_CAPACITY, C: MAG_CAPACITY, D: MAG_CAPACITY },
      // 不动 dispensed（气缸行程锁）与料斗/取药仓计数：补药只补料筒，不改写已出药状态
      sensors: {
        ...s.sensors,
        magEmpty: { A: false, B: false, C: false, D: false },
      },
    })),
  setPendingPills: (pills) => set({ pendingPills: pills }),
  setDumpingPills: (pills) => set({ dumpingPills: pills }),
  addPillToHopper: (mag) => set((s) => ({
    hopperPills: s.hopperPills + 1,
    hopperStock: { ...s.hopperStock, [mag]: s.hopperStock[mag] + 1 },
  })),
  landPill: (id) => set((s) => {
    // 找不到说明已被兜底超时结算过（或急停清空），直接忽略，保证只加一次
    const pill = s.pendingPills.find((p) => p.id === id);
    if (!pill) return {};
    return {
      pendingPills: s.pendingPills.filter((p) => p.id !== id),
      hopperPills: s.hopperPills + 1,
      hopperStock: { ...s.hopperStock, [pill.mag]: s.hopperStock[pill.mag] + 1 },
    };
  }),
  setHopperPills: (n) => set({ hopperPills: n }),
  clearHopper: () => set({ hopperPills: 0, hopperStock: { A: 0, B: 0, C: 0, D: 0 } }),
  setBinPills: (mag, n) =>
    set((s) => {
      const binPills = { ...s.binPills, [mag]: n };
      const binHasDrug = Object.values(binPills).some((v) => v > 0);
      return { binPills, sensors: { ...s.sensors, binHasDrug } };
    }),
  clearBin: () =>
    set((s) => ({
      binPills: { A: 0, B: 0, C: 0, D: 0 },
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
  setDispensed: (mag, value) =>
    set((s) => (s.dispensed[mag] === value
      ? {}
      : { dispensed: { ...s.dispensed, [mag]: value } })),
  setTiltCyl: (tilted, angle) =>
    set((s) => ({
      tiltCyl: { tilted, angle },
      sensors: { ...s.sensors, mscTiltDump: tilted, mscTiltHold: !tilted },
    })),
  setLamp: (color, on) => set((s) => ({ lamp: { ...s.lamp, [color]: on } })),
  setLamps: (lamp) => set({ lamp }),
  setButton: (btn, pressed) => set((s) => ({ buttons: { ...s.buttons, [btn]: pressed } })),
  setSelectorAuto: (auto) => set({ selectorAuto: auto }),
  setSolenoidType: (type) => set({
    solenoidType: SOLENOID_TYPES.includes(type) ? type : SOLENOID_DEFAULT,
  }),
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
      jogActive: false,
      encoderPulses: 0,
      encoderAccum: 0,
      encoderDir: 0,
      hopperPills: 0,
      hopperStock: { A: 0, B: 0, C: 0, D: 0 },
      pendingPills: [],
      dumpingPills: [],
      sendCyl: {
        A: { extended: false, position: 0 },
        B: { extended: false, position: 0 },
        C: { extended: false, position: 0 },
        D: { extended: false, position: 0 },
      },
      tiltCyl: { tilted: false, angle: 0 },
      dispensed: { A: false, B: false, C: false, D: false },
      sensors: {
        limitStart: true,
        limitEnd: false,
        magEmpty: s.sensors.magEmpty,
        binHasDrug: s.sensors.binHasDrug,
        mscBack: { A: true, B: true, C: true, D: true },
        mscFront: { A: false, B: false, C: false, D: false },
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
