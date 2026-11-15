/**
 * 汇川龙门 XY 场景的「position 坐标变量」与外部信号映射（单一来源）。
 *
 * 设计口径（2026-11-13 审核后统一）：
 *  - 机构运动只由 position 坐标变量驱动，不实现真实硬件通信；
 *  - PLC 与伺服之间的 ETHERCAT 通信**仅保留为变量 / 信号映射表**，
 *    没有 PDO 报文、没有 EtherCAT 主站、没有底层链路；
 *  - **运行时位置一律 uint16 单字**（行程 0~500mm）：`GANTRY_WORD_VARIABLES`
 *    是 connect 帧唯一规格，`GANTRY_ADDRESS_ROWS` 是面板唯一规格，两者同源；
 *  - `GANTRY_HOLDING_REGISTERS` / `splitDint` / `joinDint` 是早期 32 位 DINT 草案，
 *    只作历史溯源与纯函数自检，不参与运行时读写，也不是学生 PLC 编程口径。
 */

/**
 * 网关 connect 帧下发的 **uint16 单字**变量表（仿真模式对接外部 PLC 仿真软件）。
 * 教学映射：位置 0~500mm 单字即可，与面板 GANTRY_ADDRESS_ROWS、CONNECT_WORDS 结构同源。
 * 禁止改回 dint32 双字：会让面板地址表、学生 PLC 程序与帧规格同时错位。
 */
export const GANTRY_WORD_VARIABLES = {
  GANTRY_X_POS: { type: 'uint16', modbus: { address: 0, words: 1 }, s7: { address: 'MW0', words: 1 }, mitsubishi: { address: 'D0', words: 1 } },
  GANTRY_Y_POS: { type: 'uint16', modbus: { address: 2, words: 1 }, s7: { address: 'MW4', words: 1 }, mitsubishi: { address: 'D2', words: 1 } },
  GANTRY_X_TGT: { type: 'uint16', modbus: { address: 4, words: 1 }, s7: { address: 'MW8', words: 1 }, mitsubishi: { address: 'D4', words: 1 } },
  GANTRY_Y_TGT: { type: 'uint16', modbus: { address: 6, words: 1 }, s7: { address: 'MW12', words: 1 }, mitsubishi: { address: 'D6', words: 1 } },
  GANTRY_Z_POS: { type: 'uint16', modbus: { address: 8, words: 1 }, s7: { address: 'MW16', words: 1 }, mitsubishi: { address: 'D8', words: 1 } },
  GANTRY_PHASE_W: { type: 'uint16', modbus: { address: 9, words: 1 }, s7: { address: 'MW18', words: 1 }, mitsubishi: { address: 'D9', words: 1 } },
  GANTRY_HELD_W: { type: 'uint16', modbus: { address: 10, words: 1 }, s7: { address: 'MW20', words: 1 }, mitsubishi: { address: 'D10', words: 1 } },
  /**
   * 吸取 / 放置目标格，编码 row*3+col（0~8）。
   * PLC 程序本来就清楚自己要去哪个格；显式下发后浏览器不必靠「真空变高那一瞬的
   * 吸盘坐标」去猜棋子，即使 300ms 轮询滞后于 100ms PLC 扫描也能吸对、放对。
   */
  GANTRY_PICK_CELL: { type: 'uint16', modbus: { address: 11, words: 1 }, s7: { address: 'MW22', words: 1 }, mitsubishi: { address: 'D11', words: 1 } },
  GANTRY_PLACE_CELL: { type: 'uint16', modbus: { address: 12, words: 1 }, s7: { address: 'MW24', words: 1 }, mitsubishi: { address: 'D12', words: 1 } },
} as const;

