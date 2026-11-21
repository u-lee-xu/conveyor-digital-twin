/**
 * 汇川 MD520 虚拟变频器状态。
 *
 * 本轮范围：面板控制(F0-02=0) / DI 多段速(F0-02=1, F0-03=6) /
 * AI 模拟量(F0-03=2/3) / 485 通信控制(F0-02=2, F0-03=9)。
 *
 * 驱动源口径（与项目既有定稿一致）：
 *  - 本 store 只做「给定 → 实际输出频率」的表现层斜坡插值与面板状态，
 *    不决定传送带启停；启停仍由 useDeviceStore.conveyorRunning / PLC CONVEYOR 线圈唯一决定。
 *  - 3D 联动只表现为「频率倍率」，50.00Hz 对应既有 CONVEYOR_SPEED，不改碰撞体与运动学。
 *  - engaged 是「变频器是否已接管带速」的闩锁：未接管时 speedFactor 恒 1，
 *    手动 / 演示 / 评分 / 仿真默认链路保持原有额定带速，避免变频器默认停机把带子冻住；
 *    一旦用户从面板 RUN/STOP、DI 端子或 485 控制字下达过运行指令，输出频率才真正驱动带速。
 *    切换模式与恢复出厂参数会解除接管。
 */
import { create } from 'zustand';
// 子路径导入：不把 shared barrel 的 UI / 服务模块拉进设备分包
import { patchChanged } from '@digital-twin/shared/sync/patchChanged';
import {
  MD520_PARAMS, MD520_PARAM_MAP, MD520_DI, MD520_DO, MD520_COMMAND,
  MD520_STATUS, MD520_SOURCE, MD520_AI,
  type Md520Ai2Mode, type Md520Param,
} from '../vfd/md520Spec';
import {
  INITIAL_KEYPAD, reduceKeypad, keypadDisplay,
  type KeypadKey, type KeypadState,
} from '../vfd/md520Keypad';
import {
  INITIAL_TERMINAL_LATCH, resolveTerminalCommand, resolveMultiSpeedIndex,
  type TerminalLatch,
} from '../vfd/md520Terminal';

const DEFAULT_PARAMS: Record<string, number> = Object.fromEntries(
  MD520_PARAMS.map((p) => [p.code, p.defaultValue]),
);

const NOMINAL_HZ = 50;

/** 显式 number[]，避免 as const 字面量联合让 includes(number) 报错 */
const RUN_COMMANDS: number[] = [
  MD520_COMMAND.FWD, MD520_COMMAND.REV, MD520_COMMAND.FJOG, MD520_COMMAND.RJOG,
];
const REV_COMMANDS: number[] = [MD520_COMMAND.REV, MD520_COMMAND.RJOG];
const FWD_COMMANDS: number[] = [MD520_COMMAND.FWD, MD520_COMMAND.FJOG];

export interface VfdSnapshot {
  setpointHz: number;
  outputHz: number;
  command: number;
  status: number;
  diFlags: number;
  doFlags: number;
  /** AI1 模拟量数值镜像（V），由 PLC AO 经 100AH 下发 */
  ai1: number;
  /** 固定系数监视量：50Hz 满速 9.00A / 3.70kW，随负载率线性变化 */
  outputCurrent: number;
  outputPower: number;
  /** 方向数值镜像：观众端 3D 也要跟随换向过程，不用 !! 布尔化 */
  direction: number;
  runDirection: number;
  faultCode: string;
  engaged: boolean;
}

interface VfdStore {
  params: Record<string, number>;
  keypad: KeypadState;
  running: boolean;
  /** 目标方向：面板 FWD/REV 丝印、控制字与状态字用，切换指令下达后立刻变 */
  direction: 1 | -1;
  /** 实际输出方向：3D 电机/皮带用它。换向要先把频率降到 0 才翻转，避免瞬间反转 */
  runDirection: 1 | -1;
  /** 485 通信给定频率（Hz），来自 1000H 百分比或 7310H 直接频率 */
  externalSetpointHz: number;
  outputHz: number;
  /** 只读监视量：输出电流(A) / 输出功率(kW)，随 F1 铭牌参数与负载率变化 */
  outputCurrent: number;
  outputPower: number;
  di: Record<string, boolean>;
  /** 端子命令跨帧锁存（三线式上升沿 + 上一帧命令） */
  terminalLatch: TerminalLatch;
  doFlags: Record<string, boolean>;
  ai1: number;
  ai2: number;
  ai2Mode: Md520Ai2Mode;
  faultCode: string | null;
  faultHistory: string[];
  command: number;
  status: number;
  commOnline: boolean;
  message: string;
  /** 变频器已接管带速（见文件头口径） */
  engaged: boolean;

