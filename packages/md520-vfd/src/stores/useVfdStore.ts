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
import {
  MD520_PARAMS, MD520_PARAM_MAP, MD520_DI, MD520_DO, MD520_COMMAND,
  MD520_STATUS, MD520_SOURCE, MD520_AI,
  type Md520Ai2Mode, type Md520Param,
} from '../vfd/md520Spec';
import {
  INITIAL_KEYPAD, reduceKeypad, keypadDisplay,
  type KeypadKey, type KeypadState,
} from '../vfd/md520Keypad';

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
  faultCode: string;
  engaged: boolean;
}

interface VfdStore {
  params: Record<string, number>;
  keypad: KeypadState;
  running: boolean;
  direction: 1 | -1;
  /** 485 通信给定频率（Hz），来自 1000H 百分比或 7310H 直接频率 */
  externalSetpointHz: number;
  outputHz: number;
  di: Record<string, boolean>;
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

/** DI1~DI3 组成 3 位二进制段号，DI4 为运行使能（教学子集） */
function multiSpeedIndex(di: Record<string, boolean>): number {
  return (di.DI1 ? 1 : 0) | (di.DI2 ? 2 : 0) | (di.DI3 ? 4 : 0);
}

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
  externalSetpointHz: NOMINAL_HZ,
  outputHz: 0,
  di: Object.fromEntries(MD520_DI.map((d) => [d.key, false])),
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
    outputHz: 0,
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
        /**
         * 302 页 17.2.3 参数初始化：
         *  1   = 恢复出厂参数，不包括电机参数（F1 组铭牌值保留）
         *  503 = 恢复出厂参数，包括电机参数
         *  2   = 清除记录信息
         *  4 / 501（备份 / 恢复备份）教学未实现，仅作参数镜像，不产生副作用。
         */
        if (ev.commit.code === 'FP-01') {
          const mode = Math.trunc(ev.commit.value);
          if (mode === 1 || mode === 503) {
            const restored: Record<string, number> = { ...DEFAULT_PARAMS };
            if (mode === 1) {
              for (const [code, value] of Object.entries(params)) {
                if (code.startsWith('F1-')) restored[code] = value;
              }
            }
            patch.params = restored;
            params = restored;
          } else if (mode === 2) {
            patch.faultHistory = [];
          }
        }
      }
    }
    // MF.K：F7-01=1 强制本地面板控制，把命令源切回操作面板
    if (ev?.forcePanel) {
      const nextParams = { ...params, 'F0-02': MD520_SOURCE.PANEL };
      patch.params = nextParams;
      params = nextParams;
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
    if (typeof ev?.jog === 'number') {
      patch.engaged = true;
      patch.running = true;
      patch.command = ev.jog;
      patch.direction = ev.jog === MD520_COMMAND.RJOG ? -1 : 1;
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

    if (source === MD520_SOURCE.COMM) {
      // 485 控制字是唯一驱动源，面板与 DI 都不抢运行权
      running = RUN_COMMANDS
        .includes(s.command);
      command = s.command;
    } else if (source === MD520_SOURCE.TERMINAL) {
      // DI4 运行使能 + DI1~DI3 多段速
      running = !!s.di.DI4;
      command = running ? MD520_COMMAND.FWD : MD520_COMMAND.STOP;
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
      // 17.2.22：段速真值来自 FC-00~FC-07 百分比（相对 F0-10），不再用硬编码 Hz 表
      const seg = multiSpeedIndex(s.di);
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
    const goal = running ? Math.min(maxHz, targetHz) : 0;
    const rate = (goal > s.outputHz ? maxHz / acc : maxHz / dec) * Math.min(delta, 0.05);
    const outputHz = goal > s.outputHz
      ? Math.min(goal, s.outputHz + rate)
      : Math.max(goal, s.outputHz - rate);

    const doFlags = {
      DO1: running,
      FM: running && Math.abs(outputHz - goal) < 0.05,
      RELAY: faulted,
    };
    const status = faulted ? MD520_STATUS.FAULT
      : !running ? MD520_STATUS.STOP
        : (s.direction === -1 ? MD520_STATUS.REV : MD520_STATUS.FWD);

    set({
      outputHz,
      running,
      command,
      status,
      doFlags,
      params: { ...s.params, 'U0-00': Math.round(outputHz * 100) / 100 },
    });
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

  multiSpeedIndex: () => multiSpeedIndex(get().di),

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
    const command = num('VFD_COMMAND');
    const status = num('VFD_STATUS');
    const diFlags = num('VFD_DI_FLAGS');
    const doFlags = num('VFD_DO_FLAGS');
    const ai1 = num('VFD_AI1');
    const ai2 = num('VFD_AI2');
    if (setpointHz !== undefined) patch.externalSetpointHz = setpointHz;
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
