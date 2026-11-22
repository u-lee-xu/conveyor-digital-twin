/**
 * 电机正反转控制变量 / 信号表 —— **单一来源**。
 * 面板地址表、connect 帧、300ms 轮询、传感器回写、静态自检全部读这一份，不另抄。
 *
 * 通道划分（项目红线）：
 *  - 控制器 → 设备（输出）：KM1 / KM2 线圈、FR 复位线圈 + 显式动作字；
 *  - 设备 → 控制器（输入）：5 按钮、KM 辅助触点、FR 常闭、运行方向、过载、QF、互锁，共 14 路位；
 *  - 数值量单列：皮带位移 32 位 DINT（低字在前、FC03 读 / FC10 一帧写两字），
 *    转速 / 电流 / 热累积 / 阶段 / 掩码为单字 uint16。
 *
 * 现场总线只保留变量 / 信号映射语义，不实现任何底层链路。
 * 柜内无 KM 辅助常开自锁接线，因此本表也不存在「自锁」信号。
 */
import type { MotorButtons } from './motorConstants';

/** 字序与网关 dint32 通道一致，禁止在别处另写一份 */
export const MOTOR_DINT32_WORD_ORDER = 'low-first' as const;

export const MOTOR_WORD_VARIABLES = {
  // 设备 → PLC：皮带位移唯一真值（mm，有符号 32 位）
  MOTOR_DISPLACEMENT: { type: 'dint32', wordOrder: MOTOR_DINT32_WORD_ORDER, modbus: { address: 0, words: 2 }, s7: { address: 'MD0', words: 2 }, mitsubishi: { address: 'D0', words: 2 } },
  // 设备 → PLC：单字过程量
  MOTOR_SPEED_RPM: { type: 'uint16', modbus: { address: 2, words: 1 }, s7: { address: 'MW4', words: 1 }, mitsubishi: { address: 'D2', words: 1 } },
  MOTOR_CURRENT_A: { type: 'uint16', modbus: { address: 3, words: 1 }, s7: { address: 'MW6', words: 1 }, mitsubishi: { address: 'D3', words: 1 } },
  MOTOR_THERMAL: { type: 'uint16', modbus: { address: 4, words: 1 }, s7: { address: 'MW8', words: 1 }, mitsubishi: { address: 'D4', words: 1 } },
  MOTOR_PHASE_W: { type: 'uint16', modbus: { address: 5, words: 1 }, s7: { address: 'MW10', words: 1 }, mitsubishi: { address: 'D5', words: 1 } },
  MOTOR_SENSOR_MASK: { type: 'uint16', modbus: { address: 6, words: 1 }, s7: { address: 'MW12', words: 1 }, mitsubishi: { address: 'D6', words: 1 } },
  // PLC → 设备：显式动作字（code*1000+seq，序号变化沿触发）
  MOTOR_ACTION_W: { type: 'uint16', modbus: { address: 7, words: 1 }, s7: { address: 'MW14', words: 1 }, mitsubishi: { address: 'D7', words: 1 } },
} as const;

export type MotorWordName = keyof typeof MOTOR_WORD_VARIABLES;

/** 设备 → PLC 的上报字（位移单列，走双字原子写） */
export const MOTOR_REPORT_WORD_NAMES = [
  'MOTOR_SPEED_RPM', 'MOTOR_CURRENT_A', 'MOTOR_THERMAL', 'MOTOR_PHASE_W', 'MOTOR_SENSOR_MASK',
] as const;
/** PLC → 设备 的下发字（轮询读回，不回写） */
export const MOTOR_COMMAND_WORD_NAMES = ['MOTOR_ACTION_W'] as const;

/** Modbus 线圈：0~2 为 PLC 输出，10~23 为设备输入反馈 */
export const MOTOR_COILS = {
  MOTOR_KM1: 0,
  MOTOR_KM2: 1,
  MOTOR_FR_RESET: 2,
} as const;
export const MOTOR_OUTPUT_COIL_NAMES = [
  'MOTOR_KM1', 'MOTOR_KM2', 'MOTOR_FR_RESET',
] as const;
export type MotorOutputCoilName = (typeof MOTOR_OUTPUT_COIL_NAMES)[number];
export const MOTOR_OUTPUT_COIL_BASE = MOTOR_COILS.MOTOR_KM1;
export const MOTOR_OUTPUT_COIL_COUNT = MOTOR_OUTPUT_COIL_NAMES.length;