/** 历史草案：早期设想的 DINT 双字保持寄存器（X/Y 各占两字）；只作溯源，不参与 connect 帧或面板地址表 */
export const GANTRY_HOLDING_REGISTERS = {
  GANTRY_X_POS_L: 0,
  GANTRY_X_POS_H: 1,
  GANTRY_Y_POS_L: 2,
  GANTRY_Y_POS_H: 3,
  GANTRY_X_TGT_L: 4,
  GANTRY_X_TGT_H: 5,
  GANTRY_Y_TGT_L: 6,
  GANTRY_Y_TGT_H: 7,
  GANTRY_Z_POS: 8,
  GANTRY_PHASE: 9,
  GANTRY_HELD_PIECE: 10,
} as const;

/** Modbus TCP 线圈：伺服、气缸、吸盘与流程信号 */
export const GANTRY_COILS = {
  GANTRY_X_ENABLE: 0,
  GANTRY_Y_ENABLE: 1,
  GANTRY_X_IN_POS: 2,
  GANTRY_Y_IN_POS: 3,
  GANTRY_CYL_DOWN: 4,
  GANTRY_VACUUM: 5,
  GANTRY_HAS_PART: 6,
  GANTRY_START: 7,
  GANTRY_ESTOP: 8,
  /** 只读输入：Y 模组 1 原点 + 2 终端限位 */
  GANTRY_SENSOR_ORIGIN: 9,
  GANTRY_SENSOR_END_MINUS: 10,
  GANTRY_SENSOR_END_PLUS: 11,
  /** 只读输入：X 模组 1 原点 + 2 终端限位 */
  GANTRY_SENSOR_X_ORIGIN: 12,
  GANTRY_SENSOR_X_END_MINUS: 13,
  GANTRY_SENSOR_X_END_PLUS: 14,
  /** 仿真模式主令（自复位输入） */
  GANTRY_STOP: 15,
  GANTRY_RESET: 16,
  GANTRY_CONFIRM: 17,
} as const;

/**
 * 6 路接近开关反馈（sensor → PLC）：仿真模式由设备按 position 派生后写回 PLC。
 * 顺序与 GANTRY_COILS 的 C9~C14、地址表的 X1~X6 / M40.1~M40.6 一一对应。
 * Modbus TCP 走数字线圈地址；S7 / 三菱按变量名走 writeVars，表随 connect 帧下发。
 */
export const GANTRY_SENSOR_FEEDBACK = [
  { key: 'GANTRY_SENSOR_ORIGIN', modbus: GANTRY_COILS.GANTRY_SENSOR_ORIGIN, s7: 'M40.1', mitsubishi: 'X1' },
  { key: 'GANTRY_SENSOR_END_MINUS', modbus: GANTRY_COILS.GANTRY_SENSOR_END_MINUS, s7: 'M40.2', mitsubishi: 'X2' },
  { key: 'GANTRY_SENSOR_END_PLUS', modbus: GANTRY_COILS.GANTRY_SENSOR_END_PLUS, s7: 'M40.3', mitsubishi: 'X3' },
  { key: 'GANTRY_SENSOR_X_ORIGIN', modbus: GANTRY_COILS.GANTRY_SENSOR_X_ORIGIN, s7: 'M40.4', mitsubishi: 'X4' },
  { key: 'GANTRY_SENSOR_X_END_MINUS', modbus: GANTRY_COILS.GANTRY_SENSOR_X_END_MINUS, s7: 'M40.5', mitsubishi: 'X5' },
  { key: 'GANTRY_SENSOR_X_END_PLUS', modbus: GANTRY_COILS.GANTRY_SENSOR_X_END_PLUS, s7: 'M40.6', mitsubishi: 'X6' },
] as const;

/** 把传感器状态拆成与 GANTRY_SENSOR_FEEDBACK 同序的布尔数组（面板 / 广播 / 回写同源） */
export function gantrySensorBits(s: {
  origin: boolean; endMinus: boolean; endPlus: boolean;
  xOrigin: boolean; xEndMinus: boolean; xEndPlus: boolean;
}): boolean[] {
  return [s.origin, s.endMinus, s.endPlus, s.xOrigin, s.xEndMinus, s.xEndPlus];
}

