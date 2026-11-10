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
  S7_VARS,
  ENCODER_DINT, ENCODER_REG_LABEL,
  mitsubishiBoolVarsFor,
  type MagazineId, type MitsubishiProfile, type MitsubishiVarName,
} from './constants';
import { currentMitsubishiProfile } from '../../stores/useAppStore';

export type IoGroup =
  | 'motor' | 'cylinder' | 'tilt' | 'lamp' | 'solenoid'
  | 'button' | 'selector' | 'limit' | 'magazine' | 'reed';

export interface IoPoint {
  /** constants.ts 地址表里的键，输出/输入两组共用同一命名 */
  key: string;
  /** 面板上显示的中文简称 */
  label: string;
  /** 三菱 X/Y 地址（八进制），工业现场最直观的一套点位编号 */
  addr: string;
  /** Modbus TCP 线圈号（显示成 C32） */
  coil: string;
  /** 西门子 S7 M 区位地址（显示成 M30.2） */
  s7: string;
  group: IoGroup;
}

/**
 * 悬停浮框里的一行：一个信号在三种协议下的地址。
 * 表头固定「三菱 FX / Modbus TCP / Siemens S7」，面板只消费点位表，
 * 禁止在 JSX 里回填 'Y2' / 'C32' / 'M30.2' 这类地址字面量。
 */
export interface IoAddressRow {
  label: string;
  mitsubishi: string;
  modbus: string;
  s7: string;
}

/**
 * 点位数组 → 浮框行，手动面板的双点行（滑台正/反转、三色灯）也走这里。
 * 三菱列按当前连接目标档位取值：仿真档 X/Y、实体 FX3U/FX5U 档 M 区；
 * Modbus / S7 两列与档位无关。profile 是可选覆盖参数，调用点保持无参。
 */
export function ioAddressRows(points: readonly IoPoint[], profile?: MitsubishiProfile): IoAddressRow[] {
  const m = mitsubishiBoolVarsFor(profile ?? currentMitsubishiProfile());
  return points.map((p) => ({
    label: p.label,
    mitsubishi: m[p.key as MitsubishiVarName],
    modbus: p.coil,
    s7: p.s7,
  }));
}

/**
 * 变量名 → 浮框行。仿真面板的 IO 信号 LED 用：不管当前连的是哪种协议，
 * 悬停都同时给出三协议地址，不再随协议切换只显示一个。
 * 三菱列同样按档位解析器取值，默认读 store 当前档位。
 */
export function pointAddressRow(key: string, label: string, profile?: MitsubishiProfile): IoAddressRow {
  const k = key as keyof typeof MODBUS_READ_VARS;
  const m = mitsubishiBoolVarsFor(profile ?? currentMitsubishiProfile());
  return {
    label,
    mitsubishi: m[k as MitsubishiVarName],
    modbus: `C${MODBUS_READ_VARS[k]}`,
    s7: S7_VARS[k as keyof typeof S7_VARS],
  };
}

type OutputKey = keyof typeof MITSUBISHI_WRITE_VARS;
type InputKey = keyof typeof MITSUBISHI_READ_VARS;

/**
 * 手动面板的 10 个「动作输出点」= 面板操作顺序：电机 → 四仓送药缸 → 翻转缸 → 三色灯。
 * 手动模式是单电控单点操作台（按键 ≡ 直接置位/复位动作线圈），不展示双电控缩回线圈。
 */
const OUTPUT_KEYS: readonly OutputKey[] = [
  'MOTOR_FWD', 'MOTOR_REV',
  'CYL_SEND_A', 'CYL_SEND_B', 'CYL_SEND_C', 'CYL_SEND_D',
  'CYL_TILT',
  'LAMP_GREEN', 'LAMP_YELLOW', 'LAMP_RED',
];

/**
 * 双电控专用的 5 只「缩回 / 回位」线圈。
 * 它们只在仿真面板里出现（可直接置位/复位、LED 回读、地址浮框），
 * 手动面板保持 10 点紧凑布局不变。语义见 solenoid.ts。
 */
const SOLENOID_RETRACT_KEYS: readonly OutputKey[] = [
  'CYL_SEND_A_RETRACT', 'CYL_SEND_B_RETRACT', 'CYL_SEND_C_RETRACT',
  'CYL_SEND_D_RETRACT', 'CYL_TILT_RETRACT',
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
  CYL_SEND_A_RETRACT: 'A 缸缩回',
  CYL_SEND_B_RETRACT: 'B 缸缩回',
  CYL_SEND_C_RETRACT: 'C 缸缩回',
  CYL_SEND_D_RETRACT: 'D 缸缩回',
  CYL_TILT_RETRACT: '翻转回位',
};

const OUTPUT_GROUPS: Record<OutputKey, IoGroup> = {
  MOTOR_FWD: 'motor', MOTOR_REV: 'motor',
  CYL_SEND_A: 'cylinder', CYL_SEND_B: 'cylinder',
  CYL_SEND_C: 'cylinder', CYL_SEND_D: 'cylinder',
  CYL_TILT: 'tilt',
  LAMP_GREEN: 'lamp', LAMP_YELLOW: 'lamp', LAMP_RED: 'lamp',
  CYL_SEND_A_RETRACT: 'solenoid', CYL_SEND_B_RETRACT: 'solenoid',
  CYL_SEND_C_RETRACT: 'solenoid', CYL_SEND_D_RETRACT: 'solenoid',
  CYL_TILT_RETRACT: 'solenoid',
};

/** 输入点顺序 = 地址表顺序：主令 → 限位 → 空仓 → 取药仓 → 磁性开关（位置寄存器不占输入点） */
const INPUT_KEYS = Object.keys(MITSUBISHI_READ_VARS) as readonly InputKey[];

