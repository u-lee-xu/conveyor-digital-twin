/**
 * 液体混装场景变量 / 信号表 —— **单一来源**。
 * 面板地址表、连接帧、300ms 轮询、传感器回写、静态自检全部读这一份，不另抄。
 *
 * 通道划分（项目红线）：
 *  - 设备 → 控制器（输入）：四罐 32 位 REAL 模拟量液位 + 8 路液位开关 + 操作站 7 个输入点
 *    + 阶段/轮次/配比/开关量掩码字；
 *  - 控制器 → 设备（输出）：进料阀 A/B、搅拌正转/反转、出料阀、三色灯（线圈）
 *    + 配方/动作/时长字；
 *  - 数值量单列：REAL 占两个保持寄存器（低字在前），离散量单字 uint16。
 *
 * 地址按信号类型分簇（地址分配规范 P1~P6），四簇各自连续、从低地址起、不为避让其它场景后移：
 *   执行器输出 C0~C4 · 三色灯输出 C5~C7 · 操作站输入 C8~C14 · 液位开关输入 C15~C22。
 * 字变量同样按方向分簇：设备 → PLC 的 HR8~HR11，PLC → 设备 的 HR12~HR16。
 * 现场总线只保留变量 / 信号映射语义，不实现任何底层链路。
 */
import { LIQUID_REAL32_WORD_ORDER } from './real32';
import type { LiquidOperatorKey, LiquidSensors } from './liquidConstants';

/**
 * 网关 connect 帧下发的字变量表。
 * 四个 REAL 液位用 `dint32` 双字通道**位模式透传**（见 real32.ts 说明）：
 * 学生 PLC 侧按 IEEE754 REAL 解释 HR0/1 等连续两寄存器即可。
 * `wordOrder` 与网关一致为 low-first，由 real32.ts 单一常量锁死。
 */
export const LIQUID_WORD_VARIABLES = {
  // 设备 → PLC：32 位 REAL 模拟量液位，各占两字
  LIQUID_LEVEL_A: { type: 'dint32', wordOrder: LIQUID_REAL32_WORD_ORDER, modbus: { address: 0, words: 2 }, s7: { address: 'MD0', words: 2 }, mitsubishi: { address: 'D0', words: 2 } },
  LIQUID_LEVEL_B: { type: 'dint32', wordOrder: LIQUID_REAL32_WORD_ORDER, modbus: { address: 2, words: 2 }, s7: { address: 'MD4', words: 2 }, mitsubishi: { address: 'D2', words: 2 } },
  LIQUID_LEVEL_MIX: { type: 'dint32', wordOrder: LIQUID_REAL32_WORD_ORDER, modbus: { address: 4, words: 2 }, s7: { address: 'MD8', words: 2 }, mitsubishi: { address: 'D4', words: 2 } },
  LIQUID_LEVEL_PRODUCT: { type: 'dint32', wordOrder: LIQUID_REAL32_WORD_ORDER, modbus: { address: 6, words: 2 }, s7: { address: 'MD12', words: 2 }, mitsubishi: { address: 'D6', words: 2 } },
  // 设备 → PLC：阶段 / 轮次 / 配比 / 开关量掩码（单字 uint16）
  LIQUID_PHASE_W: { type: 'uint16', modbus: { address: 8, words: 1 }, s7: { address: 'MW16', words: 1 }, mitsubishi: { address: 'D8', words: 1 } },
  LIQUID_ROUND_W: { type: 'uint16', modbus: { address: 9, words: 1 }, s7: { address: 'MW18', words: 1 }, mitsubishi: { address: 'D9', words: 1 } },
  LIQUID_RATIO_A: { type: 'uint16', modbus: { address: 10, words: 1 }, s7: { address: 'MW20', words: 1 }, mitsubishi: { address: 'D10', words: 1 } },
  LIQUID_SENSOR_MASK: { type: 'uint16', modbus: { address: 11, words: 1 }, s7: { address: 'MW22', words: 1 }, mitsubishi: { address: 'D11', words: 1 } },
  // PLC → 设备：显式动作序号 / 配方 / 搅拌时长（单位：0.1 L 与 0.1 s 的 uint16）
  LIQUID_ACTION_W: { type: 'uint16', modbus: { address: 12, words: 1 }, s7: { address: 'MW24', words: 1 }, mitsubishi: { address: 'D12', words: 1 } },
  LIQUID_RECIPE_A: { type: 'uint16', modbus: { address: 13, words: 1 }, s7: { address: 'MW26', words: 1 }, mitsubishi: { address: 'D13', words: 1 } },
  LIQUID_RECIPE_B: { type: 'uint16', modbus: { address: 14, words: 1 }, s7: { address: 'MW28', words: 1 }, mitsubishi: { address: 'D14', words: 1 } },
  LIQUID_STIR_FWD_W: { type: 'uint16', modbus: { address: 15, words: 1 }, s7: { address: 'MW30', words: 1 }, mitsubishi: { address: 'D15', words: 1 } },
  LIQUID_STIR_REV_W: { type: 'uint16', modbus: { address: 16, words: 1 }, s7: { address: 'MW32', words: 1 }, mitsubishi: { address: 'D16', words: 1 } },
} as const;

