/**
 * 32 位有符号 DINT 与 PLC 字设备的无损转换（网关侧单一实现）
 *
 * 口径（三个协议统一）：
 *   - 逻辑变量是一个 32 位有符号整数 DINT，不占用任何输入点 / 线圈；
 *   - Modbus 保持寄存器 HR120 = 低 16 位，HR121 = 高 16 位（低字在前）；
 *   - 三菱 D 寄存器 D120 = 低 16 位，D121 = 高 16 位（低字在前）；
 *   - S7 的 MDI120 本身是 32 位 DINT，nodes7 直接读写数值，无需拆字；
 *   - 每个 16 位字在以太网上传大端字节序（Modbus 标准），在 MX Component
 *     的 SetDevice/GetDevice 里按有符号 short 传递，位模式保持不变。
 *
 * 前端 packages/auto-dispensing/src/scenes/auto-dispensing/encoderDint.ts
 * 提供同名纯函数（ESM/TS 侧），两边用同一组 DINT_TEST_VECTORS 自检，
 * 并由 test-dispensing-encoder.js 走真实 Modbus 链路做跨实现交叉验证。
 */

const DINT32_MIN = -2147483648;
const DINT32_MAX = 2147483647;

/** 夹紧到有符号 32 位整数，非数值一律归零 */
function clampDint32(value) {
  const n = Math.trunc(Number(value) || 0);
  return Math.min(DINT32_MAX, Math.max(DINT32_MIN, n));
}

/** 拆成 [低16位, 高16位]，取值范围 0..65535 */
function splitDint32(value) {
  const u = clampDint32(value) >>> 0;
  return [u & 0xffff, (u >>> 16) & 0xffff];
}

/** 由两个 16 位字还原成有符号 32 位整数 */
function joinDint32(low, high) {
  return (((high & 0xffff) << 16) | (low & 0xffff)) | 0;
}

/** MX Component 的字设备按有符号 short 读写；位模式不变 */
function toSigned16(word) {
  const u = word & 0xffff;
  return u >= 0x8000 ? u - 0x10000 : u;
}

function toUnsigned16(word) {
  return word & 0xffff;
}

/** 前端 / 网关 / 端到端测试共用的验证向量 */
const DINT_TEST_VECTORS = [
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

module.exports = {
  DINT32_MIN,
  DINT32_MAX,
  DINT_TEST_VECTORS,
  clampDint32,
  splitDint32,
  joinDint32,
  toSigned16,
  toUnsigned16,
};
