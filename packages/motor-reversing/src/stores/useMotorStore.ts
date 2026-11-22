/**
 * 电机正反转控制状态（单一真值，契约 v1.0）。
 *
 * 链路：按钮 → PLC → 接触器 → 电机 → 传送带。
 *  - 柜内**无 KM 辅助常开自锁接线**：保持逻辑属于学生 PLC 程序（仿真）或本地运行锁存（手动）。
 *  - KM1 / KM2 **硬件互锁**：resolveContactors() 是唯一解析入口，任意时刻最多一只吸合。
 *  - 仿真模式 controlSource==='plc'：按钮只写反馈位，绝不直接写线圈；PLC 输出是唯一驱动源。
 *  - 手动 / 演示模式 controlSource==='local'：零对外帧，按钮与本地状态机驱动线圈。
 *  - 转速 / 皮带位移 / 热累积是唯一真值，3D、面板、快照、PLC 上报四处同源。
 */
import { create } from 'zustand';
import { patchChanged } from '@digital-twin/shared/sync/patchChanged';
import {
  MOTOR_PROCESS, MOTOR_PHASE, MOTOR_EMPTY_BUTTONS, MOTOR_EMPTY_COILS,
  MOTOR_GEOM, clamp, clampLoad, clampThermal, clampDisplacement,
  resolveContactors, motorDirection, motorCurrentA, beltVelocityMm,
  type MotorPhase, type MotorButtons, type MotorCoils,
} from '../constants/motorConstants';
import {
  MOTOR_ACTION, MOTOR_PLC_SCALE, decodeMotorAction,
  motorSensorBits, motorSensorMask, type MotorFeedback,
} from '../constants/motorVariables';

export const MOTOR_BUTTON_KEYS: readonly (keyof MotorButtons)[] = [
  'fwdJog', 'revJog', 'fwdStart', 'revStart', 'stop',
];

export interface MotorPlcFrame {
  /** PLC 输出的两只接触器线圈，缺字段保留上次值 */
  km1?: boolean;
  km2?: boolean;
  /** FR 复位线圈 */
  reset?: boolean;
  /** 显式动作字（code*1000 + seq），序号变化沿触发一次性动作 */
  actionWord?: number;
}

interface DemoStep {
  label: string;
  sec: number;
  coils: MotorCoils;
  button?: keyof MotorButtons;
  load?: number;
  jog?: boolean;
  reset?: boolean;
  /** 等待 FR 跳闸而不是等固定时长 */
  waitTrip?: boolean;
}

/** 演示循环：正启动 → 停 → 反启动 → 停 → 正点动 → 反点动 → 过载 → 复位 → 下一轮 */
export const MOTOR_DEMO_STEPS: readonly DemoStep[] = [
  { label: '正启动', sec: 2.2, coils: { km1: true, km2: false }, button: 'fwdStart', load: 20 },
  { label: '停止', sec: 0.7, coils: { km1: false, km2: false }, button: 'stop', load: 20 },
  { label: '反启动', sec: 2.2, coils: { km1: false, km2: true }, button: 'revStart', load: 20 },
  { label: '停止', sec: 0.7, coils: { km1: false, km2: false }, button: 'stop', load: 20 },
  { label: '正点动', sec: 1.2, coils: { km1: true, km2: false }, button: 'fwdJog', jog: true, load: 20 },
  { label: '停止', sec: 0.4, coils: { km1: false, km2: false }, button: 'stop', load: 20 },
  { label: '反点动', sec: 1.2, coils: { km1: false, km2: true }, button: 'revJog', jog: true, load: 20 },
  { label: '停止', sec: 0.4, coils: { km1: false, km2: false }, button: 'stop', load: 20 },
  { label: '加载至过载', sec: 0, coils: { km1: true, km2: false }, load: MOTOR_PROCESS.DEMO_OVERLOAD_LOAD, waitTrip: true },
  { label: 'FR 复位', sec: 0.9, coils: { km1: false, km2: false }, load: 20, reset: true },
];

