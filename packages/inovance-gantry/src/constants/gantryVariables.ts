/**
 * 汇川龙门 XY 场景的「position 坐标变量」与外部信号映射（单一来源）。
 *
 * 设计口径（按用户要求）：
 *  - 机构运动只由 position 坐标变量驱动，不实现真实硬件通信；
 *  - PLC 与伺服之间的 ETHERCAT 通信**仅保留为变量 / 信号映射表**，
 *    没有 PDO 报文、没有 EtherCAT 主站、没有底层链路；
 *  - 32 位 DINT 位置低字在前（与配药场景 ENCODER_DINT 口径一致）。
 */

/**
 * 网关 connect 帧下发的 uint16 单字变量表（仿真模式读写 :1509 用）。
 * 教学映射：位置用 0~500mm 的数值，单字即可，与 CONNECT_WORDS 结构兼容。
 */
export const GANTRY_WORD_VARIABLES = {
  GANTRY_X_POS: { type: 'uint16', modbus: { address: 200, words: 1 }, s7: { address: 'MW1000', words: 1 }, mitsubishi: { address: 'D1000', words: 1 } },
  GANTRY_Y_POS: { type: 'uint16', modbus: { address: 202, words: 1 }, s7: { address: 'MW1004', words: 1 }, mitsubishi: { address: 'D1002', words: 1 } },
  GANTRY_X_TGT: { type: 'uint16', modbus: { address: 204, words: 1 }, s7: { address: 'MW1008', words: 1 }, mitsubishi: { address: 'D1004', words: 1 } },
  GANTRY_Y_TGT: { type: 'uint16', modbus: { address: 206, words: 1 }, s7: { address: 'MW1012', words: 1 }, mitsubishi: { address: 'D1006', words: 1 } },
  GANTRY_Z_POS: { type: 'uint16', modbus: { address: 208, words: 1 }, s7: { address: 'MW1016', words: 1 }, mitsubishi: { address: 'D1008', words: 1 } },
  GANTRY_PHASE_W: { type: 'uint16', modbus: { address: 209, words: 1 }, s7: { address: 'MW1018', words: 1 }, mitsubishi: { address: 'D1009', words: 1 } },
  GANTRY_HELD_W: { type: 'uint16', modbus: { address: 210, words: 1 }, s7: { address: 'MW1020', words: 1 }, mitsubishi: { address: 'D1010', words: 1 } },
} as const;

/** Modbus TCP 保持寄存器：X/Y 实际位置与目标位置（DINT 各占两字，低字在前） */
export const GANTRY_HOLDING_REGISTERS = {
  GANTRY_X_POS_L: 200,
  GANTRY_X_POS_H: 201,
  GANTRY_Y_POS_L: 202,
  GANTRY_Y_POS_H: 203,
  GANTRY_X_TGT_L: 204,
  GANTRY_X_TGT_H: 205,
  GANTRY_Y_TGT_L: 206,
  GANTRY_Y_TGT_H: 207,
  GANTRY_Z_POS: 208,
  GANTRY_PHASE: 209,
  GANTRY_HELD_PIECE: 210,
} as const;

/** Modbus TCP 线圈：伺服、气缸、吸盘与流程信号 */
export const GANTRY_COILS = {
  GANTRY_X_ENABLE: 20,
  GANTRY_Y_ENABLE: 21,
  GANTRY_X_IN_POS: 22,
  GANTRY_Y_IN_POS: 23,
  GANTRY_CYL_DOWN: 24,
  GANTRY_VACUUM: 25,
  GANTRY_HAS_PART: 26,
  GANTRY_START: 27,
  GANTRY_ESTOP: 28,
  /** 只读输入：Y 模组 1 原点 + 2 终端限位 */
  GANTRY_SENSOR_ORIGIN: 29,
  GANTRY_SENSOR_END_MINUS: 30,
  GANTRY_SENSOR_END_PLUS: 31,
  /** 只读输入：X 模组 1 原点 + 2 终端限位 */
  GANTRY_SENSOR_X_ORIGIN: 32,
  GANTRY_SENSOR_X_END_MINUS: 33,
  GANTRY_SENSOR_X_END_PLUS: 34,
  /** 仿真模式主令（自复位输入） */
  GANTRY_STOP: 35,
  GANTRY_RESET: 36,
  GANTRY_CONFIRM: 37,
} as const;

/** 状态机步号，写进 GANTRY_PHASE 供 PLC / 面板读取 */
export const GANTRY_PHASE = {
  IDLE: 0,
  MOVE_TO_PICK: 1,
  Z_DOWN_PICK: 2,
  VACUUM_ON: 3,
  Z_UP_PICK: 4,
  MOVE_TO_PLACE: 5,
  Z_DOWN_PLACE: 6,
  VACUUM_OFF: 7,
  Z_UP_PLACE: 8,
  DONE: 9,
} as const;

export type GantryPhase = (typeof GANTRY_PHASE)[keyof typeof GANTRY_PHASE];

/**
 * EtherCAT 变量 / 信号映射（仅声明，不实现链路）。
 * 供教学说明「真实设备上这些 PDO 对应到哪些 position 变量」，
 * 代码里没有任何Socket/主站/报文处理。
 */