export const LIQUID_REAL_NAMES = [
  'LIQUID_LEVEL_A', 'LIQUID_LEVEL_B', 'LIQUID_LEVEL_MIX', 'LIQUID_LEVEL_PRODUCT',
] as const;
export type LiquidRealName = (typeof LIQUID_REAL_NAMES)[number];

/** 设备 → PLC 的单字上报项（写入 PLC 输入区，绝不与 PLC 下发项混写） */
export const LIQUID_REPORT_WORD_NAMES = [
  'LIQUID_PHASE_W', 'LIQUID_ROUND_W', 'LIQUID_RATIO_A', 'LIQUID_SENSOR_MASK',
] as const;

/** PLC → 设备 的单字下发项（轮询读回，不回写） */
export const LIQUID_COMMAND_WORD_NAMES = [
  'LIQUID_ACTION_W', 'LIQUID_RECIPE_A', 'LIQUID_RECIPE_B', 'LIQUID_STIR_FWD_W', 'LIQUID_STIR_REV_W',
] as const;

export const LIQUID_WORD_NAMES = Object.keys(LIQUID_WORD_VARIABLES);

/** Modbus 线圈：0~4 执行器输出、5~7 三色灯输出、8~14 操作站输入、15~22 液位开关输入 */
export const LIQUID_COILS = {
  // PLC → 设备：5 个执行器
  LIQUID_VALVE_A: 0,
  LIQUID_VALVE_B: 1,
  LIQUID_STIR_FWD: 2,
  LIQUID_STIR_REV: 3,
  LIQUID_DISCHARGE: 4,
  // PLC → 设备：三色灯塔三个灯罩
  LIQUID_LAMP_GREEN: 5,
  LIQUID_LAMP_YELLOW: 6,
  LIQUID_LAMP_RED: 7,
  // 设备 → PLC：操作站 5 个点动按钮 + 手自动两位选择开关
  LIQUID_OP_START: 8,
  LIQUID_OP_STOP: 9,
  LIQUID_OP_RESET: 10,
  LIQUID_OP_ESTOP: 11,
  LIQUID_OP_MANUAL: 12,
  LIQUID_OP_AUTO: 13,
  LIQUID_OP_RELEASE: 14,
  // 设备 → PLC：8 路液位开关
  LIQUID_SENSOR_A_LOW: 15,
  LIQUID_SENSOR_B_LOW: 16,
  LIQUID_SENSOR_MIX_LOW: 17,
  LIQUID_SENSOR_MIX_MID: 18,
  LIQUID_SENSOR_MIX_HIGH: 19,
  LIQUID_SENSOR_MIX_OVER: 20,
  LIQUID_SENSOR_PRODUCT_LOW: 21,
  LIQUID_SENSOR_PRODUCT_HIGH: 22,
} as const;