interface MotorStore {
  /** 电源与线圈命令 */
  qfClosed: boolean;
  /** PLC 运行开关（第三十七轮）：RUN 才执行程序；STOP 时本地模式线圈命令全部释放 */
  plcRun: boolean;
  km1Cmd: boolean;
  km2Cmd: boolean;
  plcCoils: MotorCoils;
  demoCoils: MotorCoils;
  kmDirect: MotorCoils;
  /** 硬件互锁解析后的吸合状态 */
  km1On: boolean;
  km2On: boolean;
  forbidden: boolean;
  interlocked: boolean;
  /** 唯一真值 */
  direction: -1 | 0 | 1;
  speedRpm: number;
  beltDisplacement: number;
  shaftAngle: number;
  thermal: number;
  currentA: number;
  loadPercent: number;
  frTripped: boolean;
  /** 面板与阶段 */
  phase: MotorPhase;
  buttons: MotorButtons;
  runLatch: 'fwd' | 'rev' | null;
  jogFlag: boolean;
  arcTimer: number;
  /** 演示 */
  demoRunning: boolean;
  stopRequested: boolean;
  demoPaused: boolean;
  demoStep: number;
  demoElapsed: number;
  round: number;
  /** 控制来源与连接 */
  controlSource: 'local' | 'plc';
  connected: boolean;
  actionSeq: number;

  setQf: (on: boolean) => void;
  /** 3D 点击 PLC 切换 RUN / STOP（观众端只读，不响应） */
  togglePlcRun: () => void;
  setLoad: (v: number) => void;
  /** 按钮电平：仿真模式只写反馈，本地模式同时驱动线圈 */
  setButton: (key: keyof MotorButtons, on: boolean) => void;
  /** 手动模式直接控制正反接触器（调试开关），仿真模式禁用 */
  setDirectCoil: (which: keyof MotorCoils, on: boolean) => void;
  triggerOverload: () => void;
  resetFr: () => void;
  resetAll: () => void;
  setControlSource: (s: 'local' | 'plc') => void;
  setConnected: (on: boolean) => void;
  setPlcFrame: (frame: MotorPlcFrame) => void;
  startDemo: () => void;
  requestStopDemo: () => void;
  stopDemo: () => void;
  toggleDemoPause: () => void;
  tick: (delta: number) => void;
  applyBroadcast: (v: Record<string, boolean | number>) => void;
}

/** 设备→PLC 的 14 路反馈，从真值纯函数派生，面板 / 回写 / 快照同源 */
export function motorFeedbackOf(s: {
  buttons: MotorButtons; km1On: boolean; km2On: boolean; frTripped: boolean;
  speedRpm: number; direction: -1 | 0 | 1; qfClosed: boolean; interlocked: boolean;
}): MotorFeedback {
  return {
    buttons: s.buttons,
    km1On: s.km1On,
    km2On: s.km2On,
    frClosed: !s.frTripped,
    running: Math.abs(s.speedRpm) > 1,
    forward: s.direction === 1,
    reverse: s.direction === -1,
    overload: s.frTripped,
    qfClosed: s.qfClosed,
    interlocked: s.interlocked,
  };
}

export function motorButtonMask(buttons: MotorButtons): number {
  return MOTOR_BUTTON_KEYS.reduce((acc, key, i) => acc | (buttons[key] ? 1 << i : 0), 0);
}
function buttonsFromMask(mask: number, fallback: MotorButtons): MotorButtons {
  const out = { ...fallback };
  MOTOR_BUTTON_KEYS.forEach((key, i) => { out[key] = (Math.trunc(mask) & (1 << i)) !== 0; });
  return out;
}

const initialButtons = (): MotorButtons => ({ ...MOTOR_EMPTY_BUTTONS });
const initialCoils = (): MotorCoils => ({ ...MOTOR_EMPTY_COILS });

