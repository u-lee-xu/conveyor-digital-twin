/**
 * 手动模式「PLC 单点 I/O 操作台」的点位单一来源。
 *
 * 手动模式不跑自动流程：面板按键等价于直接置位 / 复位 PLC 输出线圈（Y），
 * 传感器与主令按钮则是只读输入点（X）。这里把两套点位的地址、名称、分组
 * 与电平读取集中定义，面板组件只消费本表，禁止在 JSX 里回填 'Y2' / 'Coil 32'
 * 这类地址字符串 —— 地址真值仍是 constants.ts 的三张协议地址表。
 *
 * 位置不列入输入点表：它只走一个 32 位 DINT 数据寄存器（ENCODER_DINT），
 * 物理 A/B 相 X0/X1 与高速计数器由 PLC 程序处理，面板单独显示寄存器数值。
 */
import {
  MODBUS_READ_VARS, MITSUBISHI_READ_VARS, MITSUBISHI_WRITE_VARS,
  ENCODER_DINT, ENCODER_REG_LABEL,
  type MagazineId,
} from './constants';

export type IoGroup =
  | 'motor' | 'cylinder' | 'tilt' | 'lamp'
  | 'button' | 'limit' | 'magazine' | 'bin' | 'reed';

export interface IoPoint {
  /** constants.ts 地址表里的键，输出/输入两组共用同一命名 */
  key: string;
  /** 面板上显示的中文简称 */
  label: string;
  /** 三菱 X/Y 地址，工业现场最直观的一套点位编号 */
  addr: string;
  /** Modbus 线圈号（显示成 C32） */
  coil: string;
  group: IoGroup;
}

type OutputKey = keyof typeof MITSUBISHI_WRITE_VARS;
type InputKey = keyof typeof MITSUBISHI_READ_VARS;

/** 输出点顺序 = 面板操作顺序：电机 → 四仓送药缸 → 翻转缸 → 三色灯 */
const OUTPUT_KEYS: readonly OutputKey[] = [
  'MOTOR_FWD', 'MOTOR_REV',
  'CYL_SEND_A', 'CYL_SEND_B', 'CYL_SEND_C', 'CYL_SEND_D',
  'CYL_TILT',
  'LAMP_GREEN', 'LAMP_YELLOW', 'LAMP_RED',
];

const OUTPUT_LABELS: Record<OutputKey, string> = {
  MOTOR_FWD: '电机正转',
  MOTOR_REV: '电机反转',
  CYL_SEND_A: 'A 送药缸',
  CYL_SEND_B: 'B 送药缸',
  CYL_SEND_C: 'C 送药缸',
  CYL_SEND_D: 'D 送药缸',
  CYL_TILT: '翻转缸',
  LAMP_GREEN: '绿灯',
  LAMP_YELLOW: '黄灯',
  LAMP_RED: '红灯',
};

const OUTPUT_GROUPS: Record<OutputKey, IoGroup> = {
  MOTOR_FWD: 'motor', MOTOR_REV: 'motor',
  CYL_SEND_A: 'cylinder', CYL_SEND_B: 'cylinder',
  CYL_SEND_C: 'cylinder', CYL_SEND_D: 'cylinder',
  CYL_TILT: 'tilt',
  LAMP_GREEN: 'lamp', LAMP_YELLOW: 'lamp', LAMP_RED: 'lamp',
};

/** 输入点顺序 = 地址表顺序：主令 → 限位 → 空仓 → 取药仓 → 磁性开关（位置寄存器不占输入点） */
const INPUT_KEYS = Object.keys(MITSUBISHI_READ_VARS) as readonly InputKey[];

const INPUT_LABELS: Record<InputKey, string> = {
  BUTTON_START: '启动', BUTTON_STOP: '停止', BUTTON_RESET: '复位',
  BUTTON_ESTOP: '急停', BUTTON_CONFIRM: '确认',
  S_LIMIT_START: '原点', S_LIMIT_END: '终点',
  S_MAG_A_EMPTY: 'A 空仓', S_MAG_B_EMPTY: 'B 空仓',
  S_MAG_C_EMPTY: 'C 空仓', S_MAG_D_EMPTY: 'D 空仓',
  S_BIN_HAS_DRUG: '仓有药',
  MSC_A_BACK: 'A 缸后', MSC_A_FRONT: 'A 缸前',
  MSC_B_BACK: 'B 缸后', MSC_B_FRONT: 'B 缸前',
  MSC_C_BACK: 'C 缸后', MSC_C_FRONT: 'C 缸前',
  MSC_D_BACK: 'D 缸后', MSC_D_FRONT: 'D 缸前',
  MSC_TILT_HOLD: '盛药位', MSC_TILT_DUMP: '翻转位',
};

function inputGroup(key: InputKey): IoGroup {
  if (key.startsWith('BUTTON_')) return 'button';
  if (key.startsWith('S_LIMIT_')) return 'limit';
  if (key.startsWith('S_MAG_')) return 'magazine';
  if (key === 'S_BIN_HAS_DRUG') return 'bin';
  return 'reed';
}

function makePoint(
  key: string, label: string, addr: string, coil: number, group: IoGroup,
): IoPoint {
  return { key, label, addr, coil: `C${coil}`, group };
}

