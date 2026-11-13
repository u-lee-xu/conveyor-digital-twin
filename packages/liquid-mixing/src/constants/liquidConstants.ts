/**
 * 液体混装场景：容量 / 流量 / 几何 / 视觉 / 阶段 / 报警的**唯一来源**。
 *
 * 工艺（契约 v1.0）：A 液 → B 液依次定量进料 → 正转搅拌 → 反转搅拌 →
 * 底部出料阀转入成品储液罐 → 本轮完成 → 下一轮。演示启动后一直循环，
 * 按停止只置标志，完成当前循环后才停。
 *
 * 真值口径：四罐体积是 32 位 REAL 浮点唯一真值（单位 L），由流量积分写入；
 * 显示读数 = 真值 − 去皮偏置；「去皮」只写偏置，绝不改真值或目标。
 * 模拟量液位与开关量液位同源派生，不在组件里另算一遍。
 */
import {
  INDUSTRIAL_VISUAL, INDUSTRIAL_LIGHTING, INDUSTRIAL_DETAIL,
} from '@digital-twin/shared';

export const TANK_IDS = ['a', 'b', 'mix', 'product'] as const;
export type TankId = (typeof TANK_IDS)[number];

export interface Volumes {
  a: number;
  b: number;
  mix: number;
  product: number;
}

export interface Outputs {
  valveA: boolean;
  valveB: boolean;
  stirForward: boolean;
  stirReverse: boolean;
  discharge: boolean;
}

/** 四罐上下限液位（开关量）+ 搅拌 / 阀门反馈，全部由 REAL 液位与输出同源派生 */
export interface LiquidSensors {
  aHigh: boolean;
  aLow: boolean;
  bHigh: boolean;
  bLow: boolean;
  mixHigh: boolean;
  mixLow: boolean;
  productHigh: boolean;
  productLow: boolean;
  stirring: boolean;
  forward: boolean;
  reverse: boolean;
  valveAOpen: boolean;
  valveBOpen: boolean;
  dischargeOpen: boolean;
}

export interface Recipe {
  /** 每轮从 A / B 罐取用的体积（L，REAL） */
  targetA: number;
  targetB: number;
  /** 正转 / 反转搅拌时长（秒） */
  stirForwardSec: number;
  stirReverseSec: number;
}

/** 教学整数值：容量 L、流量 L/s、时长 s，全部集中在本表 */
export const LIQUID_PROCESS = {
  CAPACITY_A: 100,
  CAPACITY_B: 100,
  CAPACITY_MIX: 120,
  CAPACITY_PRODUCT: 300,
  INITIAL_A: 80,
  INITIAL_B: 80,
  INITIAL_MIX: 0,
  INITIAL_PRODUCT: 0,
  FEED_RATE: 12,
  DISCHARGE_RATE: 15,
  /** 演示每轮结束后回补 A/B 原液、转出成品，保证「启动后一直循环」不会自己停 */
  REFILL_RATE: 120,
  PRODUCT_DRAIN_RATE: 200,
  /** 开关量液位阈值（占容量比） */
  HIGH_RATIO: 0.9,
  LOW_RATIO: 0.1,
  /** 搅拌角速度 rad/s，只影响 3D 桨叶观感，不参与真值 */
  STIR_OMEGA: 5.2,
  /** 混合均匀度积分速率（1/s）：正反转同速，默认 3s + 3s 恰好推进到 1 */
  UNIFORMITY_RATE: 0.17,
  /** 涡流液面最大凹陷（m）与旋流弧线条数：凹陷要足以在近距俯看时一眼可辨 */
  SWIRL_DEPTH: 0.028,
  SWIRL_ARMS: 3,
  /** 体积积分上限保护：单帧最多 0.05s */
  MAX_DT: 0.05,
  /** 判零容差（L） */
  EPS: 0.02,
} as const;

export const LIQUID_CAPACITY: Record<TankId, number> = {
  a: LIQUID_PROCESS.CAPACITY_A,
  b: LIQUID_PROCESS.CAPACITY_B,
  mix: LIQUID_PROCESS.CAPACITY_MIX,
  product: LIQUID_PROCESS.CAPACITY_PRODUCT,
};