export type LiquidCoilName = keyof typeof LIQUID_COILS;

/** PLC 输出的执行器线圈变量名（readVars 用，S7 / 三菱按名字读） */
export const LIQUID_OUTPUT_COIL_NAMES = [
  'LIQUID_VALVE_A', 'LIQUID_VALVE_B', 'LIQUID_STIR_FWD', 'LIQUID_STIR_REV', 'LIQUID_DISCHARGE',
] as const;
export type LiquidOutputCoilName = (typeof LIQUID_OUTPUT_COIL_NAMES)[number];

/**
 * 三色灯三个输出线圈（PLC → 设备，顺序恒 绿 → 黄 → 红）。
 * 紧接执行器占 C5~C7 / Y5~Y7 / M40.5~M40.7，与执行器共用同一次连续读。
 */
export const LIQUID_LAMP_COIL_NAMES = [
  'LIQUID_LAMP_GREEN', 'LIQUID_LAMP_YELLOW', 'LIQUID_LAMP_RED',
] as const;
export type LiquidLampCoilName = (typeof LIQUID_LAMP_COIL_NAMES)[number];

/**
 * 操作站输入点（设备 → PLC，顺序恒 启动 → 停止 → 复位 → 急停 → 手动档 → 自动档 → 放料）。
 * 五个按钮是点动件，手自动两位互锁（必有一真一假）。
 * 柜面按钮、面板操作站区块、地址浮框、地址表全部读这一张表，顺序不可能再漂移。
 */
export const LIQUID_OPERATOR_COIL_NAMES = {
  start: 'LIQUID_OP_START',
  stop: 'LIQUID_OP_STOP',
  reset: 'LIQUID_OP_RESET',
  estop: 'LIQUID_OP_ESTOP',
  manual: 'LIQUID_OP_MANUAL',
  auto: 'LIQUID_OP_AUTO',
  release: 'LIQUID_OP_RELEASE',
} as const satisfies Record<LiquidOperatorKey | 'manual' | 'auto', LiquidCoilName>;

export type LiquidOperatorCoilName = (typeof LIQUID_OPERATOR_COIL_NAMES)[keyof typeof LIQUID_OPERATOR_COIL_NAMES];

/** 5 个点动按钮的输入线圈名（不含选择开关两档） */
export const LIQUID_OPERATOR_BUTTON_COILS: readonly LiquidOperatorCoilName[] = [
  LIQUID_OPERATOR_COIL_NAMES.start,
  LIQUID_OPERATOR_COIL_NAMES.stop,
  LIQUID_OPERATOR_COIL_NAMES.reset,
  LIQUID_OPERATOR_COIL_NAMES.estop,
  LIQUID_OPERATOR_COIL_NAMES.release,
];

/** 一帧写两路互锁输入：手自动档位切换的唯一入口 */
export function liquidSelectorBits(mode: 'manual' | 'auto'): { names: LiquidOperatorCoilName[]; values: boolean[] } {
  return {
    names: [LIQUID_OPERATOR_COIL_NAMES.manual, LIQUID_OPERATOR_COIL_NAMES.auto],
    values: [mode === 'manual', mode === 'auto'],
  };
}

/**
 * 8 路液位开关反馈（设备 → PLC）：A/B 下限 + 混合罐四档 + 成品罐上下限。
 * `sensor` 直接指向 LiquidSensors 字段，liquidSensorBits() 按本表取位，
 * 面板顺序、回写线圈、位掩码三者不可能再漂移。
 * 搅拌运行与阀门到位不是传感器（用户 11-16 明确剔除），本表只有 8 行。
 */
