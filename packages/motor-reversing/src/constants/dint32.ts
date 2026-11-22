/**
 * 皮带位移 32 位 DINT ↔ 两个 16 位 PLC 字（浏览器侧镜像，单一实现）。
 *
 * 项目红线：位置量用 32 位 DINT，**低字在前**，FC03 读 / FC10 一帧写两字。
 * 网关 `dint32.js` 已经实现同样的拆分；这里只用于本地向量自检与帧级验证，
 * 实际写帧仍走 `writeWords(['MOTOR_DISPLACEMENT'], [value])` 由网关单帧原子写。
 */
import { MOTOR_DINT32_WORD_ORDER } from './motorVariables';

export function clampDint32(value: number): number {
  if (!Number.isFinite(value)) return 0;
  const v = Math.trunc(value);
  return Math.max(-2147483648, Math.min(2147483647, v));
}

export function splitMotorDint32(value: number): [number, number] {
  const u = clampDint32(value) >>> 0;
  const low = u & 0xffff;
  const high = (u >>> 16) & 0xffff;
  return MOTOR_DINT32_WORD_ORDER === 'low-first' ? [low, high] : [high, low];
}

export function joinMotorDint32(low: number, high: number): number {
  const l = low & 0xffff;
  const h = high & 0xffff;
  const bits = MOTOR_DINT32_WORD_ORDER === 'low-first' ? (h << 16) | l : (l << 16) | h;
  return bits | 0;
}

/** 与网关 / 端到端帧级用例共用的向量：0、正值、负值、边界、NaN 拒绝 */
export const MOTOR_DINT32_TEST_VECTORS: readonly { value: number; words: [number, number] }[] = [
  { value: 0, words: [0, 0] },
  { value: 1, words: [1, 0] },
  { value: 65535, words: [0xffff, 0] },
  { value: 65536, words: [0, 1] },
  { value: 123456789, words: [0xcd15, 0x075b] },
  { value: -1, words: [0xffff, 0xffff] },
  { value: -65536, words: [0, 0xffff] },
  { value: 2147483647, words: [0xffff, 0x7fff] },
];