/** 当前控制来源下「想要的线圈命令」：同一时刻只有一个写入者 */
function desiredCoils(s: MotorStore): MotorCoils {
  if (s.controlSource === 'plc') return { ...s.plcCoils };
  if (s.demoRunning) return { ...s.demoCoils };
  if (s.buttons.fwdJog) return { km1: true, km2: false };
  if (s.buttons.revJog) return { km1: false, km2: true };
  if (s.kmDirect.km1 || s.kmDirect.km2) return { ...s.kmDirect };
  if (s.runLatch === 'fwd') return { km1: true, km2: false };
  if (s.runLatch === 'rev') return { km1: false, km2: true };
  return { km1: false, km2: false };
}

export const useMotorStore = create<MotorStore>((set, get) => ({
  /** 默认分断：蓝色推杆在下方，点一下 QF 推上去才上电（演示模式启动时自动合闸） */
  qfClosed: false,
  plcRun: true,
  km1Cmd: false,
  km2Cmd: false,
  plcCoils: initialCoils(),
  demoCoils: initialCoils(),
  kmDirect: initialCoils(),
  km1On: false,
  km2On: false,
  forbidden: false,
  interlocked: false,
  direction: 0,
  speedRpm: 0,
  beltDisplacement: 0,
  shaftAngle: 0,
  thermal: 0,
  currentA: MOTOR_PROCESS.NO_LOAD_CURRENT_A,
  loadPercent: 20,
  frTripped: false,
  phase: MOTOR_PHASE.IDLE,
  buttons: initialButtons(),
  runLatch: null,
  jogFlag: false,
  arcTimer: 0,
  demoRunning: false,
  stopRequested: false,
  demoPaused: false,
  demoStep: 0,
  demoElapsed: 0,
  round: 0,
  controlSource: 'local',
  connected: false,
  actionSeq: 0,

  setQf: (on) => set(() => ({
    qfClosed: on,
    ...(on ? {} : {
      runLatch: null, kmDirect: initialCoils(),
      buttons: initialButtons(), arcTimer: 0,
    }),
  })),
  togglePlcRun: () => set((s) => ({ plcRun: !s.plcRun })),
  setLoad: (v) => set({ loadPercent: clampLoad(v) }),

  /**
   * 按钮电平。仿真模式只改反馈位（学生 PLC 程序读它），绝不碰线圈；
   * 手动模式才由按钮 / 运行锁存 / KM 直控决定线圈。
   */
  setButton: (key, on) => set((s) => {
    const buttons = { ...s.buttons, [key]: on };
    if (s.controlSource === 'plc' || s.demoRunning) return { buttons };
    let runLatch = s.runLatch;
    let kmDirect = s.kmDirect;
    if (on) {
      switch (key) {
        case 'fwdJog':
        case 'revJog':
          runLatch = null;
          kmDirect = initialCoils();
          break;
        case 'fwdStart':
          runLatch = 'fwd';
          kmDirect = initialCoils();
          break;
        case 'revStart':
          runLatch = 'rev';
          kmDirect = initialCoils();
          break;
        case 'stop':
          runLatch = null;
          kmDirect = initialCoils();
          break;
        default:
          break;
      }
    }
    return { buttons, runLatch, kmDirect };
  }),

  /** 手动模式 KM 直控调试开关：仿真模式下不生效 */
  setDirectCoil: (which, on) => set((s) => {
    if (s.controlSource === 'plc' || s.demoRunning) return {};
    return {
      kmDirect: { ...s.kmDirect, [which]: on },
      runLatch: null,
      buttons: initialButtons(),
    };
  }),

  /** 教学快捷：把负载拉满并把热累积推到动作阈值，下一帧 FR 跳闸 */
  triggerOverload: () => set({
    loadPercent: MOTOR_PROCESS.DEMO_OVERLOAD_LOAD,
    thermal: MOTOR_PROCESS.THERMAL_TRIP,
  }),
  /** FR 手动复位：只有复位后线圈命令才重新生效 */
  resetFr: () => set({
    frTripped: false, thermal: 0,
    loadPercent: 20, arcTimer: 0,
  }),
  resetAll: () => set({
    qfClosed: false, plcRun: true, km1Cmd: false, km2Cmd: false,
    plcCoils: initialCoils(), demoCoils: initialCoils(), kmDirect: initialCoils(),
    km1On: false, km2On: false, forbidden: false, interlocked: false,
    direction: 0, speedRpm: 0, beltDisplacement: 0, shaftAngle: 0,
    thermal: 0, currentA: MOTOR_PROCESS.NO_LOAD_CURRENT_A, loadPercent: 20,
    frTripped: false, phase: MOTOR_PHASE.IDLE, buttons: initialButtons(),
    runLatch: null, jogFlag: false, arcTimer: 0,
    demoRunning: false, stopRequested: false, demoPaused: false,
    demoStep: 0, demoElapsed: 0, round: 0,
    controlSource: 'local', connected: false, actionSeq: 0,
  }),

  /** 切到外部控制时清干净本地写入者，避免残留锁存与演示状态覆盖 PLC 帧 */
  setControlSource: (controlSource) => set(() => controlSource === 'plc' ? {
    controlSource,
    runLatch: null, kmDirect: initialCoils(), buttons: initialButtons(),
    demoRunning: false, stopRequested: false, demoPaused: false,
    plcCoils: initialCoils(), km1Cmd: false, km2Cmd: false,
  } : {
    controlSource,
    plcCoils: initialCoils(), km1Cmd: false, km2Cmd: false,
  }),
  setConnected: (connected) => set({ connected }),

  /** 外部 PLC 帧：只写线圈命令与一次性动作，绝不反写位移 / 转速真值 */
  setPlcFrame: (frame) => set((s) => {
    const patch: Partial<MotorStore> = { controlSource: 'plc' };
    const coils = { ...s.plcCoils };
    if (typeof frame.km1 === 'boolean') coils.km1 = frame.km1;
    if (typeof frame.km2 === 'boolean') coils.km2 = frame.km2;
    patch.plcCoils = coils;
    if (frame.reset) {
      patch.frTripped = false;
      patch.thermal = 0;
      patch.loadPercent = 20;
    }
    if (typeof frame.actionWord === 'number' && Number.isFinite(frame.actionWord)) {
      const { code, seq } = decodeMotorAction(frame.actionWord);
      if (seq !== s.actionSeq) {
        patch.actionSeq = seq;
        switch (code) {
          case MOTOR_ACTION.FR_RESET:
            patch.frTripped = false;
            patch.thermal = 0;
            break;
          case MOTOR_ACTION.ALL_RESET:
            Object.assign(patch, {
              frTripped: false, thermal: 0, loadPercent: 20,
              beltDisplacement: 0, round: 0,
            });
            break;
          case MOTOR_ACTION.TRIGGER_OVERLOAD:
            patch.loadPercent = MOTOR_PROCESS.DEMO_OVERLOAD_LOAD;
            patch.thermal = MOTOR_PROCESS.THERMAL_TRIP;
            break;
          default:
            break;
        }
      }
    }
    return patch;
  }),

  startDemo: () => set(() => ({
    demoRunning: true, stopRequested: false, demoPaused: false,
    demoStep: 0, demoElapsed: 0, round: 0,
    controlSource: 'local', connected: false,
    qfClosed: true, plcRun: true, frTripped: false, thermal: 0, loadPercent: 20,
    runLatch: null, kmDirect: initialCoils(), plcCoils: initialCoils(),
    demoCoils: { ...MOTOR_DEMO_STEPS[0].coils },
    buttons: initialButtons(), arcTimer: 0,
  })),
  /** 按停止：不打断当前循环，走完本轮最后一步才停 */
  requestStopDemo: () => set({ stopRequested: true }),
  stopDemo: () => set({
    demoRunning: false, stopRequested: false, demoPaused: false,
    demoStep: 0, demoElapsed: 0,
    demoCoils: initialCoils(), buttons: initialButtons(),
    km1Cmd: false, km2Cmd: false, runLatch: null, kmDirect: initialCoils(),
  }),
  toggleDemoPause: () => set((s) => ({ demoPaused: !s.demoPaused })),

  tick: (delta) => {
    const s = get();
    const dt = Math.min(Math.max(delta, 0), MOTOR_PROCESS.MAX_DT);
    if (dt <= 0) return;

    /* 1) 演示状态机：循环推进，暂停 / 跳闸期间冻结计时但保留步号 */
    let demoRunning = s.demoRunning;
    let stopRequested = s.stopRequested;
    let demoStep = s.demoStep;
    let demoElapsed = s.demoElapsed;
    let round = s.round;
    let demoCoils = s.demoCoils;
    let buttons = s.buttons;
    let loadPercent = s.loadPercent;
    let frTripped = s.frTripped;
    let thermal = s.thermal;
    let jogFlag = s.jogFlag;

    // PLC 处于 STOP 时程序不推进：演示状态机同样冻结，恢复 RUN 后从原步继续
    const demoActive = s.controlSource === 'local' && s.demoRunning && !s.demoPaused && s.plcRun;
    if (demoActive) {
      const step = MOTOR_DEMO_STEPS[demoStep];
      demoCoils = { ...step.coils };
      jogFlag = !!step.jog;
      loadPercent = step.load ?? loadPercent;
      buttons = initialButtons();
      if (step.button) buttons = { ...buttons, [step.button]: true };
      const done = step.waitTrip ? frTripped : demoElapsed >= step.sec;
      if (done) {
        if (step.reset) {
          frTripped = false;
          thermal = 0;
          loadPercent = 20;
        }
        demoElapsed = 0;
        demoStep += 1;
        if (demoStep >= MOTOR_DEMO_STEPS.length) {
          round += 1;
          demoStep = 0;
          if (stopRequested) {
            demoRunning = false;
            stopRequested = false;
            demoCoils = initialCoils();
            buttons = initialButtons();
            jogFlag = false;
          }
        }
      } else {
        demoElapsed += dt;
      }
    } else if (s.controlSource === 'local' && !s.demoRunning) {
      jogFlag = s.buttons.fwdJog || s.buttons.revJog;
    }

    /* 2) 线圈命令：单一写入者 + 电源 / FR 门控 + 换向灭弧间隙 + 硬件互锁 */
    const stateForCoils: MotorStore = {
      ...s, demoRunning, demoCoils, buttons, loadPercent, frTripped, thermal,
    };
    let { km1: km1Cmd, km2: km2Cmd } = desiredCoils(stateForCoils);
    // 本地程序只在 PLC RUN 时执行：STOP 一律释放线圈（仿真模式由外部 PLC 决定，不在此门控）
    if (!s.qfClosed || frTripped || (s.controlSource === 'local' && !s.plcRun)) {
      km1Cmd = false; km2Cmd = false;
    }

    let arcTimer = s.arcTimer;
    const desiredDir = km1Cmd !== km2Cmd ? (km1Cmd ? 1 : -1) : 0;
    const currentDir = motorDirection(s.km1On, s.km2On);
    if (arcTimer > 0) {
      arcTimer = Math.max(0, arcTimer - dt);
      km1Cmd = false;
      km2Cmd = false;
    } else if (s.qfClosed && !frTripped && desiredDir !== 0 && currentDir !== 0 && desiredDir !== currentDir) {
      arcTimer = MOTOR_PROCESS.ARC_GAP_SEC;
      km1Cmd = false;
      km2Cmd = false;
    }
    const lock = resolveContactors(km1Cmd, km2Cmd, s.km1On, s.km2On);
    const direction = motorDirection(lock.km1On, lock.km2On);

    /* 3) 转速一阶惯性：加速 / 减速分别限速，方向切换先减速到零 */
    const targetSpeed = direction * MOTOR_PROCESS.RATED_RPM;
    let speedRpm = s.speedRpm;
    const rate = Math.abs(targetSpeed) > Math.abs(speedRpm)
      ? MOTOR_PROCESS.ACCEL_RPM_PER_S : MOTOR_PROCESS.DECEL_RPM_PER_S;
    const diff = targetSpeed - speedRpm;
    speedRpm += Math.sign(diff) * Math.min(Math.abs(diff), rate * dt);
    if (Math.abs(speedRpm) < 1) speedRpm = 0;

    /* 4) 位移真值积分 + 观感角度；位移只由皮带线速度写入，绝不置零改写。
     *    线圈释放后电机仍按惯性减速，皮带继续沿原旋转方向滑行到速度为零。 */
    const spinDirection: -1 | 0 | 1 = direction !== 0
      ? direction
      : (speedRpm > 0 ? 1 : speedRpm < 0 ? -1 : 0);
    const beltDisplacement = clampDisplacement(
      s.beltDisplacement + beltVelocityMm(spinDirection, speedRpm) * dt,
    );
    const shaftAngle = s.shaftAngle + (speedRpm / 60) * Math.PI * 2 * dt;
    const currentA = motorCurrentA(speedRpm, loadPercent);

    /* 5) 热累积与 FR 跳闸：电流越阈值才累积，跳闸锁存直到复位 */
    if (currentA > MOTOR_PROCESS.TRIP_CURRENT_A) {
      thermal = clampThermal(thermal + (currentA - MOTOR_PROCESS.TRIP_CURRENT_A) * MOTOR_PROCESS.THERMAL_GAIN * dt);
    } else {
      thermal = clampThermal(thermal - MOTOR_PROCESS.THERMAL_COOL_PER_S * dt);
    }
    if (thermal >= MOTOR_PROCESS.THERMAL_TRIP && !frTripped) {
      frTripped = true;
      arcTimer = 0;
    }

    /* 6) 阶段：断电 / 过载 / 待机 / 点动 / 运行，全由真值派生 */
    let phase: MotorPhase;
    if (!s.qfClosed) phase = MOTOR_PHASE.POWER_OFF;
    else if (frTripped) phase = MOTOR_PHASE.OVERLOAD;
    else if (direction === 0) phase = MOTOR_PHASE.IDLE;
    else if (direction === 1) phase = jogFlag ? MOTOR_PHASE.FWD_JOG : MOTOR_PHASE.FWD_RUN;
    else phase = jogFlag ? MOTOR_PHASE.REV_JOG : MOTOR_PHASE.REV_RUN;

    const patch = {
      km1Cmd, km2Cmd, demoCoils, buttons, loadPercent, frTripped, thermal, jogFlag,
      km1On: lock.km1On, km2On: lock.km2On,
      forbidden: lock.forbidden, interlocked: lock.interlocked,
      direction, speedRpm, beltDisplacement, shaftAngle, currentA,
      arcTimer, phase, demoRunning, stopRequested, demoStep, demoElapsed, round,
    };
    // 静止期 rAF 仍在跑，值全同就不写 store，避免 60Hz 全量订阅者重渲染
    if (patchChanged(s, patch)) set(patch);
  },

  /** 观众只读镜像：键名与 exportMotorSnapshot 成对，有限性守卫、缺字段保留上次值 */
  applyBroadcast: (v) => {
    const num = (key: string): number | undefined => {
      const x = v[key];
      return typeof x === 'number' && Number.isFinite(x) && x >= 0 ? x : undefined;
    };
    const signed = (key: string): number | undefined => {
      const x = v[key];
      return typeof x === 'number' && Number.isFinite(x) ? x : undefined;
    };
    const bit = (key: string, fallback: boolean) => (num(key) !== undefined ? num(key) === 1 : fallback);
    const s = get();
    const patch: Partial<MotorStore> = {};
    const qf = num('MOTOR_QF'); if (qf !== undefined) patch.qfClosed = qf === 1;
    const plcRun = num('MOTOR_PLC_RUN'); if (plcRun !== undefined) patch.plcRun = plcRun === 1;
    const km1Cmd = num('MOTOR_KM1_CMD'); if (km1Cmd !== undefined) patch.km1Cmd = km1Cmd === 1;
    const km2Cmd = num('MOTOR_KM2_CMD'); if (km2Cmd !== undefined) patch.km2Cmd = km2Cmd === 1;
    const km1On = num('MOTOR_KM1_ON'); if (km1On !== undefined) patch.km1On = km1On === 1;
    const km2On = num('MOTOR_KM2_ON'); if (km2On !== undefined) patch.km2On = km2On === 1;
    const forbidden = num('MOTOR_FORBIDDEN'); if (forbidden !== undefined) patch.forbidden = forbidden === 1;
    const interlocked = num('MOTOR_INTERLOCKED'); if (interlocked !== undefined) patch.interlocked = interlocked === 1;
    const dir = signed('MOTOR_DIRECTION');
    if (dir !== undefined) patch.direction = (dir > 0 ? 1 : dir < 0 ? -1 : 0) as -1 | 0 | 1;
    const speed = num('MOTOR_SPEED'); if (speed !== undefined) patch.speedRpm = clamp(speed, 0, MOTOR_PROCESS.RATED_RPM);
    const disp = signed('MOTOR_DISPLACEMENT');
    if (disp !== undefined) patch.beltDisplacement = clampDisplacement(disp);
    const angle = signed('MOTOR_SHAFT_ANGLE'); if (angle !== undefined) patch.shaftAngle = angle;
    const thermal = num('MOTOR_THERMAL'); if (thermal !== undefined) patch.thermal = clampThermal(thermal);
    const current = num('MOTOR_CURRENT'); if (current !== undefined) patch.currentA = current;
    const load = num('MOTOR_LOAD'); if (load !== undefined) patch.loadPercent = clampLoad(load);
    const tripped = num('MOTOR_FR_TRIPPED'); if (tripped !== undefined) patch.frTripped = tripped === 1;
    const phase = num('MOTOR_PHASE');
    if (phase !== undefined) patch.phase = clamp(Math.trunc(phase), MOTOR_PHASE.POWER_OFF, MOTOR_PHASE.RESET_PENDING) as MotorPhase;
    const round = num('MOTOR_ROUND'); if (round !== undefined) patch.round = Math.trunc(round);
    const arc = num('MOTOR_ARC'); if (arc !== undefined) patch.arcTimer = arc;
    const buttonMask = num('MOTOR_BUTTON_MASK');
    if (buttonMask !== undefined) patch.buttons = buttonsFromMask(buttonMask, s.buttons);
    const latch = signed('MOTOR_RUN_LATCH');
    if (latch !== undefined) patch.runLatch = latch > 0 ? 'fwd' : latch < 0 ? 'rev' : null;
    const directMask = num('MOTOR_KM_DIRECT_MASK');
    if (directMask !== undefined) {
      patch.kmDirect = { km1: (Math.trunc(directMask) & 1) !== 0, km2: (Math.trunc(directMask) & 2) !== 0 };
    }
    const jog = num('MOTOR_JOG'); if (jog !== undefined) patch.jogFlag = jog === 1;
    patch.demoRunning = bit('MOTOR_DEMO', s.demoRunning);
    patch.stopRequested = bit('MOTOR_STOP_REQ', s.stopRequested);
    patch.demoPaused = bit('MOTOR_PAUSED', s.demoPaused);
    const demoStep = num('MOTOR_DEMO_STEP');
    if (demoStep !== undefined) {
      const stepIndex = Math.min(MOTOR_DEMO_STEPS.length - 1, Math.trunc(demoStep));
      patch.demoStep = stepIndex;
      patch.demoCoils = { ...MOTOR_DEMO_STEPS[stepIndex].coils };
    }
    /** 掩码优先：与 14 路反馈同源同序，逐位覆盖后不丢字段 */
    const mask = num('MOTOR_SENSOR_MASK');
    if (mask !== undefined) {
      const bits = motorSensorBits(motorFeedbackOf({
        buttons: patch.buttons ?? s.buttons,
        km1On: patch.km1On ?? s.km1On,
        km2On: patch.km2On ?? s.km2On,
        frTripped: patch.frTripped ?? s.frTripped,
        speedRpm: patch.speedRpm ?? s.speedRpm,
        direction: patch.direction ?? s.direction,
        qfClosed: patch.qfClosed ?? s.qfClosed,
        interlocked: patch.interlocked ?? s.interlocked,
      }));
      const on = (i: number) => (Math.trunc(mask) & (1 << i)) !== 0;
      for (let i = 0; i < bits.length; i += 1) bits[i] = on(i);
      const [fwdJog, revJog, fwdStart, revStart, stop, k1, k2, frClosed, , fwd, rev, , qfOn, lock] = bits;
      patch.buttons = { fwdJog, revJog, fwdStart, revStart, stop };
      patch.km1On = k1;
      patch.km2On = k2;
      patch.frTripped = !frClosed;
      patch.direction = (fwd ? 1 : rev ? -1 : 0) as -1 | 0 | 1;
      patch.interlocked = lock;
      patch.qfClosed = qfOn;
    }
    set(patch);
  },
}));