/** S7 / 三菱按变量名写布尔；Modbus TCP 走 coils 数字地址，不下发表 */
export function gantryBoolVarsFor(protocol: string): Record<string, string> | undefined {
  if (!protocol || protocol === 'modbus') return undefined;
  return Object.fromEntries(GANTRY_SENSOR_FEEDBACK.map((r) => [
    r.key, protocol === 's7' ? r.s7 : r.mitsubishi,
  ]));
}

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
  { pdo: 'X_Axis.ActualPosition', signal: 'GANTRY_X_POS', direction: 'servo → PLC' },
  { pdo: 'Y_Axis.ActualPosition', signal: 'GANTRY_Y_POS', direction: 'servo → PLC' },
  { pdo: 'X_Axis.TargetPosition', signal: 'GANTRY_X_TGT', direction: 'PLC → servo' },
  { pdo: 'Y_Axis.TargetPosition', signal: 'GANTRY_Y_TGT', direction: 'PLC → servo' },
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
  { signal: 'X 实际位置', mitsubishi: 'D0', modbus: 'HR0', s7: 'MW0', direction: '设备 → PLC', pdo: 'X_Axis.ActualPosition' },
  { signal: 'Y 实际位置', mitsubishi: 'D2', modbus: 'HR2', s7: 'MW4', direction: '设备 → PLC', pdo: 'Y_Axis.ActualPosition' },
  { signal: 'X 目标位置', mitsubishi: 'D4', modbus: 'HR4', s7: 'MW8', direction: 'PLC → 设备', pdo: 'X_Axis.TargetPosition' },
  { signal: 'Y 目标位置', mitsubishi: 'D6', modbus: 'HR6', s7: 'MW12', direction: 'PLC → 设备', pdo: 'Y_Axis.TargetPosition' },
  { signal: 'Z 位置', mitsubishi: 'D8', modbus: 'HR8', s7: 'MW16', direction: '设备 → PLC', pdo: 'Z_Cylinder.Position' },
  { signal: '流程阶段', mitsubishi: 'D9', modbus: 'HR9', s7: 'MW18', direction: '设备 → PLC', pdo: 'Gantry.Phase' },
  { signal: '吸持状态', mitsubishi: 'D10', modbus: 'HR10', s7: 'MW20', direction: '设备 → PLC', pdo: 'Vacuum.HasPart' },
  { signal: '吸取目标格', mitsubishi: 'D11', modbus: 'HR11', s7: 'MW22', direction: 'PLC → 设备', pdo: 'Gantry.PickCell' },
  { signal: '放置目标格', mitsubishi: 'D12', modbus: 'HR12', s7: 'MW24', direction: 'PLC → 设备', pdo: 'Gantry.PlaceCell' },
  { signal: 'X 伺服使能', mitsubishi: 'Y0', modbus: 'C0', s7: 'M30.0', direction: 'PLC → 设备', pdo: 'X_Axis.ServoEnable' },
  { signal: 'Y 伺服使能', mitsubishi: 'Y1', modbus: 'C1', s7: 'M30.1', direction: 'PLC → 设备', pdo: 'Y_Axis.ServoEnable' },
  { signal: '气缸下降', mitsubishi: 'Y4', modbus: 'C4', s7: 'M34.0', direction: 'PLC → 设备', pdo: 'Z_Cylinder.Down' },
  { signal: '真空吸盘', mitsubishi: 'Y5', modbus: 'C5', s7: 'M35.0', direction: 'PLC → 设备', pdo: 'Vacuum.On' },
  { signal: '有料检测', mitsubishi: 'X0', modbus: 'C6', s7: 'M40.0', direction: '设备 → PLC', pdo: 'Vacuum.HasPart' },
  { signal: 'X/Y 原点与限位', mitsubishi: 'X1~X6', modbus: 'C9~C14', s7: 'M40.1~M40.6', direction: '设备 → PLC', pdo: '*_Axis.OriginSensor / *Limit' },
] as const;
