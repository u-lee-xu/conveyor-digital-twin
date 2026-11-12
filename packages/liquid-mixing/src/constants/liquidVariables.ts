/**
 * 液体混装场景变量 / 信号表 —— **单一来源**。
 * 面板地址表、连接帧、300ms 轮询、传感器回写、静态自检全部读这一份，不另抄。
 *
 * 通道划分（项目红线）：
 *  - 设备 → 控制器（输入）：四罐 32 位 REAL 模拟量液位 + 14 路开关量反馈 + 阶段/报警/轮次/配比字；
 *  - 控制器 → 设备（输出）：进料阀 A/B、搅拌正转/反转、出料阀、急停、复位（线圈）+ 配方/动作/时长字；
 *  - 数值量单列：REAL 占两个保持寄存器（低字在前），离散量单字 uint16。
 *
 * 现场总线只保留变量 / 信号映射语义，不实现任何底层链路。
 */
import { LIQUID_REAL32_WORD_ORDER } from './real32';
import type { LiquidSensors } from './liquidConstants';

/**
 * 网关 connect 帧下发的字变量表。
 * 四个 REAL 液位用 `dint32` 双字通道**位模式透传**（见 real32.ts 说明）：
 * 学生 PLC 侧按 IEEE754 REAL 解释 HR300/301 等连续两寄存器即可。
 * `wordOrder` 与网关一致为 low-first，由 real32.ts 单一常量锁死。
 */
export const LIQUID_WORD_VARIABLES = {
  // 设备 → PLC：32 位 REAL 模拟量液位，各占两字
  LIQUID_LEVEL_A: { type: 'dint32', wordOrder: LIQUID_REAL32_WORD_ORDER, modbus: { address: 300, words: 2 }, s7: { address: 'MD400', words: 2 }, mitsubishi: { address: 'D400', words: 2 } },
  LIQUID_LEVEL_B: { type: 'dint32', wordOrder: LIQUID_REAL32_WORD_ORDER, modbus: { address: 302, words: 2 }, s7: { address: 'MD404', words: 2 }, mitsubishi: { address: 'D402', words: 2 } },
  LIQUID_LEVEL_MIX: { type: 'dint32', wordOrder: LIQUID_REAL32_WORD_ORDER, modbus: { address: 304, words: 2 }, s7: { address: 'MD408', words: 2 }, mitsubishi: { address: 'D404', words: 2 } },
  LIQUID_LEVEL_PRODUCT: { type: 'dint32', wordOrder: LIQUID_REAL32_WORD_ORDER, modbus: { address: 306, words: 2 }, s7: { address: 'MD412', words: 2 }, mitsubishi: { address: 'D406', words: 2 } },
  // 设备 → PLC：阶段 / 报警 / 轮次 / 配比 / 开关量掩码（单字 uint16）
  LIQUID_PHASE_W: { type: 'uint16', modbus: { address: 308, words: 1 }, s7: { address: 'MW1100', words: 1 }, mitsubishi: { address: 'D408', words: 1 } },
  LIQUID_ALARM_W: { type: 'uint16', modbus: { address: 309, words: 1 }, s7: { address: 'MW1102', words: 1 }, mitsubishi: { address: 'D409', words: 1 } },
  LIQUID_ROUND_W: { type: 'uint16', modbus: { address: 310, words: 1 }, s7: { address: 'MW1104', words: 1 }, mitsubishi: { address: 'D410', words: 1 } },
  LIQUID_RATIO_A: { type: 'uint16', modbus: { address: 316, words: 1 }, s7: { address: 'MW1116', words: 1 }, mitsubishi: { address: 'D416', words: 1 } },
  LIQUID_SENSOR_MASK: { type: 'uint16', modbus: { address: 317, words: 1 }, s7: { address: 'MW1118', words: 1 }, mitsubishi: { address: 'D417', words: 1 } },
  // PLC → 设备：显式动作序号 / 配方 / 搅拌时长（单位：0.1 L 与 0.1 s 的 uint16）
  LIQUID_ACTION_W: { type: 'uint16', modbus: { address: 311, words: 1 }, s7: { address: 'MW1106', words: 1 }, mitsubishi: { address: 'D411', words: 1 } },
  LIQUID_RECIPE_A: { type: 'uint16', modbus: { address: 312, words: 1 }, s7: { address: 'MW1108', words: 1 }, mitsubishi: { address: 'D412', words: 1 } },
  LIQUID_RECIPE_B: { type: 'uint16', modbus: { address: 313, words: 1 }, s7: { address: 'MW1110', words: 1 }, mitsubishi: { address: 'D413', words: 1 } },
  LIQUID_STIR_FWD_W: { type: 'uint16', modbus: { address: 314, words: 1 }, s7: { address: 'MW1112', words: 1 }, mitsubishi: { address: 'D414', words: 1 } },
  LIQUID_STIR_REV_W: { type: 'uint16', modbus: { address: 315, words: 1 }, s7: { address: 'MW1114', words: 1 }, mitsubishi: { address: 'D415', words: 1 } },
} as const;