/** 可写输出点：面板每个按键都对应这里的一项 */
export const MANUAL_OUTPUT_POINTS: readonly IoPoint[] = OUTPUT_KEYS.map((key) =>
  makePoint(
    key,
    OUTPUT_LABELS[key],
    MITSUBISHI_WRITE_VARS[key],
    MODBUS_READ_VARS[key],
    OUTPUT_GROUPS[key],
  ),
);

/** 只读输入点：传感器 / 主令（32 位 DINT 位置寄存器不占输入点） */
export const MANUAL_INPUT_POINTS: readonly IoPoint[] = INPUT_KEYS.map((key) =>
  makePoint(
    key,
    INPUT_LABELS[key],
    MITSUBISHI_READ_VARS[key],
    MODBUS_READ_VARS[key],
    inputGroup(key),
  ),
);

export const MANUAL_IO_SUMMARY = {
  outputs: MANUAL_OUTPUT_POINTS.length,
  inputs: MANUAL_INPUT_POINTS.length,
} as const;

/** 面板分组标题：输入点按组给出短标题，避免点位连成一片分不清 */
export const IO_GROUP_TITLES: Record<IoGroup, string> = {
  motor: '电机',
  cylinder: '送药缸',
  tilt: '翻转缸',
  lamp: '灯塔',
  button: '主令按钮',
  limit: '限位',
  magazine: '空仓',
  bin: '取药仓',
  reed: '磁性开关',
};

/** 位置寄存器：单独一行数值显示，不属于任何输入点分组 */
export const ENCODER_REGISTER_INFO = {
  key: 'ENCODER_PULSES',
  label: '位置寄存器',
  type: ENCODER_DINT.TYPE,
  address: ENCODER_REG_LABEL,
  modbus: ENCODER_DINT.MODBUS_LABEL,
  s7: ENCODER_DINT.S7_LABEL,
  mitsubishi: ENCODER_DINT.MITSUBISHI_LABEL,
} as const;

/** 位置寄存器三协议地址：只在悬停浮框里出现，面板不直接铺开 */
export const DINT_ADDRESS_ROWS = [
  { addr: ENCODER_REGISTER_INFO.modbus, label: 'Modbus 保持寄存器' },
  { addr: ENCODER_REGISTER_INFO.s7, label: 'S7 M 区 DINT' },
  { addr: ENCODER_REGISTER_INFO.mitsubishi, label: '三菱 D 寄存器' },
] as const;

// ============================================================
// 电平读取（纯函数，便于单测与 CDP 断言，不依赖 React / zustand）
// ============================================================

export interface InputSnapshot {
  buttons: Record<'start' | 'stop' | 'reset' | 'estop' | 'confirm', boolean>;
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
  encoderPulses: number;
}

export interface OutputSnapshot {
  motorFwd: boolean;
  motorRev: boolean;
  sendCyl: Record<MagazineId, { extended: boolean; position: number }>;
  tiltCyl: { tilted: boolean; angle: number };
  lamp: { green: boolean; yellow: boolean; red: boolean };
}

const BUTTON_FIELD = {
  BUTTON_START: 'start', BUTTON_STOP: 'stop', BUTTON_RESET: 'reset',
  BUTTON_ESTOP: 'estop', BUTTON_CONFIRM: 'confirm',
} as const;

/** 读一个输入点的实时电平；寄存器数值不参与位电平，由面板单独显示 */
export function inputPointLevel(key: string, s: InputSnapshot): boolean {
  if (key in BUTTON_FIELD) {
    return !!s.buttons[BUTTON_FIELD[key as keyof typeof BUTTON_FIELD]];
  }
  switch (key) {
    case 'S_LIMIT_START': return s.sensors.limitStart;
    case 'S_LIMIT_END': return s.sensors.limitEnd;
    case 'S_BIN_HAS_DRUG': return s.sensors.binHasDrug;
    case 'MSC_TILT_HOLD': return s.sensors.mscTiltHold;
    case 'MSC_TILT_DUMP': return s.sensors.mscTiltDump;
    default: break;
  }
  if (key.startsWith('S_MAG_')) {
    return s.sensors.magEmpty[key[6] as MagazineId];
  }
  if (key.startsWith('MSC_')) {
    const mag = key[4] as MagazineId;
    return key.endsWith('_BACK') ? s.sensors.mscBack[mag] : s.sensors.mscFront[mag];
  }
  return false;
}

/** 读一个输出点的实时电平（用于按钮高亮与输出监视 LED） */
export function outputPointLevel(key: string, s: OutputSnapshot): boolean {
  switch (key) {
    case 'MOTOR_FWD': return s.motorFwd;
    case 'MOTOR_REV': return s.motorRev;
    case 'CYL_TILT': return s.tiltCyl.tilted;
    case 'LAMP_GREEN': return s.lamp.green;
    case 'LAMP_YELLOW': return s.lamp.yellow;
    case 'LAMP_RED': return s.lamp.red;
    default: break;
  }
  if (key.startsWith('CYL_SEND_')) {
    return s.sendCyl[key[9] as MagazineId].extended;
  }
  return false;
}

