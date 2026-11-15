/**
 * 液体混装场景状态（单一真值）。
 *
 * 真值口径（契约 v1.0）：
 *  - `volumes` 四罐体积是 32 位 REAL 浮点唯一真值，只由流量积分写入；
 *    3D 液面、面板读数、快照、PLC 上报四处同源，不在组件里另算一遍。
 *  - `tare` 是去皮偏置；「去皮」只写偏置，绝不改 volumes / recipe / phase / round。
 *  - `sensors` 模拟量 REAL 与 14 路开关量同源派生（liquidSensorStates 纯函数）。
 *  - 演示启动后一直循环；按停止只置 `stopRequested`，完成当前循环（含回补）后才停。
 *  - 仿真模式只受 PLC 控制：不跑本地演示状态机，输出由 PLC 线圈给定，
 *    但设备物理（流量积分、液位、传感器）照常在浏览器侧派生。
 */
import { create } from 'zustand';
// 子路径导入：不把 shared barrel 的 UI / 服务模块拉进设备分包
import { patchChanged } from '@digital-twin/shared/sync/patchChanged';
import {
  LIQUID_PROCESS, LIQUID_CAPACITY, LIQUID_INITIAL_VOLUMES, LIQUID_DEFAULT_RECIPE,
  LIQUID_EMPTY_OUTPUTS, LIQUID_PHASE, TANK_IDS,
  clamp, clampVolume, clampUniformity, clampRecipe, LIQUID_RECIPE_LIMITS,
  liquidSensorStates, resolveStirDirection, liquidAlarmFlags,
  type Volumes, type Outputs, type Recipe, type LiquidPhase, type TankId, type LiquidSensors,
} from '../constants/liquidConstants';
import {
  LIQUID_ACTION, LIQUID_PLC_SCALE, decodeAction, liquidSensorMask,
} from '../constants/liquidVariables';

export interface LiquidPlcFrame {
  /** PLC 输出的 5 个执行器线圈，缺字段保留上次值 */
  outputs?: Partial<Outputs>;
  /** 显式动作字（code*1000 + seq），序号变化沿触发一次性动作 */
  actionWord?: number;
  /** PLC 下发的配方与时长，已是 PLC 缩放后的原值 */
  recipeA?: number;
  recipeB?: number;
  stirForwardSec?: number;
  stirReverseSec?: number;
  estop?: boolean;
  reset?: boolean;
}

interface LiquidStore {
  volumes: Volumes;
  tare: Volumes;
  recipe: Recipe;
  outputs: Outputs;
  sensors: LiquidSensors;
  phase: LiquidPhase;
  phaseElapsed: number;
  /** 搅拌桨角度（只影响 3D 观感，非真值） */
  agitatorAngle: number;
  stirDirection: -1 | 0 | 1;
  /** 混合罐中 A / B 组分的量（L），派生颜色与配比 */
  mixA: number;
  mixB: number;
  /** 混合均匀度 0..1：由累计搅拌积分，进快照 / 面板 / 3D / 观众镜像（纯本地教学量，不上 PLC） */
  mixUniformity: number;
  /** 成品罐内 A / B 组分量（L）：出料时随体积一起转移，派生成品液颜色与混合液同源 */
  productA: number;
  productB: number;
  demoRunning: boolean;
  stopRequested: boolean;
  demoPaused: boolean;
  round: number;
  alarm: number;
  estop: boolean;
  controlSource: 'local' | 'plc';
  connected: boolean;
  /** 显式动作字边沿记忆：只记 seq，短脉冲不漏采 */
  actionSeq: number;
  /** 演示本轮进料起点，用于判定「已取足目标量」 */
  batchStartA: number;
  batchStartB: number;

  setOutput: (name: keyof Outputs, on: boolean) => void;
  setOutputs: (patch: Partial<Outputs>) => void;
  setRecipe: (patch: Partial<Recipe>) => void;
  /** 手动补液 / 调试用：直接改体积真值（唯一入口） */
  setVolume: (tank: TankId, value: number) => void;
  /** 把「当前体积」定义为指定读数（默认 0.0），机构 / 体积 / 目标零位移 */
  tareTo: (tank: TankId, display?: number) => void;
  resetTare: () => void;
  setEstop: (on: boolean) => void;
  setConnected: (on: boolean) => void;
  setControlSource: (s: 'local' | 'plc') => void;
  setPlcFrame: (frame: LiquidPlcFrame) => void;
  startDemo: () => void;
  /** 按停止：只置标志，完成当前循环再停 */
  requestStopDemo: () => void;
  /** 立即停（模式切换 / 退出工作区） */
  stopDemo: () => void;
  toggleDemoPause: () => void;
  clearAlarm: () => void;
  resetAll: () => void;
  /** 每帧推进：演示状态机 + 流量积分 + 传感器 / 报警派生 */
  tick: (delta: number) => void;
  applyBroadcast: (v: Record<string, boolean | number>) => void;
}

