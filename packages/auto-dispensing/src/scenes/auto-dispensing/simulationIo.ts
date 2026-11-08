/**
 * 仿真模式「控件 ↔ PLC 地址」绑定单一来源。
 *
 * 旧版有三个各自为政的映射：
 *  - 面板主令按钮内联 `varMap`，只覆盖 5 个 BUTTON_*；
 *  - 3D 按钮箱只写本地 store，不写 PLC，且会被 300ms 轮询反向覆盖；
 *  - 传感器 LED 读本地 store，输出点只有只读 LED，10 个输出线圈无法从界面操作。
 *
 * 现在所有控件（UI 主令 / 3D 按钮箱 / 22 输入点 / 10 输出点）统一从
 * `manualIo.ts` 的点位表派生变量名与三协议地址；地址真值仍是 `constants.ts`
 * 三张协议表，本文件与面板都不回填 'X0' / 'C30' / 'M30.0' 之类字面量。
 *
 * 方向约定（与真实 PLC 接线一致）：
 *  - 主令按钮、传感器 = 孪生 → PLC 输入（X / C0-29 / M0-M22）
 *  - 电机、气缸、灯塔 = PLC 输出（Y / C30-40 / M30-M31），孪生按回读联动，
 *    仿真面板也允许直接置位/复位，便于单点调试与教学演示。
 *
 * 本文件是纯常量 + 纯函数，不 import React / plcService，Node 源码自检可直接引用。
 */
import {
  MANUAL_INPUT_POINTS, MANUAL_OUTPUT_POINTS, ioAddressRows, type IoPoint,
} from './manualIo';
import type { DispensingVarName } from './constants';

/** 3D 按钮箱与面板主令共用的按键 key（与 CABINET_BUTTONS 的 key 一致） */
export type CabinetButtonKey = 'start' | 'stop' | 'reset' | 'estop' | 'confirm';

/** 按键 → PLC 输入变量名；地址由点位表按变量名查出，不在这里写地址 */
export const CABINET_BUTTON_IO: Record<CabinetButtonKey, DispensingVarName> = {
  start: 'BUTTON_START',
  stop: 'BUTTON_STOP',
  reset: 'BUTTON_RESET',
  estop: 'BUTTON_ESTOP',
  confirm: 'BUTTON_CONFIRM',
};

export const SIM_COMMAND_KEYS: readonly CabinetButtonKey[] = [
  'start', 'stop', 'estop', 'reset', 'confirm',
];

/** 面板主令按钮短标签（与 3D 按钮箱铭牌语义一致） */
export const SIM_COMMAND_LABELS: Record<CabinetButtonKey, string> = {
  start: '▶启动',
  stop: '■停止',
  estop: '⚠急停',
  reset: '↺复位',
  confirm: '✓确认',
};

const COMMAND_VARS = new Set<string>(Object.values(CABINET_BUTTON_IO));

/** 主令输入点（5）：按钮箱按下/松开写这些 PLC 输入线圈 */
export const SIM_COMMAND_POINTS: readonly IoPoint[] =
  MANUAL_INPUT_POINTS.filter((p) => COMMAND_VARS.has(p.key));

/** 传感器输入点（17）：孪生状态每轮写回 PLC，面板 LED 按 PLC 回读显示 */
export const SIM_SENSOR_POINTS: readonly IoPoint[] =
  MANUAL_INPUT_POINTS.filter((p) => !COMMAND_VARS.has(p.key));

/** 输出执行件（10）：PLC → 孪生；仿真面板可直接置位/复位对应输出线圈 */
export const SIM_OUTPUT_POINTS: readonly IoPoint[] = MANUAL_OUTPUT_POINTS;

/** 输出按钮短标签（点位表里的 label 用于地址浮框标题） */
export const SIM_OUTPUT_ACTION_LABELS: Record<string, string> = {
  MOTOR_FWD: '前进',
  MOTOR_REV: '后退',
  CYL_SEND_A: 'A缸',
  CYL_SEND_B: 'B缸',
  CYL_SEND_C: 'C缸',
  CYL_SEND_D: 'D缸',
  CYL_TILT: '翻转',
  LAMP_GREEN: '绿灯',
  LAMP_YELLOW: '黄灯',
  LAMP_RED: '红灯',
};

/** 每轮 readVars 必须回读的全部变量名：22 输入 + 10 输出 = 32 */
export const SIM_READ_VAR_NAMES: readonly string[] = [
  ...MANUAL_INPUT_POINTS.map((p) => p.key),
  ...MANUAL_OUTPUT_POINTS.map((p) => p.key),
];

/** 孪生每轮写回 PLC 的传感器变量名（主令由按钮事件写，不在这里覆盖） */
export const SIM_SENSOR_VAR_NAMES: readonly string[] = SIM_SENSOR_POINTS.map((p) => p.key);

/** 主令按键 → 点位（用于三协议地址浮框） */
export function simCommandPoint(key: CabinetButtonKey): IoPoint {
  const varName = CABINET_BUTTON_IO[key];
  const point = SIM_COMMAND_POINTS.find((p) => p.key === varName);
  if (!point) throw new Error(`仿真主令点位缺失：${varName}`);
  return point;
}

/** 点位 → 浮框行；面板 / 按钮共用 ioAddressRows，禁止回填地址字面量 */
export function simPointRows(point: IoPoint) {
  return ioAddressRows([point]);
}

/** 电机正反转互锁：置位任一方时，另一方必须复位 */
export function motorInterlockPartner(key: string): string | null {
  if (key === 'MOTOR_FWD') return 'MOTOR_REV';
  if (key === 'MOTOR_REV') return 'MOTOR_FWD';
  return null;
}