export const LIQUID_REAL_NAMES = [
  'LIQUID_LEVEL_A', 'LIQUID_LEVEL_B', 'LIQUID_LEVEL_MIX', 'LIQUID_LEVEL_PRODUCT',
] as const;
export type LiquidRealName = (typeof LIQUID_REAL_NAMES)[number];

/** 设备 → PLC 的单字上报项（写入 PLC 输入区，绝不与 PLC 下发项混写） */
export const LIQUID_REPORT_WORD_NAMES = [
  'LIQUID_PHASE_W', 'LIQUID_ALARM_W', 'LIQUID_ROUND_W', 'LIQUID_RATIO_A', 'LIQUID_SENSOR_MASK',
] as const;

/** PLC → 设备 的单字下发项（轮询读回，不回写） */
export const LIQUID_COMMAND_WORD_NAMES = [
  'LIQUID_ACTION_W', 'LIQUID_RECIPE_A', 'LIQUID_RECIPE_B', 'LIQUID_STIR_FWD_W', 'LIQUID_STIR_REV_W',
] as const;

export const LIQUID_WORD_NAMES = Object.keys(LIQUID_WORD_VARIABLES);

/** Modbus 线圈：40~46 为 PLC 输出，50~63 为设备输入反馈 */
export const LIQUID_COILS = {
  // PLC → 设备
  LIQUID_VALVE_A: 40,
  LIQUID_VALVE_B: 41,
  LIQUID_STIR_FWD: 42,
  LIQUID_STIR_REV: 43,
  LIQUID_DISCHARGE: 44,
  LIQUID_ESTOP: 45,
  LIQUID_RESET: 46,
  // 设备 → PLC
  LIQUID_SENSOR_A_HIGH: 50,
  LIQUID_SENSOR_A_LOW: 51,
  LIQUID_SENSOR_B_HIGH: 52,
  LIQUID_SENSOR_B_LOW: 53,
  LIQUID_SENSOR_MIX_HIGH: 54,
  LIQUID_SENSOR_MIX_LOW: 55,
  LIQUID_SENSOR_PRODUCT_HIGH: 56,
  LIQUID_SENSOR_PRODUCT_LOW: 57,
  LIQUID_STIR_RUNNING: 58,
  LIQUID_STIR_FORWARD: 59,
  LIQUID_STIR_REVERSE: 60,
  LIQUID_VALVE_A_OPEN: 61,
  LIQUID_VALVE_B_OPEN: 62,
  LIQUID_DISCHARGE_OPEN: 63,
} as const;

/** PLC 输出的线圈变量名（readVars 用，S7 / 三菱按名字读） */
export const LIQUID_OUTPUT_COIL_NAMES = [
  'LIQUID_VALVE_A', 'LIQUID_VALVE_B', 'LIQUID_STIR_FWD', 'LIQUID_STIR_REV',
  'LIQUID_DISCHARGE', 'LIQUID_ESTOP', 'LIQUID_RESET',
] as const;
export type LiquidOutputCoilName = (typeof LIQUID_OUTPUT_COIL_NAMES)[number];