export const LIQUID_SENSOR_FEEDBACK = [
  { key: 'LIQUID_SENSOR_A_LOW', sensor: 'aLow', signal: 'A 罐下限', modbus: 15, s7: 'M42.0', mitsubishi: 'X7' },
  { key: 'LIQUID_SENSOR_B_LOW', sensor: 'bLow', signal: 'B 罐下限', modbus: 16, s7: 'M42.1', mitsubishi: 'X10' },
  { key: 'LIQUID_SENSOR_MIX_LOW', sensor: 'mixLow', signal: '混合罐下限', modbus: 17, s7: 'M42.2', mitsubishi: 'X11' },
  { key: 'LIQUID_SENSOR_MIX_MID', sensor: 'mixMid', signal: '混合罐中液位', modbus: 18, s7: 'M42.3', mitsubishi: 'X12' },
  { key: 'LIQUID_SENSOR_MIX_HIGH', sensor: 'mixHigh', signal: '混合罐高液位', modbus: 19, s7: 'M42.4', mitsubishi: 'X13' },
  { key: 'LIQUID_SENSOR_MIX_OVER', sensor: 'mixOver', signal: '混合罐上极限', modbus: 20, s7: 'M42.5', mitsubishi: 'X14' },
  { key: 'LIQUID_SENSOR_PRODUCT_LOW', sensor: 'productLow', signal: '成品罐下限', modbus: 21, s7: 'M42.6', mitsubishi: 'X15' },
  { key: 'LIQUID_SENSOR_PRODUCT_HIGH', sensor: 'productHigh', signal: '成品罐上限', modbus: 22, s7: 'M42.7', mitsubishi: 'X16' },
] as const;

export const LIQUID_SENSOR_FEEDBACK_BASE = LIQUID_SENSOR_FEEDBACK[0].modbus;
export const LIQUID_SENSOR_VAR_NAMES: string[] = LIQUID_SENSOR_FEEDBACK.map((r) => r.key);

/** 面板 / 广播 / 回写 / 地址掩码同源：按回写表顺序取位，8 位固定 */
export function liquidSensorBits(s: LiquidSensors): boolean[] {
  return LIQUID_SENSOR_FEEDBACK.map((r) => s[r.sensor]);
}

export function liquidSensorMask(s: LiquidSensors): number {
  return liquidSensorBits(s).reduce((acc, on, i) => acc | (on ? 1 << i : 0), 0);
}

/**
 * S7 / 三菱按变量名读写布尔；输出线圈、三色灯、操作站输入与反馈线圈全部随 connect 帧下发。
 * S7 按字节分簇：M40 = 输出 + 灯，M41 = 操作站，M42 = 液位开关。
 */
export const LIQUID_BOOL_S7: Record<string, string> = {
  LIQUID_VALVE_A: 'M40.0', LIQUID_VALVE_B: 'M40.1',
  LIQUID_STIR_FWD: 'M40.2', LIQUID_STIR_REV: 'M40.3',
  LIQUID_DISCHARGE: 'M40.4',
  LIQUID_LAMP_GREEN: 'M40.5', LIQUID_LAMP_YELLOW: 'M40.6', LIQUID_LAMP_RED: 'M40.7',
  LIQUID_OP_START: 'M41.0', LIQUID_OP_STOP: 'M41.1', LIQUID_OP_RESET: 'M41.2',
  LIQUID_OP_ESTOP: 'M41.3', LIQUID_OP_MANUAL: 'M41.4', LIQUID_OP_AUTO: 'M41.5',
  LIQUID_OP_RELEASE: 'M41.6',
  ...Object.fromEntries(LIQUID_SENSOR_FEEDBACK.map((r) => [r.key, r.s7])),
};