export const ETHERCAT_PDO_MAP = [
  { pdo: 'X_Axis.ActualPosition', signal: 'GANTRY_X_POS_DINT', direction: 'servo → PLC' },
  { pdo: 'Y_Axis.ActualPosition', signal: 'GANTRY_Y_POS_DINT', direction: 'servo → PLC' },
  { pdo: 'X_Axis.TargetPosition', signal: 'GANTRY_X_TGT_DINT', direction: 'PLC → servo' },
  { pdo: 'Y_Axis.TargetPosition', signal: 'GANTRY_Y_TGT_DINT', direction: 'PLC → servo' },
  { pdo: 'X_Axis.ServoEnable', signal: 'GANTRY_X_ENABLE', direction: 'PLC → servo' },
  { pdo: 'Y_Axis.ServoEnable', signal: 'GANTRY_Y_ENABLE', direction: 'PLC → servo' },
  { pdo: 'X_Axis.InPosition', signal: 'GANTRY_X_IN_POS', direction: 'servo → PLC' },
  { pdo: 'Y_Axis.InPosition', signal: 'GANTRY_Y_IN_POS', direction: 'servo → PLC' },
  { pdo: 'Z_Cylinder.Down', signal: 'GANTRY_CYL_DOWN', direction: 'PLC → valve' },
  { pdo: 'Vacuum.On', signal: 'GANTRY_VACUUM', direction: 'PLC → valve' },
  { pdo: 'Vacuum.HasPart', signal: 'GANTRY_HAS_PART', direction: 'sensor → PLC' },
  { pdo: 'Y_Axis.OriginSensor', signal: 'GANTRY_SENSOR_ORIGIN', direction: 'sensor → PLC' },
  { pdo: 'Y_Axis.NegativeLimit', signal: 'GANTRY_SENSOR_END_MINUS', direction: 'sensor → PLC' },
  { pdo: 'Y_Axis.PositiveLimit', signal: 'GANTRY_SENSOR_END_PLUS', direction: 'sensor → PLC' },
  { pdo: 'X_Axis.OriginSensor', signal: 'GANTRY_SENSOR_X_ORIGIN', direction: 'sensor → PLC' },
  { pdo: 'X_Axis.NegativeLimit', signal: 'GANTRY_SENSOR_X_END_MINUS', direction: 'sensor → PLC' },
  { pdo: 'X_Axis.PositiveLimit', signal: 'GANTRY_SENSOR_X_END_PLUS', direction: 'sensor → PLC' },
] as const;

/** DINT 拆字 / 合字（低字在前），与配药场景 encoderDint.ts 同口径 */
export function splitDint(value: number): [number, number] {
  const v = Math.trunc(value) >>> 0;
  return [v & 0xffff, (v >>> 16) & 0xffff];
}
export function joinDint(low: number, high: number): number {
  const v = ((high & 0xffff) << 16) | (low & 0xffff);
  return v > 0x7fffffff ? v - 0x100000000 : v;
}

/**
 * 三协议变量地址对照（仿真模式 UI 常驻显示，表头与自动配药场景一致：信号 / 三菱 FX / Modbus TCP / Siemens S7）。
 * 三菱列为仿真档地址；实体 FX3U/FX5U 走 M 区（同点位表口径），教学映射，现场地址待确认。
 */
export interface GantryAddressRow {
  signal: string;
  mitsubishi: string;
  modbus: string;
  s7: string;
  direction: string;
  pdo: string;
}

export const GANTRY_ADDRESS_ROWS: readonly GantryAddressRow[] = [
  { signal: 'X 实际位置', mitsubishi: 'D1000', modbus: 'HR200', s7: 'MW1000', direction: '设备 → PLC', pdo: 'X_Axis.ActualPosition' },
  { signal: 'Y 实际位置', mitsubishi: 'D1002', modbus: 'HR202', s7: 'MW1004', direction: '设备 → PLC', pdo: 'Y_Axis.ActualPosition' },
  { signal: 'X 目标位置', mitsubishi: 'D1004', modbus: 'HR204', s7: 'MW1008', direction: 'PLC → 设备', pdo: 'X_Axis.TargetPosition' },
  { signal: 'Y 目标位置', mitsubishi: 'D1006', modbus: 'HR206', s7: 'MW1012', direction: 'PLC → 设备', pdo: 'Y_Axis.TargetPosition' },
  { signal: 'Z 位置', mitsubishi: 'D1008', modbus: 'HR208', s7: 'MW1016', direction: '设备 → PLC', pdo: 'Z_Cylinder.Position' },
  { signal: '流程阶段', mitsubishi: 'D1009', modbus: 'HR209', s7: 'MW1018', direction: '设备 → PLC', pdo: 'Gantry.Phase' },
  { signal: 'X 伺服使能', mitsubishi: 'Y0', modbus: 'C20', s7: 'M130.0', direction: 'PLC → 设备', pdo: 'X_Axis.ServoEnable' },
  { signal: 'Y 伺服使能', mitsubishi: 'Y1', modbus: 'C21', s7: 'M130.1', direction: 'PLC → 设备', pdo: 'Y_Axis.ServoEnable' },
  { signal: '气缸下降', mitsubishi: 'Y4', modbus: 'C24', s7: 'M134.0', direction: 'PLC → 设备', pdo: 'Z_Cylinder.Down' },
  { signal: '真空吸盘', mitsubishi: 'Y5', modbus: 'C25', s7: 'M135.0', direction: 'PLC → 设备', pdo: 'Vacuum.On' },
  { signal: '有料检测', mitsubishi: 'X0', modbus: 'C26', s7: 'M140.0', direction: '设备 → PLC', pdo: 'Vacuum.HasPart' },
  { signal: 'X/Y 原点与限位', mitsubishi: 'X1~X6', modbus: 'C29~C34', s7: 'M140.1~M140.6', direction: '设备 → PLC', pdo: '*_Axis.OriginSensor / *Limit' },
] as const;