const emptyVolumes = (): Volumes => ({ a: 0, b: 0, mix: 0, product: 0 });
const initialVolumes = (): Volumes => ({ ...LIQUID_INITIAL_VOLUMES });

/** 当前混合罐 A 液占比 0..1（纯函数，面板 / 快照 / PLC 同源） */
export function liquidRatioA(mixA: number, mixB: number): number {
  const total = mixA + mixB;
  return total <= LIQUID_PROCESS.EPS ? 0.5 : clamp(mixA / total, 0, 1);
}

export const useLiquidStore = create<LiquidStore>((set, get) => ({
  volumes: initialVolumes(),
  tare: emptyVolumes(),
  recipe: { ...LIQUID_DEFAULT_RECIPE },
  outputs: { ...LIQUID_EMPTY_OUTPUTS },
  sensors: liquidSensorStates(initialVolumes(), LIQUID_EMPTY_OUTPUTS, 0),
  phase: LIQUID_PHASE.IDLE,
  phaseElapsed: 0,
  agitatorAngle: 0,
  stirDirection: 0,
  mixA: 0,
  mixB: 0,
  mixUniformity: 0,
  productA: 0,
  productB: 0,
  demoRunning: false,
  stopRequested: false,
  demoPaused: false,
  round: 0,
  alarm: 0,
  estop: false,
  controlSource: 'local',
  connected: false,
  actionSeq: 0,
  batchStartA: LIQUID_INITIAL_VOLUMES.a,
  batchStartB: LIQUID_INITIAL_VOLUMES.b,

  setOutput: (name, on) => set((s) => ({ outputs: { ...s.outputs, [name]: on } })),
  setOutputs: (patch) => set((s) => ({ outputs: { ...s.outputs, ...patch } })),
  /** 面板输入统一过守卫：非法值保留上次设定，绝不把 NaN / 负值放进演示状态机 */
  setRecipe: (patch) => set((s) => ({ recipe: clampRecipe(patch, s.recipe) })),
  setVolume: (tank, value) => set((s) => {
    const next = clampVolume(tank, value);
    const emptied = next <= LIQUID_PROCESS.EPS;
    return {
      volumes: { ...s.volumes, [tank]: next },
      mixUniformity: tank === 'mix' && emptied ? 0 : s.mixUniformity,
      productA: tank === 'product' && emptied ? 0 : s.productA,
      productB: tank === 'product' && emptied ? 0 : s.productB,
    };
  }),

  /**
   * 手工定义液位 0.0 点（去皮）。语义：把**当前体积**设置成指定读数，
   * 只写偏置，绝不改 volumes / recipe / phase / round —— 防回退断言锁死零位移。
   */
  tareTo: (tank, display = 0) => set((s) => ({
    tare: { ...s.tare, [tank]: s.volumes[tank] - (Number.isFinite(display) ? display : 0) },
  })),
  resetTare: () => set({ tare: emptyVolumes() }),

  setEstop: (on) => set((s) => ({
    estop: on,
    outputs: on ? { ...LIQUID_EMPTY_OUTPUTS } : s.outputs,
    demoRunning: on ? false : s.demoRunning,
  })),
  setConnected: (on) => set({ connected: on }),
  setControlSource: (controlSource) => set({ controlSource }),

  /**
   * 外部 PLC 帧：只改输出 / 配方 / 一次性动作，不直接写四罐液位真值
   * （液位是设备侧由阀门积分出来的物理量，PLC 只能读它，不能反写）。
   * 显式动作字按 seq 变化沿触发，短脉冲锁存不漏采。
   */
  setPlcFrame: (frame) => set((s) => {
    const patch: Partial<LiquidStore> = { controlSource: 'plc' };
    if (frame.outputs) patch.outputs = { ...s.outputs, ...frame.outputs };
    if (typeof frame.recipeA === 'number' && Number.isFinite(frame.recipeA)) {
      patch.recipe = { ...(patch.recipe ?? s.recipe), targetA: clamp(frame.recipeA / LIQUID_PLC_SCALE.RECIPE, 0, LIQUID_CAPACITY.a) };
    }
    if (typeof frame.recipeB === 'number' && Number.isFinite(frame.recipeB)) {
      patch.recipe = { ...(patch.recipe ?? s.recipe), targetB: clamp(frame.recipeB / LIQUID_PLC_SCALE.RECIPE, 0, LIQUID_CAPACITY.b) };
    }
    if (typeof frame.stirForwardSec === 'number' && Number.isFinite(frame.stirForwardSec)) {
      patch.recipe = { ...(patch.recipe ?? s.recipe), stirForwardSec: clamp(frame.stirForwardSec / LIQUID_PLC_SCALE.DURATION, 0, LIQUID_RECIPE_LIMITS.MAX_DURATION_SEC) };
    }
    if (typeof frame.stirReverseSec === 'number' && Number.isFinite(frame.stirReverseSec)) {
      patch.recipe = { ...(patch.recipe ?? s.recipe), stirReverseSec: clamp(frame.stirReverseSec / LIQUID_PLC_SCALE.DURATION, 0, LIQUID_RECIPE_LIMITS.MAX_DURATION_SEC) };
    }
    if (typeof frame.estop === 'boolean') patch.estop = frame.estop;
    if (frame.reset) {
      patch.volumes = initialVolumes();
      patch.tare = emptyVolumes();
      patch.mixA = 0; patch.mixB = 0; patch.mixUniformity = 0;
      patch.productA = 0; patch.productB = 0; patch.round = 0;
      patch.phase = LIQUID_PHASE.IDLE; patch.alarm = 0;
    }
    if (typeof frame.actionWord === 'number' && Number.isFinite(frame.actionWord)) {
      const { code, seq } = decodeAction(frame.actionWord);
      if (seq !== s.actionSeq) {
        patch.actionSeq = seq;
        switch (code) {
          case LIQUID_ACTION.LOAD_RECIPE:
            patch.phase = LIQUID_PHASE.IDLE;
            patch.round = 0;
            break;
          case LIQUID_ACTION.RESET:
            patch.volumes = initialVolumes();
            patch.tare = emptyVolumes();
            patch.mixA = 0; patch.mixB = 0; patch.mixUniformity = 0;
            patch.productA = 0; patch.productB = 0; patch.round = 0;
            patch.phase = LIQUID_PHASE.IDLE; patch.alarm = 0;
            break;
          case LIQUID_ACTION.ALARM_RESET:
            patch.alarm = 0;
            patch.estop = false;
            break;
          case LIQUID_ACTION.ESTOP:
            patch.estop = true;
            break;
          default:
            break;
        }
      }
    }
    return patch;
  }),

  startDemo: () => set((s) => ({
    demoRunning: true, stopRequested: false, demoPaused: false,
    phase: LIQUID_PHASE.IDLE, phaseElapsed: 0, round: 0,
    controlSource: 'local', estop: false, alarm: 0,
    outputs: { ...LIQUID_EMPTY_OUTPUTS },
    batchStartA: s.volumes.a, batchStartB: s.volumes.b,
  })),
  /** 用户按停止：不打断当前循环，等 DONE 阶段收尾后再停 */
  requestStopDemo: () => set({ stopRequested: true }),
  stopDemo: () => set({
    demoRunning: false, stopRequested: false, demoPaused: false,
    phase: LIQUID_PHASE.IDLE, phaseElapsed: 0,
    outputs: { ...LIQUID_EMPTY_OUTPUTS },
  }),
  toggleDemoPause: () => set((s) => ({ demoPaused: !s.demoPaused })),
  clearAlarm: () => set({ alarm: 0, estop: false }),

  resetAll: () => set({
    volumes: initialVolumes(), tare: emptyVolumes(),
    recipe: { ...LIQUID_DEFAULT_RECIPE },
    outputs: { ...LIQUID_EMPTY_OUTPUTS },
    sensors: liquidSensorStates(initialVolumes(), LIQUID_EMPTY_OUTPUTS, 0),
    phase: LIQUID_PHASE.IDLE, phaseElapsed: 0, agitatorAngle: 0, stirDirection: 0,
    mixA: 0, mixB: 0, mixUniformity: 0, productA: 0, productB: 0,
    demoRunning: false, stopRequested: false, demoPaused: false, round: 0,
    alarm: 0, estop: false, controlSource: 'local', connected: false,
    actionSeq: 0,
    batchStartA: LIQUID_INITIAL_VOLUMES.a, batchStartB: LIQUID_INITIAL_VOLUMES.b,
  }),

  tick: (delta) => {
    const s = get();
    const dt = Math.min(Math.max(delta, 0), LIQUID_PROCESS.MAX_DT);
    if (dt <= 0) return;

    let outputs = s.outputs;
    let phase = s.phase;
    /** 阶段计时只在演示真正推进时累加：暂停 / 急停 / 报警期间冻结，恢复后不跳阶段 */
    let phaseElapsed = s.phaseElapsed;
    let demoRunning = s.demoRunning;
    let stopRequested = s.stopRequested;
    let round = s.round;
    let batchStartA = s.batchStartA;
    let batchStartB = s.batchStartB;
    const running = s.controlSource === 'local' && s.demoRunning && !s.demoPaused && !s.estop && s.alarm === 0;

    /* 1) 演示状态机：A 进料 → B 进料 → 正转 → 反转 → 出料 → 完成（含回补）→ 下一轮 */
    if (running) {
      phaseElapsed += dt;
      const step = (next: LiquidPhase, nextOutputs: Outputs) => {
        phase = next; phaseElapsed = 0; outputs = nextOutputs;
      };
      switch (s.phase) {
        case LIQUID_PHASE.IDLE:
          batchStartA = s.volumes.a;
          batchStartB = s.volumes.b;
          step(LIQUID_PHASE.FEED_A, { ...LIQUID_EMPTY_OUTPUTS, valveA: true });
          break;
        case LIQUID_PHASE.FEED_A:
          outputs = { ...LIQUID_EMPTY_OUTPUTS, valveA: true };
          if (s.volumes.a <= batchStartA - s.recipe.targetA + LIQUID_PROCESS.EPS) {
            step(LIQUID_PHASE.FEED_B, { ...LIQUID_EMPTY_OUTPUTS, valveB: true });
          }
          break;
        case LIQUID_PHASE.FEED_B:
          outputs = { ...LIQUID_EMPTY_OUTPUTS, valveB: true };
          if (s.volumes.b <= batchStartB - s.recipe.targetB + LIQUID_PROCESS.EPS) {
            step(LIQUID_PHASE.STIR_FWD, { ...LIQUID_EMPTY_OUTPUTS, stirForward: true });
          }
          break;
        case LIQUID_PHASE.STIR_FWD:
          outputs = { ...LIQUID_EMPTY_OUTPUTS, stirForward: true };
          if (phaseElapsed >= s.recipe.stirForwardSec) {
            step(LIQUID_PHASE.STIR_REV, { ...LIQUID_EMPTY_OUTPUTS, stirReverse: true });
          }
          break;
        case LIQUID_PHASE.STIR_REV:
          outputs = { ...LIQUID_EMPTY_OUTPUTS, stirReverse: true };
          if (phaseElapsed >= s.recipe.stirReverseSec) {
            step(LIQUID_PHASE.DISCHARGE, { ...LIQUID_EMPTY_OUTPUTS, discharge: true });
          }
          break;
        case LIQUID_PHASE.DISCHARGE:
          outputs = { ...LIQUID_EMPTY_OUTPUTS, discharge: true };
          if (s.volumes.mix <= LIQUID_PROCESS.EPS) {
            step(LIQUID_PHASE.DONE, { ...LIQUID_EMPTY_OUTPUTS });
          }
          break;
        case LIQUID_PHASE.DONE: {
          outputs = { ...LIQUID_EMPTY_OUTPUTS };
          // 回补原液 + 转出成品，让「一直循环」不会自己撞上低液位 / 满罐报警
          const ready = s.volumes.a >= LIQUID_INITIAL_VOLUMES.a - LIQUID_PROCESS.EPS
            && s.volumes.b >= LIQUID_INITIAL_VOLUMES.b - LIQUID_PROCESS.EPS
            && s.volumes.product <= LIQUID_PROCESS.EPS;
          if (ready) {
            round += 1;
            if (s.stopRequested) {
              demoRunning = false;
              stopRequested = false;
              step(LIQUID_PHASE.IDLE, { ...LIQUID_EMPTY_OUTPUTS });
            } else {
              step(LIQUID_PHASE.IDLE, { ...LIQUID_EMPTY_OUTPUTS });
            }
          }
          break;
        }
        default:
          break;
      }
    }

    /* 2) 流量积分：四罐体积是唯一真值，阀门 / 出料阀只通过流量改变它 */
    const volumes: Volumes = { ...s.volumes };
    let mixA = s.mixA;
    let mixB = s.mixB;
    let uniformity = s.mixUniformity;
    let productA = s.productA;
    let productB = s.productB;
    // 本地演示暂停时保持阀门状态但冻结物理过程，恢复后从原处继续；
    // 仿真模式（controlSource==='plc'）从不受本地暂停影响。
    const pausedLocally = s.controlSource === 'local' && s.demoRunning && s.demoPaused;
    const canFlow = !s.estop && s.alarm === 0 && !pausedLocally;
    if (canFlow) {
      // 新进的原液是未混合的：按质量占比稀释均匀度，搅拌才有「从分层到均匀」的过程
      const dilute = (d: number, before: number) => {
        uniformity = before + d > LIQUID_PROCESS.EPS ? uniformity * before / (before + d) : 0;
      };
      if (outputs.valveA && volumes.a > 0 && volumes.mix < LIQUID_CAPACITY.mix) {
        const d = Math.min(LIQUID_PROCESS.FEED_RATE * dt, volumes.a, LIQUID_CAPACITY.mix - volumes.mix);
        const before = volumes.mix;
        volumes.a -= d; volumes.mix += d; mixA += d;
        dilute(d, before);
      }
      if (outputs.valveB && volumes.b > 0 && volumes.mix < LIQUID_CAPACITY.mix) {
        const d = Math.min(LIQUID_PROCESS.FEED_RATE * dt, volumes.b, LIQUID_CAPACITY.mix - volumes.mix);
        const before = volumes.mix;
        volumes.b -= d; volumes.mix += d; mixB += d;
        dilute(d, before);
      }
      if (outputs.discharge && volumes.mix > 0 && volumes.product < LIQUID_CAPACITY.product) {
        const d = Math.min(LIQUID_PROCESS.DISCHARGE_RATE * dt, volumes.mix, LIQUID_CAPACITY.product - volumes.product);
        const total = mixA + mixB;
        if (total > LIQUID_PROCESS.EPS) {
          // 组分随体积同比例转移：成品罐 A/B 比例 = 混合罐比例 → 颜色必然同源
          const fA = mixA / total;
          const fB = mixB / total;
          mixA -= d * fA;
          mixB -= d * fB;
          productA += d * fA;
          productB += d * fB;
        }
        volumes.mix -= d; volumes.product += d;
      }
      // 演示收尾：回补 A/B 原液、把成品转去下游，肉眼可见液面恢复
      if (running && phase === LIQUID_PHASE.DONE) {
        const ra = Math.min(LIQUID_PROCESS.REFILL_RATE * dt, LIQUID_INITIAL_VOLUMES.a - volumes.a);
        const rb = Math.min(LIQUID_PROCESS.REFILL_RATE * dt, LIQUID_INITIAL_VOLUMES.b - volumes.b);
        const pBefore = volumes.product;
        const rp = Math.min(LIQUID_PROCESS.PRODUCT_DRAIN_RATE * dt, pBefore);
        volumes.a += Math.max(0, ra);
        volumes.b += Math.max(0, rb);
        volumes.product -= Math.max(0, rp);
        if (pBefore > LIQUID_PROCESS.EPS && rp > 0) {
          const keep = Math.max(0, pBefore - rp) / pBefore;
          productA *= keep;
          productB *= keep;
        }
      }
    }
    for (const tank of TANK_IDS) volumes[tank] = clampVolume(tank, volumes[tank]);
    mixA = clamp(mixA, 0, LIQUID_CAPACITY.mix);
    mixB = clamp(mixB, 0, LIQUID_CAPACITY.mix);
    productA = clamp(productA, 0, LIQUID_CAPACITY.product);
    productB = clamp(productB, 0, LIQUID_CAPACITY.product);
    if (volumes.product <= LIQUID_PROCESS.EPS) { productA = 0; productB = 0; }

    /* 3) 禁止态：正反转同时有效保持上次方向；搅拌角度只影响观感。
     *    恰好一个方向有效才算「有效搅拌」，正反转都推进均匀度、禁止态不推进。 */
    const stirDirection = resolveStirDirection(outputs.stirForward, outputs.stirReverse, s.stirDirection);
    const stirEffective = (outputs.stirForward ? 1 : 0) + (outputs.stirReverse ? 1 : 0) === 1;
    const stirring = canFlow && stirEffective;
    const agitatorAngle = s.agitatorAngle + (stirring ? stirDirection * LIQUID_PROCESS.STIR_OMEGA * dt : 0);
    if (stirring && volumes.mix > LIQUID_PROCESS.EPS) {
      uniformity = clampUniformity(uniformity + LIQUID_PROCESS.UNIFORMITY_RATE * dt);
    }
    // 混合罐排空后回到未混合初态，组分一并清零，避免残量污染下一批的成品色；
    // 停机 / 暂停 / 急停时保持当前值。
    if (volumes.mix <= LIQUID_PROCESS.EPS) { uniformity = 0; mixA = 0; mixB = 0; }

    /* 4) 模拟量与开关量同源派生 + 报警停机 */
    let alarm = liquidAlarmFlags(volumes, outputs, s.estop);
    if (alarm !== 0) {
      outputs = { ...LIQUID_EMPTY_OUTPUTS };
      demoRunning = false;
      phase = LIQUID_PHASE.IDLE;
    }
    const sensors = liquidSensorStates(volumes, outputs, stirDirection);
    // 报警锁存：停机后触发条件会自我消失（例如阀断电后低液位判据不再成立），
    // 必须保持上一次报警，直到「报警复位」/ ALARM_RESET / 启动演示 / resetAll 显式清除。
    if (s.alarm !== 0 && alarm === 0) alarm = s.alarm;

    const patch = {
      volumes, mixA, mixB, mixUniformity: uniformity, productA, productB,
      outputs, phase, phaseElapsed,
      demoRunning, stopRequested, round, batchStartA, batchStartB,
      agitatorAngle, stirDirection, sensors, alarm,
    };
    // 静止期 rAF 仍在跑，但值全同就不写 store，避免 60Hz 全量订阅者重渲染；
    // 液面 / 搅拌角任一变化都会照常写入，连续性不变
    if (patchChanged(s, patch)) set(patch);
  },

  /** 观众只读镜像：数值键成对、有限性守卫、缺字段保留上次值 */
  applyBroadcast: (v) => {
    const num = (key: string): number | undefined => {
      const x = v[key];
      return typeof x === 'number' && Number.isFinite(x) && x >= 0 ? x : undefined;
    };
    const signed = (key: string): number | undefined => {
      const x = v[key];
      return typeof x === 'number' && Number.isFinite(x) ? x : undefined;
    };
    const s = get();
    const patch: Partial<LiquidStore> = {};
    const volumes: Volumes = { ...s.volumes };
    for (const tank of TANK_IDS) {
      const key = `LIQUID_${tank.toUpperCase()}`;
      const value = num(key);
      if (value !== undefined) volumes[tank] = clampVolume(tank, value);
    }
    patch.volumes = volumes;
    const tare: Volumes = { ...s.tare };
    for (const tank of TANK_IDS) {
      const value = signed(`LIQUID_TARE_${tank.toUpperCase()}`);
      if (value !== undefined) tare[tank] = value;
    }
    patch.tare = tare;
    const mixA = num('LIQUID_MIX_A');
    const mixB = num('LIQUID_MIX_B');
    if (mixA !== undefined) patch.mixA = mixA;
    if (mixB !== undefined) patch.mixB = mixB;
    const uniformity = num('LIQUID_UNIFORMITY');
    if (uniformity !== undefined) patch.mixUniformity = clampUniformity(uniformity);
    const productA = num('LIQUID_PRODUCT_A');
    const productB = num('LIQUID_PRODUCT_B');
    if (productA !== undefined) patch.productA = clamp(productA, 0, LIQUID_CAPACITY.product);
    if (productB !== undefined) patch.productB = clamp(productB, 0, LIQUID_CAPACITY.product);
    const phase = num('LIQUID_PHASE');
    if (phase !== undefined) patch.phase = clamp(Math.trunc(phase), 0, LIQUID_PHASE.DONE) as LiquidPhase;
    const round = num('LIQUID_ROUND');
    if (round !== undefined) patch.round = Math.trunc(round);
    const alarm = num('LIQUID_ALARM');
    if (alarm !== undefined) patch.alarm = Math.trunc(alarm);
    const angle = signed('LIQUID_ANGLE');
    if (angle !== undefined) patch.agitatorAngle = angle;
    const dir = signed('LIQUID_STIR_DIR');
    if (dir !== undefined) patch.stirDirection = (dir > 0 ? 1 : dir < 0 ? -1 : 0) as -1 | 0 | 1;
    const bit = (key: string, fallback: boolean) => (num(key) !== undefined ? num(key) === 1 : fallback);
    const outputs: Outputs = {
      valveA: bit('LIQUID_VALVE_A', s.outputs.valveA),
      valveB: bit('LIQUID_VALVE_B', s.outputs.valveB),
      stirForward: bit('LIQUID_STIR_FWD', s.outputs.stirForward),
      stirReverse: bit('LIQUID_STIR_REV', s.outputs.stirReverse),
      discharge: bit('LIQUID_DISCHARGE', s.outputs.discharge),
    };
    patch.outputs = outputs;
    const mask = num('LIQUID_SENSOR_MASK');
    const bits = liquidSensorStates(volumes, outputs, patch.stirDirection ?? s.stirDirection);
    if (mask !== undefined) {
      // 主控快照优先：掩码与纯函数派生同源同序，掩码逐位覆盖后不丢字段
      const on = (i: number) => (Math.trunc(mask) & (1 << i)) !== 0;
      patch.sensors = {
        ...bits,
        aHigh: on(0), aLow: on(1), bHigh: on(2), bLow: on(3),
        mixHigh: on(4), mixLow: on(5), productHigh: on(6), productLow: on(7),
        stirring: on(8), forward: on(9), reverse: on(10),
        valveAOpen: on(11), valveBOpen: on(12), dischargeOpen: on(13),
      };
    } else {
      patch.sensors = bits;
    }
    patch.demoRunning = bit('LIQUID_DEMO_RUNNING', s.demoRunning);
    patch.stopRequested = bit('LIQUID_STOP_REQUESTED', s.stopRequested);
    patch.demoPaused = bit('LIQUID_PAUSED', s.demoPaused);
    patch.estop = bit('LIQUID_ESTOP', s.estop);
    set(patch);
  },
}));