const INPUT_LABELS: Record<InputKey, string> = {
  BUTTON_START: '启动', BUTTON_STOP: '停止', BUTTON_RESET: '复位',
  BUTTON_ESTOP: '急停', BUTTON_CONFIRM: '确认',
  SEL_MANUAL: '手动档', SEL_AUTO: '自动档',
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

/**
 * 输入点分组。面板按「每行 2 个」渲染，因此每组点数必须是偶数，
 * 否则最后一行会只剩一个 LED（用户反馈「翻转位」孤零零一行）。
 * 取药仓只有 1 个点，并入主令组凑成 6 点；磁性开关 10 点天然是 5 对
 * 「A 缸后 / A 缸前 … 盛药位 / 翻转位」，两列后每行正好是一个气缸的两个磁性开关。
 */
function inputGroup(key: InputKey): IoGroup {
  if (key.startsWith('BUTTON_')) return 'button';
  if (key.startsWith('SEL_')) return 'selector';
  if (key === 'S_BIN_HAS_DRUG') return 'button';
  if (key.startsWith('S_LIMIT_')) return 'limit';
  if (key.startsWith('S_MAG_')) return 'magazine';
  return 'reed';
}

function makePoint(
  key: string, label: string, addr: string, coil: number, group: IoGroup,
): IoPoint {
  const k = key as keyof typeof S7_VARS;
  return { key, label, addr, coil: `C${coil}`, s7: S7_VARS[k], group };
}

const outputPoints = (keys: readonly OutputKey[]): readonly IoPoint[] => keys.map((key) =>
  makePoint(
    key,
    OUTPUT_LABELS[key],
    MITSUBISHI_WRITE_VARS[key],
    MODBUS_READ_VARS[key],
    OUTPUT_GROUPS[key],
  ),
);

/** 可写动作输出点（10）：手动/仿真面板每个基础按键都对应这里的一项 */
export const MANUAL_OUTPUT_POINTS: readonly IoPoint[] = outputPoints(OUTPUT_KEYS);

/** 双电控专用缩回 / 回位线圈（5）：只在仿真面板出现，单电控模式下不参与驱动 */
export const SOLENOID_OUTPUT_POINTS: readonly IoPoint[] = outputPoints(SOLENOID_RETRACT_KEYS);

/** 全部可写输出点（15）：仿真面板的输出操作区与 IO LED 用它，顺序 = 动作 10 + 缩回 5 */
export const ALL_OUTPUT_POINTS: readonly IoPoint[] = [
  ...MANUAL_OUTPUT_POINTS,
  ...SOLENOID_OUTPUT_POINTS,
];

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
  /** 手动单点操作台的 10 个动作输出 */
  outputs: MANUAL_OUTPUT_POINTS.length,
  inputs: MANUAL_INPUT_POINTS.length,
  /** 双电控专用缩回线圈 5 个 */
  solenoidOutputs: SOLENOID_OUTPUT_POINTS.length,
  /** 仿真面板可操作的输出点总数（10 + 5） */
  allOutputs: ALL_OUTPUT_POINTS.length,
} as const;

/** 面板分组标题：输入点按组给出短标题，避免点位连成一片分不清 */
export const IO_GROUP_TITLES: Record<IoGroup, string> = {
  motor: '电机',
  cylinder: '送药缸',
  tilt: '翻转缸',
  lamp: '灯塔',
  solenoid: '双电控缩回线圈',
  button: '主令 / 取药仓',
  selector: '手动 / 自动 选择开关',
  limit: '限位',
  magazine: '空仓',
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

/**
 * 位置寄存器三协议地址：只在悬停浮框里出现，面板不直接铺开。
 * 与布尔点位共用 IoAddressRow —— 浮框表头固定「三菱 / Modbus / S7」，
 * 位置脉冲是「一个信号」，三列分别是它的双字地址。
 * 值全部由 ENCODER_DINT 派生，禁止回填 HR120 / MD120 / D120 字面量。
 */
/** 双字标签去掉「 · 」两侧空格，避免浮框列宽装不下 HR120 · HR121 */
const compactDint = (s: string) => s.replace(/\s*·\s*/g, '·');
export const DINT_ADDRESS_ROWS: readonly IoAddressRow[] = [
  {
    label: '位置脉冲',
    mitsubishi: compactDint(ENCODER_DINT.MITSUBISHI_LABEL),
    modbus: compactDint(ENCODER_DINT.MODBUS_LABEL),
    s7: ENCODER_DINT.S7_LABEL,
  },
];

// ============================================================
// 电平读取（纯函数，便于单测与 CDP 断言，不依赖 React / zustand）
// ============================================================

export interface InputSnapshot {
  buttons: Record<'start' | 'stop' | 'reset' | 'estop' | 'confirm', boolean>;
  /** 控制柜两位选择开关：false=手动档、true=自动档（两档互锁） */
  selectorAuto: boolean;
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
    // 两位选择开关的两个输入点互锁：任一时刻只有一个档位为 ON
    case 'SEL_MANUAL': return !s.selectorAuto;
    case 'SEL_AUTO': return s.selectorAuto;
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

/**
 * 读一个输出点的实时电平（用于按钮高亮与输出监视 LED）。
 * 双电控缩回线圈不是「模型姿态」：它是脉冲线圈，电平由 PLC 回读单独显示，
 * 因此这里必须显式返回 false，不能被 `CYL_SEND_` 前缀误判成 A 缸已伸出。
 */
export function outputPointLevel(key: string, s: OutputSnapshot): boolean {
  if (key.endsWith('_RETRACT')) return false;
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