/**
 * 14 路开关量反馈（设备 → PLC）：5 按钮 + 两只接触器辅助触点 + FR 常闭 +
 * 运行 / 方向 + 过载 + QF + 硬件互锁。顺序与地址表、motorSensorBits() 一一对应。
 */
export const MOTOR_SENSOR_FEEDBACK = [
  { key: 'MOTOR_BTN_FWD_JOG', signal: '正点动按钮', modbus: 10, s7: 'M21.0', mitsubishi: 'X0' },
  { key: 'MOTOR_BTN_REV_JOG', signal: '反点动按钮', modbus: 11, s7: 'M21.1', mitsubishi: 'X1' },
  { key: 'MOTOR_BTN_FWD_START', signal: '正启动按钮', modbus: 12, s7: 'M21.2', mitsubishi: 'X2' },
  { key: 'MOTOR_BTN_REV_START', signal: '反启动按钮', modbus: 13, s7: 'M21.3', mitsubishi: 'X3' },
  { key: 'MOTOR_BTN_STOP', signal: '停止按钮', modbus: 14, s7: 'M21.4', mitsubishi: 'X4' },
  { key: 'MOTOR_KM1_AUX', signal: 'KM1 辅助触点', modbus: 15, s7: 'M21.5', mitsubishi: 'X5' },
  { key: 'MOTOR_KM2_AUX', signal: 'KM2 辅助触点', modbus: 16, s7: 'M21.6', mitsubishi: 'X6' },
  { key: 'MOTOR_FR_NC', signal: 'FR 常闭触点', modbus: 17, s7: 'M21.7', mitsubishi: 'X7' },
  { key: 'MOTOR_RUNNING', signal: '电机运行', modbus: 18, s7: 'M22.0', mitsubishi: 'X8' },
  { key: 'MOTOR_FORWARD', signal: '电机正转', modbus: 19, s7: 'M22.1', mitsubishi: 'X9' },
  { key: 'MOTOR_REVERSE', signal: '电机反转', modbus: 20, s7: 'M22.2', mitsubishi: 'X10' },
  { key: 'MOTOR_OVERLOAD', signal: '过载', modbus: 21, s7: 'M22.3', mitsubishi: 'X11' },
  { key: 'MOTOR_QF_ON', signal: 'QF 合闸', modbus: 22, s7: 'M22.4', mitsubishi: 'X12' },
  { key: 'MOTOR_INTERLOCK', signal: '硬件互锁', modbus: 23, s7: 'M22.5', mitsubishi: 'X13' },
] as const;

export const MOTOR_SENSOR_FEEDBACK_BASE = MOTOR_SENSOR_FEEDBACK[0].modbus;
export const MOTOR_SENSOR_VAR_NAMES: string[] = MOTOR_SENSOR_FEEDBACK.map((r) => r.key);
export type MotorSensorKey = (typeof MOTOR_SENSOR_FEEDBACK)[number]['key'];

/** 面板 / 广播 / 回写 / 地址掩码同源：14 位固定顺序 */
export interface MotorFeedback {
  buttons: MotorButtons;
  km1On: boolean;
  km2On: boolean;
  frClosed: boolean;
  running: boolean;
  forward: boolean;
  reverse: boolean;
  overload: boolean;
  qfClosed: boolean;
  interlocked: boolean;
}
export function motorSensorBits(f: MotorFeedback): boolean[] {
  return [
    f.buttons.fwdJog, f.buttons.revJog, f.buttons.fwdStart, f.buttons.revStart, f.buttons.stop,
    f.km1On, f.km2On, f.frClosed,
    f.running, f.forward, f.reverse, f.overload, f.qfClosed, f.interlocked,
  ];
}
export function motorSensorMask(f: MotorFeedback): number {
  return motorSensorBits(f).reduce((acc, on, i) => acc | (on ? 1 << i : 0), 0);
}