  setEngaged: (engaged: boolean) => void;
  setParam: (code: string, value: number) => void;
  resetParams: () => void;
  dispatchKey: (key: KeypadKey) => void;
  setDi: (key: string, on: boolean) => void;
  setAi1: (value: number) => void;
  setAi2: (value: number) => void;
  setAi2Mode: (mode: Md520Ai2Mode) => void;
  setPlcFrame: (frame: Partial<VfdSnapshot>) => void;
  setCommOnline: (online: boolean) => void;
  /** 每帧推进加减速斜坡，返回频率倍率供 3D 消费 */
  tick: (delta: number) => number;
  /** 整机带速倍率：未接管时恒 1，保住手动/演示/评分的原有额定带速 */
  speedFactor: () => number;
  /**
   * 演示装置倍率：严格按输出频率，不做 engaged 保底。
   * 变频器驱动台只表现「变频器 → 电机」这一层，不参与分拣业务启停。
   */
  outputFactor: () => number;
  multiSpeedIndex: () => number;
  snapshot: () => VfdSnapshot;
  applyBroadcast: (v: Record<string, boolean | number>) => void;
}

function bitFlags(di: Record<string, boolean>): number {
  return MD520_DI.reduce((acc, d, i) => acc | (di[d.key] ? 1 << i : 0), 0);
}

function doBitFlags(flags: Record<string, boolean>): number {
  return MD520_DO.reduce((acc, d) => acc | (flags[d.key] ? 1 << d.bit : 0), 0);
}

/** 固定系数监视量：不依赖 F1 铭牌参数，50Hz 满速仍显示 9.00A / 3.70kW */
const NOMINAL_CURRENT = 9;
const NOMINAL_POWER = 3.7;

function aiFrequency(params: Record<string, number>, ai1: number, ai2: number, mode: Md520Ai2Mode): number {
  const maxHz = params['F0-10'] || NOMINAL_HZ;
  const source = Math.trunc(params['F0-03']);
  if (source === MD520_SOURCE.FREQ_AI1) {
    return Math.max(0, Math.min(maxHz, Math.abs(ai1) / 10 * maxHz));
  }
  if (source === MD520_SOURCE.FREQ_AI2) {
    const span = mode === 'current' ? MD520_AI.AI2.currentMax : MD520_AI.AI2.max;
    return Math.max(0, Math.min(maxHz, Math.abs(ai2) / span * maxHz));
  }
  return params['F0-08'];
}