/** 主控上报：与 applyBroadcast 键名一一对应，全部数值键 */
export function exportMotorSnapshot(): Record<string, number> {
  const s = useMotorStore.getState();
  const r3 = (v: number) => Math.round(v * 1000) / 1000;
  return {
    MOTOR_QF: s.qfClosed ? 1 : 0,
    MOTOR_PLC_RUN: s.plcRun ? 1 : 0,
    MOTOR_KM1_CMD: s.km1Cmd ? 1 : 0,
    MOTOR_KM2_CMD: s.km2Cmd ? 1 : 0,
    MOTOR_KM1_ON: s.km1On ? 1 : 0,
    MOTOR_KM2_ON: s.km2On ? 1 : 0,
    MOTOR_FORBIDDEN: s.forbidden ? 1 : 0,
    MOTOR_INTERLOCKED: s.interlocked ? 1 : 0,
    MOTOR_DIRECTION: s.direction,
    MOTOR_SPEED: r3(s.speedRpm),
    MOTOR_DISPLACEMENT: r3(s.beltDisplacement),
    MOTOR_SHAFT_ANGLE: r3(s.shaftAngle),
    MOTOR_THERMAL: r3(s.thermal),
    MOTOR_CURRENT: r3(s.currentA),
    MOTOR_LOAD: r3(s.loadPercent),
    MOTOR_FR_TRIPPED: s.frTripped ? 1 : 0,
    MOTOR_PHASE: s.phase,
    MOTOR_ROUND: s.round,
    MOTOR_DEMO: s.demoRunning ? 1 : 0,
    MOTOR_STOP_REQ: s.stopRequested ? 1 : 0,
    MOTOR_PAUSED: s.demoPaused ? 1 : 0,
    MOTOR_DEMO_STEP: s.demoStep,
    MOTOR_ARC: r3(s.arcTimer),
    MOTOR_JOG: s.jogFlag ? 1 : 0,
    MOTOR_BUTTON_MASK: motorButtonMask(s.buttons),
    MOTOR_RUN_LATCH: s.runLatch === 'fwd' ? 1 : s.runLatch === 'rev' ? -1 : 0,
    MOTOR_KM_DIRECT_MASK: (s.kmDirect.km1 ? 1 : 0) | (s.kmDirect.km2 ? 2 : 0),
    MOTOR_SENSOR_MASK: motorSensorMask(motorFeedbackOf(s)),
  };
}

/** 面板 / 帧级验证共用的 PLC 缩放后的过程量 */
export function motorPlcWords(): Record<string, number> {
  const s = useMotorStore.getState();
  return {
    MOTOR_SPEED_RPM: Math.round(Math.abs(s.speedRpm)),
    MOTOR_CURRENT_A: Math.round(s.currentA * MOTOR_PLC_SCALE.CURRENT),
    MOTOR_THERMAL: Math.round(s.thermal * MOTOR_PLC_SCALE.THERMAL),
    MOTOR_PHASE_W: s.phase,
    MOTOR_SENSOR_MASK: motorSensorMask(motorFeedbackOf(s)),
  };
}

/** 皮带有效长度：物料箱端点回绕用，尺寸来自唯一几何表 */
export const MOTOR_BELT_LENGTH_MM = MOTOR_GEOM.BELT.length * 1000;