export const LIQUID_INITIAL_VOLUMES: Volumes = {
  a: LIQUID_PROCESS.INITIAL_A,
  b: LIQUID_PROCESS.INITIAL_B,
  mix: LIQUID_PROCESS.INITIAL_MIX,
  product: LIQUID_PROCESS.INITIAL_PRODUCT,
};

export const LIQUID_DEFAULT_RECIPE: Recipe = {
  targetA: 30,
  targetB: 20,
  stirForwardSec: 3,
  stirReverseSec: 3,
};

export const LIQUID_EMPTY_OUTPUTS: Outputs = {
  valveA: false, valveB: false, stirForward: false, stirReverse: false, discharge: false,
};

/** 工艺阶段：正转与反转是两段独立阶段，演示交替执行 */
export const LIQUID_PHASE = {
  IDLE: 0,
  FEED_A: 1,
  FEED_B: 2,
  STIR_FWD: 3,
  STIR_REV: 4,
  DISCHARGE: 5,
  DONE: 6,
} as const;
export type LiquidPhase = (typeof LIQUID_PHASE)[keyof typeof LIQUID_PHASE];

export const LIQUID_PHASE_LABEL: Record<number, string> = {
  [LIQUID_PHASE.IDLE]: '待机',
  [LIQUID_PHASE.FEED_A]: 'A 液进料',
  [LIQUID_PHASE.FEED_B]: 'B 液进料',
  [LIQUID_PHASE.STIR_FWD]: '正转搅拌',
  [LIQUID_PHASE.STIR_REV]: '反转搅拌',
  [LIQUID_PHASE.DISCHARGE]: '出料转成品罐',
  [LIQUID_PHASE.DONE]: '本轮完成',
};

/** 报警位（可叠加），0 表示无报警 */
export const LIQUID_ALARM = {
  NONE: 0,
  LOW_LEVEL: 1,
  PRODUCT_FULL: 2,
  OVERFLOW: 4,
  ESTOP: 8,
} as const;

export const LIQUID_ALARM_LABEL: Record<number, string> = {
  [LIQUID_ALARM.LOW_LEVEL]: '原液低液位',
  [LIQUID_ALARM.PRODUCT_FULL]: '成品罐满',
  [LIQUID_ALARM.OVERFLOW]: '混合罐溢流',
  [LIQUID_ALARM.ESTOP]: '急停',
};

/** 视觉：结构色 / 布光 / 间隙一律取自共享令牌，液体色为本场景新增项 */
export const LIQUID_VISUAL = {
  ...INDUSTRIAL_VISUAL,
  SURFACE_GAP: INDUSTRIAL_DETAIL.SURFACE_GAP,
  SCENE_LIGHTING: INDUSTRIAL_LIGHTING,
  LIQUID_A: '#2f81f7',
  LIQUID_B: '#f59e0b',
  LIQUID_MIX: '#a855f7',
  LIQUID_PRODUCT: '#10b981',
  /** 搅拌可视化：桨叶示踪 / 旋流弧线 / 罐顶转向环 */
  BLADE_MARK: '#c084fc',
  SWIRL: '#7dd3fc',
  DIRECTION: '#fbbf24',
  GLASS: '#bcd7ee',
  SCALE: '#e2e8f0',
  PIPE: '#aab6c4',
  SCENE_CAMERA: [1.85, 1.18, 2.15] as [number, number, number],
  SCENE_TARGET: [0, 0.42, 0] as [number, number, number],
} as const;

/** 几何单一来源：米。罐底 y 即支腿台面高度，液面从罐底沿 +Y 上升 */
export interface TankGeometry {
  label: string;
  short: string;
  radius: number;
  height: number;
  baseY: number;
  position: [number, number, number];
  color: string;
}
export const LIQUID_TANKS: Record<TankId, TankGeometry> = {
  a: { label: 'A 原液罐', short: 'A', radius: 0.155, height: 0.50, baseY: 0.14, position: [-0.86, 0.14, -0.44], color: LIQUID_VISUAL.LIQUID_A },
  b: { label: 'B 原液罐', short: 'B', radius: 0.155, height: 0.50, baseY: 0.14, position: [-0.86, 0.14, 0.44], color: LIQUID_VISUAL.LIQUID_B },
  mix: { label: '混合罐', short: 'MIX', radius: 0.205, height: 0.58, baseY: 0.14, position: [0, 0.14, 0], color: LIQUID_VISUAL.LIQUID_MIX },
  product: { label: '成品储液罐', short: 'OUT', radius: 0.215, height: 0.62, baseY: 0.14, position: [0.92, 0.14, 0], color: LIQUID_VISUAL.LIQUID_PRODUCT },
};

