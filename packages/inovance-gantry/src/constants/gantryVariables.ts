/**
 * 汇川龙门 XY 场景的「position 坐标变量」与外部信号映射（单一来源）。
 *
 * 设计口径（按用户要求）：
 *  - 机构运动只由 position 坐标变量驱动，不实现真实硬件通信；
 *  - PLC 与伺服之间的 ETHERCAT 通信**仅保留为变量 / 信号映射表**，
 *    没有 PDO 报文、没有 EtherCAT 主站、没有底层链路；
 *  - 32 位 DINT 位置低字在前（与配药场景 ENCODER_DINT 口径一致）。
 */

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