/** S7 / 三菱按变量名读写布尔；输出线圈与反馈线圈全部随 connect 帧下发 */
export const MOTOR_BOOL_S7: Record<string, string> = {
  MOTOR_KM1: 'M20.0', MOTOR_KM2: 'M20.1', MOTOR_FR_RESET: 'M20.2',
  ...Object.fromEntries(MOTOR_SENSOR_FEEDBACK.map((r) => [r.key, r.s7])),
};
export const MOTOR_BOOL_MITSUBISHI: Record<string, string> = {
  MOTOR_KM1: 'Y0', MOTOR_KM2: 'Y1', MOTOR_FR_RESET: 'Y2',
  ...Object.fromEntries(MOTOR_SENSOR_FEEDBACK.map((r) => [r.key, r.mitsubishi])),
};
/** Modbus TCP 按 coils 数字地址读写，不下发布尔表 */
export function motorBoolVarsFor(protocol: string): Record<string, string> | undefined {
  if (!protocol || protocol === 'modbus') return undefined;
  return protocol === 's7' ? MOTOR_BOOL_S7 : MOTOR_BOOL_MITSUBISHI;
}

/** PLC 动作的缩放：电流 0.01 A / 字，热累积 0.001 / 字 */
export const MOTOR_PLC_SCALE = { CURRENT: 100, THERMAL: 1000 } as const;

export const MOTOR_ACTION = {
  NONE: 0,
  FR_RESET: 1,
  ALL_RESET: 2,
  TRIGGER_OVERLOAD: 3,
} as const;

/** 单字同时承载动作类型与触发序号，短脉冲由 seq 变化沿锁存，不靠轮询猜电平 */
export function encodeMotorAction(code: number, seq: number): number {
  const c = Math.max(0, Math.min(9, Math.trunc(code)));
  const n = ((Math.trunc(seq) % 1000) + 1000) % 1000;
  return c * 1000 + n;
}
export function decodeMotorAction(value: number): { code: number; seq: number } {
  const v = Number.isFinite(value) ? Math.max(0, Math.trunc(value)) : 0;
  return { code: Math.floor(v / 1000), seq: v % 1000 };
}

/* ---------------------- 地址表：全部从上面的变量 / 线圈表派生 ---------------------- */

export interface MotorAddressRow {
  signal: string;
  mitsubishi: string;
  modbus: string;
  s7: string;
  direction: string;
  note: string;
}

function modbusWord(address: number, words: number): string {
  return words > 1 ? `HR${address}·${address + 1}` : `HR${address}`;
}
function mitsubishiWord(address: string, words: number): string {
  const base = Number(address.replace(/^D/, ''));
  return words > 1 ? `${address}·D${base + 1}` : address;
}
function coilAddress(n: number): string { return `C${n}`; }

const WORD_ROW_META: Record<MotorWordName, { signal: string; direction: string; note: string }> = {
  MOTOR_DISPLACEMENT: { signal: '皮带位移 DINT32', direction: '设备 → PLC', note: 'mm · 低字在前' },
  MOTOR_SPEED_RPM: { signal: '电机转速', direction: '设备 → PLC', note: 'r/min' },
  MOTOR_CURRENT_A: { signal: '电机电流', direction: '设备 → PLC', note: '0.01 A' },
  MOTOR_THERMAL: { signal: '热累积', direction: '设备 → PLC', note: '0.001' },
  MOTOR_PHASE_W: { signal: '工艺阶段', direction: '设备 → PLC', note: '0~7' },
  MOTOR_SENSOR_MASK: { signal: '开关量掩码', direction: '设备 → PLC', note: '14 位' },
  MOTOR_ACTION_W: { signal: '显式动作字', direction: 'PLC → 设备', note: '序号变化触发' },
};

const wordRows: MotorAddressRow[] = (Object.keys(MOTOR_WORD_VARIABLES) as MotorWordName[]).map((key) => {
  const spec = MOTOR_WORD_VARIABLES[key];
  const meta = WORD_ROW_META[key];
  return {
    signal: meta.signal,
    mitsubishi: mitsubishiWord(spec.mitsubishi.address, spec.mitsubishi.words),
    modbus: modbusWord(spec.modbus.address, spec.modbus.words),
    s7: spec.s7.address,
    direction: meta.direction,
    note: meta.note,
  };
});