/** 机架台面 / 管路 / 阀泵尺寸，与罐体同一份常量表 */
export const LIQUID_GEOM = {
  PLATFORM_Y: 0.10,
  PLATFORM_H: 0.04,
  LEG_H: 0.10,
  PIPE_R: 0.018,
  PIPE_INSET: 0.006,
  VALVE_R: 0.036,
  PUMP_R: 0.052,
  STIR_SHAFT_R: 0.012,
  STIR_BLADE_L: 0.15,
  WINDOW_W: 0.055,
  WINDOW_INSET: 0.004,
  SCALE_W: 0.012,
  TICK_LEN: 0.028,
  /** 观察窗与罐壁、液面与观察窗的错开量，一律 ≥ SURFACE_GAP */
  WINDOW_GAP: 0.004,
  LIQUID_GAP: 0.006,
  CAP_GAP: 0.005,
} as const;

/** 机位预设：整机 / 正面 / 俯视 / 混合罐 / 搅拌观察 / 成品罐 */
export const LIQUID_VIEW_PRESETS = {
  overview: { label: '整机', desc: '四罐与管路全景', position: [1.85, 1.18, 2.15] as [number, number, number], target: [0, 0.42, 0] as [number, number, number] },
  front: { label: '正面', desc: '正对四个液位视窗', position: [0, 0.62, 2.55] as [number, number, number], target: [0, 0.42, 0] as [number, number, number] },
  top: { label: '俯视', desc: '管路与罐顶布置', position: [0.05, 2.35, 0.35] as [number, number, number], target: [0, 0.24, 0] as [number, number, number] },
  mixer: { label: '混合罐', desc: '搅拌桨与液面特写', position: [0.62, 0.92, 0.85] as [number, number, number], target: [0, 0.40, 0] as [number, number, number] },
  stir: { label: '搅拌观察', desc: '近距俯看涡流、旋流与桨叶', position: [0.40, 0.82, 0.52] as [number, number, number], target: [0, 0.34, 0] as [number, number, number] },
  product: { label: '成品罐', desc: '出料管路与成品液位', position: [1.72, 0.86, 0.78] as [number, number, number], target: [0.92, 0.42, 0] as [number, number, number] },
} as const;
export type LiquidViewKey = keyof typeof LIQUID_VIEW_PRESETS;

export function isLiquidViewKey(v: string | null): v is LiquidViewKey {
  return !!v && Object.prototype.hasOwnProperty.call(LIQUID_VIEW_PRESETS, v);
}

/** 部件展台：与整机共用同一批组件，1:1 尺度 + 0.1m 标尺网格 */
export const LIQUID_PART_STAGES = {
  tank: { label: '储液罐', grid: 1.0, gridY: -0.02 },
  window: { label: '液位视窗', grid: 0.8, gridY: -0.02 },
  agitator: { label: '搅拌器', grid: 0.8, gridY: -0.02 },
  valve: { label: '球阀', grid: 0.5, gridY: -0.02 },
  pump: { label: '进料泵', grid: 0.5, gridY: -0.02 },
  pipe: { label: '管路', grid: 0.8, gridY: -0.02 },
} as const;
export type LiquidPartKind = keyof typeof LIQUID_PART_STAGES;

export function isLiquidPartStage(v: string | null): v is LiquidPartKind {
  return !!v && Object.prototype.hasOwnProperty.call(LIQUID_PART_STAGES, v);
}

export const LIQUID_PART_STAGE_ORIGIN: Record<LiquidPartKind, [number, number, number]> = {
  tank: [0, 0, 0], window: [0, 0, 0], agitator: [0, 0, 0],
  valve: [0, 0, 0], pump: [0, 0, 0], pipe: [0, 0, 0],
};

