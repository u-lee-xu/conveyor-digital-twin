/**
 * 煤料分拣场景 仿真地址表（单一来源）
 *
 * 与 packages/coal-sorting/src/scenes/coal-sorting/constants.ts 的
 * MODBUS_READ_VARS / MODBUS_WRITE_VARS 保持一致（线圈 0-26）。
 *
 * ⚠️ 同步规则：修改前端 constants.ts 地址后，必须同步本文件；
 * 运行 `node mock-addresses.js --check` 可对照 constants.ts 做一致性检查。
 */

/** 煤料分拣 IO 地址（Modbus 线圈号，与前端 constants 一致） */
const COAL_ADDRESSES = {
  BUTTON_START: 0, BUTTON_STOP: 1, BUTTON_ESTOP: 2,
  BELT1_RUN: 3, BELT2_RUN: 4, BELT3_RUN: 5, BELT4_RUN: 6,
  FEED_CYL_EXTEND: 7, FEED_CYL_RETRACT: 8, SEPARATOR_ON: 9,
  S1_BELT1_ENTRY: 10, S2_BELT1_RUN: 11, S3_BELT1_EXIT: 12,
  S4_BELT2_ENTRY: 13, S5_BELT2_RUN: 14, S6_BELT2_EXIT: 15,
  S7_BELT3_ENTRY: 16, S8_BELT3_RUN: 17, S9_BELT3_EXIT: 18,
  S10_PILEUP: 19,
  CYL_FEED_OUT: 20, CYL_FEED_IN: 21,
  IND_BELT1_RUN: 22, IND_BELT2_RUN: 23, IND_BELT3_RUN: 24, IND_BELT4_RUN: 25,
  IND_FAULT: 26,
};

/**
 * 对照前端 constants.ts 做一致性检查。
 * 用法：node mock-addresses.js --check
 * 说明：前端为 TS 模块无法直接 require，采用文本正则解析（仅取数字型线圈映射）。
 */
function checkAgainstConstants() {
  const fs = require('fs');
  const path = require('path');
  const target = path.join(__dirname, '../packages/coal-sorting/src/scenes/coal-sorting/constants.ts');
  if (!fs.existsSync(target)) {
    console.error(`[check] 未找到前端常量文件: ${target}`);
    return false;
  }
  const src = fs.readFileSync(target, 'utf8');
  // 解析 MODBUS_READ_VARS 块内的 name: number 映射
  const block = src.match(/MODBUS_READ_VARS\s*=\s*\{([\s\S]*?)\n\}/);
  if (!block) {
    console.error('[check] 未找到 MODBUS_READ_VARS 块');
    return false;
  }
  const parsed = {};
  const re = /^\s*([A-Z0-9_]+):\s*(\d+),?\s*$/gm;
  let m;
  while ((m = re.exec(block[1])) !== null) {
    parsed[m[1]] = parseInt(m[2], 10);
  }
  const keys = Object.keys(COAL_ADDRESSES);
  const missing = keys.filter((k) => !(k in parsed));
  const mismatched = keys.filter((k) => (k in parsed) && parsed[k] !== COAL_ADDRESSES[k]);
  const extra = Object.keys(parsed).filter((k) => !(k in COAL_ADDRESSES));
  if (missing.length || mismatched.length || extra.length) {
    console.error('[check] ❌ 地址不一致：');
    if (missing.length) console.error('  mock 有而 constants 缺:', missing.join(', '));
    if (mismatched.length) console.error('  地址不同:', mismatched.map((k) => `${k}: mock=${COAL_ADDRESSES[k]} constants=${parsed[k]}`).join(', '));
    if (extra.length) console.error('  constants 有而 mock 缺:', extra.join(', '));
    return false;
  }
  console.log(`[check] ✅ 地址一致（${keys.length} 项）`);
  return true;
}

if (require.main === module && process.argv.includes('--check')) {
  process.exit(checkAgainstConstants() ? 0 : 1);
}

module.exports = { COAL_ADDRESSES };