export const useVfdStore = create<VfdStore>((set, get) => ({
  params: { ...DEFAULT_PARAMS },
  keypad: { ...INITIAL_KEYPAD },
  running: false,
  direction: 1,
  runDirection: 1,
  externalSetpointHz: NOMINAL_HZ,
  outputHz: 0,
  outputCurrent: 0,
  outputPower: 0,
  di: Object.fromEntries(MD520_DI.map((d) => [d.key, false])),
  terminalLatch: { ...INITIAL_TERMINAL_LATCH },
  doFlags: Object.fromEntries(MD520_DO.map((d) => [d.key, false])),
  ai1: 0,
  ai2: 0,
  ai2Mode: 'voltage',
  faultCode: null,
  faultHistory: [],
  command: MD520_COMMAND.STOP,
  status: MD520_STATUS.STOP,
  commOnline: false,
  message: '',
  engaged: false,

  setEngaged: (engaged) => set({ engaged }),

  setParam: (code, value) => set((s) => {
    const p: Md520Param | undefined = MD520_PARAM_MAP[code];
    if (!p || p.readOnly) return s;
    const factor = 10 ** p.decimals;
    const v = Math.max(p.min, Math.min(p.max, Math.round(value * factor) / factor));
    return { params: { ...s.params, [code]: v }, message: '' };
  }),

  resetParams: () => set({
    params: { ...DEFAULT_PARAMS },
    keypad: { ...INITIAL_KEYPAD },
    faultCode: null,
    faultHistory: [],
    message: '',
    engaged: false,
    running: false,
    direction: 1,
    runDirection: 1,
    terminalLatch: { ...INITIAL_TERMINAL_LATCH },
    outputHz: 0,
    outputCurrent: 0,
    outputPower: 0,
  }),

  dispatchKey: (key) => {
    const s = get();
    const result = reduceKeypad(s.keypad, key, s.params, s.running, s.faultHistory.length);
    const patch: Partial<VfdStore> = { keypad: result.state, message: '' };
    const ev = result.event;
    let params = s.params;
    if (ev?.commit) {
      const p = MD520_PARAM_MAP[ev.commit.code];
      if (p) {
        params = { ...params, [ev.commit.code]: ev.commit.value };
        patch.params = params;
      }
    }
    // 通信命令源下，面板 RUN/STOP 不抢运行权，由 485 控制字唯一决定
    const panelControlsRun = Math.trunc(params['F0-02']) !== MD520_SOURCE.COMM;
    if (ev?.run || ev?.stop) patch.engaged = true;
    if (ev?.run && panelControlsRun) {
      patch.running = true;
      patch.command = s.direction === 1 ? MD520_COMMAND.FWD : MD520_COMMAND.REV;
    }
    if (ev?.stop && panelControlsRun) {
      patch.running = false;
      patch.command = MD520_COMMAND.STOP;
    }
    if (ev?.resetFault && s.faultCode) patch.faultCode = null;
    if (ev?.toggleDirection) {
      const next = s.direction === 1 ? -1 : 1;
      patch.direction = next;
      // 285 页：切换的是「频率指令方向」，运行中必须立刻反映到控制字、状态字与 3D 转向，
      // 否则只剩面板 FWD/REV 丝印变化，电机仍朝原方向转。
      if (s.running) {
        patch.command = next === -1 ? MD520_COMMAND.REV : MD520_COMMAND.FWD;
        patch.status = next === -1 ? MD520_STATUS.REV : MD520_STATUS.FWD;
      }
    }
    if (ev?.potentiometer) {
      const p = MD520_PARAM_MAP['F0-08'];
      patch.params = {
        ...params,
        'F0-08': Math.max(p.min, Math.min(p.max, params['F0-08'] + ev.potentiometer * 0.5)),
      };
    }
    if (ev?.message) patch.message = ev.message;
    set(patch);
  },

  setDi: (key, on) => set((s) => ({ di: { ...s.di, [key]: on }, engaged: true })),
  setAi1: (value) => set({ ai1: Math.max(MD520_AI.AI1.min, Math.min(MD520_AI.AI1.max, value)) }),
  setAi2: (value) => set((s) => ({
    ai2: Math.max(0, Math.min(s.ai2Mode === 'current' ? MD520_AI.AI2.currentMax : MD520_AI.AI2.max, value)),
  })),
  setAi2Mode: (mode) => set((s) => ({
    ai2Mode: mode,
    ai2: Math.min(s.ai2, mode === 'current' ? MD520_AI.AI2.currentMax : MD520_AI.AI2.max),
  })),

  setPlcFrame: (frame) => set((s) => {
    const patch: Partial<VfdStore> = {};
    if (typeof frame.setpointHz === 'number' && Number.isFinite(frame.setpointHz)) {
      patch.externalSetpointHz = Math.max(0, Math.min(s.params['F0-10'], frame.setpointHz));
    }
    if (typeof frame.command === 'number' && Number.isFinite(frame.command)) {
      patch.command = Math.trunc(frame.command);
      patch.engaged = true;
      const running = RUN_COMMANDS
        .includes(Math.trunc(frame.command));
      patch.running = running;
      if (REV_COMMANDS.includes(Math.trunc(frame.command))) patch.direction = -1;
      if (FWD_COMMANDS.includes(Math.trunc(frame.command))) patch.direction = 1;
      if (Math.trunc(frame.command) === MD520_COMMAND.FAULT_RESET) patch.faultCode = null;
    }
    if (typeof frame.status === 'number' && Number.isFinite(frame.status)) patch.status = Math.trunc(frame.status);
    if (typeof frame.diFlags === 'number' && Number.isFinite(frame.diFlags)) {
      patch.di = Object.fromEntries(MD520_DI.map((d, i) => [d.key, !!(frame.diFlags! & (1 << i))]));
      // PLC 经 DIDO 下达给定即视为接管；未下达的零帧由 VfdLink 跳过
      patch.engaged = true;
    }
    if (typeof frame.ai1 === 'number' && Number.isFinite(frame.ai1)) {
      patch.ai1 = Math.max(MD520_AI.AI1.min, Math.min(MD520_AI.AI1.max, frame.ai1));
      patch.engaged = true;
    }
    if (frame.faultCode) {
      patch.faultCode = frame.faultCode;
      if (!s.faultHistory.includes(frame.faultCode)) {
        patch.faultHistory = [frame.faultCode, ...s.faultHistory].slice(0, 8);
      }
    }
    return patch;
  }),

  setCommOnline: (online) => set({ commOnline: online }),

  tick: (delta) => {
    const s = get();
    const faulted = !!s.faultCode;
    const source = Math.trunc(s.params['F0-02']);
    const freqSource = Math.trunc(s.params['F0-03']);
    let command = s.command;
    let running = false;
    let direction = s.direction;
    let terminalLatch = s.terminalLatch;

    if (source === MD520_SOURCE.COMM) {
      // 通信控制字是唯一驱动源，面板与端子都不抢运行权
      running = RUN_COMMANDS.includes(s.command);
      command = s.command;
    } else if (source === MD520_SOURCE.TERMINAL) {
      // 端子功能由 F4-00~F4-04 决定，命令方式由 F4-11 决定
      const result = resolveTerminalCommand(s.di, s.params, s.terminalLatch);
      command = result.command;
      running = RUN_COMMANDS.includes(result.command);
      terminalLatch = result.latch;
      if (REV_COMMANDS.includes(result.command)) direction = -1;
      if (FWD_COMMANDS.includes(result.command)) direction = 1;
    } else {
      running = s.running;
      command = running
        ? (s.direction === 1 ? MD520_COMMAND.FWD : MD520_COMMAND.REV)
        : MD520_COMMAND.STOP;
    }
    if (faulted) running = false;

    let targetHz: number;
    if (source === MD520_SOURCE.COMM || freqSource === MD520_SOURCE.FREQ_COMM) {
      targetHz = s.externalSetpointHz;
    } else if (freqSource === MD520_SOURCE.FREQ_MULTI) {
      // 段位来自配成「多段指令端子1~4」的 DI，段速真值取 FC-00~FC-07 相对 F0-10 的百分比
      const seg = resolveMultiSpeedIndex(s.di, s.params);
      targetHz = Math.abs(Number(s.params[`FC-0${seg}`] ?? 0)) / 100 * (s.params['F0-10'] || 50);
    } else if (freqSource === MD520_SOURCE.FREQ_AI1 || freqSource === MD520_SOURCE.FREQ_AI2) {
      targetHz = aiFrequency(s.params, s.ai1, s.ai2, s.ai2Mode);
    } else {
      targetHz = s.params['F0-08'];
    }
    if (command === MD520_COMMAND.FJOG || command === MD520_COMMAND.RJOG) {
      targetHz = Math.min(5, targetHz);
    }

    const maxHz = s.params['F0-10'] || NOMINAL_HZ;
    const acc = Math.max(0.1, s.params['F0-17']);
    const dec = Math.max(0.1, s.params['F0-18']);
    const dt = Math.min(delta, 0.05);
    const runGoal = Math.min(maxHz, targetHz);

    // 正反转切换：目标方向与实际输出方向不一致时，先按 F0-18 降到 0，
    // 到零后才翻转 runDirection，再按 F0-17 反向加速。3D 用 runDirection。
    const reversing = running && direction !== s.runDirection && s.outputHz > 0.01;
    const goal = reversing ? 0 : (running ? runGoal : 0);
    // 斜坡标尺固定为最大频率；换向减速时改用运行目标频率，避免速率趋近 0 卡住
    const baseHz = reversing ? Math.max(0.01, runGoal) : maxHz;
    const seconds = goal > s.outputHz ? acc : dec;
    const rate = baseHz / seconds * dt;
    const outputHz = goal > s.outputHz
      ? Math.min(goal, s.outputHz + rate)
      : Math.max(goal, s.outputHz - rate);

    // 判定必须用帧初的 s.outputHz：帧末可能已是反向加速第一帧，用它判断会来回震荡
    let runDirection = s.runDirection;
    if (!reversing && runDirection !== direction && (s.outputHz <= 0.01 || !running)) {
      runDirection = direction;
    }

    // 固定系数监视量：空载 15% 额定电流，负载率随频率线性上升
    const load = Math.min(1, outputHz / maxHz);
    const motoring = running || outputHz > 0.01;
    const outputCurrent = motoring ? NOMINAL_CURRENT * (0.15 + 0.85 * load) : 0;
    const outputPower = motoring ? NOMINAL_POWER * load : 0;

    const doFlags = {
      DO1: running,
      FM: running && Math.abs(outputHz - goal) < 0.05,
      RELAY: faulted,
    };
    const status = faulted ? MD520_STATUS.FAULT
      : !running ? MD520_STATUS.STOP
        : (direction === -1 ? MD520_STATUS.REV : MD520_STATUS.FWD);

    // U0-00 只在两位小数变化时更新；静止期复用整张参数表，省掉每帧复制
    const u0 = Math.round(outputHz * 100) / 100;
    const params = Object.is(s.params['U0-00'], u0) ? s.params : { ...s.params, 'U0-00': u0 };
    const patch = {
      outputHz, runDirection, outputCurrent, outputPower,
      running, command, status, doFlags, params, direction, terminalLatch,
    };
    if (patchChanged(s, patch)) set(patch);
    return outputHz / NOMINAL_HZ;
  },

  speedFactor: () => {
    const s = get();
    if (!s.engaged) return 1;
    return s.faultCode ? 0 : Math.max(0, s.outputHz / NOMINAL_HZ);
  },

  outputFactor: () => {
    const s = get();
    return s.faultCode ? 0 : Math.max(0, s.outputHz / NOMINAL_HZ);
  },

  multiSpeedIndex: () => resolveMultiSpeedIndex(get().di, get().params),

  snapshot: () => {
    const s = get();
    return {
      setpointHz: Math.round(s.externalSetpointHz * 100) / 100,
      outputHz: Math.round(s.outputHz * 100) / 100,
      command: s.command,
      status: s.status,
      diFlags: bitFlags(s.di),
      doFlags: doBitFlags(s.doFlags),
      ai1: Math.round(s.ai1 * 100) / 100,
      outputCurrent: Math.round(s.outputCurrent * 100) / 100,
      outputPower: Math.round(s.outputPower * 100) / 100,
      direction: s.direction,
      runDirection: s.runDirection,
      faultCode: s.faultCode ?? '',
      engaged: s.engaged,
    };
  },

  /** 观众端只读镜像：数值键必须 typeof number 守卫，禁止 !! 布尔化 */
  applyBroadcast: (v) => {
    const num = (key: string): number | undefined => {
      const x = v[key];
      return typeof x === 'number' && Number.isFinite(x) ? x : undefined;
    };
    const patch: Partial<VfdStore> = {};
    const current = get();
    let params: Record<string, number> | undefined;
    const mirrorParam = (code: string, x: number | undefined) => {
      if (x === undefined) return;
      params = { ...(params ?? current.params), [code]: x };
    };
    const setpointHz = num('VFD_SETPOINT_HZ');
    const outputHz = num('VFD_OUTPUT_HZ');
    const outputCurrent = num('VFD_CURRENT');
    const outputPower = num('VFD_POWER');
    const direction = num('VFD_DIRECTION');
    const runDirection = num('VFD_RUN_DIRECTION');
    const command = num('VFD_COMMAND');
    const status = num('VFD_STATUS');
    const diFlags = num('VFD_DI_FLAGS');
    const doFlags = num('VFD_DO_FLAGS');
    const ai1 = num('VFD_AI1');
    const ai2 = num('VFD_AI2');
    if (setpointHz !== undefined) patch.externalSetpointHz = setpointHz;
    if (outputCurrent !== undefined) patch.outputCurrent = outputCurrent;
    if (outputPower !== undefined) patch.outputPower = outputPower;
    if (direction === 1 || direction === -1) patch.direction = direction;
    if (runDirection === 1 || runDirection === -1) patch.runDirection = runDirection;
    if (outputHz !== undefined) {
      patch.outputHz = outputHz;
      mirrorParam('U0-00', Math.round(outputHz * 100) / 100);
    }
    if (command !== undefined) patch.command = command;
    if (status !== undefined) patch.status = status;
    if (ai1 !== undefined) patch.ai1 = ai1;
    if (ai2 !== undefined) patch.ai2 = ai2;
    // 给定来源与频率设定也随快照走，观众端面板不会停留在出厂默认值
    mirrorParam('F0-02', num('VFD_SOURCE'));
    mirrorParam('F0-03', num('VFD_FREQ_SOURCE'));
    mirrorParam('F0-08', num('VFD_PRESET_HZ'));
    mirrorParam('F0-10', num('VFD_MAX_HZ'));
    if (params) patch.params = params;
    if (diFlags !== undefined) {
      patch.di = Object.fromEntries(MD520_DI.map((d, i) => [d.key, !!(diFlags & (1 << i))]));
    }
    if (doFlags !== undefined) {
      patch.doFlags = Object.fromEntries(MD520_DO.map((d) => [d.key, !!(doFlags & (1 << d.bit))]));
    }
    if (typeof v['VFD_FAULT'] === 'number') patch.faultCode = v['VFD_FAULT'] ? 'E002.1' : null;
    if (typeof v['VFD_ENGAGED'] === 'number') patch.engaged = !!v['VFD_ENGAGED'];
    if (Object.keys(patch).length) set(patch);
  },
}));

export { keypadDisplay };
