/**
 * 32 位有符号 DINT 的位置数据寄存器 —— 前端侧纯函数
 *
 * 与 websocket-server/dint32.js 是同一口径的两份实现（网关 CJS / 前端 ESM）：
 *   - 位置只通过一个 32 位 DINT 数据寄存器传递，不占任何输入点或线圈；
 *   - HR120 / D120 放低 16 位，HR121 / D121 放高 16 位（低字在前）；
 *   - S7 的 MD120 本身是 32 位 DINT，nodes7 用 MDI120 地址原生读写；
 *   - 增量式编码器 A/B 相接 X0/X1、高速计数器 C0 的映射由 PLC 程序负责，
 *     数字孪生不绑定物理输入点，只提供等效的计数器当前值。
 *
 * 两份实现的输出由 DINT_TEST_VECTORS 固定，并由
 * websocket-server/test-dispensing-encoder.js 走真实 Modbus 链路交叉验证。
 */

export const DINT32 = {
  MIN: -2147483648,
  MAX: 2147483647,
  /** 一个 DINT 占两个 16 位字寄存器（S7 原生 32 位变量除外） */
  WORDS: 2,
  TYPE: 'DINT32',
  WORD_ORDER: 'low-first',
} as const;

/** 夹紧到有符号 32 位整数，非数值一律归零 */
export function clampDint32(value: number): number {
  const n = Math.trunc(Number(value) || 0);
  return Math.min(DINT32.MAX, Math.max(DINT32.MIN, n));
}

/** 拆成 [低16位, 高16位]，取值范围 0..65535 */
export function splitDint32(value: number): [number, number] {
  const u = clampDint32(value) >>> 0;
  return [u & 0xffff, (u >>> 16) & 0xffff];
}

/** 由两个 16 位字还原成有符号 32 位整数 */
export function joinDint32(low: number, high: number): number {
  return (((high & 0xffff) << 16) | (low & 0xffff)) | 0;
}

/** MX Component 的字设备按有符号 short 读写；位模式不变 */
export function toSigned16(word: number): number {
  const u = word & 0xffff;
  return u >= 0x8000 ? u - 0x10000 : u;
}

export function toUnsigned16(word: number): number {
  return word & 0xffff;
}

/** 前端 / 网关 / 端到端测试共用的验证向量 */
export const DINT_TEST_VECTORS: readonly { value: number; words: [number, number] }[] = [
  { value: 0, words: [0, 0] },
  { value: 1, words: [1, 0] },
  { value: 170, words: [170, 0] },
  { value: 32767, words: [32767, 0] },
  { value: 65535, words: [65535, 0] },
  { value: 65536, words: [0, 1] },
  { value: 100000, words: [34464, 1] },
  { value: 2147483647, words: [65535, 32767] },
  { value: -1, words: [65535, 65535] },
  { value: -2147483648, words: [0, 32768] },
];