export const LIQUID_BOOL_MITSUBISHI: Record<string, string> = {
  LIQUID_VALVE_A: 'Y0', LIQUID_VALVE_B: 'Y1',
  LIQUID_STIR_FWD: 'Y2', LIQUID_STIR_REV: 'Y3',
  LIQUID_DISCHARGE: 'Y4',
  LIQUID_LAMP_GREEN: 'Y5', LIQUID_LAMP_YELLOW: 'Y6', LIQUID_LAMP_RED: 'Y7',
  LIQUID_OP_START: 'X0', LIQUID_OP_STOP: 'X1', LIQUID_OP_RESET: 'X2',
  LIQUID_OP_ESTOP: 'X3', LIQUID_OP_MANUAL: 'X4', LIQUID_OP_AUTO: 'X5',
  LIQUID_OP_RELEASE: 'X6',
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
 * ALARM_RESET 保留为契约码位（清内部联锁与急停），面板上不再有独立报警区块。
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
  { signal: 'A 罐液位 REAL', mitsubishi: 'D0·D1', modbus: 'HR0·1', s7: 'MD0', direction: '设备 → PLC', note: '32 位浮点 L' },
  { signal: 'B 罐液位 REAL', mitsubishi: 'D2·D3', modbus: 'HR2·3', s7: 'MD4', direction: '设备 → PLC', note: '32 位浮点 L' },
  { signal: '混合罐液位 REAL', mitsubishi: 'D4·D5', modbus: 'HR4·5', s7: 'MD8', direction: '设备 → PLC', note: '32 位浮点 L' },
  { signal: '成品罐液位 REAL', mitsubishi: 'D6·D7', modbus: 'HR6·7', s7: 'MD12', direction: '设备 → PLC', note: '32 位浮点 L' },
  { signal: '工艺阶段', mitsubishi: 'D8', modbus: 'HR8', s7: 'MW16', direction: '设备 → PLC', note: '0~6' },
  { signal: '循环轮次', mitsubishi: 'D9', modbus: 'HR9', s7: 'MW18', direction: '设备 → PLC', note: '计数' },
  { signal: 'A 液配比', mitsubishi: 'D10', modbus: 'HR10', s7: 'MW20', direction: '设备 → PLC', note: '0~100' },
  { signal: '开关量掩码', mitsubishi: 'D11', modbus: 'HR11', s7: 'MW22', direction: '设备 → PLC', note: '8 位' },
  { signal: '显式动作字', mitsubishi: 'D12', modbus: 'HR12', s7: 'MW24', direction: 'PLC → 设备', note: '序号变化触发' },
  { signal: 'A 目标量', mitsubishi: 'D13', modbus: 'HR13', s7: 'MW26', direction: 'PLC → 设备', note: '0.1 L' },
  { signal: 'B 目标量', mitsubishi: 'D14', modbus: 'HR14', s7: 'MW28', direction: 'PLC → 设备', note: '0.1 L' },
  { signal: '正转时长', mitsubishi: 'D15', modbus: 'HR15', s7: 'MW30', direction: 'PLC → 设备', note: '0.1 s' },
  { signal: '反转时长', mitsubishi: 'D16', modbus: 'HR16', s7: 'MW32', direction: 'PLC → 设备', note: '0.1 s' },
  { signal: 'A 进料阀 / 泵', mitsubishi: 'Y0', modbus: 'C0', s7: 'M40.0', direction: 'PLC → 设备', note: '开关量' },
  { signal: 'B 进料阀 / 泵', mitsubishi: 'Y1', modbus: 'C1', s7: 'M40.1', direction: 'PLC → 设备', note: '开关量' },
  { signal: '搅拌正转', mitsubishi: 'Y2', modbus: 'C2', s7: 'M40.2', direction: 'PLC → 设备', note: '开关量' },
  { signal: '搅拌反转', mitsubishi: 'Y3', modbus: 'C3', s7: 'M40.3', direction: 'PLC → 设备', note: '开关量' },
  { signal: '出料阀', mitsubishi: 'Y4', modbus: 'C4', s7: 'M40.4', direction: 'PLC → 设备', note: '开关量' },
  { signal: '三色灯 绿', mitsubishi: 'Y5', modbus: 'C5', s7: 'M40.5', direction: 'PLC → 设备', note: '灯罩 1' },
  { signal: '三色灯 黄', mitsubishi: 'Y6', modbus: 'C6', s7: 'M40.6', direction: 'PLC → 设备', note: '灯罩 2' },
  { signal: '三色灯 红', mitsubishi: 'Y7', modbus: 'C7', s7: 'M40.7', direction: 'PLC → 设备', note: '灯罩 3' },
  { signal: '启动按钮', mitsubishi: 'X0', modbus: 'C8', s7: 'M41.0', direction: '设备 → PLC', note: '点动输入' },
  { signal: '停止按钮', mitsubishi: 'X1', modbus: 'C9', s7: 'M41.1', direction: '设备 → PLC', note: '点动输入' },
  { signal: '复位按钮', mitsubishi: 'X2', modbus: 'C10', s7: 'M41.2', direction: '设备 → PLC', note: '点动输入' },
  { signal: '急停按钮', mitsubishi: 'X3', modbus: 'C11', s7: 'M41.3', direction: '设备 → PLC', note: '点动输入' },
  { signal: '手动档', mitsubishi: 'X4', modbus: 'C12', s7: 'M41.4', direction: '设备 → PLC', note: '选择开关' },
  { signal: '自动档', mitsubishi: 'X5', modbus: 'C13', s7: 'M41.5', direction: '设备 → PLC', note: '选择开关' },
  { signal: '放料按钮', mitsubishi: 'X6', modbus: 'C14', s7: 'M41.6', direction: '设备 → PLC', note: '点动输入' },
  { signal: 'A/B 罐下限', mitsubishi: 'X7·X10', modbus: 'C15~C16', s7: 'M42.0~M42.1', direction: '设备 → PLC', note: '2 路液位开关' },
  { signal: '混合罐四档液位', mitsubishi: 'X11~X14', modbus: 'C17~C20', s7: 'M42.2~M42.5', direction: '设备 → PLC', note: '低 / 中 / 高 / 上极限' },
  { signal: '成品罐上下限', mitsubishi: 'X15~X16', modbus: 'C21~C22', s7: 'M42.6~M42.7', direction: '设备 → PLC', note: '2 路液位开关' },
] as const;