/* ------------------------------ 纯函数派生 ------------------------------ */

export const clamp = (v: number, min: number, max: number) => Math.max(min, Math.min(max, v));

/** 体积越界守卫：有限性 + 非负 + 容量截断 */
export function clampVolume(tank: TankId, v: number): number {
  if (!Number.isFinite(v) || v < 0) return 0;
  return clamp(v, 0, LIQUID_CAPACITY[tank]);
}

/** 去皮后的显示读数（唯一公式） */
export function liquidDisplay(tank: TankId, volumes: Volumes, tare: Volumes): number {
  return volumes[tank] - tare[tank];
}

/** 液位占容量比 0..1，3D 液面高度与开关量都由它派生 */
export function liquidLevelRatio(tank: TankId, volume: number): number {
  return clamp(volume / LIQUID_CAPACITY[tank], 0, 1);
}

/** 液面柱高度（米），与 3D 几何同源 */
export function liquidLevelHeight(tank: TankId, volume: number): number {
  const g = LIQUID_TANKS[tank];
  const usable = g.height - 2 * LIQUID_GEOM.LIQUID_GAP;
  return liquidLevelRatio(tank, volume) * usable;
}

/* ------------------------------ 颜色 / 搅拌派生 ------------------------------ */

/** 十六进制颜色解析（本文件颜色派生的单一实现） */
function hexRgb(hex: string): [number, number, number] {
  const n = Number.parseInt(hex.slice(1), 16);
  return [(n >> 16) & 0xff, (n >> 8) & 0xff, n & 0xff];
}
function rgbHex(c: number[]): string {
  return `#${c.map((v) => clamp(Math.round(v), 0, 255).toString(16).padStart(2, '0')).join('')}`;
}

/** 两色线性插值：t=0 取 a、t=1 取 b */
export function mixHexColor(a: string, b: string, t: number): string {
  const k = clamp(t, 0, 1);
  const ca = hexRgb(a);
  const cb = hexRgb(b);
  return rgbHex([0, 1, 2].map((i) => ca[i] + (cb[i] - ca[i]) * k));
}

/** 混合液颜色：按混合罐内 A / B 占比，从 A 原液色插值到 B 原液色 */
export function liquidMixColor(ratioA: number, ratioB: number): string {
  const total = ratioA + ratioB;
  const t = total <= 0 ? 0.5 : clamp(ratioB / total, 0, 1);
  return mixHexColor(LIQUID_VISUAL.LIQUID_A, LIQUID_VISUAL.LIQUID_B, t);
}

/** 混合均匀度 0..1 守卫（非有限值归零） */
export function clampUniformity(v: number): number {
  return Number.isFinite(v) ? clamp(v, 0, 1) : 0;
}

/** 两组分齐备度：只有一种原液时为 0，等量时为 1 */
export function liquidPairPresence(ratioA: number, ratioB: number): number {
  const a = Math.max(0, Number.isFinite(ratioA) ? ratioA : 0);
  const b = Math.max(0, Number.isFinite(ratioB) ? ratioB : 0);
  const total = a + b;
  return total <= 0 ? 0 : clamp((2 * Math.min(a, b)) / total, 0, 1);
}

/**
 * 搅匀后的目标色：A 蓝与 B 橙直接线性插值会得到灰褐色，看起来像「变透明了」。
 * 两组分齐备时向本场景的混合紫偏移，搅匀后是饱和的一体色；只有单一组分时保持原液色。
 */
export function liquidBlendColor(ratioA: number, ratioB: number): string {
  return mixHexColor(
    liquidMixColor(ratioA, ratioB),
    LIQUID_VISUAL.LIQUID_MIX,
    0.88 * liquidPairPresence(ratioA, ratioB),
  );
}

/**
 * 分层色带：下带 A 色、上带 B 色，随均匀度一起收敛到混合色。
 * 只有单一组分时不应凭空画出另一层的颜色，因此用「两组分齐备度」缩放分层强度。
 */
export function liquidMixBandColors(uniformity: number, ratioA: number, ratioB: number): [string, string] {
  const strat = liquidMixStratification(uniformity, ratioA, ratioB);
  const blended = liquidBlendColor(ratioA, ratioB);
  return [
    mixHexColor(blended, LIQUID_VISUAL.LIQUID_A, strat),
    mixHexColor(blended, LIQUID_VISUAL.LIQUID_B, strat),
  ];
}