/**
 * 14 路开关量反馈（设备 → PLC）：四罐上下限液位 + 搅拌运行/方向 + 三阀到位。
 * 顺序与 LIQUID_COILS 的 C50~C63、地址表、liquidSensorBits() 一一对应。
 */
export const LIQUID_SENSOR_FEEDBACK = [
  { key: 'LIQUID_SENSOR_A_HIGH', signal: 'A 罐上限', modbus: 50, s7: 'M150.0', mitsubishi: 'X40' },
  { key: 'LIQUID_SENSOR_A_LOW', signal: 'A 罐下限', modbus: 51, s7: 'M150.1', mitsubishi: 'X41' },
  { key: 'LIQUID_SENSOR_B_HIGH', signal: 'B 罐上限', modbus: 52, s7: 'M150.2', mitsubishi: 'X42' },
  { key: 'LIQUID_SENSOR_B_LOW', signal: 'B 罐下限', modbus: 53, s7: 'M150.3', mitsubishi: 'X43' },
  { key: 'LIQUID_SENSOR_MIX_HIGH', signal: '混合罐上限', modbus: 54, s7: 'M150.4', mitsubishi: 'X44' },
  { key: 'LIQUID_SENSOR_MIX_LOW', signal: '混合罐下限', modbus: 55, s7: 'M150.5', mitsubishi: 'X45' },
  { key: 'LIQUID_SENSOR_PRODUCT_HIGH', signal: '成品罐上限', modbus: 56, s7: 'M150.6', mitsubishi: 'X46' },
  { key: 'LIQUID_SENSOR_PRODUCT_LOW', signal: '成品罐下限', modbus: 57, s7: 'M150.7', mitsubishi: 'X47' },
  { key: 'LIQUID_STIR_RUNNING', signal: '搅拌运行', modbus: 58, s7: 'M151.0', mitsubishi: 'X50' },
  { key: 'LIQUID_STIR_FORWARD', signal: '搅拌正转', modbus: 59, s7: 'M151.1', mitsubishi: 'X51' },
  { key: 'LIQUID_STIR_REVERSE', signal: '搅拌反转', modbus: 60, s7: 'M151.2', mitsubishi: 'X52' },
  { key: 'LIQUID_VALVE_A_OPEN', signal: 'A 阀到位', modbus: 61, s7: 'M151.3', mitsubishi: 'X53' },
  { key: 'LIQUID_VALVE_B_OPEN', signal: 'B 阀到位', modbus: 62, s7: 'M151.4', mitsubishi: 'X54' },
  { key: 'LIQUID_DISCHARGE_OPEN', signal: '出料阀到位', modbus: 63, s7: 'M151.5', mitsubishi: 'X55' },
] as const;

export const LIQUID_SENSOR_FEEDBACK_BASE = LIQUID_SENSOR_FEEDBACK[0].modbus;
export const LIQUID_SENSOR_VAR_NAMES: string[] = LIQUID_SENSOR_FEEDBACK.map((r) => r.key);

/** 面板 / 广播 / 回写 / 地址掩码同源：14 位固定顺序 */
export function liquidSensorBits(s: LiquidSensors): boolean[] {
  return [
    s.aHigh, s.aLow, s.bHigh, s.bLow,
    s.mixHigh, s.mixLow, s.productHigh, s.productLow,
    s.stirring, s.forward, s.reverse,
    s.valveAOpen, s.valveBOpen, s.dischargeOpen,
  ];
}

export function liquidSensorMask(s: LiquidSensors): number {
  return liquidSensorBits(s).reduce((acc, on, i) => acc | (on ? 1 << i : 0), 0);
}

/** S7 / 三菱按变量名读写布尔；输出线圈与反馈线圈全部随 connect 帧下发 */
export const LIQUID_BOOL_S7: Record<string, string> = {
  LIQUID_VALVE_A: 'M160.0', LIQUID_VALVE_B: 'M160.1',
  LIQUID_STIR_FWD: 'M160.2', LIQUID_STIR_REV: 'M160.3',
  LIQUID_DISCHARGE: 'M160.4', LIQUID_ESTOP: 'M160.5', LIQUID_RESET: 'M160.6',
  ...Object.fromEntries(LIQUID_SENSOR_FEEDBACK.map((r) => [r.key, r.s7])),
};