/** 教学映射表：只声明变量 / 信号对应关系，不实现任何底层链路 */
export const LIQUID_IO_MAP = [
  { signal: 'LIQUID_LEVEL_A', direction: 'analog → PLC', source: 'A 罐液位变送器' },
  { signal: 'LIQUID_LEVEL_B', direction: 'analog → PLC', source: 'B 罐液位变送器' },
  { signal: 'LIQUID_LEVEL_MIX', direction: 'analog → PLC', source: '混合罐液位变送器' },
  { signal: 'LIQUID_LEVEL_PRODUCT', direction: 'analog → PLC', source: '成品罐液位变送器' },
  { signal: 'LIQUID_SENSOR_FEEDBACK', direction: 'digital → PLC', source: '8 路液位开关' },
  { signal: 'LIQUID_OP_START / STOP / RESET / ESTOP / RELEASE', direction: 'digital → PLC', source: '操作站按钮箱点动按钮' },
  { signal: 'LIQUID_OP_MANUAL / AUTO', direction: 'digital → PLC', source: '操作站手动 / 自动两位选择开关' },
  { signal: 'LIQUID_VALVE_A / B', direction: 'PLC → actuator', source: '进料球阀与泵' },
  { signal: 'LIQUID_STIR_FWD / REV', direction: 'PLC → actuator', source: '搅拌电机正反转' },
  { signal: 'LIQUID_DISCHARGE', direction: 'PLC → actuator', source: '底部出料阀' },
  { signal: 'LIQUID_LAMP_GREEN / YELLOW / RED', direction: 'PLC → indicator', source: '三色灯塔三个灯罩' },
] as const;

/* ---------------------- 面板变量地址浮框（与自动配药 AddressHint 同一范式） ---------------------- */