const outputRows: MotorAddressRow[] = [
  {
    signal: 'KM1 / KM2 线圈',
    mitsubishi: `${MOTOR_BOOL_MITSUBISHI.MOTOR_KM1}·${MOTOR_BOOL_MITSUBISHI.MOTOR_KM2}`,
    modbus: `${coilAddress(MOTOR_COILS.MOTOR_KM1)}·${coilAddress(MOTOR_COILS.MOTOR_KM2)}`,
    s7: `${MOTOR_BOOL_S7.MOTOR_KM1}·${MOTOR_BOOL_S7.MOTOR_KM2}`,
    direction: 'PLC → 设备', note: '硬件互锁',
  },
  {
    signal: 'FR 复位',
    mitsubishi: MOTOR_BOOL_MITSUBISHI.MOTOR_FR_RESET,
    modbus: coilAddress(MOTOR_COILS.MOTOR_FR_RESET),
    s7: MOTOR_BOOL_S7.MOTOR_FR_RESET,
    direction: 'PLC → 设备', note: '开关量',
  },
];

const feedbackRows: MotorAddressRow[] = MOTOR_SENSOR_FEEDBACK.map((r) => ({
  signal: r.signal,
  mitsubishi: r.mitsubishi,
  modbus: coilAddress(r.modbus),
  s7: r.s7,
  direction: '设备 → PLC',
  note: '开关量反馈',
}));

/** 仿真模式常驻地址表：表头恒「信号 / 三菱 FX / Modbus TCP / Siemens S7」 */
export const MOTOR_ADDRESS_ROWS: readonly MotorAddressRow[] = [
  ...wordRows, ...outputRows, ...feedbackRows,
];

/** 教学映射表：只声明变量 / 信号对应关系，不实现底层链路 */
export const MOTOR_IO_MAP = [
  { signal: 'MOTOR_BTN_FWD_JOG / REV_JOG', direction: 'digital → PLC', source: '柜门点动按钮' },
  { signal: 'MOTOR_BTN_FWD_START / REV_START / STOP', direction: 'digital → PLC', source: '柜门启动与停止按钮' },
  { signal: 'MOTOR_KM1 / KM2', direction: 'PLC → actuator', source: '两只硬件互锁交流接触器' },
  { signal: 'MOTOR_DISPLACEMENT', direction: 'analog → PLC', source: '皮带位移累计值' },
  { signal: 'MOTOR_CURRENT_A / THERMAL', direction: 'analog → PLC', source: '电机电流与热累积' },
  { signal: 'MOTOR_FR_NC', direction: 'digital → PLC', source: '热继电器常闭触点' },
] as const;

/* ---------------------- 面板变量地址浮框：按语义键查表，查不到立即抛错 ---------------------- */

export interface MotorHintRow {
  label: string;
  mitsubishi: string;
  modbus: string;
  s7: string;
  note?: string;
}

/** 纯本地教学量（负载档位、演示主令、机位）不在此表：它们不在 PLC 链路上 */
export const MOTOR_PANEL_HINT_SIGNALS = {
  displacement: ['皮带位移 DINT32'],
  speed: ['电机转速'],
  current: ['电机电流'],
  thermal: ['热累积'],
  phase: ['工艺阶段'],
  sensorMask: ['开关量掩码'],
  actionWord: ['显式动作字'],
  km1: ['KM1 / KM2 线圈'],
  km2: ['KM1 / KM2 线圈'],
  frReset: ['FR 复位'],
} as const;
export type MotorPanelHintKey = keyof typeof MOTOR_PANEL_HINT_SIGNALS;

export function motorAddressRowsFor(key: MotorPanelHintKey): MotorHintRow[] {
  return MOTOR_PANEL_HINT_SIGNALS[key].map((signal) => {
    const row = MOTOR_ADDRESS_ROWS.find((r) => r.signal === signal);
    if (!row) throw new Error(`电机正反转地址表缺少信号：${signal}`);
    return {
      label: row.signal,
      mitsubishi: row.mitsubishi,
      modbus: row.modbus,
      s7: row.s7,
      note: `${row.direction} · ${row.note}`,
    };
  });
}

/** 14 路开关量逐路浮框行：直接取回写表，保证「面板名 / 三协议地址 / 回写线圈」同源 */
export function motorSensorHintRow(key: string): MotorHintRow[] {
  const row = MOTOR_SENSOR_FEEDBACK.find((r) => r.key === key);
  if (!row) throw new Error(`电机正反转开关量表缺少信号：${key}`);
  return [{
    label: row.signal,
    mitsubishi: row.mitsubishi,
    modbus: coilAddress(row.modbus),
    s7: row.s7,
    note: '设备 → PLC · 开关量反馈',
  }];
}