/** 分层度 0..1，驱动 3D 两色带的分离强度 */
export function liquidStratification(uniformity: number): number {
  return 1 - clampUniformity(uniformity);
}

/**
 * 实际分层度 = 未搅匀程度 × 两组分齐备度。
 * 3D 用同一个值决定「上半段分层带还占多高」：搅到 1 时upper 高度归零，液柱成为完整一根。
 */
export function liquidMixStratification(uniformity: number, ratioA: number, ratioB: number): number {
  return liquidStratification(uniformity) * liquidPairPresence(ratioA, ratioB);
}

/** 涡流强度 0..1：停机为 0，搅拌时随均匀度升高略降 */
export function liquidSwirlStrength(uniformity: number, direction: -1 | 0 | 1): number {
  return direction === 0 ? 0 : 0.55 + 0.45 * (1 - clampUniformity(uniformity));
}

/**
 * 模拟量 → 开关量：四罐上下限全部由同一个 REAL 液位与阈值比较派生，
 * 搅拌 / 阀门反馈由输出派生。面板、3D、回写表、快照共用这一份结果。
 */
export function liquidSensorStates(volumes: Volumes, outputs: Outputs, stirDirection: -1 | 0 | 1): LiquidSensors {
  const level = (tank: TankId) => liquidLevelRatio(tank, volumes[tank]);
  const high = (tank: TankId) => level(tank) >= LIQUID_PROCESS.HIGH_RATIO;
  const low = (tank: TankId) => level(tank) <= LIQUID_PROCESS.LOW_RATIO;
  return {
    aHigh: high('a'), aLow: low('a'),
    bHigh: high('b'), bLow: low('b'),
    mixHigh: high('mix'), mixLow: low('mix'),
    productHigh: high('product'), productLow: low('product'),
    stirring: stirDirection !== 0,
    forward: stirDirection === 1,
    reverse: stirDirection === -1,
    valveAOpen: outputs.valveA,
    valveBOpen: outputs.valveB,
    dischargeOpen: outputs.discharge,
  };
}

/**
 * 搅拌正反转同时有效属禁止态：保持上次方向，不来回抖。
 * 输入是当前两个布尔与上一帧方向，输出唯一方向。
 */
export function resolveStirDirection(
  forward: boolean, reverse: boolean, previous: -1 | 0 | 1,
): -1 | 0 | 1 {
  if (forward && reverse) return previous;
  if (forward) return 1;
  if (reverse) return -1;
  return 0;
}

/**
 * 报警字：低液位 / 成品罐满 / 溢流 / 急停，按位叠加。
 * 低液位判据是「进料阀仍开而原液罐已空」——不能用「低于配方目标量」判定，
 * 否则演示多轮后 A/B 罐取空前就会误报警，破坏「启动后一直循环」的语义。
 * 演示每轮结束会回补原液并转出成品，正常循环不会撞到满罐 / 溢流。
 */
export function liquidAlarmFlags(volumes: Volumes, outputs: Outputs, estop: boolean): number {
  let mask = 0;
  if ((outputs.valveA && volumes.a <= LIQUID_PROCESS.EPS)
    || (outputs.valveB && volumes.b <= LIQUID_PROCESS.EPS)) {
    mask |= LIQUID_ALARM.LOW_LEVEL;
  }
  if (volumes.product >= LIQUID_CAPACITY.product - LIQUID_PROCESS.EPS) {
    mask |= LIQUID_ALARM.PRODUCT_FULL;
  }
  if (volumes.mix >= LIQUID_CAPACITY.mix - LIQUID_PROCESS.EPS) {
    mask |= LIQUID_ALARM.OVERFLOW;
  }
  if (estop) mask |= LIQUID_ALARM.ESTOP;
  return mask;
}

export function liquidAlarmText(mask: number): string {
  if (!mask) return '正常';
  return Object.entries(LIQUID_ALARM_LABEL)
    .filter(([bit]) => (mask & Number(bit)) !== 0)
    .map(([, text]) => text)
    .join(' · ');
}
