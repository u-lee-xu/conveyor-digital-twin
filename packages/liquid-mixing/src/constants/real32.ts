/**
 * 32 位 IEEE754 REAL/FLOAT ↔ 两个 16 位 PLC 字的无损编解码（浏览器侧单一实现）。
 *
 * 用户口径：液位数据用 real / float，即 32 位小数。
 *
 * 关键设计：**不改网关、不新增协议类型**。网关既有的 `dint32` 双字通道是位模式透传的：
 *   - 写：网关 `splitDint32(clampDint32(value))` 把 32 位整数按低字在前拆成两个字，
 *     再用 FC16 单帧原子写两字；
 *   - 读：网关 FC03 读两字后 `joinDint32(low, high)` 还原成有符号 32 位整数。
 * 因此浏览器把 float32 的 IEEE754 位模式当作有符号 DINT 送进 `writeWords`，
 * 回读时再把同一个位模式解释回 float32，即可得到标准 REAL 双字：
 *   HR0 = 低 16 位、HR1 = 高 16 位（low-first），每字在网络上大端。
 * 学生 PLC 程序按 REAL 解释这两个寄存器即可，无需网关做任何浮点转换。
 *
 * 这样既满足「32 位 REAL + 双字单帧原子写 + 字序显式冻结」，又保持既有设备的
 * uint16 / dint32 路径逐字不变，已定稿的 6 个场景零影响。
 */
const view = new DataView(new ArrayBuffer(4));

/** 字序与网关 dint32.js / joinDint32 完全一致，禁止在别处另写一份 */
export const LIQUID_REAL32_WORD_ORDER = 'low-first' as const;

/** float32 → 有符号 32 位整数（IEEE754 位模式），非有限值归零 */
export function floatToDintBits(value: number): number {
  if (!Number.isFinite(value)) return 0;
  view.setFloat32(0, value, true);
  return view.getInt32(0, true) | 0;
}

/** 有符号 32 位整数（IEEE754 位模式）→ float32 */
export function dintBitsToFloat(bits: number): number {
  view.setInt32(0, bits | 0, true);
  const v = view.getFloat32(0, true);
  return Number.isFinite(v) ? v : 0;
}

/** REAL 拆成 [低字, 高字]，与网关 FC16 写帧的两个寄存器逐字对应 */
export function splitReal32(value: number): [number, number] {
  const u = floatToDintBits(value) >>> 0;
  return [u & 0xffff, (u >>> 16) & 0xffff];
}

/** 由 [低字, 高字] 还原 REAL，等价于网关 joinDint32 + 位模式解释 */
export function joinReal32(low: number, high: number): number {
  const bits = (((high & 0xffff) << 16) | (low & 0xffff)) | 0;
  return dintBitsToFloat(bits);
}

/** 有限性守卫后的 float32 量化（PLC REAL 只有单精度） */
export function quantizeReal32(value: number): number {
  return Number.isFinite(value) ? Math.fround(value) : 0;
}

/** 与网关 / 端到端测试共用的向量：0、小数、负值、满量程、极小值 */
export const REAL32_TEST_VECTORS: readonly { value: number; words: [number, number] }[] = [
  { value: 0, words: [0, 0] },
  { value: 1, words: [0, 0x3f80] },
  { value: -2, words: [0, 0xc000] },
  { value: 1.5, words: [0, 0x3fc0] },
  { value: -2.25, words: [0, 0xc010] },
  { value: 3.14159, words: [0x0fd0, 0x4049] },
  { value: 100, words: [0, 0x42c8] },
  { value: 0.001, words: [0x126f, 0x3a83] },
  { value: 300, words: [0, 0x4396] },
  { value: -0.5, words: [0, 0xbf00] },
];