export const LIQUID_BOOL_MITSUBISHI: Record<string, string> = {
  LIQUID_VALVE_A: 'Y40', LIQUID_VALVE_B: 'Y41',
  LIQUID_STIR_FWD: 'Y42', LIQUID_STIR_REV: 'Y43',
  LIQUID_DISCHARGE: 'Y44', LIQUID_ESTOP: 'Y45', LIQUID_RESET: 'Y46',
  ...Object.fromEntries(LIQUID_SENSOR_FEEDBACK.map((r) => [r.key, r.mitsubishi])),
};

/** Modbus TCP 按 coils 数字地址读写，不下发布尔表（与龙门 / MD520 同口径） */
export function liquidBoolVarsFor(protocol: string): Record<string, string> | undefined {
  if (!protocol || protocol === 'modbus') return undefined;
  return protocol === 's7' ? LIQUID_BOOL_S7 : LIQUID_BOOL_MITSUBISHI;
}

/**
 * 显式动作字：PLC 用「序号变化」触发动作，浏览器不靠滞后的液位读数猜工艺意图。
 * 短脉冲由边沿记忆锁存，见 useLiquidStore.setPlcFrame。
 */
export const LIQUID_ACTION = {
  NONE: 0,
  LOAD_RECIPE: 1,
  RESET: 2,
  ALARM_RESET: 3,
  ESTOP: 4,
} as const;

/**
 * 单字同时承载「动作类型」与「触发序号」：value = code * 1000 + seq（seq 0~999 循环）。
 * PLC 每次要触发动作就把 seq 加一，浏览器按 seq 变化沿执行 code，
 * 即使 300ms 轮询错过短脉冲电平，只要序号变了也不会漏采。
 */
export function encodeAction(code: number, seq: number): number {
  const c = Math.max(0, Math.min(9, Math.trunc(code)));
  const n = ((Math.trunc(seq) % 1000) + 1000) % 1000;
  return c * 1000 + n;
}
export function decodeAction(value: number): { code: number; seq: number } {
  const v = Number.isFinite(value) ? Math.max(0, Math.trunc(value)) : 0;
  return { code: Math.floor(v / 1000), seq: v % 1000 };
}

/** 配方 / 时长的 PLC 缩放：0.1 L 与 0.1 s，集中一处不散落 */
export const LIQUID_PLC_SCALE = {
  RECIPE: 10,
  DURATION: 10,
  RATIO: 100,
} as const;

export interface LiquidAddressRow {
  signal: string;
  mitsubishi: string;
  modbus: string;
  s7: string;
  direction: string;
  note: string;
}