/** 主控上报：与 applyBroadcast 键名一一对应，全部数值键（含 REAL 浮点体积） */
export function exportLiquidSnapshot(): Record<string, number> {
  const s = useLiquidStore.getState();
  const round2 = (v: number) => Math.round(v * 1000) / 1000;
  return {
    LIQUID_A: round2(s.volumes.a),
    LIQUID_B: round2(s.volumes.b),
    LIQUID_MIX: round2(s.volumes.mix),
    LIQUID_PRODUCT: round2(s.volumes.product),
    LIQUID_TARE_A: round2(s.tare.a),
    LIQUID_TARE_B: round2(s.tare.b),
    LIQUID_TARE_MIX: round2(s.tare.mix),
    LIQUID_TARE_PRODUCT: round2(s.tare.product),
    LIQUID_MIX_A: round2(s.mixA),
    LIQUID_MIX_B: round2(s.mixB),
    LIQUID_UNIFORMITY: round2(s.mixUniformity),
    LIQUID_PRODUCT_A: round2(s.productA),
    LIQUID_PRODUCT_B: round2(s.productB),
    LIQUID_PHASE: s.phase,
    LIQUID_ROUND: s.round,
    LIQUID_ALARM: s.alarm,
    LIQUID_ANGLE: round2(s.agitatorAngle),
    LIQUID_STIR_DIR: s.stirDirection,
    LIQUID_VALVE_A: s.outputs.valveA ? 1 : 0,
    LIQUID_VALVE_B: s.outputs.valveB ? 1 : 0,
    LIQUID_STIR_FWD: s.outputs.stirForward ? 1 : 0,
    LIQUID_STIR_REV: s.outputs.stirReverse ? 1 : 0,
    LIQUID_DISCHARGE: s.outputs.discharge ? 1 : 0,
    LIQUID_SENSOR_MASK: liquidSensorMask(s.sensors),
    LIQUID_DEMO_RUNNING: s.demoRunning ? 1 : 0,
    LIQUID_STOP_REQUESTED: s.stopRequested ? 1 : 0,
    LIQUID_PAUSED: s.demoPaused ? 1 : 0,
    LIQUID_ESTOP: s.estop ? 1 : 0,
  };
}
