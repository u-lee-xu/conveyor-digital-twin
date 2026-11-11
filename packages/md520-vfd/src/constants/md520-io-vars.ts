/**
 * MD520 变频器 DI / DO 的「PLC 侧布尔点位」映射（三协议 + 三菱双档）。
 *
 * 用途：让外部 PLC 程序（AutoShop / 博途 / GX Works2 / 实物 PLC）通过网关
 * 直接打开变频器 DI、读回变频器 DO，与 15 个 uint16 数值字链路并存。
 *
 * 方向语义（与 mock-vfd-server.js > VFD_IO 一致）：
 *   PLC 输出 → 变频器 DI1~DI5（写侧由 PLC 程序驱动，变频器只读）
 *   变频器 DO1/FM/RELAY → PLC 输入（变频器只写，PLC 程序只读）
 *
 * 口径：
 *  - Modbus TCP：coils 130~134（DI）/ 140~142（DO），纯数字地址，走 readCoils/writeCoils；
 *  - Siemens S7：M 区位 M130.0~M130.4 / M140.0~M140.2，走 readVars/writeVars；
 *    刻意避开 MW1000~MW1014（MB1000~MB1015）那一段 485 数值字；
 *  - 三菱 GX Simulator2 仿真：Y0~Y4 / X0~X2（仿真器无物理刷新，可写 X/Y）；
 *  - 三菱实物 FX3U/FX5U：M130~M134 / M140~M142。实物机没有实际接线，
 *    X 会被 END 后的物理 I/O 刷新覆盖、Y 会被程序输出刷新覆盖，所以统一用 M 区。
 *    X/Y 是八进制编号，本表只用到 0~4 / 0~2，未跨越 Y7→Y10 进位。
 *
 * 这张表只属于 MD520 设备包；共用连接服务通过 setVariableTable() 接收覆盖，
 * 其它设备（配药 / 分拣 / 气动 / 交通灯）的默认布尔表保持原样。
 */

export type Md520PlcProtocol = 'modbus' | 's7' | 'mitsubishi';
export type Md520MitsubishiTarget = 'simulator' | 'real';

export const MD520_DI_VAR_KEYS = [
  'VFD_DI1', 'VFD_DI2', 'VFD_DI3', 'VFD_DI4', 'VFD_DI5',
] as const;

export const MD520_DO_VAR_KEYS = [
  'VFD_DO1', 'VFD_DO_FM', 'VFD_DO_RELAY',
] as const;

export type Md520BoolVarName =
  | (typeof MD520_DI_VAR_KEYS)[number]
  | (typeof MD520_DO_VAR_KEYS)[number];

/** Modbus TCP 线圈基址：连续 5 路 DI + 连续 3 路 DO */
export const MD520_MODBUS_DI_BASE = 130;
export const MD520_MODBUS_DO_BASE = 140;

/** 1009H DO 位字到三个端子的位号，顺序与 MD520_DO 一致 */
export const MD520_DO_BITS = [0, 4, 2] as const;

type BoolVars = Record<Md520BoolVarName, string>;

/** S7 M 区位：每通道占一个字节的 bit0，避免按位换算产生歧义 */
export const MD520_S7_VARS: BoolVars = {
  VFD_DI1: 'M130.0', VFD_DI2: 'M131.0', VFD_DI3: 'M132.0',
  VFD_DI4: 'M133.0', VFD_DI5: 'M134.0',
  VFD_DO1: 'M140.0', VFD_DO_FM: 'M141.0', VFD_DO_RELAY: 'M142.0',
};

/** 三菱仿真档：X/Y 是物理端子编号，只有 GX Simulator2 这类无物理刷新的仿真器可写 */
export const MD520_MITSUBISHI_SIM_VARS: BoolVars = {
  VFD_DI1: 'Y0', VFD_DI2: 'Y1', VFD_DI3: 'Y2', VFD_DI4: 'Y3', VFD_DI5: 'Y4',
  VFD_DO1: 'X0', VFD_DO_FM: 'X1', VFD_DO_RELAY: 'X2',
};

/** 三菱实物档：无实际接线，统一 M 区（与项目已定稿的双 profile 口径一致） */
export const MD520_MITSUBISHI_REAL_VARS: BoolVars = {
  VFD_DI1: 'M130', VFD_DI2: 'M131', VFD_DI3: 'M132', VFD_DI4: 'M133', VFD_DI5: 'M134',
  VFD_DO1: 'M140', VFD_DO_FM: 'M141', VFD_DO_RELAY: 'M142',
};

/**
 * 按协议 / 档位给出 connect 帧的布尔变量表。
 * Modbus TCP 返回 null —— 它按 coils 数字地址读写，不需要变量名翻译。
 */
export function md520BoolVarsFor(
  protocol: Md520PlcProtocol,
  target: Md520MitsubishiTarget = 'simulator',
): BoolVars | null {
  if (protocol === 's7') return { ...MD520_S7_VARS };
  if (protocol === 'mitsubishi') {
    return target === 'real'
      ? { ...MD520_MITSUBISHI_REAL_VARS }
      : { ...MD520_MITSUBISHI_SIM_VARS };
  }
  return null;
}

/** DI 读回的布尔数组 → 1008H 位字（与 MD520_DI 的顺序一致） */
export function packDiFlags(values: boolean[]): number {
  return MD520_DI_VAR_KEYS.reduce(
    (acc, _key, i) => acc | (values[i] ? 1 << i : 0), 0,
  );
}

/** 1009H 位字 → 三路 DO 的布尔数组，供 PLC 输入点写入 */
export function unpackDoFlags(word: number): boolean[] {
  return MD520_DO_BITS.map((bit) => !!(word & (1 << bit)));
}