/** 仿真模式常驻地址表：表头恒「信号 / 三菱 FX / Modbus TCP / Siemens S7」 */
export const LIQUID_ADDRESS_ROWS: readonly LiquidAddressRow[] = [
  { signal: 'A 罐液位 REAL', mitsubishi: 'D400·D401', modbus: 'HR300·301', s7: 'MD400', direction: '设备 → PLC', note: '32 位浮点 L' },
  { signal: 'B 罐液位 REAL', mitsubishi: 'D402·D403', modbus: 'HR302·303', s7: 'MD404', direction: '设备 → PLC', note: '32 位浮点 L' },
  { signal: '混合罐液位 REAL', mitsubishi: 'D404·D405', modbus: 'HR304·305', s7: 'MD408', direction: '设备 → PLC', note: '32 位浮点 L' },
  { signal: '成品罐液位 REAL', mitsubishi: 'D406·D407', modbus: 'HR306·307', s7: 'MD412', direction: '设备 → PLC', note: '32 位浮点 L' },
  { signal: '工艺阶段', mitsubishi: 'D408', modbus: 'HR308', s7: 'MW1100', direction: '设备 → PLC', note: '0~6' },
  { signal: '报警字', mitsubishi: 'D409', modbus: 'HR309', s7: 'MW1102', direction: '设备 → PLC', note: '按位' },
  { signal: '循环轮次', mitsubishi: 'D410', modbus: 'HR310', s7: 'MW1104', direction: '设备 → PLC', note: '计数' },
  { signal: 'A 液配比', mitsubishi: 'D416', modbus: 'HR316', s7: 'MW1116', direction: '设备 → PLC', note: '0~100' },
  { signal: '开关量掩码', mitsubishi: 'D417', modbus: 'HR317', s7: 'MW1118', direction: '设备 → PLC', note: '14 位' },
  { signal: '显式动作字', mitsubishi: 'D411', modbus: 'HR311', s7: 'MW1106', direction: 'PLC → 设备', note: '序号变化触发' },
  { signal: 'A 目标量', mitsubishi: 'D412', modbus: 'HR312', s7: 'MW1108', direction: 'PLC → 设备', note: '0.1 L' },
  { signal: 'B 目标量', mitsubishi: 'D413', modbus: 'HR313', s7: 'MW1110', direction: 'PLC → 设备', note: '0.1 L' },
  { signal: '正转时长', mitsubishi: 'D414', modbus: 'HR314', s7: 'MW1112', direction: 'PLC → 设备', note: '0.1 s' },
  { signal: '反转时长', mitsubishi: 'D415', modbus: 'HR315', s7: 'MW1114', direction: 'PLC → 设备', note: '0.1 s' },
  { signal: 'A 进料阀 / 泵', mitsubishi: 'Y40', modbus: 'C40', s7: 'M160.0', direction: 'PLC → 设备', note: '开关量' },
  { signal: 'B 进料阀 / 泵', mitsubishi: 'Y41', modbus: 'C41', s7: 'M160.1', direction: 'PLC → 设备', note: '开关量' },
  { signal: '搅拌正转', mitsubishi: 'Y42', modbus: 'C42', s7: 'M160.2', direction: 'PLC → 设备', note: '开关量' },
  { signal: '搅拌反转', mitsubishi: 'Y43', modbus: 'C43', s7: 'M160.3', direction: 'PLC → 设备', note: '开关量' },
  { signal: '出料阀', mitsubishi: 'Y44', modbus: 'C44', s7: 'M160.4', direction: 'PLC → 设备', note: '开关量' },
  { signal: '急停 / 复位', mitsubishi: 'Y45·Y46', modbus: 'C45·C46', s7: 'M160.5·M160.6', direction: 'PLC → 设备', note: '开关量' },
  { signal: '四罐上下限液位', mitsubishi: 'X40~X47', modbus: 'C50~C57', s7: 'M150.0~M150.7', direction: '设备 → PLC', note: '8 路开关量' },
  { signal: '搅拌运行与方向', mitsubishi: 'X50~X52', modbus: 'C58~C60', s7: 'M151.0~M151.2', direction: '设备 → PLC', note: '3 路开关量' },
  { signal: '三阀到位反馈', mitsubishi: 'X53~X55', modbus: 'C61~C63', s7: 'M151.3~M151.5', direction: '设备 → PLC', note: '3 路开关量' },
] as const;

/** 教学映射表：只声明变量 / 信号对应关系，不实现任何底层链路 */
export const LIQUID_IO_MAP = [
  { signal: 'LIQUID_LEVEL_A', direction: 'analog → PLC', source: 'A 罐液位变送器' },
  { signal: 'LIQUID_LEVEL_B', direction: 'analog → PLC', source: 'B 罐液位变送器' },
  { signal: 'LIQUID_LEVEL_MIX', direction: 'analog → PLC', source: '混合罐液位变送器' },
  { signal: 'LIQUID_LEVEL_PRODUCT', direction: 'analog → PLC', source: '成品罐液位变送器' },
  { signal: 'LIQUID_SENSOR_FEEDBACK', direction: 'digital → PLC', source: '上下限液位开关与到位开关' },
  { signal: 'LIQUID_VALVE_A / B', direction: 'PLC → actuator', source: '进料球阀与泵' },
  { signal: 'LIQUID_STIR_FWD / REV', direction: 'PLC → actuator', source: '搅拌电机正反转' },
  { signal: 'LIQUID_DISCHARGE', direction: 'PLC → actuator', source: '底部出料阀' },
] as const;