/** 浮框一行：一个信号在三种协议下的地址，值一律来自 LIQUID_ADDRESS_ROWS / LIQUID_SENSOR_FEEDBACK */
export interface LiquidHintRow {
  label: string;
  mitsubishi: string;
  modbus: string;
  s7: string;
  /** 方向 / 量纲说明：浮框底部去重后统一显示，不占三协议列 */
  note?: string;
}

/**
 * 面板语义键 → 仿真地址表里的 signal 名。
 * 这里只声明「哪个面板变量查哪一行」，绝不回填 C0 / HR0 / M40.0 之类的地址字面量；
 * 与配药 manualIo.ioAddressRows() 同源范式。注意地址真值分散在本文件五处
 * （LIQUID_WORD_VARIABLES / LIQUID_COILS / LIQUID_SENSOR_FEEDBACK / LIQUID_BOOL_* /
 * LIQUID_ADDRESS_ROWS），改地址必须逐一对齐；五处是否同源由 __liquid_check.test.ts
 * 的「三协议同源」断言锁死，分配规范见 SCENE_DEVELOPMENT.md 第 7 章。
 * 纯本地教学量（混合均匀度、成品组分、阀门状态色）与本地演示主令**不在此表**，
 * 它们不在 PLC 链路上，标地址会误导学生。
 */
export const LIQUID_PANEL_HINT_SIGNALS = {
  levelA: ['A 罐液位 REAL'],
  levelB: ['B 罐液位 REAL'],
  levelMix: ['混合罐液位 REAL'],
  levelProduct: ['成品罐液位 REAL'],
  phase: ['工艺阶段'],
  round: ['循环轮次'],
  sensorMask: ['开关量掩码'],
  actionWord: ['显式动作字'],
  valveA: ['A 进料阀 / 泵'],
  valveB: ['B 进料阀 / 泵'],
  stirForward: ['搅拌正转'],
  stirReverse: ['搅拌反转'],
  discharge: ['出料阀'],
  /** 三色灯三个灯罩各占一个输出线圈，逐灯标注各自地址 */
  lampGreen: ['三色灯 绿'],
  lampYellow: ['三色灯 黄'],
  lampRed: ['三色灯 红'],
  /** 操作站六个操作件：五个点动按钮 + 手自动两位各占一个输入点 */
  opStart: ['启动按钮'],
  opStop: ['停止按钮'],
  opReset: ['复位按钮'],
  opEstop: ['急停按钮'],
  opRelease: ['放料按钮'],
  opManual: ['手动档'],
  opAuto: ['自动档'],
} as const;

export type LiquidPanelHintKey = keyof typeof LIQUID_PANEL_HINT_SIGNALS;

/** 面板语义键 → 地址浮框行；查不到立即报错，避免 UI 出现「有标注却没地址」的死链 */
export function liquidAddressRowsFor(key: LiquidPanelHintKey): LiquidHintRow[] {
  return LIQUID_PANEL_HINT_SIGNALS[key].map((signal) => {
    const row = LIQUID_ADDRESS_ROWS.find((r) => r.signal === signal);
    if (!row) throw new Error(`液体混装地址表缺少信号：${signal}`);
    return {
      label: row.signal,
      mitsubishi: row.mitsubishi,
      modbus: row.modbus,
      s7: row.s7,
      note: `${row.direction} · ${row.note}`,
    };
  });
}

/** 8 路液位开关逐路浮框行：直接取回写表，保证「面板信号名 / 三协议地址 / 回写线圈」同源 */
export function liquidSensorHintRow(key: string): LiquidHintRow[] {
  const row = LIQUID_SENSOR_FEEDBACK.find((r) => r.key === key);
  if (!row) throw new Error(`液体混装开关量表缺少信号：${key}`);
  return [{
    label: row.signal,
    mitsubishi: row.mitsubishi,
    modbus: `C${row.modbus}`,
    s7: row.s7,
    note: '设备 → PLC · 开关量反馈',
  }];
}
