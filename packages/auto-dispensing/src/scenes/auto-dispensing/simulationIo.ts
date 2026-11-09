/**
 * 仿真模式「控件 ↔ PLC 地址」绑定单一来源。
 *
 * 旧版有三个各自为政的映射：
 *  - 面板主令按钮内联 `varMap`，只覆盖 5 个 BUTTON_*；
 *  - 3D 按钮箱只写本地 store，不写 PLC，且会被 300ms 轮询反向覆盖；
 *  - 传感器 LED 读本地 store，输出点只有只读 LED，10 个输出线圈无法从界面操作。
 *
 * 现在所有控件（UI 主令 / 3D 按钮箱 / 24 输入点 / 15 输出点）统一从
 * `manualIo.ts` 的点位表派生变量名与三协议地址；地址真值仍是 `constants.ts`
 * 三张协议表，本文件与面板都不回填 'X0' / 'C30' / 'M30.0' 之类字面量。
 *
 * 方向约定（与真实 PLC 接线一致）：
 *  - 主令按钮、两位选择开关档位、传感器 = 孪生 → PLC 输入（X0-X31 / C0-C29 / M0-M22）
 *  - 电机、气缸、灯塔及双电控缩回线圈 = PLC 输出（Y0-Y16 / C30-C45 / M30-M31），
 *    孪生按回读联动，仿真面板也允许直接置位/复位，便于单点调试与教学演示。
 *  - 10 只气缸线圈如何解释成气缸姿态由 `solenoid.ts` 的纯函数决定：
 *    单电控电平跟随、双电控上升沿自保持，面板不自己判断语义。
 *
 * 本文件是纯常量 + 纯函数，不 import React / plcService，Node 源码自检可直接引用。
 */
import {
  MANUAL_INPUT_POINTS, ALL_OUTPUT_POINTS, ioAddressRows, type IoPoint,
} from './manualIo';
import { CABINET_BUTTONS, type DispensingVarName } from './constants';

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

/**
 * 主令顺序 / 铭牌 / 颜色全部从 3D 按钮箱的 CABINET_BUTTONS 派生：
 * 面板与按钮箱一一对应，不再各写一套顺序（旧版把 estop 与 reset 放反了）。
 */
export const SIM_COMMAND_KEYS: readonly CabinetButtonKey[] =
  CABINET_BUTTONS.map((b) => b.key as CabinetButtonKey);

/** 按钮图形符号：只做 UI 提示，语义名称仍取按钮箱铭牌 */
const COMMAND_ICONS: Record<CabinetButtonKey, string> = {
  start: '▶', stop: '■', reset: '↺', estop: '⚠', confirm: '✓',
};

export const SIM_COMMAND_LABELS: Record<CabinetButtonKey, string> = Object.fromEntries(
  CABINET_BUTTONS.map((b) => [
    b.key, `${COMMAND_ICONS[b.key as CabinetButtonKey]}${b.label}`,
  ]),
) as Record<CabinetButtonKey, string>;

/** 按钮颜色与 3D 按钮头同源（constants.ts 是唯一来源，面板禁写死色值） */
export const SIM_COMMAND_COLORS: Record<CabinetButtonKey, string> = Object.fromEntries(
  CABINET_BUTTONS.map((b) => [b.key, b.color]),
) as Record<CabinetButtonKey, string>;

const COMMAND_VARS = new Set<string>(Object.values(CABINET_BUTTON_IO));

/** 两位选择开关的两个 PLC 输入变量：档位互锁，由 UI 开关 / 3D 旋钮拨动写入 */
export const SELECTOR_IO = { manual: 'SEL_MANUAL', auto: 'SEL_AUTO' } as const;
const SELECTOR_VARS = new Set<string>(Object.values(SELECTOR_IO));

/** 主令输入点（5）：按钮箱按下/松开写这些 PLC 输入线圈 */
export const SIM_COMMAND_POINTS: readonly IoPoint[] =
  MANUAL_INPUT_POINTS.filter((p) => COMMAND_VARS.has(p.key));

/** 选择开关输入点（2）：手动档 / 自动档，两档互锁 */
export const SIM_SELECTOR_POINTS: readonly IoPoint[] =
  MANUAL_INPUT_POINTS.filter((p) => SELECTOR_VARS.has(p.key));

/** 传感器输入点（17）：孪生状态每轮写回 PLC，面板 LED 按 PLC 回读显示。
 *  主令与选择开关是人工操作件，由按钮事件写，绝不能被传感器轮询反向覆盖。 */
export const SIM_SENSOR_POINTS: readonly IoPoint[] =
  MANUAL_INPUT_POINTS.filter((p) => !COMMAND_VARS.has(p.key) && !SELECTOR_VARS.has(p.key));

/**
 * 输出执行件（15）：PLC → 孪生。线圈由真实 PLC 程序驱动，仿真面板不再
 * 提供置位按钮，只在 IO 信号表用点位表 label 做只读 LED 显示。
 * 10 个动作线圈 + 5 个双电控专用缩回线圈；单电控模式下缩回线圈不参与
 * 气缸驱动，语义见 solenoid.ts。
 */
export const SIM_OUTPUT_POINTS: readonly IoPoint[] = ALL_OUTPUT_POINTS;

/** 拨动两位选择开关时一帧写两个输入线圈（互锁：必有一真一假） */
export function selectorIo(auto: boolean): { names: string[]; values: boolean[] } {
  const names = SIM_SELECTOR_POINTS.map((p) => p.key);
  return {
    names,
    values: names.map((n) => (n === SELECTOR_IO.auto ? auto : !auto)),
  };
}

/** 选择开关两个档位的三协议地址浮框行 */
export function simSelectorRows() {
  return ioAddressRows(SIM_SELECTOR_POINTS);
}

/** 输出点没有 UI 短标签：面板只在 IO 信号表用点位表 label 做只读显示 */

/** 每轮 readVars 必须回读的全部变量名：24 输入 + 15 输出 = 39 */
export const SIM_READ_VAR_NAMES: readonly string[] = [
  ...MANUAL_INPUT_POINTS.map((p) => p.key),
  ...ALL_OUTPUT_POINTS.map((p) => p.key),
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

/** PLC 程序侧电机正反转互锁口径：置位任一方时另一方必须复位；面板不再置位输出 */
export function motorInterlockPartner(key: string): string | null {
  if (key === 'MOTOR_FWD') return 'MOTOR_REV';
  if (key === 'MOTOR_REV') return 'MOTOR_FWD';
  return null;
}
